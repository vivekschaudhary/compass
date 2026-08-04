"""
Docs-primary artifact lifecycle — the page IS the record, a ticket IS the approval.

Where `connector.py` is Compass-primary (repo holds truth, external systems are
projections), this module is the inverse and is used by workflows whose artifact lives
in the engagement's docs system:

    publish()          ensure the engagement parent → push the page → REMOVE any local
                       file, so exactly one record exists (#127's story→Jira pattern,
                       applied to foundation docs)
    open_gate_ticket() create/update the Jira ticket that carries a human gate decision
    gate_state()       read that ticket — `approved` is the gate signal downstream
                       workflows check instead of a repo file
    revert_gate()      any change to an approved artifact sends the gate back to pending

Two gates, two tickets (#154): `research` (the Researcher's evidence page) and `brief`
(the PM's product brief). Approval is read from Jira's `statusCategory` — stable across
client workflows, unlike status names.

Nothing here falls back to the filesystem. If the docs system or Jira cannot be reached,
the caller refuses: a silent local write would recreate the dual-truth this design
removes. Local removal happens ONLY after a successful push, so unshipped work is never
deleted.
"""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from . import docs_adapter, stores
from .docs_adapter import DocsError, DocsUnreachable  # re-exported for callers

# The `<name>@tickets` slots a workflow may declare in `requires_approved:`.
TICKET_SLOT_SUFFIX = "@tickets"
GATE_TICKET_LEDGER = "gate-tickets.jsonl"

# gate name → (ticket summary suffix, Jira issue type)
GATES = {
    "research": ("Research review", "Task"),
    "brief": ("Product brief approval", "Task"),
}


class GateUnreachable(DocsError):
    """The approval ticket cannot be created or read — refuse rather than guess."""


def _jira_context():
    auth = stores.jira_auth()
    project_key = os.environ.get("JIRA_PROJECT")
    if not auth or not project_key:
        missing = []
        if not auth:
            missing.append("JIRA_BASE_URL/EMAIL/API_TOKEN (or ATLASSIAN_*)")
        if not project_key:
            missing.append("JIRA_PROJECT")
        raise GateUnreachable(
            "the approval ticket is the gate record but Jira is not configured — set "
            + " + ".join(missing) + ". Refusing rather than approving unrecorded."
        )
    return auth, project_key


def publish(project_dir, title, body, parent_title, page_id=None, local_path=None,
            backend=None, transport=None) -> dict:
    """Publish a page docs-primary: find-or-create the engagement parent, create-or-update
    the page beneath it, then delete `local_path` if it exists.

    Returns {pointer, url, action, parent_pointer, parent_action, removed}. `removed` is
    the repo-relative path deleted, or None. Raises DocsUnreachable on any failure —
    and in that case nothing local is removed.
    """
    project_dir = Path(project_dir)
    backend = backend or docs_adapter.resolve_docs_backend(project_dir)

    parent = docs_adapter.ensure_parent(backend, parent_title, transport=transport)
    page = docs_adapter.push_page(backend, title, body, page_id=page_id,
                                  parent_id=parent["pointer"], transport=transport)

    # Only now that the page is definitely landed may the local copy go.
    removed = None
    if local_path:
        target = project_dir / local_path
        if target.is_file():
            target.unlink()
            removed = str(local_path)
            _prune_empty_parents(project_dir, target.parent)

    return {"pointer": page["pointer"], "url": page.get("url"), "action": page["action"],
            "parent_pointer": parent["pointer"], "parent_action": parent["action"],
            "removed": removed}


def _prune_empty_parents(project_dir: Path, directory: Path):
    """Remove now-empty dirs left behind by the deleted file, stopping at project_dir."""
    project_dir = project_dir.resolve()
    directory = directory.resolve()
    while (directory != project_dir and project_dir in directory.parents
           and directory.is_dir() and not any(directory.iterdir())):
        directory.rmdir()
        directory = directory.parent


def open_gate_ticket(gate: str, subject: str, page_url: str = None, key: str = None,
                     transport=None) -> dict:
    """Create (or update, when `key` is given) the Jira ticket carrying a gate decision.

    Returns {key, url, action}. Raises GateUnreachable on failure.
    """
    if gate not in GATES:
        raise GateUnreachable(
            f"unknown gate '{gate}' — expected one of {', '.join(sorted(GATES))}.")
    suffix, issue_type = GATES[gate]
    auth, project_key = _jira_context()

    summary = f"{subject} — {suffix}"
    body = (f"Compass gate: **{suffix}**.\n\n"
            f"Review the artifact and move this ticket to Done to approve it. "
            f"Compass reads this ticket's status as the gate signal; downstream "
            f"workflows stay blocked until it is Done.\n")
    if page_url:
        body += f"\nArtifact: {page_url}\n"

    res = stores.jira_push(auth, project_key, issue_type, summary, body, key=key,
                           transport=transport)
    if not res.get("ok") or not res.get("pointer"):
        raise GateUnreachable(
            f"could not {'update' if key else 'create'} the {gate} gate ticket "
            f"in project '{project_key}' (HTTP {res.get('status')}): {res.get('response')}"
        )
    return {"key": res["pointer"], "url": res.get("url"), "action": res["action"]}


