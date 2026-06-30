"""
Connector layer — pushes HITL-approved artifacts to their canonical location.

Per improvement #70 (architecture amendment 2026-06-10): runs.jsonl holds the
draft; HITL approval is the WRITE TRIGGER that pushes the artifact to its
canonical home. The canonical home is connector-dependent — Confluence / Notion
/ Linear when configured, the project filesystem (`docs/`) otherwise.

This module implements the **filesystem** backend (the Compass-primary cache, always
written) and **one-way projection** to **jira** + **confluence** (via `stores.py`,
server-to-server API token). Compass stays canonical; the external systems are
projections of it. The distribution pointer (Jira key / Confluence page id) is stored
on the artifact's frontmatter, so a re-push is an idempotent update-not-create. Missing
creds → honest filesystem fallback (never a silent failure).

`resolve_connector()` reads `compass/config.yaml` `connectors.docs:` (the gate-promotion
default); `resolve_connector_for_artifact()` routes per artifact type (stories →
ticketing/jira; docs → docs/confluence).
"""
import os
import re
from datetime import datetime, timezone
from pathlib import Path

IMPLEMENTED_BACKENDS = {"filesystem", "jira", "confluence"}


def _push_err(res: dict) -> str:
    """#181: a concise, actionable failure reason from a jira/confluence push result —
    so the fallback label says WHY (401 bad creds, 404 wrong space, title exists, …)
    instead of a blind 'push failed'. Reads the HTTP status + the API error body
    (Confluence: message; Jira: errorMessages/errors)."""
    import json as _json
    r = res.get("response") or {}
    status = res.get("status")
    msg = (r.get("message")
           or "; ".join(r.get("errorMessages") or [])
           or (_json.dumps(r.get("errors")) if r.get("errors") else "")
           or r.get("error")
           or (str(r)[:160] if r else "no response body"))
    return f"HTTP {status}: {msg}".strip() if status else (msg or "unknown error")[:200]


def _config_connector(project_dir: Path, compass_dir, key: str) -> str:
    """Read `connectors.<key>` from compass/config.yaml (filesystem if unset)."""
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
            m = re.match(rf"^\s+{re.escape(key)}\s*:\s*(\S+)", stripped)
            if m:
                return m.group(1)
    return "filesystem"


def resolve_connector(project_dir: Path, compass_dir: Path = None) -> str:
    """The configured docs connector (back-compat — the gate-promotion default)."""
    return _config_connector(project_dir, compass_dir, "docs")


def resolve_connector_for_artifact(canonical_rel_path, project_dir: Path,
                                   compass_dir: Path = None) -> str:
    """Per-artifact-type backend (Compass-primary → one-way projection): a story →
    ticketing (jira); foundation / brief / architecture docs → docs (confluence)."""
    if re.search(r"/stories/[^/]+/story\.md$", str(canonical_rel_path)):
        return _config_connector(project_dir, compass_dir, "ticketing")
    return _config_connector(project_dir, compass_dir, "docs")


def _frontmatter_field(content: str, field: str):
    """Read a frontmatter `field:` value, or None."""
    fm = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not fm:
        return None
    m = re.search(rf"^{re.escape(field)}\s*:\s*(\S+)", fm.group(1), re.MULTILINE)
    return m.group(1) if m else None


def _set_frontmatter_field(content: str, field: str, value) -> str:
    """Set/replace a frontmatter `field:` (creates a block if absent). Used to store
    the distribution pointer (jira_key / confluence_page_id) for idempotent re-push."""
    if value is None:
        return content
    fm = re.match(r"^---\n(.*?)\n---\n?", content, re.DOTALL)
    if fm:
        block = fm.group(1)
        if re.search(rf"^{re.escape(field)}\s*:", block, re.MULTILINE):
            block = re.sub(rf"^{re.escape(field)}\s*:.*$", f"{field}: {value}",
                           block, count=1, flags=re.MULTILINE)
        else:
            block = block + f"\n{field}: {value}"
        return f"---\n{block}\n---\n" + content[fm.end():]
    return f"---\n{field}: {value}\n---\n\n" + content


def _artifact_title(content: str, rel_path) -> str:
    """Title for the projected object — first markdown H1, else frontmatter id/title,
    else the artifact's parent-dir / filename."""
    m = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if m:
        return m.group(1).strip()
    for field in ("title", "id"):
        v = _frontmatter_field(content, field)
        if v:
            return v
    p = Path(rel_path)
    return p.parent.name or p.stem


def push_artifact(
    project_dir: Path,
    canonical_rel_path: str,
    content: str,
    connector_name: str = "filesystem",
    transport=None,
) -> str:
    """Write the Compass-primary filesystem cache (always), then PROJECT one-way to the
    configured backend (jira/confluence) when credentialed, storing the distribution
    pointer on the artifact for an idempotent re-push. Missing creds / failure → an
    honest filesystem-fallback label so hitl.jsonl never lies about where it landed.
    `transport` is injectable for tests."""
    from . import stores
    target = project_dir / canonical_rel_path
    target.parent.mkdir(parents=True, exist_ok=True)

    def _land(text, label):
        target.write_text(text, encoding="utf-8")
        return label

    if connector_name == "filesystem":
        return _land(content, "filesystem")

    if connector_name == "jira":
        auth = stores.jira_auth()
        project_key = os.environ.get("JIRA_PROJECT")
        if not auth or not project_key:
            return _land(content, "filesystem fallback — jira not configured "
                                  "(set JIRA_BASE_URL/EMAIL/API_TOKEN + JIRA_PROJECT)")
        issue_type = "Story" if "/stories/" in str(canonical_rel_path) else "Epic"
        res = stores.jira_push(auth, project_key, issue_type,
                               _artifact_title(content, canonical_rel_path), content,
                               key=_frontmatter_field(content, "jira_key"),
                               transport=transport)
        if res.get("ok") and res.get("pointer"):
            content = _set_frontmatter_field(content, "jira_key", res["pointer"])
            content = _set_frontmatter_field(content, "jira_url", res.get("url"))
            return _land(content, f"jira ({res['pointer']}, {res['action']})")
        return _land(content, f"filesystem fallback — jira push failed: {_push_err(res)}")

    if connector_name == "confluence":
        auth = stores.confluence_auth()
        space = os.environ.get("CONFLUENCE_SPACE")
        if not auth or not space:
            return _land(content, "filesystem fallback — confluence not configured "
                                  "(set CONFLUENCE_BASE_URL/EMAIL/API_TOKEN + CONFLUENCE_SPACE)")
        res = stores.confluence_push(auth, space,
                                     _artifact_title(content, canonical_rel_path), content,
                                     page_id=_frontmatter_field(content, "confluence_page_id"),
                                     transport=transport)
        if res.get("ok") and res.get("pointer"):
            content = _set_frontmatter_field(content, "confluence_page_id", res["pointer"])
            content = _set_frontmatter_field(content, "confluence_url", res.get("url"))
            return _land(content, f"confluence ({res['pointer']}, {res['action']})")
        return _land(content, f"filesystem fallback — confluence push failed: {_push_err(res)}")

    return _land(content, f"filesystem fallback — {connector_name} not implemented")


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
