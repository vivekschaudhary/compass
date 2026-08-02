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

    # ── #122: parser shape edges. Post-#123 a mis-parse is a HARD HALT whose message
    # says "declare checks:" while checks: is visibly present — maximally confusing.
    def test_zero_indent_block_is_accepted(self):
        """`checks:` followed by an unindented `- cmd` list is valid YAML; the old
        `^\\s+-` pattern required indentation and silently dropped the whole block."""
        d = self._proj("checks:\n- pnpm lint\n- pnpm build\n")
        self.assertEqual(R._read_checks_from_config(d), ["pnpm lint", "pnpm build"])

    def test_blank_line_inside_block_does_not_end_it(self):
        d = self._proj("checks:\n  - pnpm lint\n\n  - pnpm build\n")
        self.assertEqual(R._read_checks_from_config(d), ["pnpm lint", "pnpm build"])

    def test_next_top_level_key_ends_the_block(self):
        d = self._proj("checks:\n  - pnpm lint\nconnectors:\n  - github\n")
        self.assertEqual(R._read_checks_from_config(d), ["pnpm lint"])

    def test_quoted_stack_value_still_resolves(self):
        """`stack: "nextjs-ts"` kept its quotes, so the profile/suite lookup missed and
        the run went silently stack-neutral."""
        d = self._proj('stack: "nextjs-ts"\n')
        self.assertEqual(R._read_stack_from_config(d / "compass"), "nextjs-ts")
        self.assertIn("pnpm build", R._resolve_checks(d, d / "compass"))


class TestResolveChecksSplitDirs(unittest.TestCase):
    """#122: the one-framework-many-projects layout (SETUP.md) — project_dir and
    compass_dir are DIFFERENT trees. `checks:` was read from the project's config but
    `stack:` from the framework's, so setup-foundation-architecture writing `stack:`
    into the CONSUMER's config activated nothing. TestResolveChecks' `_proj` helper
    passes `d, d/"compass"` so the two coincide — which is exactly why this was
    invisible. These cases keep them apart."""

    def _split(self, project_config=None, framework_config=None):
        root = Path(tempfile.mkdtemp())
        proj = root / "client-repo"
        (proj / "compass").mkdir(parents=True)
        fw = root / "framework" / "compass"
        fw.mkdir(parents=True)
        if project_config is not None:
            (proj / "compass" / "config.yaml").write_text(project_config)
        if framework_config is not None:
            (fw / "config.yaml").write_text(framework_config)
        return proj, fw

    def test_project_stack_activates_the_default_suite(self):
        """THE regression: `stack:` in the consumer's config — where setup writes it."""
        proj, fw = self._split(project_config="stack: nextjs-ts\n",
                               framework_config="framework_version: 1.0.0\n")
        checks = R._resolve_checks(proj, fw)
        self.assertEqual(checks[0], "pnpm install --frozen-lockfile")
        self.assertIn("pnpm build", checks)

    def test_project_checks_win_over_framework_stack(self):
        proj, fw = self._split(project_config="checks:\n  - make verify\n",
                               framework_config="stack: nextjs-ts\n")
        self.assertEqual(R._resolve_checks(proj, fw), ["make verify"])

    def test_framework_stack_is_the_fallback(self):
        proj, fw = self._split(project_config="framework_version: 1.0.0\n",
                               framework_config="stack: dotnet-blazor\n")
        self.assertIn("dotnet test", R._resolve_checks(proj, fw))

    def test_project_stack_wins_over_framework_stack(self):
        proj, fw = self._split(project_config="stack: dotnet-blazor\n",
                               framework_config="stack: nextjs-ts\n")
        self.assertIn("dotnet test", R._resolve_checks(proj, fw))

    def test_framework_checks_are_never_inherited(self):
        """The asymmetry guard. `checks:` mirror a project's OWN CI, so inheriting them
        across projects is always wrong — a consumer with no config of its own would
        silently run the FRAMEWORK's suite (Compass's `python3 -m unittest …`) against
        the consumer's codebase and call the result verification."""
        proj, fw = self._split(
            project_config="framework_version: 1.0.0\n",
            framework_config="checks:\n  - python3 -m unittest discover -s compass\n")
        self.assertEqual(R._resolve_checks(proj, fw), [])

    def test_framework_checks_not_inherited_when_project_has_no_config(self):
        proj, fw = self._split(
            project_config=None,
            framework_config="checks:\n  - python3 -m unittest discover -s compass\n")
        self.assertEqual(R._resolve_checks(proj, fw), [])

    def test_readers_still_accept_a_single_argument(self):
        """Back-compat: existing call sites and tests pass one dir."""
        proj, fw = self._split(project_config="checks:\n  - make verify\n",
                               framework_config="stack: nextjs-ts\n")
        self.assertEqual(R._read_checks_from_config(proj), ["make verify"])
        self.assertEqual(R._read_stack_from_config(fw), "nextjs-ts")


class TestScaffoldChecksWarning(unittest.TestCase):
    """#122: scaffold-foundation owns leaving the project verifiable. A miss surfaces at
    setup time (warn, re-runnable) rather than at the first code run (halt, #123)."""

    def _proj(self, config_text):
        d = Path(tempfile.mkdtemp())
        (d / "compass").mkdir()
        (d / "compass" / "config.yaml").write_text(config_text)
        return d

    def test_silent_when_checks_resolve(self):
        d = self._proj("checks:\n  - make verify\n")
        self.assertIsNone(R._scaffold_checks_warning(d, d / "compass"))

    def test_warns_and_names_the_config_when_empty(self):
        d = self._proj("framework_version: 1.0.0\n")
        warn = R._scaffold_checks_warning(d, d / "compass")
        self.assertIsNotNone(warn)
        self.assertIn("SETUP INCOMPLETE", warn)
        self.assertIn("config.yaml", warn)
        self.assertIn("halts", warn)


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
