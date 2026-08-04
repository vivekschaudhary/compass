#!/usr/bin/env python3
"""
smoke-docs-primary.py — exercise the docs-primary path against a REAL Atlassian.

The unit suite injects a fake HTTP transport, so it proves the object mapping and the
refusal logic but **never touches a live endpoint**. Everything auth-shaped is therefore
unproven by the suite: token scopes, space permissions, the `ancestors` contract for
parent pages, whether an update really updates instead of duplicating, and whether the
Jira project accepts the issue type. This script closes that gap.

It is WRITE-heavy by nature: it creates a parent page, a child page, and a Jira issue in
whatever space/project you point it at. So it refuses to run without `--yes`, prints
exactly what it will create first, and marks everything with a timestamped
`[compass-smoke]` title you can find and delete afterwards.

Usage
-----
    export CONFLUENCE_BASE_URL=https://<site>.atlassian.net
    export CONFLUENCE_EMAIL=you@example.com
    export CONFLUENCE_API_TOKEN=...          # id.atlassian.com → API tokens
    export CONFLUENCE_SPACE=SCRATCH          # a throwaway space, NOT a client space
    export JIRA_BASE_URL=https://<site>.atlassian.net
    export JIRA_EMAIL=you@example.com
    export JIRA_API_TOKEN=...
    export JIRA_PROJECT=SCRATCH

    python3 compass/scripts/smoke-docs-primary.py            # dry — checks config only
    python3 compass/scripts/smoke-docs-primary.py --yes      # live — creates artifacts

`ATLASSIAN_BASE_URL` / `_EMAIL` / `_API_TOKEN` work as shared fallbacks for both.

Exit 0 = every check passed. Exit 1 = a check failed (the failure is named).
"""
import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from compass.orchestrator import docs_adapter, docs_primary, stores  # noqa: E402

PASS, FAIL, SKIP = "  \033[32m✓\033[0m", "  \033[31m✗\033[0m", "  \033[33m–\033[0m"
_results = []


