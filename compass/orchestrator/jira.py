"""
Jira read/write/resolve for `source_of_truth: external` projects — turning a
Jira key passed on the CLI into context, enforcing ticket-state gates (Ready /
Tech-ready / not-Done), and writing the orchestrator's own state back onto the
ticket (tech design, lifecycle transitions).

Split out of run.py (which otherwise interleaves this with CLI parsing,
git/branch management, PR lifecycle, and the step-dispatch loop). Every
`_resolve_jira_*` function follows the same refuse-loud contract: None when
the input isn't a Jira key (repo mode, unchanged), else either a resolved
context dict or `sys.exit(3)` with a one-line reason ([refuse-escalate] — no
dead-ends).
"""
import os
import re
import sys
from pathlib import Path


def _work_item_jira_key(project_dir, epic_id, story_id):
    """#MVP1: the Jira key of the ticket THIS run is delivering — the story (build) whose
    `jira_key` was stored on its artifact by create-story's projection. None when there's no
    story/key (a hygiene fix has no ticket yet; Jira may not be wired)."""
    from .connector import _frontmatter_field
    if not (epic_id and story_id):
        return None
    story = Path(project_dir) / "docs" / "epics" / epic_id / "stories" / story_id / "story.md"
    if not story.exists():
        return None
    return _frontmatter_field(story.read_text(encoding="utf-8"), "jira_key")


_JIRA_KEY_RE = re.compile(r"^[A-Z][A-Z0-9]+-\d+$")


def _looks_like_jira_key(s) -> bool:
    return bool(s and _JIRA_KEY_RE.match(str(s).strip()))


def _resolve_jira_work_item(raw):
    """#Phase1a: if the /fix input is a Jira key (e.g. KAN-99) and Jira is wired, READ the
    ticket so Compass executes work that already LIVES in Jira — no repo fix record. Returns
    {key, context, issuetype, url} on success; None when the input is plain text (current
    behavior). Refuses LOUD (exit 3) when a key is given but unusable — no dead-ends."""
    ident = (raw or "").strip()
    if not _looks_like_jira_key(ident):
        return None
    from .stores import jira_auth, jira_get_issue
    auth = jira_auth()
    if not auth:
        print(f"\nRefuse: `{ident}` looks like a Jira key but no Jira creds are set "
              f"(JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN). Set them, or pass the bug as "
              f"free text.", file=sys.stderr)
        sys.exit(3)
    issue = jira_get_issue(auth, ident)
    if not issue.get("ok"):
        print(f"\nRefuse: Jira ticket {ident} not found or unreadable "
              f"(HTTP {issue.get('status_code')}). Check the key + creds.", file=sys.stderr)
        sys.exit(3)
    if issue.get("category") == "done":
        print(f"\nRefuse: {ident} is already Done — nothing to fix. Reopen it in Jira or file "
              f"a new bug.", file=sys.stderr)
        sys.exit(3)
    context = f"{issue['summary']}\n\n{issue['description']}".strip()
    return {"key": issue["key"], "context": context,
            "issuetype": issue["issuetype"], "url": issue["url"]}


