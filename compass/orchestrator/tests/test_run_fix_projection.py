"""#71: the orchestrator writes the fix record + projects it to Jira (Bug/Story) at the
end of a /fix run — so the Jira creation doesn't depend on the agent following prose."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import run as R
from compass.orchestrator import connector


class TestFixProjection(unittest.TestCase):
    JIRA_KEYS = ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT")

    def setUp(self):
        self.proj = Path(tempfile.mkdtemp())
        self._pr = R._pr_url_any_state
        R._pr_url_any_state = lambda pd, br: "https://github.com/x/home-app/pull/138"
        # deterministic: no Jira creds → filesystem, no live API
        self._saved = {k: os.environ.pop(k, None) for k in self.JIRA_KEYS}

    def tearDown(self):
        R._pr_url_any_state = self._pr
        for k, v in self._saved.items():
            if v is not None:
                os.environ[k] = v

    def _only_record(self, subdir):
        recs = list((self.proj / subdir).glob("*.md"))
        self.assertEqual(len(recs), 1, f"expected one record in {subdir}, got {recs}")
        return recs[0], recs[0].read_text()

    def test_hygiene_fix_defaults_to_bug(self):
        label = R._project_fix_record(self.proj, self.proj / "compass", None,
                                      "fix/passkey-cookie", "TL;DR fixed it. P1.", "run1")
        rec, c = self._only_record("docs/fixes")
        self.assertIn("type: bug", c)
        self.assertIn("hygiene: true", c)
        self.assertIn("pull/138", c)          # PR linked
        self.assertIn("severity: P1", c)      # parsed from output
        self.assertEqual(connector.resolve_issue_type(str(rec.relative_to(self.proj)), c), "Bug")
        self.assertNotIn("fallback", label)   # unconfigured → plain filesystem, no false alarm

    def test_bet_linked_enhancement_is_story(self):
        label = R._project_fix_record(self.proj, self.proj / "compass", "WLT-9",
                                      "fix/add-thing", "CLASSIFICATION: enhancement", "run2")
        rec, c = self._only_record("docs/bets/WLT-9/fixes")
        self.assertIn("type: enhancement", c)
        self.assertIn("bet: WLT-9", c)
        self.assertIn("hygiene: false", c)
        self.assertEqual(connector.resolve_issue_type(str(rec.relative_to(self.proj)), c), "Story")

    def test_defaults_when_no_markers(self):
        # no severity / no classification in the output → Bug + P2 (never mislabels)
        R._project_fix_record(self.proj, self.proj / "compass", None, "fix/x", "just some prose", "r")
        _, c = self._only_record("docs/fixes")
        self.assertIn("type: bug", c)
        self.assertIn("severity: P2", c)

    def test_never_raises(self):
        # a broken PR lookup must not crash the run — returns an honest label
        R._pr_url_any_state = lambda pd, br: (_ for _ in ()).throw(RuntimeError("gh down"))
        label = R._project_fix_record(self.proj, self.proj / "compass", None, "fix/x", "", "r")
        self.assertIn("fallback", label)


class TestUnshippedFixRecord(unittest.TestCase):
    """#123: a /fix that opened NO pull request shipped nothing. The record is still
    filed — it is the audit trail of the attempt — but it must never read as delivered.
    The live failure filed KAN-17 with `status: in_review` and `pr: null`."""

    def test_no_pr_renders_unshipped(self):
        c = R._render_fix_record("FIX-1", "bug", None, "P1", "", "Broken login", "2026-08-02")
        self.assertIn("status: unshipped", c)
        self.assertNotIn("status: in_review", c)
        self.assertIn("pr: null", c)
        self.assertIn("UNSHIPPED", c)
        self.assertIn("NO pull request", c)

    def test_pr_present_renders_in_review(self):
        c = R._render_fix_record("FIX-1", "bug", None, "P1",
                                 "https://github.com/x/y/pull/9", "Broken login", "2026-08-02")
        self.assertIn("status: in_review", c)
        self.assertNotIn("status: unshipped", c)
        self.assertNotIn("UNSHIPPED", c)
        self.assertIn("pull/9", c)

    def test_unshipped_record_does_not_claim_the_pr_carries_the_triage(self):
        """The shipped body says 'the full triage is in the PR'. With no PR that line
        points at nothing — the reader is sent to a document that does not exist."""
        c = R._render_fix_record("FIX-1", "bug", None, "P2", "", "t", "2026-08-02")
        self.assertNotIn("is in the PR", c)

    def test_issue_type_is_unaffected_by_shipped_state(self):
        """An unshipped enhancement is still a Story — the halt must not mislabel."""
        c = R._render_fix_record("FIX-1", "enhancement", "WLT-9", "P2", "", "t", "2026-08-02")
        self.assertIn("type: enhancement", c)
        self.assertIn("Jira Story", c)


if __name__ == "__main__":
    unittest.main()
