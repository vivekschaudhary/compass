"""Docs-primary lifecycle tests — page-is-the-record, ticket-is-the-approval (#154 slice 2).

The load-bearing guarantees proven here:

  1. **Local removal happens only after a successful push.** A failed push must leave the
     local draft on disk — deleting it would destroy unshipped work.
  2. **The gate reads statusCategory, not status name.** Client Jira workflows rename
     statuses freely; only the category is stable.
  3. **An unreadable gate raises.** It is never silently treated as open.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import docs_primary


class FakeTransport:
    """Records each call; returns canned (status, dict) responses in order."""
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, method, url, headers, body):
        self.calls.append({"method": method, "url": url, "body": body})
        return self.responses.pop(0) if self.responses else (200, {})


ENV_KEYS = ("CONFLUENCE_BASE_URL", "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN",
            "CONFLUENCE_SPACE", "JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN",
            "JIRA_PROJECT", "ATLASSIAN_BASE_URL", "ATLASSIAN_EMAIL",
            "ATLASSIAN_API_TOKEN")


class DocsPrimaryCase(unittest.TestCase):
    def setUp(self):
        self.project_dir = Path(tempfile.mkdtemp())
        self._saved = {k: os.environ.get(k) for k in ENV_KEYS}
        for k in ENV_KEYS:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self._saved.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

    def confluence(self):
        os.environ.update(CONFLUENCE_BASE_URL="https://acme.atlassian.net",
                          CONFLUENCE_EMAIL="x@x.com", CONFLUENCE_API_TOKEN="t",
                          CONFLUENCE_SPACE="ENG")

    def jira(self):
        os.environ.update(JIRA_BASE_URL="https://acme.atlassian.net",
                          JIRA_EMAIL="x@x.com", JIRA_API_TOKEN="t",
                          JIRA_PROJECT="KAN")

    def draft(self, rel="docs/foundation/product.md", text="# Draft\nbody"):
        p = self.project_dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
        return p


class TestPublish(DocsPrimaryCase):
    def test_publishes_under_parent_and_removes_local(self):
        self.confluence()
        local = self.draft()
        t = FakeTransport([
            (200, {"results": [{"id": "9000"}]}),        # parent found
            (200, {"id": "123", "_links": {}}),          # page created
        ])
        res = docs_primary.publish(
            self.project_dir, "Acme Product Brief", "body", "Acme Engagement",
            local_path="docs/foundation/product.md", backend="confluence", transport=t)

        self.assertEqual((res["pointer"], res["action"]), ("123", "created"))
        self.assertEqual((res["parent_pointer"], res["parent_action"]), ("9000", "found"))
        self.assertEqual(res["removed"], "docs/foundation/product.md")
        self.assertFalse(local.exists())                 # the page is the only record
        self.assertEqual(t.calls[1]["body"]["ancestors"], [{"id": "9000"}])

    def test_failed_push_leaves_the_local_draft_intact(self):
        # The guarantee that matters most: never destroy unshipped work.
        self.confluence()
        local = self.draft()
        t = FakeTransport([(200, {"results": [{"id": "9000"}]}), (403, {"message": "no"})])
        with self.assertRaises(docs_primary.DocsUnreachable):
            docs_primary.publish(self.project_dir, "T", "body", "Acme",
                                 local_path="docs/foundation/product.md",
                                 backend="confluence", transport=t)
        self.assertTrue(local.exists())
        self.assertEqual(local.read_text(), "# Draft\nbody")

    def test_failed_parent_lookup_leaves_local_intact(self):
        self.confluence()
        local = self.draft()
        t = FakeTransport([(500, {"message": "boom"})])
        with self.assertRaises(docs_primary.DocsUnreachable):
            docs_primary.publish(self.project_dir, "T", "body", "Acme",
                                 local_path="docs/foundation/product.md",
                                 backend="confluence", transport=t)
        self.assertTrue(local.exists())

    def test_uncredentialed_refuses_and_keeps_local(self):
        local = self.draft()
        with self.assertRaises(docs_primary.DocsUnreachable):
            docs_primary.publish(self.project_dir, "T", "body", "Acme",
                                 local_path="docs/foundation/product.md",
                                 backend="confluence")
        self.assertTrue(local.exists())

    def test_no_local_path_is_fine(self):
        self.confluence()
        t = FakeTransport([(200, {"results": [{"id": "9000"}]}),
                           (200, {"id": "123", "_links": {}})])
        res = docs_primary.publish(self.project_dir, "T", "body", "Acme",
                                   backend="confluence", transport=t)
        self.assertIsNone(res["removed"])

    def test_empty_dirs_are_pruned_after_removal(self):
        self.confluence()
        self.draft()
        t = FakeTransport([(200, {"results": [{"id": "9000"}]}),
                           (200, {"id": "123", "_links": {}})])
        docs_primary.publish(self.project_dir, "T", "body", "Acme",
                             local_path="docs/foundation/product.md",
                             backend="confluence", transport=t)
        self.assertFalse((self.project_dir / "docs" / "foundation").exists())

    def test_prune_stops_at_project_dir_and_keeps_siblings(self):
        self.confluence()
        self.draft()
        keep = self.project_dir / "docs" / "status.md"
        keep.write_text("status", encoding="utf-8")
        t = FakeTransport([(200, {"results": [{"id": "9000"}]}),
                           (200, {"id": "123", "_links": {}})])
        docs_primary.publish(self.project_dir, "T", "body", "Acme",
                             local_path="docs/foundation/product.md",
                             backend="confluence", transport=t)
        self.assertFalse((self.project_dir / "docs" / "foundation").exists())
        self.assertTrue(keep.exists())                    # sibling untouched
        self.assertTrue(self.project_dir.exists())        # never prunes the root

    def test_page_id_updates_the_same_page(self):
        self.confluence()
        t = FakeTransport([(200, {"results": [{"id": "9000"}]}),
                           (200, {"version": {"number": 4}}),
                           (200, {"id": "123", "_links": {}})])
        res = docs_primary.publish(self.project_dir, "T", "body", "Acme",
                                   page_id="123", backend="confluence", transport=t)
        self.assertEqual((res["pointer"], res["action"]), ("123", "updated"))


class TestGateTickets(DocsPrimaryCase):
    def test_open_ticket_names_the_gate_and_links_the_page(self):
        self.jira()
        t = FakeTransport([(201, {"key": "KAN-10"})])
        res = docs_primary.open_gate_ticket("brief", "Acme", page_url="https://x/123",
                                            transport=t)
        self.assertEqual((res["key"], res["action"]), ("KAN-10", "created"))
        summary = t.calls[0]["body"]["fields"]["summary"]
        self.assertEqual(summary, "Acme — Product brief approval")

    def test_research_and_brief_are_distinct_tickets(self):
        self.jira()
        t1 = FakeTransport([(201, {"key": "KAN-10"})])
        t2 = FakeTransport([(201, {"key": "KAN-11"})])
        r = docs_primary.open_gate_ticket("research", "Acme", transport=t1)
        b = docs_primary.open_gate_ticket("brief", "Acme", transport=t2)
        self.assertNotEqual(r["key"], b["key"])
        self.assertIn("Research review",
                      t1.calls[0]["body"]["fields"]["summary"])
        self.assertIn("Product brief approval",
                      t2.calls[0]["body"]["fields"]["summary"])

    def test_unknown_gate_refuses(self):
        self.jira()
        with self.assertRaises(docs_primary.GateUnreachable) as cm:
            docs_primary.open_gate_ticket("architecture", "Acme")
        self.assertIn("unknown gate", str(cm.exception))

    def test_uncredentialed_jira_refuses_naming_vars(self):
        with self.assertRaises(docs_primary.GateUnreachable) as cm:
            docs_primary.open_gate_ticket("brief", "Acme")
        self.assertIn("JIRA_PROJECT", str(cm.exception))

    def test_push_failure_refuses(self):
        self.jira()
        t = FakeTransport([(400, {"errorMessages": ["bad project"]})])
        with self.assertRaises(docs_primary.GateUnreachable):
            docs_primary.open_gate_ticket("brief", "Acme", transport=t)


class TestGateState(DocsPrimaryCase):
    def _issue(self, category, name):
        return (200, {"key": "KAN-10", "fields": {
            "summary": "s", "description": None, "labels": [],
            "status": {"name": name, "statusCategory": {"key": category}}}})

    def test_done_category_is_approved(self):
        self.jira()
        t = FakeTransport([self._issue("done", "Signed off")])
        state = docs_primary.gate_state("KAN-10", transport=t)
        self.assertTrue(state["approved"])

    def test_approval_reads_category_not_status_name(self):
        # A client workflow whose name says "Approved" but sits in an in-progress
        # category is NOT approved — the category is the stable signal.
        self.jira()
        t = FakeTransport([self._issue("indeterminate", "Approved (pending legal)")])
        state = docs_primary.gate_state("KAN-10", transport=t)
        self.assertFalse(state["approved"])
        self.assertEqual(state["status"], "Approved (pending legal)")

    def test_new_category_is_not_approved(self):
        self.jira()
        t = FakeTransport([self._issue("new", "To Do")])
        self.assertFalse(docs_primary.gate_state("KAN-10", transport=t)["approved"])

    def test_unreadable_ticket_raises_rather_than_reporting_open(self):
        self.jira()
        t = FakeTransport([(404, {"message": "gone"})])
        with self.assertRaises(docs_primary.GateUnreachable):
            docs_primary.gate_state("KAN-99", transport=t)


class TestRevertGate(DocsPrimaryCase):
    def _issue(self, category, name):
        return (200, {"key": "KAN-10", "fields": {
            "summary": "s", "description": None, "labels": [],
            "status": {"name": name, "statusCategory": {"key": category}}}})

    def test_approved_gate_is_sent_back_to_pending(self):
        self.jira()
        t = FakeTransport([
            self._issue("done", "Done"),                                   # gate_state
            (200, {"fields": {"status": {"name": "Done",
                                         "statusCategory": {"key": "done"}}},
                   "transitions": [{"id": "11",
                                    "to": {"name": "To Do",
                                           "statusCategory": {"key": "new"}}}]}),
            (204, {}),
        ])
        res = docs_primary.revert_gate("KAN-10", transport=t)
        self.assertEqual(res["action"], "transitioned")
        self.assertEqual(res["to"], "To Do")

    def test_pending_gate_is_a_noop(self):
        self.jira()
        t = FakeTransport([self._issue("new", "To Do")])
        res = docs_primary.revert_gate("KAN-10", transport=t)
        self.assertEqual(res["action"], "noop")
        self.assertEqual(len(t.calls), 1)              # no transition attempted

    def test_no_transition_path_is_reported_not_raised(self):
        self.jira()
        t = FakeTransport([
            self._issue("done", "Done"),
            (200, {"fields": {"status": {"name": "Done",
                                         "statusCategory": {"key": "done"}}},
                   "transitions": []}),
        ])
        res = docs_primary.revert_gate("KAN-10", transport=t)
        self.assertEqual(res["action"], "no_path")     # human moves it by hand


if __name__ == "__main__":
    unittest.main()
