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
import subprocess

from .. import events as ev
from ..events import terminal_sink as _default_tool_event


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


def _default_runner(argv, input):
    """Run the CLI, capturing stdout/stderr. Isolated so tests inject a fake."""
    return subprocess.run(argv, input=input, capture_output=True, text=True)


def _run(agent_file_path, user_message, model, project_dir, allow_write,
         on_event, runner) -> str:
    emit = on_event or _default_tool_event
    runner = runner or _default_runner
    argv = _build_cli_argv(model, agent_file_path, project_dir, allow_write)
    proc = runner(argv, input=user_message)
    if getattr(proc, "returncode", 0) != 0:
        err = (getattr(proc, "stderr", "") or "").strip() or "(no stderr)"
        raise RuntimeError(
            f"claude CLI exited {proc.returncode}: {err[:300]} — is the CLI "
            f"installed and logged in? (`claude` on PATH, run `claude` once to auth)"
        )
    text, usage, cost = _parse_result(getattr(proc, "stdout", "") or "")
    # Flat-cost NOTE (no `usage` event): keeps --max-cost from false-tripping and
    # the cockpit 💰 Spend honest at $0 for subscription runs, while still showing
    # the token shape + the CLI's API-equivalent cost for transparency.
    inp = usage.get("input_tokens", 0)
    out = usage.get("output_tokens", 0)
    cost_str = f" · ~${cost:.3f} on API" if isinstance(cost, (int, float)) else ""
    emit({"type": ev.NOTE,
          "text": f"claude-code (subscription, $0 marginal): in={inp} out={out}{cost_str}"})
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