def _resolve_jira_epic(raw):
    """#127 (Phase 1c): `/create-story KAN-100` names the Jira **Epic** to decompose. If the
    input is a Jira key and Jira is wired, READ the Epic so its summary+description become the
    PM's decomposition context — the stories are authored back into Jira UNDER this Epic, no
    repo brief. Returns {key, context, url} on success; None when the input isn't a key (repo
    mode — decompose a local bet). Refuses LOUD (exit 3) when a key is given but unusable, or
    names an issue that isn't an Epic (you decompose an Epic into Stories, not a Story into
    Stories) — no dead-ends."""
    ident = (raw or "").strip()
    if not _looks_like_jira_key(ident):
        return None
    from .stores import jira_auth, jira_get_issue
    auth = jira_auth()
    if not auth:
        print(f"\nRefuse: `{ident}` looks like a Jira Epic key but no Jira creds are set "
              f"(JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN). Set them, or use "
              f"`source_of_truth: repo` to decompose a local bet.", file=sys.stderr)
        sys.exit(3)
    issue = jira_get_issue(auth, ident)
    if not issue.get("ok"):
        print(f"\nRefuse: Jira issue {ident} not found or unreadable "
              f"(HTTP {issue.get('status_code')}). Check the key + creds.", file=sys.stderr)
        sys.exit(3)
    if (issue.get("issuetype") or "").lower() != "epic":
        print(f"\nRefuse: {ident} is a `{issue.get('issuetype')}`, not an Epic. "
              f"`/create-story` decomposes an **Epic** into Stories — pass the Epic key.",
              file=sys.stderr)
        sys.exit(3)
    context = f"{issue['summary']}\n\n{issue['description']}".strip()
    return {"key": issue["key"], "context": context, "url": issue["url"]}


def _resolve_jira_story_for_tech(raw):
    """#127 (tech-design): `/tech-design KAN-43` names the Jira **Story** to design. Reads it as
    the Architect's context. Returns {key, context, url}; None when the input isn't a Jira key.
    Refuses LOUD (exit 3) on missing/unreadable/no-creds, an already-Done story, or a story that
    isn't functionally **Ready** (no `ready` label — the AC/design come first, `/create-story`) —
    you don't design tech for an under-specified story."""
    ident = (raw or "").strip()
    if not _looks_like_jira_key(ident):
        return None
    from .stores import jira_auth, jira_get_issue
    auth = jira_auth()
    if not auth:
        print(f"\nRefuse: `{ident}` looks like a Jira Story key but no Jira creds are set "
              f"(JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN).", file=sys.stderr)
        sys.exit(3)
    issue = jira_get_issue(auth, ident)
    if not issue.get("ok"):
        print(f"\nRefuse: Jira story {ident} not found or unreadable "
              f"(HTTP {issue.get('status_code')}). Check the key + creds.", file=sys.stderr)
        sys.exit(3)
    if issue.get("category") == "done":
        print(f"\nRefuse: {ident} is already Done — no tech design needed.", file=sys.stderr)
        sys.exit(3)
    if "ready" not in (issue.get("labels") or []):
        print(f"\nRefuse: {ident} isn't functionally Ready (no `ready` label) — complete its "
              f"acceptance criteria / design first (`/create-story`), then tech-design it.",
              file=sys.stderr)
        sys.exit(3)
    context = f"{issue['summary']}\n\n{issue['description']}".strip()
    return {"key": issue["key"], "context": context, "url": issue["url"]}


def _resolve_jira_story_for_build(raw):
    """#127 (Phase 1d): `/build KAN-43` names the Jira **Story** to build. Reads it as the Engineer's
    context and enforces the **ready-to-build gate off the ticket**: a story builds only when it is
    both functionally **Ready** (`ready` — DoR met, `/create-story`) AND **Tech-ready** (`tech-ready`
    — arch-reviewed, `/tech-design`). Returns {key, context, url}; None when the input isn't a Jira
    key (repo mode — build reads `story.md`, unchanged). Refuses LOUD (exit 3), each naming the ONE
    next move (`[refuse-escalate]`, no dead-ends). Generalizes the repo-only #171 design/copy gate
    into the ticket-read gate for `source_of_truth: external`."""
    ident = (raw or "").strip()
    if not _looks_like_jira_key(ident):
        return None
    from .stores import jira_auth, jira_get_issue
    auth = jira_auth()
    if not auth:
        print(f"\nRefuse: `{ident}` looks like a Jira Story key but no Jira creds are set "
              f"(JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN).", file=sys.stderr)
        sys.exit(3)
    issue = jira_get_issue(auth, ident)
    if not issue.get("ok"):
        print(f"\nRefuse: Jira story {ident} not found or unreadable "
              f"(HTTP {issue.get('status_code')}). Check the key + creds.", file=sys.stderr)
        sys.exit(3)
    if issue.get("category") == "done":
        print(f"\nRefuse: {ident} is already Done — already shipped. Reopen it in Jira or file a "
              f"new story.", file=sys.stderr)
        sys.exit(3)
    labels = issue.get("labels") or []
    if "ready" not in labels:
        print(f"\nRefuse: {ident} isn't functionally Ready (no `ready` label) — complete its "
              f"acceptance criteria / design first (`/create-story`), then build it.",
              file=sys.stderr)
        sys.exit(3)
    if "tech-ready" not in labels:
        print(f"\nRefuse: {ident} is Ready but not Tech-ready (no `tech-ready` label) — the "
              f"technical design hasn't been authored. Run `/tech-design {ident}` first, then build.",
              file=sys.stderr)
        sys.exit(3)
    context = f"{issue['summary']}\n\n{issue['description']}".strip()
    return {"key": issue["key"], "context": context, "url": issue["url"]}


