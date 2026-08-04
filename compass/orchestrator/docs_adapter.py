"""
Docs adapter — the `@docs` slot, resolved to a configured provider.

Per the adapter-slot vocabulary in `compass/templates/workflow.md`, a workflow names a
CAPABILITY (`product-brief@docs`), never a vendor. This module is where that slot
resolves: `connectors.docs` in `compass/config.yaml` picks the backend, and every
backend answers the same four questions —

    ensure_parent(...)    find-or-create the per-engagement parent page
    push_page(...)        create-or-update a page beneath it (idempotent via page_id)
    read_page(...)        read a page's body back
    page_comments(...)    list comments (the revision-command intake)

Contrast with `connector.py`, which projects a repo-primary artifact OUTWARD and falls
back to the filesystem when uncredentialed. This module serves the **docs-primary**
case: the page IS the record, there is no repo copy to fall back to, so an unreachable
or uncredentialed docs system RAISES `DocsUnreachable` rather than silently writing a
local file. A silent fallback would recreate exactly the dual-truth problem
docs-primary removes.

`confluence` is implemented. `gdrive` and `teams-sharepoint` are named in the slot
vocabulary and raise `DocsBackendNotImplemented` — declared, not implemented, per
`[declare-not-implement]`.
"""
import os

from . import stores

IMPLEMENTED_DOCS_BACKENDS = {"confluence"}
DECLARED_DOCS_BACKENDS = {"gdrive", "teams-sharepoint"}


class DocsError(Exception):
    """Base for docs-adapter failures."""


class DocsUnreachable(DocsError):
    """The docs system is the system of record and cannot be reached or written.

    Raised instead of falling back to the filesystem. Carries an actionable reason —
    which env vars are missing, or what the API returned.
    """


class DocsBackendNotImplemented(DocsError):
    """The configured `connectors.docs` backend has no implementation yet."""


def resolve_docs_backend(project_dir, compass_dir=None) -> str:
    """The configured docs backend name (`connectors.docs` in compass/config.yaml)."""
    from .connector import resolve_connector
    return resolve_connector(project_dir, compass_dir)


def _confluence_context():
    """Auth + space for confluence, or raise DocsUnreachable naming what is missing."""
    auth = stores.confluence_auth()
    space = os.environ.get("CONFLUENCE_SPACE")
    if not auth or not space:
        missing = []
        if not auth:
            missing.append("CONFLUENCE_BASE_URL/EMAIL/API_TOKEN (or ATLASSIAN_*)")
        if not space:
            missing.append("CONFLUENCE_SPACE")
        raise DocsUnreachable(
            "docs system is the system of record but confluence is not configured — "
            "set " + " + ".join(missing) + ". Refusing rather than writing a repo file."
        )
    return auth, space


def _check_backend(backend: str):
    if backend in IMPLEMENTED_DOCS_BACKENDS:
        return
    if backend in DECLARED_DOCS_BACKENDS:
        raise DocsBackendNotImplemented(
            f"connectors.docs is '{backend}', which is declared in the @docs slot "
            f"vocabulary but has no backend yet. Implemented: "
            f"{', '.join(sorted(IMPLEMENTED_DOCS_BACKENDS))}."
        )
    raise DocsBackendNotImplemented(
        f"connectors.docs is '{backend}' — unknown docs backend. Implemented: "
        f"{', '.join(sorted(IMPLEMENTED_DOCS_BACKENDS))}; declared: "
        f"{', '.join(sorted(DECLARED_DOCS_BACKENDS))}."
    )


def ensure_parent(backend: str, title: str, transport=None) -> dict:
    """Find-or-create the per-engagement parent page. Idempotent: an existing page with
    this exact title in the configured space is reused, never duplicated.

    Returns {pointer, url, action: found|created}. Raises DocsUnreachable on failure.
    """
    _check_backend(backend)
    auth, space = _confluence_context()

    found = stores.confluence_find_page(auth, space, title, transport=transport)
    if not found.get("ok"):
        raise DocsUnreachable(
            f"could not search confluence space '{space}' for parent page "
            f"'{title}' (HTTP {found.get('status')}): {found.get('response')}"
        )
    if found.get("found"):
        return {"pointer": found["pointer"], "url": found.get("url"), "action": "found"}

    created = stores.confluence_push(
        auth, space, title,
        f"Compass engagement root for **{title}**. "
        "Artifacts for this engagement are filed beneath this page.",
        transport=transport)
    if not created.get("ok"):
        raise DocsUnreachable(
            f"could not create parent page '{title}' in space '{space}' "
            f"(HTTP {created.get('status')}): {created.get('response')}"
        )
    return {"pointer": created["pointer"], "url": created.get("url"), "action": "created"}


def push_page(backend: str, title: str, body: str, page_id=None, parent_id=None,
              transport=None) -> dict:
    """Create-or-update a page. Idempotent via `page_id` (update-not-create); `parent_id`
    files a new page beneath the engagement parent.

    Returns {pointer, url, action: created|updated}. Raises DocsUnreachable on failure.
    """
    _check_backend(backend)
    auth, space = _confluence_context()
    res = stores.confluence_push(auth, space, title, body, page_id=page_id,
                                 parent_id=parent_id, transport=transport)
    if not res.get("ok") or not res.get("pointer"):
        raise DocsUnreachable(
            f"could not {'update' if page_id else 'create'} page '{title}' in space "
            f"'{space}' (HTTP {res.get('status')}): {res.get('response')}"
        )
    return {"pointer": res["pointer"], "url": res.get("url"), "action": res["action"]}


def read_page(backend: str, page_id, transport=None) -> dict:
    """Read a page back. Returns {pointer, title, body, url}. Raises DocsUnreachable."""
    _check_backend(backend)
    auth, _ = _confluence_context()
    res = stores.confluence_get_page(auth, page_id, transport=transport)
    if not res.get("ok"):
        raise DocsUnreachable(
            f"could not read page '{page_id}' (HTTP {res.get('status')}): "
            f"{res.get('response')}"
        )
    return {"pointer": res["pointer"], "title": res.get("title"),
            "body": res.get("body"), "url": res.get("url")}


def page_comments(backend: str, page_id, transport=None) -> list:
    """List a page's comments — the revision-command intake. Raises DocsUnreachable."""
    _check_backend(backend)
    auth, _ = _confluence_context()
    res = stores.confluence_get_comments(auth, page_id, transport=transport)
    if not res.get("ok"):
        raise DocsUnreachable(
            f"could not read comments on page '{page_id}' "
            f"(HTTP {res.get('status')}): {res.get('response')}"
        )
    return res["comments"]