def check(name, fn):
    """Run one check; record and print the outcome. Never raises."""
    try:
        detail = fn()
        _results.append(True)
        print(f"{PASS} {name}" + (f" — {detail}" if detail else ""))
        return True
    except Exception as exc:                      # noqa: BLE001 — a smoke test reports, never crashes
        _results.append(False)
        print(f"{FAIL} {name}\n      {type(exc).__name__}: {exc}")
        return False


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--yes", action="store_true",
                    help="actually create the pages + ticket (without this: config check only)")
    args = ap.parse_args()

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    parent_title = f"[compass-smoke] engagement {stamp}"
    page_title = f"[compass-smoke] product brief {stamp}"
    space = os.environ.get("CONFLUENCE_SPACE")
    project = os.environ.get("JIRA_PROJECT")

    print("\nCompass docs-primary smoke test")
    print("=" * 60)

    # ── configuration ────────────────────────────────────────────────────────
    conf_auth, jira_auth_ = stores.confluence_auth(), stores.jira_auth()
    print(f"  Confluence : {(conf_auth or {}).get('base_url') or 'NOT CONFIGURED'}"
          f"   space={space or 'UNSET'}")
    print(f"  Jira       : {(jira_auth_ or {}).get('base_url') or 'NOT CONFIGURED'}"
          f"   project={project or 'UNSET'}")

    missing = []
    if not conf_auth or not space:
        missing.append("Confluence (CONFLUENCE_BASE_URL/EMAIL/API_TOKEN + CONFLUENCE_SPACE)")
    if not jira_auth_ or not project:
        missing.append("Jira (JIRA_BASE_URL/EMAIL/API_TOKEN + JIRA_PROJECT)")

    # ── refusal path — provable WITHOUT credentials, so always run it ─────────
    print("\nRefusal path (docs-primary must never fall back to a repo file)")
    saved = {k: os.environ.pop(k, None) for k in
             ("CONFLUENCE_BASE_URL", "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN",
              "CONFLUENCE_SPACE", "ATLASSIAN_BASE_URL", "ATLASSIAN_EMAIL",
              "ATLASSIAN_API_TOKEN")}
    try:
        def uncredentialed_refuses():
            try:
                docs_adapter.push_page("confluence", "x", "y")
            except docs_adapter.DocsUnreachable as e:
                assert "Refusing" in str(e), "refusal message must say it is refusing"
                return "raises DocsUnreachable, names the missing vars"
            raise AssertionError("did NOT refuse — it must never fall back silently")
        check("uncredentialed docs system refuses", uncredentialed_refuses)

        def unimplemented_backend_refuses():
            try:
                docs_adapter.push_page("gdrive", "x", "y")
            except docs_adapter.DocsBackendNotImplemented as e:
                return str(e)[:70] + "…"
            raise AssertionError("gdrive must raise DocsBackendNotImplemented")
        check("declared-but-unimplemented backend refuses", unimplemented_backend_refuses)
    finally:
        for k, v in saved.items():
            if v is not None:
                os.environ[k] = v

    if missing:
        print("\n" + SKIP + " live checks skipped — not configured:")
        for m in missing:
            print(f"      {m}")
        return _summary()

    if not args.yes:
        print(f"\n{SKIP} live checks skipped — re-run with --yes to create:")
        print(f"      Confluence page  '{parent_title}'  in space {space}")
        print(f"      Confluence page  '{page_title}'  beneath it")
        print(f"      Jira issue       '[compass-smoke] … — Product brief approval' in {project}")
        print("      (all are yours to delete afterwards; use a throwaway space/project)")
        return _summary()

    # ── live checks ──────────────────────────────────────────────────────────
    print(f"\nLive checks — creating artifacts in {space} / {project}")
    state = {}

    def ensure_parent():
        r = docs_adapter.ensure_parent("confluence", parent_title)
        state["parent"] = r["pointer"]
        return f"{r['action']} id={r['pointer']}"
    if not check("ensure_parent creates the engagement page", ensure_parent):
        return _summary()

    def parent_is_idempotent():
        r = docs_adapter.ensure_parent("confluence", parent_title)
        assert r["action"] == "found", f"second call must FIND, not create (got {r['action']})"
        assert r["pointer"] == state["parent"], "found a different page — title lookup is wrong"
        return "second call found the same page (no duplicate)"
    check("ensure_parent is idempotent", parent_is_idempotent)

    def publish_child():
        r = docs_primary.publish(Path.cwd(), page_title, "# Smoke\n\nCreated by the "
                                 "Compass docs-primary smoke test. Safe to delete.",
                                 parent_title, backend="confluence")
        state["page"] = r["pointer"]
        assert r["action"] == "created", f"expected created, got {r['action']}"
        return f"id={r['pointer']}  url={r.get('url')}"
    if not check("publish files a page under the parent", publish_child):
        return _summary()

    def republish_updates():
        r = docs_primary.publish(Path.cwd(), page_title, "# Smoke (v2)\n\nUpdated.",
                                 parent_title, page_id=state["page"], backend="confluence")
        assert r["action"] == "updated", f"expected updated, got {r['action']}"
        assert r["pointer"] == state["page"], "re-push created a DUPLICATE page"
        return "same page id, version bumped — update-not-create holds"
    check("re-publish updates in place (idempotent)", republish_updates)

    def read_back():
        r = docs_adapter.read_page("confluence", state["page"])
        assert r["title"] == page_title, f"title mismatch: {r['title']!r}"
        assert "v2" in (r["body"] or ""), "read back stale content — the update did not land"
        return "title + updated body match what we wrote"
    check("read_page returns what we wrote", read_back)

    def local_file_removed():
        tmp = Path.cwd() / ".compass-smoke-local.md"
        tmp.write_text("draft", encoding="utf-8")
        docs_primary.publish(Path.cwd(), page_title, "# Smoke (v3)", parent_title,
                             page_id=state["page"], local_path=tmp.name,
                             backend="confluence")
        if tmp.exists():
            tmp.unlink()
            raise AssertionError("local draft still on disk — publish must remove it")
        return "local draft deleted after a successful push"
    check("publish removes the local draft (docs-primary)", local_file_removed)

    def open_ticket():
        r = docs_primary.open_gate_ticket("brief", f"[compass-smoke] {stamp}")
        state["ticket"] = r["key"]
        return f"{r['key']} ({r['action']})"
    if not check("open_gate_ticket creates the approval ticket", open_ticket):
        return _summary()

    def gate_is_pending():
        s = docs_primary.gate_state(state["ticket"])
        assert not s["approved"], f"a brand-new ticket must not read as approved ({s['status']})"
        return f"status={s['status']} category={s['category']} → not approved"
    check("a new gate ticket reads as NOT approved", gate_is_pending)

    print("\nCreated (delete these when you're done):")
    print(f"      parent page : {state.get('parent')}")
    print(f"      brief page  : {state.get('page')}")
    print(f"      Jira issue  : {state.get('ticket')}")
    print("\nManual step the script cannot do for you:")
    print(f"      move {state.get('ticket')} to Done, re-run, and confirm the gate flips to")
    print("      approved — that is the downstream `product-brief@tickets` gate.")
    return _summary()


def _summary():
    ok, total = sum(_results), len(_results)
    print("\n" + "=" * 60)
    print(f"{ok}/{total} checks passed")
    return 0 if ok == total else 1


if __name__ == "__main__":
    sys.exit(main())
