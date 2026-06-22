"""
Read-only repo tools for tool-using orchestrator dispatch (#87 slice 1).

Gives a tool-capable agent (e.g. engineer.triage-and-fix) grounded read access to the
actual project — architecture, story, source — instead of guessing. Every tool
is **sandboxed to project_dir**: any path that resolves outside it is refused
(returned as an error string the model can see, never a crash, never a read).

Slice 2 (v0.4.0-alpha-8) adds the WRITE tools — `write_file` + `bash` — so a
tool-capable implementer can apply a fix and run its regression test. They are
**opt-in only** (the orchestrator grants them solely under `--allow-write`),
**sandboxed to project_dir**, and `bash` is screened against a denylist that
mechanizes the framework's refusal rules (no force-push, no --no-verify, no
reset --hard / clean -f / branch -D, no rm -rf, no sudo, …) plus a timeout.
Per `[pluggable-graph-executor]` (compass/orchestrator/DESIGN-pluggable-executor.md).
"""
import re
import subprocess
from pathlib import Path

MAX_FILE_BYTES = 100_000      # cap a single read so one file can't blow the context
MAX_GLOB_RESULTS = 200
MAX_GREP_MATCHES = 100
MAX_WRITE_BYTES = 500_000     # cap a single write
BASH_TIMEOUT_S = 120          # bash hard timeout
MAX_BASH_OUTPUT = 20_000      # cap captured stdout+stderr fed back to the model

TOOL_SCHEMAS = [
    {
        "name": "read_file",
        "description": (
            "Read a UTF-8 text file from the project. Use to read the architecture "
            "(docs/foundation/architecture.md), the story, and the actual source "
            "before proposing changes. Path is relative to the project root."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Project-relative file path."}
            },
            "required": ["path"],
        },
    },
    {
        "name": "glob",
        "description": (
            "List files matching a glob pattern (e.g. 'src/**/*.ts', "
            "'docs/bets/*/brief.md'), relative to the project root."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Glob pattern."}
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "grep",
        "description": (
            "Search file contents for a regular expression. Optionally restrict to "
            "a glob (default: all text files). Returns matching path:line: text."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Python regex."},
                "path_glob": {
                    "type": "string",
                    "description": "Optional glob to limit the search (e.g. 'src/**/*.ts').",
                },
            },
            "required": ["pattern"],
        },
    },
]

# Write tools — granted ONLY under --allow-write (slice 2). Sandboxed to project_dir.
WRITE_TOOL_SCHEMAS = [
    {
        "name": "write_file",
        "description": (
            "Create or overwrite a UTF-8 text file in the project (relative path). "
            "Use to apply the fix and to add the regression test. Sandboxed to the "
            "project — paths outside it are refused."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Project-relative file path."},
                "content": {"type": "string", "description": "Full new file contents."},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "bash",
        "description": (
            "Run a shell command in the project root (e.g. run the regression test, "
            "typecheck, build). Destructive/forbidden commands are refused "
            "(force-push, --no-verify, reset --hard, clean -f, branch -D, rm -rf, "
            "sudo, …). Times out; output is capped."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to run."}
            },
            "required": ["command"],
        },
    },
]

_READ_NAMES = {s["name"] for s in TOOL_SCHEMAS}
_WRITE_NAMES = {s["name"] for s in WRITE_TOOL_SCHEMAS}
_SCHEMA_BY_NAME = {s["name"]: s for s in (*TOOL_SCHEMAS, *WRITE_TOOL_SCHEMAS)}


def schemas_for(names, allow_write: bool) -> list:
    """
    Resolve declared executor_tool NAMES to anthropic tool schemas.

    Write tools (write_file, bash) are dropped unless allow_write — the operator
    opt-in gate. Unknown names are ignored. This is what the orchestrator hands
    the model, so an un-granted tool simply doesn't exist to it.
    """
    out = []
    for name in (names or []):
        if name in _WRITE_NAMES and not allow_write:
            continue
        schema = _SCHEMA_BY_NAME.get(name)
        if schema:
            out.append(schema)
    return out

_TEXT_SUFFIXES = {
    ".md", ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml",
    ".toml", ".txt", ".sql", ".sh", ".css", ".html", ".env", ".cfg", ".ini",
}


def _resolve_in_sandbox(project_dir: Path, rel_path: str) -> Path:
    """
    Resolve rel_path under project_dir, refusing any escape.

    Raises ValueError if the resolved path is outside project_dir. This is the
    one security-critical function — all file access goes through it.
    """
    base = project_dir.resolve()
    target = (base / rel_path).resolve()
    if base != target and base not in target.parents:
        raise ValueError(f"path escapes project directory: {rel_path}")
    return target


def _read_file(project_dir: Path, path: str) -> str:
    target = _resolve_in_sandbox(project_dir, path)
    if not target.exists():
        return f"error: file not found: {path}"
    if not target.is_file():
        return f"error: not a file: {path}"
    data = target.read_bytes()[:MAX_FILE_BYTES]
    text = data.decode("utf-8", errors="replace")
    if target.stat().st_size > MAX_FILE_BYTES:
        text += f"\n\n[... truncated at {MAX_FILE_BYTES} bytes ...]"
    return text


