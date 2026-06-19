"""
Read-only repo tools for tool-using orchestrator dispatch (#87 slice 1).

Gives a tool-capable agent (e.g. engineer.fix-bug) grounded read access to the
actual project — architecture, story, source — instead of guessing. Every tool
is **sandboxed to project_dir**: any path that resolves outside it is refused
(returned as an error string the model can see, never a crash, never a read).

Slice 1 is READ-ONLY by design — no write_file, no bash. Those arrive in
slice 2 with their own guards. Per `[pluggable-graph-executor]`
(compass/orchestrator/DESIGN-pluggable-executor.md).
"""
import re
from pathlib import Path

MAX_FILE_BYTES = 100_000      # cap a single read so one file can't blow the context
MAX_GLOB_RESULTS = 200
MAX_GREP_MATCHES = 100

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


def execute_tool(name: str, tool_input: dict, project_dir: Path) -> str:
    """
    Run a read tool by name. Returns a string result (or an error string the
    model can read and recover from). Never raises on bad input / sandbox escape.
    """
    try:
        if name == "read_file":
            return _read_file(project_dir, tool_input["path"])
        if name == "glob":
            return _glob(project_dir, tool_input["pattern"])
        if name == "grep":
            return _grep(project_dir, tool_input["pattern"], tool_input.get("path_glob"))
        return f"error: unknown tool '{name}'"
    except ValueError as exc:
        return f"error: {exc}"
    except KeyError as exc:
        return f"error: missing required argument {exc}"
