"""Claude Code (CLI) adapter for the Compass orchestrator (#120).

Unlike `claude.py` (the metered Anthropic API host), this host shells out to the
**logged-in `claude` CLI** in print mode (`claude -p`) — subscription-backed, no
`ANTHROPIC_API_KEY`, flat marginal cost. It's opt-in (`--claude-cli` /
`COMPASS_CLAUDE_HOST=cli`); `run.py` remaps a step's `claude` host → `claude-code`
before host selection. Reviewers stay on Codex/Gemini (their `preferred_hosts`
never name `claude`, so the remap doesn't touch them).

Two differences from the API host, by design:
- **Tool use is internal to Claude Code.** We don't pass our own tool schemas —
  CC runs its own Read/Edit/Bash loop, governed by `--permission-mode` +
  `--add-dir <project_dir>`. So per-tool events aren't surfaced this slice.
- **Flat-cost accounting.** The adapter emits a single NOTE (tokens + turns +
  the CLI-reported equivalent cost, labeled subscription/$0 marginal) and NO
  `usage` event — so `--max-cost` never false-trips and the cockpit shows $0.
"""
import json
import os
import signal
import subprocess

from .. import events as ev
from ..events import terminal_sink as _default_tool_event

# #131: a hung `claude -p` (e.g. it started a dev server / watcher that holds the
# output pipe, or otherwise never returns) would block the orchestrator forever —
# the deadlock that froze a real /fix run for 15+ min. Cap it and fail loud
# ([fail-loud-not-silent]). Default 15 min; override with COMPASS_CLAUDE_CLI_TIMEOUT
# (seconds; 0/blank disables the cap for genuinely long steps).
_DEFAULT_CLI_TIMEOUT = 900


def _cli_timeout():
    raw = os.environ.get("COMPASS_CLAUDE_CLI_TIMEOUT")
    if raw is None or raw == "":
        return _DEFAULT_CLI_TIMEOUT
    try:
        n = int(raw)
    except ValueError:
        return _DEFAULT_CLI_TIMEOUT
    return None if n <= 0 else n


def _cli_model(model: str) -> str:
    """Map a Compass model id to a `claude` CLI model arg. The CLI accepts the
    `sonnet`/`opus` aliases (latest of each tier); our economy/deep ids map onto
    them. Anything else passes through. Override with COMPASS_CLAUDE_CLI_MODEL."""
    override = os.environ.get("COMPASS_CLAUDE_CLI_MODEL")
    if override:
        return override
    m = (model or "").lower()
    if "opus" in m:
        return "opus"
    if "sonnet" in m:
        return "sonnet"
    if "haiku" in m:
        return "haiku"
    return model or "sonnet"


def _build_cli_argv(model, agent_file_path, project_dir=None, allow_write=False) -> list:
    """Pure: the `claude -p` argv for one dispatch. The agent file is the system
    identity (appended to CC's harness via --append-system-prompt-file); the user
    message goes on stdin (see _run). Tool steps get --add-dir + a permission
    mode; allow_write → bypassPermissions (full parity with the API host, which
    grants write_file + sandboxed bash under allow_write — build agents need bash
    for tests/git). Read-only/no-tools steps → default (in headless -p mode,
    edits needing approval are auto-denied → effectively read-only)."""
    argv = [
        "claude", "-p",
        "--output-format", "json",
        "--append-system-prompt-file", str(agent_file_path),
        "--model", _cli_model(model),
    ]
    if project_dir is not None:
        argv += ["--add-dir", str(project_dir)]
        argv += ["--permission-mode",
                 "bypassPermissions" if allow_write else "default"]
    return argv


def _parse_result(stdout: str):
    """Pure: parse `claude -p --output-format json` stdout →
    (text, usage_dict, total_cost_usd). Raises RuntimeError on an error result or
    unparseable output so run.py's dispatch `except` yields a clean halt."""
    try:
        obj = json.loads(stdout)
    except (ValueError, TypeError) as e:
        raise RuntimeError(f"claude CLI returned unparseable output: {e}")
    if isinstance(obj, dict) and obj.get("is_error"):
        raise RuntimeError(f"claude CLI reported an error: {obj.get('result') or obj}")
    text = obj.get("result") if isinstance(obj, dict) else None
    if text is None:
        raise RuntimeError(f"claude CLI returned no result field: {str(obj)[:200]}")
    usage = (obj.get("usage") or {}) if isinstance(obj, dict) else {}
    cost = obj.get("total_cost_usd") if isinstance(obj, dict) else None
    return text, usage, cost


def _subscription_env() -> dict:
    """Env for the CLI with API-key vars stripped (#120). The `claude` CLI prefers
    ANTHROPIC_API_KEY over the logged-in subscription — so leaving it set would
    bill (and rate-limit) the metered API, defeating the entire point of this
    host. Drop it (and the auth-token / base-url overrides) so `claude` uses the
    subscription login. This IS the flat-cost guarantee, not a nicety."""
    env = os.environ.copy()
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"):
        env.pop(k, None)
    return env


