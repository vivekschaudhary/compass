"""Codex CLI adapter for the Compass orchestrator (#155).

The analog of `claude_code.py` (#120) for the logged-in **`codex` CLI** —
subscription-backed, no `OPENAI_API_KEY`, flat marginal cost. Its reason to exist:
the **Reviewer** (and Security Reviewer) declare `preferred_hosts: [codex, gemini]`
so review independence holds (the reviewer is never the same model as the
implementer). A CLI-only operator (claude subscription, no API keys) had no reachable
reviewer host — every `/build` halted at review. This host runs the reviewer on the
operator's **Codex** subscription (codex ≠ claude → independence preserved) with no
API key.

Opt-in, mirroring #120: `--codex-cli` / `COMPASS_CODEX_HOST=cli`; `run.py` remaps a
step's `codex` host → `codex-cli` before host selection (reviewers' `gemini` fallback
is untouched).

Codex specifics vs the Claude host:
- **No `--append-system-prompt-file`.** The agent file is prepended to the prompt as
  the agent's identity (see `_compose_message`).
- **Result capture via `-o <file>`** (codex writes its final message there) — robust;
  we fall back to the last `agent_message` in the `--json` stream if the file is empty.
- **`--json`** streams `item.completed` / `turn.completed` events; we tee progress to
  the run log (the #152 observability pattern) and read token usage from
  `turn.completed.usage` for the flat-cost NOTE.
- **Permission parity:** allow_write → `--dangerously-bypass-approvals-and-sandbox`
  (full access — the reviewer needs to run `gh` + network); else `-s read-only`.
- **Isolation (#148 analog):** `--ignore-user-config` so the operator's
  `~/.codex/config.toml` can't bleed into the agent run.
"""
import json
import os
import queue
import signal
import subprocess
import tempfile
import threading
import time

from .. import events as ev
from ..events import terminal_sink as _default_tool_event

# Idle-timeout guard (#152 pattern): kill on SILENCE, not duration — a healthy long
# review streams events; a genuine hang (a command that never returns) goes quiet.
_DEFAULT_CLI_IDLE = 300       # 5 min of no output ⇒ stuck
_DEFAULT_CLI_TIMEOUT = 3600   # absolute backstop only


def _cli_idle_timeout():
    raw = os.environ.get("COMPASS_CODEX_CLI_IDLE_TIMEOUT")
    if raw is None or raw == "":
        return _DEFAULT_CLI_IDLE
    try:
        n = int(raw)
    except ValueError:
        return _DEFAULT_CLI_IDLE
    return None if n <= 0 else n


def _cli_timeout():
    raw = os.environ.get("COMPASS_CODEX_CLI_TIMEOUT")
    if raw is None or raw == "":
        return _DEFAULT_CLI_TIMEOUT
    try:
        n = int(raw)
    except ValueError:
        return _DEFAULT_CLI_TIMEOUT
    return None if n <= 0 else n


def _cli_model(model: str) -> str:
    """Codex runs its logged-in default model unless told otherwise. We deliberately
    do NOT pass the orchestrator's resolved model id by default — the openai-family
    default (`gpt-5`) is not necessarily a valid `codex exec -m` value, and the
    subscription's default (e.g. gpt-5-codex) is the right one for review. Override
    explicitly with COMPASS_CODEX_CLI_MODEL. Returns '' to mean 'omit -m'."""
    return os.environ.get("COMPASS_CODEX_CLI_MODEL", "") or ""


def _build_cli_argv(model, project_dir, allow_write, output_file) -> list:
    """Pure: the `codex exec` argv for one dispatch. Prompt goes on stdin (see
    `_run`). `-o` captures the final message; `--json` streams events; tool steps get
    `-C`/`--add-dir` + a sandbox policy (allow_write → full bypass for gh/network
    parity with the Claude host; else read-only). `--ignore-user-config` isolates the
    run from the operator's codex config (#148 analog); `--skip-git-repo-check` lets
    review run even when cwd isn't the repo root."""
    argv = ["codex", "exec", "--json", "--skip-git-repo-check", "--ignore-user-config"]
    cm = _cli_model(model)
    if cm:
        argv += ["-m", cm]
    if project_dir is not None:
        argv += ["-C", str(project_dir), "--add-dir", str(project_dir)]
    if allow_write:
        argv += ["--dangerously-bypass-approvals-and-sandbox"]
    else:
        argv += ["-s", "read-only"]
    argv += ["-o", str(output_file)]
    return argv