def _source_of_truth(project_dir):
    """#Phase1b (#127): `external` = instances live in Jira/Confluence (Compass authors them
    there, no repo record) · `repo` = Compass writes repo records (default, back-compat). Read
    from `compass/config.yaml`; default `repo` so existing setups are unchanged."""
    cfg = Path(project_dir) / "compass" / "config.yaml"
    if cfg.exists():
        m = re.search(r"^source_of_truth:\s*(\w+)", cfg.read_text(encoding="utf-8"), re.MULTILINE)
        if m:
            return m.group(1).strip().lower()
    return "repo"


def _create_jira_bug(raw_text):
    """#Phase1b: `/fix "<text>"` in external mode → CREATE a Bug in Jira from the free text
    (the fix's home is the ticket, not `docs/fixes/*.md`). The new key then flows exactly like
    `/fix KAN-99` (status driven, no repo record). Returns {key, context, url}; refuses LOUD
    (exit 3) if Jira isn't configured — no dead-ends."""
    from .stores import jira_auth, jira_push
    auth = jira_auth()
    project_key = os.environ.get("JIRA_PROJECT")
    if not auth or not project_key:
        print("\nRefuse: `source_of_truth: external` needs Jira configured to file the bug "
              "(JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN + JIRA_PROJECT). Set them, or use "
              "`source_of_truth: repo`.", file=sys.stderr)
        sys.exit(3)
    text = (raw_text or "").strip()
    summary = (text.splitlines()[0].strip() if text else "Bug")[:120] or "Bug"
    res = jira_push(auth, project_key, "Bug", summary, text)
    if not res.get("ok") or not res.get("pointer"):
        print(f"\nRefuse: could not file the Jira Bug (HTTP {res.get('status')}). Check "
              f"creds / JIRA_PROJECT.", file=sys.stderr)
        sys.exit(3)
    return {"key": res["pointer"], "context": text, "url": res.get("url")}


def _extract_md_section(text, heading):
    """#127 (tech-design): return the body of the `## <heading>` section (up to the next `## ` or
    EOF), stripped; "" if the heading is absent. Used to pull the Architect's authored
    `## Technical approach` out of its step output before writing it back onto the Jira Story."""
    m = re.search(r"(?ms)^##[ \t]+" + re.escape(heading) + r"[ \t]*$\n(.*?)(?=^##[ \t]+|\Z)",
                  text or "")
    return m.group(1).strip() if m else ""


