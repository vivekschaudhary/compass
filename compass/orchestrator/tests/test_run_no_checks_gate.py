"""#123: a code workflow that resolves ZERO CI-parity checks must HALT — not warn,
finish as "completed", and project a Jira record while nothing shipped.

The live failure this closes (fix--no-bet--20260706T221024): `/fix` printed
"NO CHECKS DECLARED", ran no verification, opened no PR (the orchestrator opens one only
on green checks), then reported "all steps complete" and created KAN-17. Ticket on the
board, changelog written, run marked complete — and no code, no PR, no verification.
Activity mistaken for outcome ([done-by-outcome-not-activity], Principle #20).

The gate is tested at predicate level (the convention in test_gates.py) but against the
REAL parsed dispatch graphs, so a future graph edit that moves a check task is caught.
"""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import run as R
from compass.orchestrator.graph import load_workflow

WORKFLOWS = Path(__file__).resolve().parents[2] / "workflows"


def _steps(workflow_name):
    return load_workflow(WORKFLOWS / f"{workflow_name}.md")


class TestCodeRunNeedsChecks(unittest.TestCase):
    """Which invocations must be verifiable. Knowable pre-dispatch — the graph is parsed
    before any gate runs — which is what lets the halt land before an agent is spawned."""

    def test_every_code_workflow_reaches_a_check_task(self):
        """If this ever fails, a code workflow has become unverifiable by construction."""
        for wf in R._CODE_WORKFLOWS:
            with self.subTest(workflow=wf):
                self.assertTrue(
                    R._code_run_needs_checks(_steps(wf), wf, allow_write=True, no_write=False),
                    f"{wf} reaches no step in _CHECK_TASKS — it can never be verified")

    def test_doc_workflow_is_not_gated(self):
        self.assertFalse(R._code_run_needs_checks(
            _steps("create-brief"), "create-brief", allow_write=True, no_write=False))

    def test_not_gated_without_write(self):
        self.assertFalse(R._code_run_needs_checks(
            _steps("build"), "build", allow_write=False, no_write=False))

    def test_not_gated_when_no_write(self):
        self.assertFalse(R._code_run_needs_checks(
            _steps("build"), "build", allow_write=True, no_write=True))

    def test_resume_that_still_reaches_a_check_task_is_gated(self):
        """`--from-step 4` on build still reaches respond-to-review, so it still gates.
        Correct resume semantics — better than a blanket "from_step ⇒ skip"."""
        steps = _steps("build")
        last_check = max(s.number for s in steps if s.task in R._CHECK_TASKS)
        self.assertTrue(R._code_run_needs_checks(
            steps, "build", True, False, from_step=last_check))

    def test_resume_past_every_check_task_is_not_gated(self):
        steps = _steps("build")
        beyond = max(s.number for s in steps if s.task in R._CHECK_TASKS) + 1
        self.assertFalse(R._code_run_needs_checks(
            steps, "build", True, False, from_step=beyond))

    def test_only_step_without_a_check_task_is_not_gated(self):
        steps = _steps("build")
        non_check = next(s.number for s in steps if s.task not in R._CHECK_TASKS)
        self.assertFalse(R._code_run_needs_checks(
            steps, "build", True, False, only_step=non_check))

    def test_only_step_on_a_check_task_is_gated(self):
        steps = _steps("build")
        check = next(s.number for s in steps if s.task in R._CHECK_TASKS)
        self.assertTrue(R._code_run_needs_checks(
            steps, "build", True, False, only_step=check))


class TestNoChecksHaltMessage(unittest.TestCase):
    """The message is the whole UX of the halt. It must state the mandated sentence AND
    say what was actually inspected — a config with no `checks:` and a config whose
    `checks:` block failed to parse both yield an empty list, and telling someone to
    "add `checks:`" while `checks:` is visibly present is a dead end."""

    def _proj(self, config_text=None):
        d = Path(tempfile.mkdtemp())
        (d / "compass").mkdir()
        if config_text is not None:
            (d / "compass" / "config.yaml").write_text(config_text)
        return d

    def test_carries_the_mandated_sentence(self):
        d = self._proj("framework_version: 1.0.0\n")
        msg = R._no_checks_halt_message(d, d / "compass", "fix")
        self.assertIn("No checks declared for a code workflow.", msg)
        self.assertIn("Halting — a code run must be verifiable.", msg)

    def test_names_the_config_it_inspected(self):
        d = self._proj("framework_version: 1.0.0\n")
        msg = R._no_checks_halt_message(d, d / "compass", "fix")
        self.assertIn(str(d / "compass" / "config.yaml"), msg)
        self.assertIn("0 command(s)", msg)

    def test_reports_a_missing_config_distinctly(self):
        d = self._proj(None)
        msg = R._no_checks_halt_message(d, d / "compass", "build")
        self.assertIn("no such file", msg)

    def test_names_an_unknown_stack(self):
        """`stack: cobol-9000` resolving nothing looks like a config that IS set."""
        d = self._proj("stack: cobol-9000\n")
        msg = R._no_checks_halt_message(d, d / "compass", "build")
        self.assertIn("cobol-9000", msg)
        self.assertIn("no built-in default check suite", msg)
        self.assertIn("nextjs-ts", msg)  # names what IS shipped

    def test_resume_hint_when_halting_mid_run(self):
        d = self._proj("framework_version: 1.0.0\n")
        msg = R._no_checks_halt_message(d, d / "compass", "fix", resume_step=4,
                                        allow_write=True)
        self.assertIn("--from-step 4", msg)
        self.assertIn("--allow-write", msg)

    def test_no_resume_hint_at_the_entry_gate(self):
        """The entry gate halts before anything ran — there is nothing to resume."""
        d = self._proj("framework_version: 1.0.0\n")
        msg = R._no_checks_halt_message(d, d / "compass", "fix")
        self.assertNotIn("--from-step", msg)

    def test_explains_that_checks_are_not_inherited(self):
        """Otherwise the obvious 'but the framework declares checks' theory wastes time."""
        d = self._proj("framework_version: 1.0.0\n")
        msg = R._no_checks_halt_message(d, d / "compass", "fix")
        self.assertIn("PROJECT's config only", msg)


class TestGateWiring(unittest.TestCase):
    """The predicates above are only worth anything if the run actually consults them."""

    def _source(self):
        return (Path(R.__file__)).read_text(encoding="utf-8")

    def test_entry_gate_exits_3_and_the_backstop_emits_run_end(self):
        src = self._source()
        self.assertIn("_code_run_needs_checks(steps, workflow_name", src)
        self.assertIn('reason="no checks declared for a code workflow"', src)

    def test_no_warn_and_continue_path_remains(self):
        """The regression itself: the old branch printed a warning and fell through, so
        the run reached RUN_END status="completed" having verified nothing."""
        src = self._source()
        self.assertNotIn("Mechanical verification skipped this run.", src)


if __name__ == "__main__":
    unittest.main()