def _safe_json(line):
    try:
        o = json.loads(line)
        return o if isinstance(o, dict) else None
    except (ValueError, TypeError):
        return None


def _progress_line(obj):
    """Pure: a human one-liner (or None) for a codex `--json` event, teed to the run
    log so a review's activity is visible live (#152). Surfaces the agent's messages,
    shell commands, and edits; a stuck step shows its last action before the idle
    timeout fires."""
    t = obj.get("type")
    if t == "item.completed":
        item = obj.get("item", {}) or {}
        it = item.get("type", "")
        if it == "command_execution":
            return f"· $ {str(item.get('command') or '')[:80]}".rstrip()
        if it == "agent_message":
            txt = (item.get("text") or "").strip()
            return f"· {txt[:80]}" if txt else None
        if it in ("file_change", "patch", "file_update"):
            return f"· edit {item.get('path') or it}"
        if it == "reasoning":
            return None
        return f"· {it}" if it else None
    return None


def _parse_result(stdout, output_file=None):
    """Codex's final message — prefer the `-o` file (clean), fall back to the last
    `agent_message` in the `--json` stream (tests inject this on stdout). Also pull
    token usage from the last `turn.completed`. Raises if there's no message at all."""
    text = None
    if output_file and os.path.exists(output_file):
        try:
            c = open(output_file, encoding="utf-8").read().strip()
            if c:
                text = c
        except OSError:
            pass
    usage, last_msg = {}, None
    for ln in (stdout or "").splitlines():
        o = _safe_json(ln)
        if o is None:
            continue
        if o.get("type") == "turn.completed":
            usage = o.get("usage") or usage
        elif o.get("type") == "item.completed":
            item = o.get("item", {}) or {}
            if item.get("type") == "agent_message" and item.get("text"):
                last_msg = item["text"]
    if text is None:
        text = last_msg
    if text is None:
        raise RuntimeError("codex CLI returned no agent message "
                           "(empty -o file and no agent_message in the stream).")
    return text, usage


def _subscription_env() -> dict:
    """Env with OPENAI_API_KEY stripped (#155). Like the Claude host, the point is
    flat-cost: codex prefers an API key over the logged-in subscription, so leaving
    it set would bill (and rate-limit) the metered API. Auth (the ChatGPT login under
    CODEX_HOME) is unaffected by removing the key."""
    env = os.environ.copy()
    env.pop("OPENAI_API_KEY", None)
    return env


def _kill_group(proc):
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        proc.wait(timeout=5)
    except Exception:
        pass


def _default_runner(argv, input, cwd=None):
    """Stream `codex exec --json` under an idle-timeout (the #152 pattern). A reader
    thread pushes each stdout/stderr line to a queue; silence for `idle` seconds ⇒
    the CLI is stuck ⇒ kill the whole process group + fail loud. Each event is teed
    to stdout so the run log shows live activity. Returns CompletedProcess with the
    full stdout (for usage parsing); the final message itself is read from `-o`."""
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
            q.put((tag, None))

    for th in (threading.Thread(target=_reader, args=(proc.stdout, "out"), daemon=True),
               threading.Thread(target=_reader, args=(proc.stderr, "err"), daemon=True)):
        th.start()

    out_lines, err_lines, eofs, last_action = [], [], 0, "(no output yet)"
    start = time.monotonic()
    while eofs < 2:
        try:
            tag, line = q.get(timeout=idle) if idle else q.get()
        except queue.Empty:
            _kill_group(proc)
            raise RuntimeError(
                f"codex CLI produced no output for {idle}s and was killed — it is "
                f"genuinely stuck (a command that never returns, or an interactive "
                f"prompt). Last activity: {last_action}. Re-run, or raise "
                f"COMPASS_CODEX_CLI_IDLE_TIMEOUT (seconds; 0 disables the idle guard)."
            )
        if line is None:
            eofs += 1
            continue
        if tag == "out":
            out_lines.append(line)
            obj = _safe_json(line)
            if obj is not None:
                p = _progress_line(obj)
                if p:
                    last_action = p
                    print(f"    {p}", flush=True)
        else:
            err_lines.append(line)
        if hard and (time.monotonic() - start) > hard:
            _kill_group(proc)
            raise RuntimeError(
                f"codex CLI exceeded the {hard}s absolute backstop and was killed. "
                f"Re-run, or adjust COMPASS_CODEX_CLI_TIMEOUT (0 disables it)."
            )
    proc.wait()
    return subprocess.CompletedProcess(argv, proc.returncode,
                                       "".join(out_lines), "".join(err_lines))