def _default_runner(argv, input, cwd=None):
    """Run the CLI, capturing stdout/stderr, under a timeout (#131). Isolated so
    tests inject a fake. `cwd` (#132) makes the target repo the agent's working
    directory so it can actually read the project's source (not just the orchestrator's
    cwd + an --add-dir). The child runs in its own process group so a hung
    `claude -p` AND anything it spawned (dev server, watcher) are killed together;
    on timeout we fail loud with a RuntimeError → run.py emits RUN_END(halted) +
    a --from-step resume hint, instead of blocking the orchestrator forever."""
    timeout = _cli_timeout()
    proc = subprocess.Popen(
        argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, env=_subscription_env(), start_new_session=True, cwd=cwd,
    )
    try:
        out, err = proc.communicate(input=input, timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)  # whole tree
        except (ProcessLookupError, PermissionError):
            pass
        try:
            proc.communicate(timeout=5)
        except Exception:
            pass
        raise RuntimeError(
            f"claude CLI exceeded the {timeout}s timeout and was killed — it likely "
            f"hung on a long-running command (a dev server / watcher that never "
            f"returns, or an interactive prompt). Re-run from this step, or raise "
            f"COMPASS_CLAUDE_CLI_TIMEOUT (seconds; 0 disables the cap)."
        )
    return subprocess.CompletedProcess(argv, proc.returncode, out, err)


# #139: Claude Code, run headless via `claude -p`, tends to return a PLAN ("here's
# what I'd do") or wrongly claim "I can't access the codebase from this session"
# instead of executing — even with tools + write permission (live: automation &
# tech-writer steps planned instead of writing the test/changelog). This directive,
# appended to tool-capable dispatches, forces execution and routes a genuine block
# to the #125 REFUSE: sentinel (which the orchestrator halts on) rather than a plan.
_EXECUTE_DIRECTIVE = (
    "\n\n---\n**Orchestrator execution mode (not a chat).** You are running headless "
    "with tools enabled (Read/Edit/Bash) and write access, in this project's working "
    "directory. EXECUTE this task end-to-end NOW: make the actual file changes, run the "
    "commands, and produce the artifact on disk. Do NOT return a plan, do NOT ask for "
    "confirmation, and do NOT claim you lack access to the codebase — you are inside the "
    "repo. If a hard precondition genuinely cannot be met, reply with a first line of "
    "`REFUSE: <reason>` (the orchestrator halts on that) — never a vague plan."
)


def _run(agent_file_path, user_message, model, project_dir, allow_write,
         on_event, runner) -> str:
    emit = on_event or _default_tool_event
    runner = runner or _default_runner
    argv = _build_cli_argv(model, agent_file_path, project_dir, allow_write)
    # #132: run IN the target repo so the agent can read the project's source.
    cwd = str(project_dir) if project_dir else None
    # #139: tool-capable steps (project_dir set) must execute, not plan.
    msg = user_message + _EXECUTE_DIRECTIVE if project_dir else user_message
    proc = runner(argv, input=msg, cwd=cwd)
    out = getattr(proc, "stdout", "") or ""
    if getattr(proc, "returncode", 0) != 0:
        # The CLI reports usage-limit / auth / model errors in STDOUT (as JSON or
        # plain text), often with an EMPTY stderr — so surface stdout, else the
        # cause is invisible ("no stderr" tells you nothing). #120.
        detail = (getattr(proc, "stderr", "") or "").strip()
        if not detail and out.strip():
            try:
                o = json.loads(out)
                detail = str(o.get("result") or o.get("error") or o)[:400]
            except (ValueError, TypeError):
                detail = out.strip()[:400]
        detail = detail or "(no output on stdout or stderr)"
        raise RuntimeError(
            f"claude CLI exited {proc.returncode}: {detail} — check the CLI is "
            f"logged in and not at a usage limit (`claude` on PATH; run `claude` "
            f"interactively once to auth / see limits)."
        )
    text, usage, cost = _parse_result(out)
    # Flat-cost NOTE (no `usage` event): keeps --max-cost from false-tripping and
    # the cockpit 💰 Spend honest at $0 for subscription runs. #132: word it so the
    # comparison figure can't be mistaken for a charge — "$0 to you" is the actual
    # cost; "if billed via API" is the would-have-cost on the metered API.
    inp = usage.get("input_tokens", 0)
    out = usage.get("output_tokens", 0)
    cmp_str = f" · ~${cost:.2f} if billed via API" if isinstance(cost, (int, float)) else ""
    emit({"type": ev.NOTE,
          "text": f"claude-code · $0 to you (subscription) · in={inp} out={out}{cmp_str}"})
    return text


def dispatch(agent_file_path: str, task_name: str, user_message: str,
             model: str = "claude-opus-4-8", max_tokens: int = 8096,
             on_event=None, runner=None) -> str:
    """Single-shot (no-tools) dispatch via `claude -p` — default permission mode,
    no project dir granted. Returns the model's final text."""
    return _run(agent_file_path, user_message, model,
                project_dir=None, allow_write=False,
                on_event=on_event, runner=runner)


def dispatch_with_tools(agent_file_path: str, task_name: str, user_message: str,
                        project_dir, model: str = "claude-opus-4-8",
                        max_tokens: int = 8192, tool_schemas: list = None,
                        allow_write: bool = False, max_iterations: int = 50,
                        client=None, on_event=None, runner=None) -> str:
    """Tool-using dispatch — CC owns the tool loop (we ignore `tool_schemas`),
    governed by --add-dir <project_dir> + a permission mode from allow_write.
    Same signature the router calls for the API host."""
    return _run(agent_file_path, user_message, model,
                project_dir=project_dir, allow_write=allow_write,
                on_event=on_event, runner=runner)
