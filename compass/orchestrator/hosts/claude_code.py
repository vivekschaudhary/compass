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
import queue
import signal
import subprocess
import threading
import time

from .. import events as ev
from ..events import terminal_sink as _default_tool_event

# #152: timeout discipline, corrected. The original #131 guard was a blunt
# WALL-CLOCK cap (default 900s): kill the CLI after N seconds total. Reproduction
# (a WLT-26 create-bet-architecture that "halted: hung on a dev server") proved
# that wrong — the step wasn't hung at all; it was a healthy 448s Opus drafting
# run that read ~10 files + thought hard, and a sibling run simply ran past 900s.
# A wall-clock cap can't tell "stuck" from "long but working", and buffered
# `--output-format json` left a killed run with ZERO trace of which it was
# ([reproduce-before-diagnose] + [observability-before-trust]).
#
# The fix: stream `--output-format stream-json` and guard on SILENCE, not
# duration. A genuinely stuck CLI (dev server holding the pipe, interactive
# prompt) emits nothing; a long-but-healthy step emits a tool_use / text / thinking
# event every few seconds. So the IDLE timeout (no output for N s) precisely
# catches the hang and never false-kills honest long work. The wall-clock value
# remains as a generous absolute BACKSTOP only (a pathological emit-forever loop).
_DEFAULT_CLI_IDLE = 300       # 5 min of total silence ⇒ genuinely stuck
_DEFAULT_CLI_TIMEOUT = 3600   # absolute backstop only; idle is the real guard


def _cli_timeout():
    """Absolute wall-clock BACKSTOP (seconds), or None to disable. Idle-timeout
    (`_cli_idle_timeout`) is the primary guard now (#152); this only catches a
    pathological run that keeps emitting forever. Override COMPASS_CLAUDE_CLI_TIMEOUT
    (0/blank disables)."""
    raw = os.environ.get("COMPASS_CLAUDE_CLI_TIMEOUT")
    if raw is None or raw == "":
        return _DEFAULT_CLI_TIMEOUT
    try:
        n = int(raw)
    except ValueError:
        return _DEFAULT_CLI_TIMEOUT
    return None if n <= 0 else n


def _cli_idle_timeout():
    """The PRIMARY guard (#152): kill the CLI if it produces NO output for this
    many seconds — the precise signature of a hang (a command that never returns,
    an interactive prompt). Healthy long steps stream events continuously and
    never trip it. Override COMPASS_CLAUDE_CLI_IDLE_TIMEOUT (0/blank disables)."""
    raw = os.environ.get("COMPASS_CLAUDE_CLI_IDLE_TIMEOUT")
    if raw is None or raw == "":
        return _DEFAULT_CLI_IDLE
    try:
        n = int(raw)
    except ValueError:
        return _DEFAULT_CLI_IDLE
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
        # #152: stream events so the run log shows live activity (a stuck step is
        # then visible, a long-but-healthy one obviously isn't) and the idle-timeout
        # guard has a liveness signal to watch. --verbose is required for stream-json
        # under --print. _default_runner consumes the NDJSON; _parse_result reads the
        # final `result` event (same fields as the old buffered json object).
        "--output-format", "stream-json",
        "--verbose",
        # #170: stream PARTIAL message chunks (token deltas) too. The idle-timeout
        # guard (#152) watches stdout silence — but a long single turn (e.g. the
        # architect composing a 12-section doc after deep exploration) emits NOTHING
        # until the turn completes, so a *working* step looked idle and got killed at
        # 300s. Partial chunks make the generation continuously visible → the guard
        # only trips on a TRUE hang (zero deltas). _progress_line ignores these (they
        # reset the idle timer without flooding the log); _parse_result still reads the
        # final `result` event unchanged.
        "--include-partial-messages",
        # #148 host-context isolation: load NONE of the user/project/local settings.
        # The consumer repo's .claude/settings.json (a Bash-command allowlist with no
        # Write entries) made agents CONFABULATE "writes aren't allowed here" even
        # under bypassPermissions (a create-brief's delivery-manager refused to write
        # docs/status.md while pm wrote brief.md fine); the user's global memory
        # ("don't run /create-brief in the framework repo") bled in the same way. The
        # agent runs as a clean unit governed only by the orchestrator's flags + the
        # agent file — auth (OAuth/keychain) is unaffected by setting-sources.
        "--setting-sources", "",
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


def _safe_json(line):
    try:
        o = json.loads(line)
        return o if isinstance(o, dict) else None
    except (ValueError, TypeError):
        return None


def _progress_line(obj):
    """Pure: a human one-liner (or None to skip) for a stream-json event, teed to
    the run log so live activity is visible (#152). Surfaces the agent's tool calls
    and short text so the dashboard 'log ↗' shows what the step is doing — and so a
    truly stuck step shows its LAST action before the idle-timeout kills it."""
    t = obj.get("type")
    if t == "assistant":
        out = []
        for c in obj.get("message", {}).get("content", []):
            ct = c.get("type")
            if ct == "tool_use":
                inp = c.get("input", {}) or {}
                arg = (inp.get("command") or inp.get("file_path") or inp.get("pattern")
                       or inp.get("path") or "")
                out.append(f"· {c.get('name')} {str(arg)[:80]}".rstrip())
            elif ct == "text" and (c.get("text") or "").strip():
                out.append(f"· {c['text'].strip()[:80]}")
        return "\n".join(out) or None
    return None