# Canonical repo path → the gate slot that replaces it under `source_of_truth: external`.
# A workflow keeps declaring the familiar path in `requires_approved:`; under docs-primary
# there is no such file, so the gate resolves to the artifact's approval TICKET instead.
# Declaring the path (not the slot) keeps repo-mode consumers byte-for-byte unchanged.
DOCS_PRIMARY_SLOTS = {
    "docs/foundation/product.md": "product-brief@tickets",
    "docs/foundation/research.md": "research@tickets",
}


def is_ticket_slot(requirement: str) -> bool:
    """True for the `<name>@tickets` requirement form (vs a repo path)."""
    return str(requirement).strip().endswith(TICKET_SLOT_SUFFIX)


def ticket_slot_for_path(rel_path: str):
    """The gate slot standing in for a repo path under docs-primary, or None."""
    return DOCS_PRIMARY_SLOTS.get(str(rel_path).strip().lstrip("./"))


def record_gate_ticket(project_dir, slot: str, ticket_key: str, url: str = None) -> dict:
    """Remember which Jira ticket carries a gate slot, so a later workflow can resolve
    `<name>@tickets` without a repo file.

    The ledger lives in the user-local state dir alongside runs.jsonl / hitl.jsonl
    (`logger.runs_root`) — OUT of the repo, so docs-primary really does leave `git
    status` clean. Append-only; the newest record for a slot wins.
    """
    from .logger import ensure_runs_dir
    record = {"ts": datetime.now(timezone.utc).isoformat(), "slot": slot,
              "ticket": ticket_key, "url": url}
    path = ensure_runs_dir(Path(project_dir)) / GATE_TICKET_LEDGER
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def resolve_gate_ticket(project_dir, slot: str):
    """The most recent ticket key recorded for a gate slot, or None if never opened."""
    from .logger import runs_root
    path = runs_root(Path(project_dir)) / GATE_TICKET_LEDGER
    if not path.exists():
        return None
    found = None
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError:
            continue          # a torn line must not blind the gate to earlier records
        if rec.get("slot") == slot and rec.get("ticket"):
            found = rec["ticket"]
    return found


def slot_approved(project_dir, slot: str, transport=None) -> tuple:
    """Resolve a `<name>@tickets` requirement. Returns (met: bool, how: str).

    Never raises: an unresolvable or unreadable gate is reported as UNMET with the
    reason, so the caller's gate output stays uniform with the repo-path form.
    """
    ticket = resolve_gate_ticket(project_dir, slot)
    if not ticket:
        return False, "no gate ticket recorded for this slot"
    try:
        state = gate_state(ticket, transport=transport)
    except GateUnreachable as exc:
        return False, f"{ticket} unreadable — {exc}"
    if state["approved"]:
        return True, f"{ticket} is {state['status']} (done)"
    return False, f"{ticket} is {state['status']} — not approved"


def gate_state(ticket_key: str, transport=None) -> dict:
    """Read a gate ticket. Returns {key, approved, status, category, url}.

    `approved` is True only when Jira's statusCategory is `done` — categories are stable
    across client Jira workflows; status names are not. Raises GateUnreachable when the
    ticket cannot be read, so an unreachable gate is never silently treated as open.
    """
    auth, _ = _jira_context()
    issue = stores.jira_get_issue(auth, ticket_key, transport=transport)
    if not issue.get("ok"):
        raise GateUnreachable(
            f"could not read gate ticket {ticket_key} "
            f"(HTTP {issue.get('status_code')}). Check the key and Jira creds."
        )
    return {"key": issue["key"], "approved": issue.get("category") == "done",
            "status": issue.get("status"), "category": issue.get("category"),
            "url": issue.get("url")}


def revert_gate(ticket_key: str, transport=None) -> dict:
    """Send an approved gate back to pending — every change to an approved artifact
    requires a fresh human decision (#154). No-op when already pending.

    Returns {key, action, from, to}. Raises GateUnreachable when the ticket is
    unreadable; a transition with no available path is reported, not raised, so the
    caller can tell the human to move it by hand.
    """
    auth, _ = _jira_context()
    state = gate_state(ticket_key, transport=transport)
    if not state["approved"]:
        return {"key": ticket_key, "action": "noop", "from": state["status"],
                "to": state["status"]}
    res = stores.jira_transition(auth, ticket_key, "todo", transport=transport)
    return {"key": ticket_key, "action": res.get("action"), "from": res.get("from"),
            "to": res.get("to")}
