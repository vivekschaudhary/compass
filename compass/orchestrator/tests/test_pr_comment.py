"""The Reviewer's output is posted on the branch's PR by the orchestrator."""
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import pr as P


def _done(rc=0, out="", err=""):
    return subprocess.CompletedProcess([], rc, stdout=out, stderr=err)


class TestPostPrComment(unittest.TestCase):
    def test_posts_the_review_body_on_the_branch_pr(self):
        seen = {}

        def fake(cmd, **kw):
            seen["cmd"] = cmd
            seen["body"] = Path(cmd[cmd.index("--body-file") + 1]).read_text()
            return _done(out="https://github.com/o/r/pull/3#issuecomment-1\n")

        with mock.patch("subprocess.run", fake):
            ok, why = P._post_pr_comment("/x", "feat/s", "### Recommendation\nApprove")
        self.assertTrue(ok)
        self.assertEqual(seen["cmd"][:4], ["gh", "pr", "comment", "feat/s"])
        self.assertIn("Approve", seen["body"])
        self.assertTrue(why.endswith("issuecomment-1"))

    def test_gh_failure_is_returned_not_swallowed(self):
        with mock.patch("subprocess.run", lambda *a, **k: _done(1, "", "no pull requests found")):
            ok, why = P._post_pr_comment("/x", "feat/s", "review text")
        self.assertFalse(ok)
        self.assertIn("no pull requests found", why)

    def test_empty_output_and_no_branch_are_refused_without_calling_gh(self):
        with mock.patch("subprocess.run", side_effect=AssertionError("gh must not run")):
            self.assertFalse(P._post_pr_comment("/x", "feat/s", "  ")[0])
            self.assertFalse(P._post_pr_comment("/x", None, "text")[0])

    def test_oversized_review_is_truncated_under_githubs_limit(self):
        sizes = []

        def fake(cmd, **kw):
            sizes.append(len(Path(cmd[cmd.index("--body-file") + 1]).read_text()))
            return _done()

        with mock.patch("subprocess.run", fake):
            P._post_pr_comment("/x", "feat/s", "x" * 100000)
        self.assertLess(sizes[0], 65536)

    def test_exception_from_gh_is_returned(self):
        with mock.patch("subprocess.run", side_effect=FileNotFoundError("gh")):
            ok, why = P._post_pr_comment("/x", "feat/s", "text")
        self.assertFalse(ok)
        self.assertIn("FileNotFoundError", why)


if __name__ == "__main__":
    unittest.main()