def _extract_result_line(lines):
    """Pure: from streamed NDJSON lines, return the final `result` event's raw JSON
    string (what _parse_result consumes). Raises RuntimeError if absent — a stream
    that ends without a result event means the CLI died mid-flight (#152)."""
    for ln in reversed(lines):
        s = ln.strip()
        if not s:
            continue
        o = _safe_json(s)
        if o is not None and o.get("type") == "result":
            return s
    raise RuntimeError("claude CLI stream ended without a result event "
                       "(the process likely crashed or was killed mid-run).")


def _kill_group(proc):
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)  # whole tree (child + spawns)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        proc.wait(timeout=5)
    except Exception:
        pass


def _default_runner(argv, input, cwd=None):
    """Run the CLI, STREAMING its NDJSON output under an idle-timeout (#152, was a
    wall-clock cap in #131). Isolated so tests inject a fake. `cwd` (#132) makes the
    target repo the agent's working directory so it can read the project's source.
    The child runs in its own process group so a hung `claude -p` AND anything it
    spawned (dev server, watcher) are killed together.

    Guard = SILENCE, not duration: a reader thread pushes each stdout/stderr line to
    a queue; if no line arrives for `idle` seconds the CLI is genuinely stuck (a
    command that never returns / an interactive prompt) → kill + fail loud. Healthy
    long steps stream events continuously and never trip it. A generous wall-clock
    backstop still catches a pathological emit-forever loop. Each event is teed to
    stdout (→ the run log / dashboard) so the step's activity is observable live."""
    idle = _cli_idle_timeout()
    hard = _cli_timeout()
    proc = subprocess.Popen(
        argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, env=_subscription_env(), start_new_session=True, cwd=cwd, bufsize=1,
    )
    try:
        proc.stdin.write(input)
        proc.stdin.close()
    except (BrokenPipeError, ValueError):
        pass

    q = queue.Queue()

    def _reader(stream, tag):
        try:
            for line in iter(stream.readline, ""):
                q.put((tag, line))
        finally:
            q.put((tag, None))  # EOF sentinel

    threads = [threading.Thread(target=_reader, args=(proc.stdout, "out"), daemon=True),
               threading.Thread(target=_reader, args=(proc.stderr, "err"), daemon=True)]
    for th in threads:
        th.start()

    out_lines, err_lines, result_line = [], [], None
    eofs, last_action = 0, "(no output yet)"
    start = time.monotonic()
    # #83: on ANY abnormal exit — operator Ctrl-C (KeyboardInterrupt), a SIGTERM, or an
    # unexpected error while streaming — kill the child process group before propagating,
    # so a `claude -p` (and anything it spawned: dev server, watcher) is never orphaned
    # and left running. The idle/hard-timeout paths kill explicitly below; this is the
    # catch-all so no failure path leaves the process open. `_kill_group` is idempotent.
    try:
        while eofs < 2:
            try:
                tag, line = q.get(timeout=idle) if idle else q.get()
            except queue.Empty:
                _kill_group(proc)
                raise RuntimeError(
                    f"claude CLI produced no output for {idle}s and was killed — it is "
                    f"genuinely stuck (a command that never returns, like a dev server / "
                    f"watcher, or an interactive prompt). Last activity: {last_action}. "
                    f"Re-run from this step, or raise COMPASS_CLAUDE_CLI_IDLE_TIMEOUT "
                    f"(seconds; 0 disables the idle guard)."
                )
            if line is None:
                eofs += 1
                continue
            if tag == "out":
                out_lines.append(line)
                obj = _safe_json(line)
                if obj is not None:
                    if obj.get("type") == "result":
                        result_line = line.strip()
                    p = _progress_line(obj)
                    if p:
                        for pl in p.splitlines():
                            last_action = pl
                            print(f"    {pl}", flush=True)
            else:
                err_lines.append(line)
            if hard and (time.monotonic() - start) > hard:
                _kill_group(proc)
                raise RuntimeError(
                    f"claude CLI exceeded the {hard}s absolute backstop and was killed "
                    f"(it kept emitting but never finished). Re-run, or adjust "
                    f"COMPASS_CLAUDE_CLI_TIMEOUT (0 disables the backstop)."
                )
    except BaseException:
        _kill_group(proc)   # never leave the child (or its spawns) running on a failure
        raise
    proc.wait()
    stdout = result_line if result_line is not None else "".join(out_lines)
    return subprocess.CompletedProcess(argv, proc.returncode, stdout, "".join(err_lines))


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
    "`REFUSE: <reason>` (the orchestrator halts on that) — never a vague plan.\n\n"
    # #153: 'end-to-end' means complete the WORK, not approve it. The headless push to
    # 'finish now' was making doc agents over-execute and self-approve (an architecture
    # written with status: Approved before the HITL gate) — a Principle #16 violation.
    "**Respect your task's gates and postconditions exactly.** If your agent task says "
    "to set a draft status (e.g. `status: proposed`) and halt at a HITL gate, do EXACTLY "
    "that — set the draft status and stop. NEVER self-approve: do not set `status: "
    "approved`/`ready`/`accepted` on a gated artifact. Approval is the human's decision "
    "at the gate, not yours. 'End-to-end' = the work is done and the draft is on disk, "
    "NOT that you signed off on it."
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
