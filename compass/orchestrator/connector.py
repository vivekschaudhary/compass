"""
Connector layer — pushes HITL-approved artifacts to their canonical location.

Per improvement #70 (architecture amendment 2026-06-10): runs.jsonl holds the
draft; HITL approval is the WRITE TRIGGER that pushes the artifact to its
canonical home. The canonical home is connector-dependent — Confluence / Notion
/ Linear when configured, the project filesystem (`docs/`) otherwise.

Per [declare-not-implement] (canon v0.3.9), this module DECLARES the push
interface and implements ONLY the filesystem backend. Vendor backends are
consumer-side / upstream work:

    push contract for a future backend:
      def push(project_dir: Path, canonical_rel_path: str, content: str) -> str
      — deliver `content` to the destination identified by `canonical_rel_path`,
        return a human-readable label for the hitl.jsonl `connector` field.

`resolve_connector()` reads `compass/config.yaml` `connectors.docs:`; an
unimplemented name degrades to the filesystem backend with an honest label
("filesystem fallback — <name> not implemented") — never silently.
"""
import re
from datetime import datetime, timezone
from pathlib import Path

IMPLEMENTED_BACKENDS = {"filesystem"}


def resolve_connector(project_dir: Path, compass_dir: Path = None) -> str:
    """Read the configured docs connector name from compass/config.yaml."""
    config = (compass_dir or project_dir / "compass") / "config.yaml"
    if not config.exists():
        return "filesystem"
    in_connectors = False
    for line in config.read_text(encoding="utf-8").splitlines():
        stripped = line.split("#")[0].rstrip()
        if re.match(r"^connectors\s*:", stripped):
            in_connectors = True
            continue
        if in_connectors:
            if stripped and not stripped.startswith(" "):
                break  # left the connectors block
            m = re.match(r"^\s+docs\s*:\s*(\S+)", stripped)
            if m:
                return m.group(1)
    return "filesystem"


def push_artifact(
    project_dir: Path,
    canonical_rel_path: str,
    content: str,
    connector_name: str = "filesystem",
) -> str:
    """
    Push approved content to its canonical location.

    Only the filesystem backend is implemented; any other configured name
    falls back to filesystem with an explicit label so the hitl.jsonl record
    is honest about where the artifact actually landed.
    """
    if connector_name in IMPLEMENTED_BACKENDS:
        label = connector_name
    else:
        label = f"filesystem fallback — {connector_name} not implemented"

    target = project_dir / canonical_rel_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return label


def extract_artifact_body(step_output: str) -> str:
    """
    Extract the artifact draft from an agent step output.

    Agents append an '## Output summary' section per their output contract —
    that is run metadata, not artifact content. Strip from the first such
    heading onward; if absent, the output is taken verbatim.
    """
    match = re.search(r"^##\s+Output summary\s*$", step_output, re.MULTILINE | re.IGNORECASE)
    if match:
        return step_output[: match.start()].rstrip() + "\n"
    return step_output.rstrip() + "\n"


def set_frontmatter_status(content: str, status: str, run_id: str = None) -> str:
    """
    Set `status:` in the artifact's YAML frontmatter.

    Replaces an existing status line; injects one into an existing frontmatter
    block that lacks it; creates a minimal block when the draft has none.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fm_match = re.match(r"^---\n(.*?)\n---\n?", content, re.DOTALL)

    if fm_match:
        fm = fm_match.group(1)
        if re.search(r"^status\s*:", fm, re.MULTILINE):
            fm = re.sub(r"^status\s*:.*$", f"status: {status}", fm, count=1, flags=re.MULTILINE)
        else:
            fm = fm + f"\nstatus: {status}"
        if f"\napproved:" not in fm and status == "approved":
            fm = fm + f"\napproved: {today}"
        if run_id and "source_run:" not in fm:
            fm = fm + f"\nsource_run: {run_id}"
        return f"---\n{fm}\n---\n" + content[fm_match.end():]

    lines = [f"status: {status}"]
    if status == "approved":
        lines.append(f"approved: {today}")
    if run_id:
        lines.append(f"source_run: {run_id}")
    return "---\n" + "\n".join(lines) + "\n---\n\n" + content


def read_frontmatter_status(path: Path) -> str:
    """Return the `status:` value from a file's frontmatter, or '' if absent."""
    if not path.exists():
        return ""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    fm_match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not fm_match:
        return ""
    m = re.search(r"^status\s*:\s*(\S+)", fm_match.group(1), re.MULTILINE)
    return m.group(1) if m else ""
