"""#97: the orchestrator-opened PR takes its title from the branch's fix:/feat: commit
subject (a real description), not the engineer's TL;DR run-status blurb."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import run as R


def _git(d, *a):
    return subprocess.run(["git", "-C", str(d), *a], capture_output=True, text=True)


class TestPrTitle(unittest.TestCase):
    def _repo_on_branch(self, *commit_msgs):
        d = Path(tempfile.mkdtemp())
        _git(d, "init", "-q")
        _git(d, "config", "user.email", "x@x")
        _git(d, "config", "user.name", "x")
        _git(d, "commit", "--allow-empty", "-q", "-m", "init")
        _git(d, "branch", "-M", "main")
        _git(d, "checkout", "-q", "-b", "fix/inr-csv-dates")
        for m in commit_msgs:
            _git(d, "commit", "--allow-empty", "-q", "-m", m)
        return d

    def test_prefers_fix_commit_over_test_commit(self):
        d = self._repo_on_branch("test: reproduce the bug",
                                 "fix: INR CSV import date parsing (DD/MM/YYYY)")
        self.assertEqual(R._pr_title(d, "fix/inr-csv-dates"),
                         "fix: INR CSV import date parsing (DD/MM/YYYY)")

    def test_uses_commit_subject_not_output_blurb(self):
        # the title comes from the branch's commit subject (a real description), so a
        # TL;DR status line in the run OUTPUT can never leak into the PR title.
        d = self._repo_on_branch("fix: correct INR date parsing")
        self.assertEqual(R._pr_title(d, "fix/inr-csv-dates"), "fix: correct INR date parsing")

    def test_falls_back_to_branch_slug(self):
        # no git repo at the path → branch-slug fallback, never a crash
        self.assertEqual(R._pr_title("/nonexistent/xyz", "fix/inr-csv-dates"),
                         "inr csv dates")


if __name__ == "__main__":
    unittest.main()