# #139/#153: like the Claude host, force execution (not a plan) and carve out gate
# discipline (no self-approval) — the directive the orchestrator appends to tool steps.
_EXECUTE_DIRECTIVE = (
    "\n\n---\n**Orchestrator execution mode (not a chat).** You are running headless "
    "with shell + file access in this project's working directory. EXECUTE this task "
    "end-to-end NOW: run the commands, post the review / make the changes the task "
    "defines. Do NOT return a plan, do NOT ask for confirmation, and do NOT claim you "
    "lack access — you are inside the repo. If a hard precondition genuinely cannot be "
    "met, reply with a first line of `REFUSE: <reason>` (the orchestrator halts on "
    "that) — never a vague plan.\n\n"
    "**Respect your task's gates and postconditions exactly.** 'End-to-end' means the "
    "WORK is done, NOT that you signed off on it. NEVER self-approve: do not set "
    "`status: approved`/`ready`/`accepted` on a gated artifact — approval is the "
    "human's decision at the gate, not yours."
)


def _compose_message(agent_file_path, user_message, tool) -> str:
    """Codex has no system-prompt-file flag, so the agent file IS the system identity,
    prepended to the prompt. Tool steps also get the execute directive."""
    try:
        agent = open(agent_file_path, encoding="utf-8").read()
    except OSError:
        agent = ""
    head = (
        "You are running as a Compass agent. Adopt the following agent file as your "
        "identity, principles, tools, and task discipline — follow its gates, "
        "postconditions, and refusal rules exactly:\n\n"
        "===== AGENT FILE =====\n" + agent + "\n===== END AGENT FILE =====\n\n---\n\n"
    )
    msg = head + user_message
    if tool:
        msg += _EXECUTE_DIRECTIVE
    return msg


def _run(agent_file_path, user_message, model, project_dir, allow_write,
         on_event, runner) -> str:
    emit = on_event or _default_tool_event
    runner = runner or _default_runner
    fd, out_file = tempfile.mkstemp(suffix=".codexmsg.txt")
    os.close(fd)
    try:
        argv = _build_cli_argv(model, project_dir, allow_write, out_file)
        msg = _compose_message(agent_file_path, user_message, tool=project_dir is not None)
        cwd = str(project_dir) if project_dir else None
        proc = runner(argv, input=msg, cwd=cwd)
        out = getattr(proc, "stdout", "") or ""
        if getattr(proc, "returncode", 0) != 0:
            detail = (getattr(proc, "stderr", "") or "").strip()
            if not detail and out.strip():
                detail = out.strip()[:400]
            detail = detail or "(no output on stdout or stderr)"
            raise RuntimeError(
                f"codex CLI exited {proc.returncode}: {detail} — check `codex` is "
                f"logged in (`codex login`) and not at a usage limit."
            )
        text, usage = _parse_result(out, out_file)
        inp = usage.get("input_tokens", 0)
        out_t = usage.get("output_tokens", 0)
        emit({"type": ev.NOTE,
              "text": f"codex-cli · $0 to you (subscription) · in={inp} out={out_t}"})
        return text
    finally:
        try:
            os.unlink(out_file)
        except OSError:
            pass


def dispatch(agent_file_path: str, task_name: str, user_message: str,
             model: str = None, max_tokens: int = 8192,
             on_event=None, runner=None) -> str:
    """Single-shot (no project dir) dispatch via `codex exec` — read-only sandbox."""
    return _run(agent_file_path, user_message, model,
                project_dir=None, allow_write=False,
                on_event=on_event, runner=runner)


def dispatch_with_tools(agent_file_path: str, task_name: str, user_message: str,
                        project_dir, model: str = None, max_tokens: int = 8192,
                        tool_schemas: list = None, allow_write: bool = False,
                        max_iterations: int = 50, client=None,
                        on_event=None, runner=None) -> str:
    """Tool-using dispatch — codex owns its own shell/file loop (we ignore
    `tool_schemas`), governed by -C <project_dir> + the sandbox policy from
    allow_write. Same signature the router calls for the other hosts."""
    return _run(agent_file_path, user_message, model,
                project_dir=project_dir, allow_write=allow_write,
                on_event=on_event, runner=runner)
