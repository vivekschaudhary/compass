"""#149: the suite must be hermetic against git's location env vars.

Git exports GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE to its hooks, and those OVERRIDE cwd
for every `git` subprocess that inherits them. Tests here shell out to git inside temp
fixtures — including `stash`, `checkout`, `clean` and `worktree` — so an inherited context
does not just fail the suite, it points destructive commands at whatever repo that context
names. `tests/__init__.py` scrubs them at package import; this proves the scrub works and
that the helpers behave correctly once it has.
"""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import run as R
from compass.orchestrator.tests import _GIT_LOCATION_VARS

REPO_ROOT = Path(__file__).resolve().parents[3]


class TestGitEnvIsScrubbed(unittest.TestCase):
    def test_no_git_location_vars_leak_into_the_suite(self):
        """Trivially true standalone; the real catch is a hook run, where a removed scrub
        makes this the first and clearest failure instead of ~16 confusing ones."""
        leaked = [v for v in _GIT_LOCATION_VARS if v in os.environ]
        self.assertEqual(leaked, [], f"git location vars leaked into the suite: {leaked}")

    def test_scrub_survives_a_polluted_parent_environment(self):
        """The load-bearing case: import the package WITH the vars set, as a git hook would,
        and confirm they are gone afterwards. Independent of how this suite was invoked."""
        env = {**os.environ,
               "GIT_DIR": str(REPO_ROOT / ".git"),
               "GIT_WORK_TREE": str(REPO_ROOT),
               "GIT_INDEX_FILE": str(REPO_ROOT / ".git" / "index")}
        code = ("import os, sys; sys.path.insert(0, sys.argv[1]);"
                "import compass.orchestrator.tests as t;"
                "print(','.join(v for v in t._GIT_LOCATION_VARS if v in os.environ))")
        out = subprocess.run([sys.executable, "-c", code, str(REPO_ROOT.parent)],
                             capture_output=True, text=True, env=env, timeout=60)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip(), "",
                         f"these survived the scrub: {out.stdout.strip()}")


class TestGitHelpersSeeTheDirectoryTheyAreGiven(unittest.TestCase):
    """The behaviour the leak broke: a non-git temp dir must read as non-git. Under an
    inherited GIT_DIR these all reported the ambient repo instead, which is what turned
    fixture worktree/stash operations loose on a real checkout."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())

    def test_ensure_work_worktree_returns_none_for_a_non_git_dir(self):
        self.assertIsNone(R._ensure_work_worktree(self.tmp, "feat/x"))

    def test_uncommitted_code_is_empty_for_a_non_git_dir(self):
        self.assertEqual(R._uncommitted_code(self.tmp), [])

    def test_git_rev_parse_does_not_resolve_the_ambient_repo(self):
        """Directly: git run in the fixture must not answer with this repo's toplevel."""
        out = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                             cwd=self.tmp, capture_output=True, text=True)
        self.assertNotEqual(out.stdout.strip(), str(REPO_ROOT),
                            "git resolved the ambient repo from inside a temp fixture — "
                            "a git location env var is leaking (#149)")


if __name__ == "__main__":
    unittest.main()
