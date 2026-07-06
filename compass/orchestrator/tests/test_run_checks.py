"""#92: the orchestrator runs the CI-parity check suite (lint/typecheck/test/build) in
the worktree and opens the PR only on green — 'checks green' is verified, not the agent's
self-report."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import run as R


class _Res:
    def __init__(self, rc, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


class TestRunChecks(unittest.TestCase):
    def test_all_pass(self):
        ok, failed, tail = R._run_checks("/x", ["lint", "build"],
                                         runner=lambda c, d: _Res(0, "ok"))
        self.assertEqual((ok, failed), (True, None))

    def test_stops_at_first_failure_with_tail(self):
        def runner(cmd, cwd):
            return _Res(1, "", "lint error: _url unused") if "lint" in cmd else _Res(0)
        ok, failed, tail = R._run_checks("/x", ["install", "lint", "build"], runner=runner)
        self.assertFalse(ok)
        self.assertEqual(failed, "lint")
        self.assertIn("_url", tail)

    def test_runner_exception_is_caught(self):
        def boom(cmd, cwd): raise RuntimeError("pnpm not found")
        ok, failed, tail = R._run_checks("/x", ["lint"], runner=boom)
        self.assertFalse(ok)
        self.assertIn("could not run", tail)


class TestResolveChecks(unittest.TestCase):
    def _proj(self, config_text):
        d = Path(tempfile.mkdtemp())
        (d / "compass").mkdir()
        (d / "compass" / "config.yaml").write_text(config_text)
        return d

    def test_config_block_preferred(self):
        d = self._proj("stack: nextjs-ts\nchecks:\n  - pnpm ci\n  - pnpm build\n")
        self.assertEqual(R._resolve_checks(d, d / "compass"), ["pnpm ci", "pnpm build"])

    def test_config_inline_list(self):
        d = self._proj("checks: [pnpm lint, pnpm build]\n")
        self.assertEqual(R._read_checks_from_config(d), ["pnpm lint", "pnpm build"])

    def test_stack_default_when_no_config_checks(self):
        d = self._proj("stack: nextjs-ts\n")
        checks = R._resolve_checks(d, d / "compass")
        self.assertIn("pnpm lint", checks)
        self.assertIn("pnpm build", checks)
        self.assertEqual(checks[0], "pnpm install --frozen-lockfile")  # install first

    def test_empty_when_unknown_stack_and_no_checks(self):
        d = self._proj("stack: cobol-9000\n")
        self.assertEqual(R._resolve_checks(d, d / "compass"), [])


class TestDirtyPrNote(unittest.TestCase):
    """#109: on a FAILED check gate the halt message must not falsely claim 'no dirty
    PR' when an agent (against #92) already opened one. _dirty_pr_note detects it."""

    def setUp(self):
        self._orig = R._pr_url_any_state
        self.addCleanup(lambda: setattr(R, "_pr_url_any_state", self._orig))

    def test_no_branch_returns_empty(self):
        R._pr_url_any_state = lambda *a: "https://gh/pr/9"  # must not even be consulted
        self.assertEqual(R._dirty_pr_note("/x", None), "")

    def test_no_pr_returns_empty(self):
        R._pr_url_any_state = lambda *a: None
        self.assertEqual(R._dirty_pr_note("/x", "feat/y"), "")

    def test_existing_pr_is_flagged(self):
        R._pr_url_any_state = lambda *a: "https://github.com/o/r/pull/149"
        note = R._dirty_pr_note("/x", "feat/WLT-28-4-work")
        self.assertIn("https://github.com/o/r/pull/149", note)
        self.assertIn("#92", note)
        self.assertIn("FAILING", note)


if __name__ == "__main__":
    unittest.main()