def _glob(project_dir: Path, pattern: str) -> str:
    base = project_dir.resolve()
    hits = []
    for p in sorted(base.glob(pattern)):
        if p.is_file():
            try:
                hits.append(str(p.relative_to(base)))
            except ValueError:
                continue  # symlink escape — skip
        if len(hits) >= MAX_GLOB_RESULTS:
            hits.append(f"[... capped at {MAX_GLOB_RESULTS} ...]")
            break
    return "\n".join(hits) if hits else f"(no files match {pattern})"


def _grep(project_dir: Path, pattern: str, path_glob: str = None) -> str:
    base = project_dir.resolve()
    try:
        rx = re.compile(pattern)
    except re.error as exc:
        return f"error: bad regex: {exc}"
    files = base.glob(path_glob) if path_glob else base.rglob("*")
    out = []
    for p in files:
        if not p.is_file() or p.suffix not in _TEXT_SUFFIXES:
            continue
        try:
            rel = p.relative_to(base)
        except ValueError:
            continue
        try:
            for n, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if rx.search(line):
                    out.append(f"{rel}:{n}: {line.strip()[:200]}")
                    if len(out) >= MAX_GREP_MATCHES:
                        out.append(f"[... capped at {MAX_GREP_MATCHES} matches ...]")
                        return "\n".join(out)
        except OSError:
            continue
    return "\n".join(out) if out else f"(no matches for {pattern})"


def _write_file(project_dir: Path, path: str, content: str) -> str:
    target = _resolve_in_sandbox(project_dir, path)
    if content is None:
        return "error: missing content"
    data = content.encode("utf-8")
    if len(data) > MAX_WRITE_BYTES:
        return f"error: content exceeds {MAX_WRITE_BYTES} bytes"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"wrote {len(data)} bytes to {path}"


# Destructive / forbidden command patterns — mechanizes the framework refusal
# rules (CLAUDE.md + engineer.md) plus a few catastrophics. Denylist is
# best-effort; it pairs with the project_dir sandbox + the --allow-write opt-in.
_BASH_DENYLIST = [
    (r'\bgit\s+push\b.*(--force\b|--force-with-lease\b|\s-f\b)', "force-push"),
    (r'--no-verify\b', "skipping git hooks (--no-verify)"),
    (r'--no-gpg-sign\b', "skipping signing (--no-gpg-sign)"),
    (r'\bgit\s+reset\s+--hard\b', "git reset --hard"),
    (r'\bgit\s+clean\b\s+-[a-z]*f', "git clean -f"),
    (r'\bgit\s+branch\b\s+-D\b', "git branch -D (force delete)"),
    (r'\bgit\s+push\b.*:\S', "remote branch deletion via push"),
    (r'\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r', "rm -rf"),
    (r'\bsudo\b', "sudo"),
    (r'\bchmod\s+-?R?\s*777\b', "chmod 777"),
    (r'\bmkfs\b|\bdd\s+.*of=/dev/', "raw device write"),
    (r'>\s*/dev/sd|>\s*/dev/disk', "raw device write"),
    (r':\(\)\s*\{.*\|.*&\s*\}', "fork bomb"),
    (r'\b(curl|wget)\b.*\|\s*(sudo\s+)?(ba)?sh\b', "pipe-to-shell install"),
]


def _screen_bash(command: str):
    """Return a denial reason if the command is forbidden, else None."""
    for pattern, reason in _BASH_DENYLIST:
        if re.search(pattern, command, re.IGNORECASE):
            return reason
    return None


def _bash(project_dir: Path, command: str) -> str:
    reason = _screen_bash(command)
    if reason:
        return (
            f"error: command refused — {reason}. This violates the Compass refusal "
            f"rules; do it a safe way or hand off to the human."
        )
    try:
        proc = subprocess.run(
            command, shell=True, cwd=str(project_dir.resolve()),
            capture_output=True, text=True, timeout=BASH_TIMEOUT_S,
            stdin=subprocess.DEVNULL,  # a command that reads stdin fails fast, not hangs (#97)
        )
    except subprocess.TimeoutExpired:
        return f"error: command timed out after {BASH_TIMEOUT_S}s"
    out = (proc.stdout or "") + (proc.stderr or "")
    if len(out) > MAX_BASH_OUTPUT:
        out = out[:MAX_BASH_OUTPUT] + f"\n[... output capped at {MAX_BASH_OUTPUT} chars ...]"
    return f"exit code: {proc.returncode}\n{out}"


def execute_tool(name: str, tool_input: dict, project_dir: Path, allow_write: bool = False) -> str:
    """
    Run a tool by name. Returns a string result (or an error string the model
    can read and recover from). Never raises on bad input / sandbox escape.

    Write tools (write_file, bash) require allow_write — a second defense layer
    behind schema-filtering (`schemas_for`): even if a write tool somehow reaches
    here without the opt-in, it is refused.
    """
    try:
        if name == "read_file":
            return _read_file(project_dir, tool_input["path"])
        if name == "glob":
            return _glob(project_dir, tool_input["pattern"])
        if name == "grep":
            return _grep(project_dir, tool_input["pattern"], tool_input.get("path_glob"))
        if name in _WRITE_NAMES and not allow_write:
            return f"error: '{name}' requires --allow-write (write mode is off)"
        if name == "write_file":
            return _write_file(project_dir, tool_input["path"], tool_input.get("content"))
        if name == "bash":
            return _bash(project_dir, tool_input["command"])
        return f"error: unknown tool '{name}'"
    except ValueError as exc:
        return f"error: {exc}"
    except KeyError as exc:
        return f"error: missing required argument {exc}"