def _splice_md_section(text, heading, body):
    """#127 (tech-design): replace the body of the `## <heading>` section with `body` (matching to
    the next `## ` or EOF), or APPEND the section if the heading is absent. Returns the new text.
    The one primitive the write-back needs (no section-merge helper exists) — it fills a Jira Story
    description's `## Technical approach`, replacing its `_Pending architecture review._` placeholder."""
    text = text or ""
    body = (body or "").strip()
    section = f"## {heading}\n\n{body}\n"
    pat = re.compile(r"(?ms)^##[ \t]+" + re.escape(heading) + r"[ \t]*$\n.*?(?=^##[ \t]+|\Z)")
    if pat.search(text):
        new = pat.sub(lambda m: section + "\n", text, count=1)   # lambda: body may contain backrefs
    else:
        new = text.rstrip() + "\n\n" + section
    new = re.sub(r"\n{3,}", "\n\n", new)
    return new.rstrip() + "\n"


def _apply_tech_design(story_key, approach_text, transport=None):
    """#127 (tech-design): write the Architect's authored `## Technical approach` back onto the Jira
    Story — read the current description, splice the section in (replacing the placeholder or
    appending), PUT the full updated description, and mark the Story `tech-ready`. Returns
    {ok, key, action, url}. Refuses LOUD (exit 3) without Jira creds / an unreadable story; NEVER
    marks tech-ready when no approach text was produced (no false Tech-ready)."""
    from .stores import jira_auth, jira_get_issue, jira_push, jira_add_labels
    approach = (approach_text or "").strip()
    auth = jira_auth()
    project_key = os.environ.get("JIRA_PROJECT")
    if not auth or not project_key:
        print("\nRefuse: tech-design needs Jira configured to write the technical approach back "
              "onto the story (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN + JIRA_PROJECT).",
              file=sys.stderr)
        sys.exit(3)
    if not approach:
        print(f"\n⚠ No `## Technical approach` was produced for {story_key} — leaving it "
              f"un-Tech-ready (nothing to write).", file=sys.stderr)
        return {"ok": False, "key": story_key, "action": "no_approach"}
    issue = jira_get_issue(auth, story_key, transport=transport)
    if not issue.get("ok"):
        print(f"\nRefuse: {story_key} not found or unreadable (HTTP {issue.get('status_code')}).",
              file=sys.stderr)
        sys.exit(3)
    new_desc = _splice_md_section(issue.get("description") or "", "Technical approach", approach)
    push = jira_push(auth, project_key, "Story", issue.get("summary") or story_key,
                     new_desc, key=story_key, transport=transport)
    if not push.get("ok"):
        print(f"\nRefuse: could not update {story_key} description (HTTP {push.get('status')}).",
              file=sys.stderr)
        sys.exit(3)
    jira_add_labels(auth, story_key, ["tech-ready"], transport=transport)
    return {"ok": True, "key": story_key, "action": "tech-ready", "url": push.get("url")}


def _advance_ticket(project_dir, epic_id, story_id, target, emit, key=None):
    """#MVP1: transition the run's work-item ticket toward a lifecycle state so the Jira board
    reflects reality (`to_do → in_progress` on start, `→ done` on merge) instead of sitting at
    "To Do" forever. `key` (#Phase1a) is the explicit ticket when the run was launched from a
    Jira key (`/fix KAN-99`); else it's resolved from the story's frontmatter. Best-effort:
    silent no-op without creds or a key; never raises; `emit`s a NOTE of what moved."""
    from . import events as ev
    from .stores import jira_auth, jira_transition
    auth = jira_auth()
    if not auth:
        return
    key = key or _work_item_jira_key(project_dir, epic_id, story_id)
    if not key:
        return
    try:
        res = jira_transition(auth, key, target)
    except Exception as exc:                       # telemetry is best-effort — never break the run
        emit(ev.NOTE, text=f"⚠ jira {key} → {target}: transition errored ({type(exc).__name__})")
        return
    if res.get("action") in ("transitioned", "noop"):
        emit(ev.NOTE, text=f"[jira {key} → {target}] {res.get('from')} → {res.get('to')} ({res['action']})")
    else:
        emit(ev.NOTE, text=f"⚠ jira {key} → {target} not applied ({res.get('action')}): {(res.get('response') or {}).get('error','')}")
