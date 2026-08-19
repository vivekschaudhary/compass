"""Ticket-slot requirement tests — the docs-primary downstream gate (#154 slice 3).

When the product brief lives in the docs system there is no `docs/foundation/product.md`
for `requires_approved:` to check, so a workflow may instead require
`product-brief@tickets` — resolved to the Jira gate ticket recorded when the gate opened.

The guarantees proven here:
  1. Both requirement FORMS coexist — a repo path still resolves the old way.
  2. An unresolvable or unreadable ticket is UNMET, never silently met.
  3. The gate-ticket ledger lives OUTSIDE the repo, so docs-primary leaves git clean.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import docs_primary, logger
from compass.orchestrator.run import _producer_hint, _requirement_met

ENV_KEYS = ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT",
            "ATLASSIAN_BASE_URL", "ATLASSIAN_EMAIL", "ATLASSIAN_API_TOKEN",
            "COMPASS_HOME")


class TicketSlotCase(unittest.TestCase):
    def setUp(self):
        self.project_dir = Path(tempfile.mkdtemp())
        self.home = Path(tempfile.mkdtemp())
        self._saved = {k: os.environ.get(k) for k in ENV_KEYS}
        for k in ENV_KEYS:
            os.environ.pop(k, None)
        os.environ["COMPASS_HOME"] = str(self.home)   # keep state out of the real home

    def tearDown(self):
        for k, v in self._saved.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

    def jira(self):
        os.environ.update(JIRA_BASE_URL="https://acme.atlassian.net",
                          JIRA_EMAIL="x@x.com", JIRA_API_TOKEN="t",
                          JIRA_PROJECT="KAN")


class TestSlotDetection(unittest.TestCase):
    def test_ticket_slots_are_recognised(self):
        for slot in ("product-brief@tickets", "research@tickets", " brief@tickets "):
            self.assertTrue(docs_primary.is_ticket_slot(slot), slot)

    def test_repo_paths_are_not_ticket_slots(self):
        for path in ("docs/foundation/product.md",
                     "docs/epics/<epic-id>/brief.md",
                     "docs/foundation/architecture.md"):
            self.assertFalse(docs_primary.is_ticket_slot(path), path)

    def test_docs_slot_is_not_a_ticket_slot(self):
        # `@docs` names the artifact's home; only `@tickets` carries the approval.
        self.assertFalse(docs_primary.is_ticket_slot("product-brief@docs"))


class TestLedger(TicketSlotCase):
    def test_ledger_is_written_outside_the_repo(self):
        docs_primary.record_gate_ticket(self.project_dir, "product-brief@tickets",
                                        "KAN-10", "https://x/KAN-10")
        # nothing added to the project tree — docs-primary keeps `git status` clean
        self.assertEqual(list(self.project_dir.rglob("*")), [])
        ledger = logger.runs_root(self.project_dir) / docs_primary.GATE_TICKET_LEDGER
        self.assertTrue(ledger.exists())

    def test_latest_record_for_a_slot_wins(self):
        docs_primary.record_gate_ticket(self.project_dir, "product-brief@tickets", "KAN-10")
        docs_primary.record_gate_ticket(self.project_dir, "product-brief@tickets", "KAN-20")
        self.assertEqual(
            docs_primary.resolve_gate_ticket(self.project_dir, "product-brief@tickets"),
            "KAN-20")

    def test_slots_do_not_collide(self):
        docs_primary.record_gate_ticket(self.project_dir, "research@tickets", "KAN-1")
        docs_primary.record_gate_ticket(self.project_dir, "product-brief@tickets", "KAN-2")
        self.assertEqual(
            docs_primary.resolve_gate_ticket(self.project_dir, "research@tickets"), "KAN-1")
        self.assertEqual(
            docs_primary.resolve_gate_ticket(self.project_dir, "product-brief@tickets"),
            "KAN-2")

    def test_unknown_slot_resolves_to_none(self):
        self.assertIsNone(
            docs_primary.resolve_gate_ticket(self.project_dir, "nope@tickets"))

    def test_torn_line_does_not_blind_the_gate_to_earlier_records(self):
        docs_primary.record_gate_ticket(self.project_dir, "product-brief@tickets", "KAN-10")
        ledger = logger.runs_root(self.project_dir) / docs_primary.GATE_TICKET_LEDGER
        with ledger.open("a", encoding="utf-8") as f:
            f.write('{"slot": "product-brief@tickets", "ticket": "KAN-2\n')  # truncated
        self.assertEqual(
            docs_primary.resolve_gate_ticket(self.project_dir, "product-brief@tickets"),
            "KAN-10")


class FakeTransport:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, method, url, headers, body):
        self.calls.append({"method": method, "url": url, "body": body})
        return self.responses.pop(0) if self.responses else (200, {})


def _issue(category, name):
    return (200, {"key": "KAN-10", "fields": {
        "summary": "s", "description": None, "labels": [],
        "status": {"name": name, "statusCategory": {"key": category}}}})


class TestSlotApproved(TicketSlotCase):
    def test_approved_ticket_meets_the_requirement(self):
        self.jira()
        docs_primary.record_gate_ticket(self.project_dir, "product-brief@tickets", "KAN-10")
        met, how = docs_primary.slot_approved(
            self.project_dir, "product-brief@tickets",
            transport=FakeTransport([_issue("done", "Done")]))
        self.assertTrue(met)
        self.assertIn("KAN-10", how)

    def test_pending_ticket_does_not_meet_it(self):
        self.jira()
        docs_primary.record_gate_ticket(self.project_dir, "product-brief@tickets", "KAN-10")
        met, how = docs_primary.slot_approved(
            self.project_dir, "product-brief@tickets",
            transport=FakeTransport([_issue("new", "To Do")]))
        self.assertFalse(met)
        self.assertIn("not approved", how)

    def test_never_opened_gate_is_unmet_with_a_reason(self):
        self.jira()
        met, how = docs_primary.slot_approved(self.project_dir, "product-brief@tickets")
        self.assertFalse(met)
        self.assertIn("no gate ticket recorded", how)

    def test_unreadable_ticket_is_unmet_not_an_exception(self):
        # The gate output must stay uniform with the repo-path form — report, don't raise.
        self.jira()
        docs_primary.record_gate_ticket(self.project_dir, "product-brief@tickets", "KAN-10")
        met, how = docs_primary.slot_approved(
            self.project_dir, "product-brief@tickets",
            transport=FakeTransport([(404, {"message": "gone"})]))
        self.assertFalse(met)
        self.assertIn("unreadable", how)

    def test_uncredentialed_jira_is_unmet_not_an_exception(self):
        docs_primary.record_gate_ticket(self.project_dir, "product-brief@tickets", "KAN-10")
        met, how = docs_primary.slot_approved(self.project_dir, "product-brief@tickets")
        self.assertFalse(met)
        self.assertIn("unreadable", how)


class TestRequirementMetDispatch(TicketSlotCase):
    """`_requirement_met` must serve BOTH forms from the one entry point."""

    def test_repo_path_form_still_works(self):
        p = self.project_dir / "docs" / "foundation" / "product.md"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("---\nstatus: approved\n---\n# P", encoding="utf-8")
        met, how = _requirement_met(self.project_dir, "docs/foundation/product.md")
        self.assertTrue(met)
        self.assertIn("frontmatter", how)

    def test_repo_path_unapproved_is_unmet(self):
        p = self.project_dir / "docs" / "foundation" / "product.md"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("---\nstatus: proposed\n---\n# P", encoding="utf-8")
        met, _ = _requirement_met(self.project_dir, "docs/foundation/product.md")
        self.assertFalse(met)

    def test_ticket_form_routes_to_the_slot_resolver(self):
        self.jira()
        met, how = _requirement_met(self.project_dir, "product-brief@tickets")
        self.assertFalse(met)
        self.assertIn("no gate ticket recorded", how)   # slot resolver's wording

    def test_missing_repo_file_is_unmet_without_raising(self):
        met, how = _requirement_met(self.project_dir, "docs/foundation/product.md")
        self.assertFalse(met)
        self.assertIsNone(how)


class TestExternalModeRewrite(TicketSlotCase):
    """Under source_of_truth: external there is no product.md — the declared repo path
    must resolve to the gate TICKET, while repo mode stays byte-for-byte unchanged."""

    def _config(self, source_of_truth):
        cfg = self.project_dir / "compass" / "config.yaml"
        cfg.parent.mkdir(parents=True, exist_ok=True)
        cfg.write_text(f"source_of_truth: {source_of_truth}\n", encoding="utf-8")

    def _approved_product_md(self):
        p = self.project_dir / "docs" / "foundation" / "product.md"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("---\nstatus: approved\n---\n# P", encoding="utf-8")

    def test_external_mode_resolves_the_path_via_its_ticket(self):
        # Deliberately UNcredentialed: _jira_context() refuses before any HTTP, so this
        # stays hermetic (no live call) while still proving the ticket path was taken —
        # the recorded key surfaces in the reason string.
        self._config("external")
        docs_primary.record_gate_ticket(self.project_dir, "product-brief@tickets", "KAN-10")
        met, how = _requirement_met(self.project_dir, "docs/foundation/product.md")
        self.assertFalse(met)
        self.assertIn("KAN-10", how)                # proves it went down the ticket path

    def test_external_mode_ignores_a_stale_approved_file(self):
        # The dangerous case: a leftover approved product.md must NOT satisfy the gate
        # once the docs system is the record.
        self._config("external")
        self._approved_product_md()
        met, how = _requirement_met(self.project_dir, "docs/foundation/product.md")
        self.assertFalse(met)
        self.assertNotIn("frontmatter", how or "")

    def test_repo_mode_still_reads_the_file(self):
        self._config("repo")
        self._approved_product_md()
        met, how = _requirement_met(self.project_dir, "docs/foundation/product.md")
        self.assertTrue(met)
        self.assertIn("frontmatter", how)

    def test_no_config_defaults_to_repo_mode(self):
        self._approved_product_md()
        met, _ = _requirement_met(self.project_dir, "docs/foundation/product.md")
        self.assertTrue(met)

    def test_external_mode_leaves_non_docs_primary_paths_alone(self):
        # A bet brief is ticket-projected by a different mechanism (#127) — this
        # rewrite must not swallow it.
        self._config("external")
        p = self.project_dir / "docs" / "epics" / "X" / "brief.md"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("---\nstatus: approved\n---\n# B", encoding="utf-8")
        met, how = _requirement_met(self.project_dir, "docs/epics/X/brief.md")
        self.assertTrue(met)
        self.assertIn("frontmatter", how)

    def test_slot_mapping_covers_both_foundation_artifacts(self):
        self.assertEqual(docs_primary.ticket_slot_for_path("docs/foundation/product.md"),
                         "product-brief@tickets")
        self.assertEqual(docs_primary.ticket_slot_for_path("docs/foundation/research.md"),
                         "research@tickets")
        self.assertIsNone(docs_primary.ticket_slot_for_path("docs/foundation/architecture.md"))


class TestProducerHint(unittest.TestCase):
    def test_ticket_slots_point_at_create_product_brief(self):
        self.assertEqual(_producer_hint("product-brief@tickets"), "create-product-brief")
        self.assertEqual(_producer_hint("research@tickets"), "create-product-brief")

    def test_repo_paths_keep_their_existing_hints(self):
        self.assertEqual(_producer_hint("docs/epics/X/brief.md"), "create-brief")
        self.assertEqual(_producer_hint("docs/foundation/architecture.md"),
                         "setup-foundation-architecture")


if __name__ == "__main__":
    unittest.main()
