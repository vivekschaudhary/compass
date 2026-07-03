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
    """Per-artifact-type backend (Compass-primary → one-way projection): a story or a
    fix record → ticketing (jira); foundation / brief / architecture docs → docs
    (confluence)."""
    p = str(canonical_rel_path)
    if re.search(r"/stories/[^/]+/story\.md$", p):
        return _config_connector(project_dir, compass_dir, "ticketing")
    if re.search(r"/fixes/[^/]+\.md$", p):          # #71: a fix record → Jira Bug/Story
        return _config_connector(project_dir, compass_dir, "ticketing")
    return _config_connector(project_dir, compass_dir, "docs")


# #73: work-type → Jira issue type. The artifact's frontmatter `type:` picks the row;
# callers (/fix, /ops) may also pass an explicit issue_type. Sub-task is intentionally
# absent — no consumer parents work under a Story yet (deferred, see #73).
_JIRA_ISSUE_TYPE = {
    "bet": "Epic", "brief": "Epic",
    "story": "Story", "design": "Story", "copy": "Story", "enhancement": "Story",
    "architecture": "Task", "research": "Task", "ops": "Task",
    "bug": "Bug", "defect": "Bug",
}


def resolve_issue_type(canonical_rel_path, content: str = "") -> str:
    """#73: the Jira issue type for an artifact. Prefers the frontmatter `type:`
    (bug/defect→Bug, architecture/research/ops→Task, story/design/copy→Story,
    bet/brief→Epic); falls back to the path. Defaults to Epic (back-compat: today the
    only jira-routed artifact is a story → Story, and a bet brief → Epic)."""
    t = (_frontmatter_field(content, "type") or "").lower()
    if t in _JIRA_ISSUE_TYPE:
        return _JIRA_ISSUE_TYPE[t]
    p = str(canonical_rel_path)
    if re.search(r"/stories/[^/]+/story\.md$", p):
        return "Story"
    if "/fixes/" in p:          # #71: a fix record with no explicit type defaults to Bug
        return "Bug"
    if "/ops/" in p:
        return "Task"
    if re.search(r"/(architecture|research)\.md$", p):
        return "Task"
    return "Epic"


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
    issue_type: str = None,
) -> str:
    """Write the Compass-primary filesystem cache (always), then PROJECT one-way to the
    configured backend (jira/confluence) when credentialed, storing the distribution
    pointer on the artifact for an idempotent re-push. Missing creds / failure → an
    honest filesystem-fallback label so hitl.jsonl never lies about where it landed.
    `transport` is injectable for tests. `issue_type` (#73) overrides the Jira issue
    type (/fix passes Bug or Story, /ops passes Task); when None it is resolved from
    the artifact's frontmatter `type:` / path via `resolve_issue_type`."""
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
        itype = issue_type or resolve_issue_type(canonical_rel_path, content)
        res = stores.jira_push(auth, project_key, itype,
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


def _frontmatter_list(content: str, field: str) -> list:
    """#35: read a frontmatter list field (`dependencies`, `area_tags`) as a list of ids
    — inline (`[a, b]`/`a, b`) + block (`  - a`) forms; drops `<placeholder>` items."""
    fm = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not fm:
        return []
    m = re.search(rf"^{re.escape(field)}[ \t]*:[ \t]*(.*(?:\n[ \t]+-.*)*)$",
                  fm.group(1), re.MULTILINE)
    if not m:
        return []
    inline, _, rest = m.group(1).partition("\n")
    items = list(inline.strip().strip("[]").split(","))
    for line in rest.splitlines():
        lm = re.match(r"^[ \t]+-\s*(.*)$", line)
        if lm:
            items.append(lm.group(1))
    return [x.strip().strip("\"'") for x in items
            if x.strip().strip("\"'") and not x.strip().startswith("<")]


def project_bet_jira_structure(project_dir, bet_id: str, transport=None) -> list:
    """#35: after a bet's stories are projected to Jira (flat issues with stored
    `jira_key`s), wire the STRUCTURE so the program is visible in Jira, not a flat pile:
      1. a bet **Epic** (created once; pointer `jira_epic_key` stored on brief.md),
      2. each story **parented** under that epic,
      3. **'is blocked by'** links from each story's `dependencies`.
    Idempotent — reuses the epic pointer, re-parenting is a no-op PUT, and existing
    links are skipped. Reads the on-disk `jira_key`s (only stories already projected get
    wired). No-op with a reason when Jira isn't configured. Returns action strings."""
    import os
    from pathlib import Path as _Path
    from . import stores
    auth = stores.jira_auth()
    project_key = os.environ.get("JIRA_PROJECT")
    if not auth or not project_key:
        return ["structure skipped — jira not configured (JIRA_* / JIRA_PROJECT)"]
    bet_dir = _Path(project_dir) / "docs" / "bets" / bet_id
    actions = []

    # 1) ensure the bet Epic
    brief = bet_dir / "brief.md"
    bc = brief.read_text(encoding="utf-8") if brief.exists() else ""
    epic_key = _frontmatter_field(bc, "jira_epic_key")
    if not epic_key:
        title = _artifact_title(bc, f"docs/bets/{bet_id}/brief.md") if bc else bet_id
        res = stores.jira_push(auth, project_key, "Epic", f"{bet_id}: {title}",
                               bc or f"# {bet_id}", transport=transport)
        if res.get("ok") and res.get("pointer"):
            epic_key = res["pointer"]
            if brief.exists():
                bc = _set_frontmatter_field(bc, "jira_epic_key", epic_key)
                bc = _set_frontmatter_field(bc, "jira_epic_url", res.get("url"))
                brief.write_text(bc, encoding="utf-8")
            actions.append(f"epic {epic_key} created")
        else:
            return actions + [f"epic create failed: {_push_err(res)}"]
    else:
        actions.append(f"epic {epic_key} (reused)")

    # gather already-projected stories: story_id -> (jira_key, [deps])
    story_key, story_deps = {}, {}
    sdir = bet_dir / "stories"
    for sf in sorted(sdir.glob("*/story.md")) if sdir.is_dir() else []:
        c = sf.read_text(encoding="utf-8")
        jk = _frontmatter_field(c, "jira_key")
        if jk:
            story_key[sf.parent.name] = jk
            story_deps[sf.parent.name] = _frontmatter_list(c, "dependencies")

    # 2) parent each story under the epic
    for sid, jk in story_key.items():
        res = stores.jira_set_parent(auth, jk, epic_key, transport=transport)
        actions.append(f"{jk} → under {epic_key}" if res.get("ok")
                       else f"{jk} parent failed: {_push_err(res)}")

    # 3) 'is blocked by' links from dependencies (idempotent)
    for sid, jk in story_key.items():
        existing = stores.jira_links_of(auth, jk, transport=transport)
        for dep in story_deps.get(sid, []):
            dk = story_key.get(dep)
            if not dk or ("Blocks", dk) in existing:
                continue
            res = stores.jira_link(auth, inward_key=jk, outward_key=dk, transport=transport)
            actions.append(f"{jk} ⟵ blocked by {dk}" if res.get("ok")
                           else f"link {jk}⟵{dk} failed: {_push_err(res)}")
    return actions


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
