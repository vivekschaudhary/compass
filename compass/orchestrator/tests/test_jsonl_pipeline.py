"""
End-to-end tests for the runs.jsonl + hitl.jsonl pipeline.

Tests:
  1. log_step() writes a well-formed record to runs.jsonl
  2. log_hitl() writes a well-formed record to hitl.jsonl (approved)
  3. log_hitl() writes a well-formed record to hitl.jsonl (rejected with feedback)
  4. Multiple log_step() calls append separate records (not overwrite)
  5. load_runs() / load_hitl_log() round-trip cleanly
  6. run_id links a step record to its HITL record
"""
import json
import sys
import os
from pathlib import Path
import tempfile
import unittest

# Make the compass package importable when run directly from this file
sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator.logger import (
    log_step,
    log_hitl,
    load_runs,
    load_hitl_log,
    parse_step_output,
)


FAKE_OUTPUT = """\
## Output summary

**TL;DR:** Brief CB-4 drafted. Vision + personas + defensibility complete.

**Files created:**
- `docs/bets/CB-4/brief.md`

**Next recommended command:** `/create-bet-architecture CB-4`

**Open questions / risks:**
- Data sensitivity not confirmed; marked TBD pending legal review.

## DRI Decision logged

- [2026-06-10] [PM] **Draft brief CB-4** — Source: founder memo + CB-3 retro.
  Rationale: bet is highest-priority OKR initiative for Q3.
  Area: product. Reversibility: reversible (brief is proposed, not approved).
"""


class TestRunsJsonl(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.project_dir = Path(self.tmp)

    def _runs_path(self):
        return self.project_dir / "docs" / "orchestrator-runs" / "runs.jsonl"

    def _hitl_path(self):
        return self.project_dir / "docs" / "orchestrator-runs" / "hitl.jsonl"

    def test_log_step_creates_file_and_record(self):
        record = log_step(
            project_dir=self.project_dir,
            run_id="create-brief--CB-4--20260610T120000",
            workflow="create-brief",
            bet_id="CB-4",
            step=1,
            agent="pm",
            task="draft-brief",
            host="claude",
            model=None,
            output=FAKE_OUTPUT,
        )
        self.assertTrue(self._runs_path().exists(), "runs.jsonl not created")
        lines = [l for l in self._runs_path().read_text().splitlines() if l.strip()]
        self.assertEqual(len(lines), 1)
        r = json.loads(lines[0])
        self.assertEqual(r["run_id"], "create-brief--CB-4--20260610T120000")
        self.assertEqual(r["workflow"], "create-brief")
        self.assertEqual(r["bet_id"], "CB-4")
        self.assertEqual(r["step"], 1)
        self.assertEqual(r["agent"], "pm")
        self.assertEqual(r["task"], "draft-brief")
        self.assertEqual(r["host"], "claude")
        self.assertIsNone(r["model"])
        self.assertIn("ts", r)
        self.assertIn("tldr", r)
        self.assertGreater(r["output_chars"], 0)
        # files_created should be parsed
        self.assertIn("docs/bets/CB-4/brief.md", r.get("files_created", []))
        # DRI decisions should be captured
        self.assertGreater(len(r.get("dri_decisions", [])), 0)

    def test_log_step_appends_not_overwrites(self):
        for i in range(3):
            log_step(
                project_dir=self.project_dir,
                run_id=f"run-{i}",
                workflow="create-brief",
                bet_id="CB-4",
                step=i + 1,
                agent="pm",
                task="draft-brief",
                host="claude",
                model=None,
                output=FAKE_OUTPUT,
            )
        lines = [l for l in self._runs_path().read_text().splitlines() if l.strip()]
        self.assertEqual(len(lines), 3, "Expected 3 records, each step appended")
        run_ids = [json.loads(l)["run_id"] for l in lines]
        self.assertEqual(run_ids, ["run-0", "run-1", "run-2"])

    def test_load_runs_round_trip(self):
        log_step(
            project_dir=self.project_dir,
            run_id="r1",
            workflow="build",
            bet_id="CB-5",
            step=1,
            agent="engineer",
            task="implement-story",
            host="claude",
            model="claude-sonnet-4-6",
            output=FAKE_OUTPUT,
        )
        records = load_runs(self.project_dir)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["model"], "claude-sonnet-4-6")

    def test_load_runs_empty(self):
        records = load_runs(self.project_dir)
        self.assertEqual(records, [])


class TestHitlJsonl(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.project_dir = Path(self.tmp)

    def _hitl_path(self):
        return self.project_dir / "docs" / "orchestrator-runs" / "hitl.jsonl"

    def test_log_hitl_approved_creates_record(self):
        record = log_hitl(
            project_dir=self.project_dir,
            run_id="create-brief--CB-4--20260610T120000",
            workflow="create-brief",
            bet_id="CB-4",
            step=2,
            artifact_path="docs/orchestrator-runs/create-brief/step-01-pm-draft-brief.md",
            decision="approved",
        )
        self.assertTrue(self._hitl_path().exists(), "hitl.jsonl not created")
        lines = [l for l in self._hitl_path().read_text().splitlines() if l.strip()]
        self.assertEqual(len(lines), 1)
        r = json.loads(lines[0])
        self.assertEqual(r["decision"], "approved")
        self.assertEqual(r["reviewer"], "human")
        self.assertIsNone(r["feedback"])
        self.assertIsNone(r["connector"])
        self.assertEqual(r["step"], 2)
        self.assertIn("ts", r)

    def test_log_hitl_rejected_captures_feedback(self):
        log_hitl(
            project_dir=self.project_dir,
            run_id="create-brief--CB-4--20260610T120000",
            workflow="create-brief",
            bet_id="CB-4",
            step=2,
            artifact_path="docs/orchestrator-runs/create-brief/step-01-pm-draft-brief.md",
            decision="rejected",
            feedback="Defensibility section missing moat type 7 (talent). Rework.",
        )
        r = json.loads(self._hitl_path().read_text().strip())
        self.assertEqual(r["decision"], "rejected")
        self.assertIn("talent", r["feedback"])

    def test_log_hitl_appends(self):
        for decision in ("rejected", "approved"):
            log_hitl(
                project_dir=self.project_dir,
                run_id="r1",
                workflow="create-brief",
                bet_id="CB-4",
                step=2,
                artifact_path=None,
                decision=decision,
                feedback="needs work" if decision == "rejected" else None,
            )
        lines = [l for l in self._hitl_path().read_text().splitlines() if l.strip()]
        self.assertEqual(len(lines), 2)
        decisions = [json.loads(l)["decision"] for l in lines]
        self.assertEqual(decisions, ["rejected", "approved"])

    def test_load_hitl_log_round_trip(self):
        log_hitl(
            project_dir=self.project_dir,
            run_id="r1",
            workflow="setup-product",
            bet_id=None,
            step=3,
            artifact_path="docs/orchestrator-runs/setup-product/step-02-pm-setup-product-foundation.md",
            decision="approved",
        )
        records = load_hitl_log(self.project_dir)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["workflow"], "setup-product")
        self.assertIsNone(records[0]["bet_id"])

    def test_load_hitl_log_empty(self):
        records = load_hitl_log(self.project_dir)
        self.assertEqual(records, [])


class TestRunIdLinkage(unittest.TestCase):
    """run_id must be the same in runs.jsonl and hitl.jsonl so the two can be joined."""

    def test_run_id_links_step_to_hitl_decision(self):
        tmp = tempfile.mkdtemp()
        project_dir = Path(tmp)
        run_id = "create-brief--CB-4--20260610T120000"

        log_step(
            project_dir=project_dir,
            run_id=run_id,
            workflow="create-brief",
            bet_id="CB-4",
            step=1,
            agent="pm",
            task="draft-brief",
            host="claude",
            model=None,
            output=FAKE_OUTPUT,
        )
        log_hitl(
            project_dir=project_dir,
            run_id=run_id,
            workflow="create-brief",
            bet_id="CB-4",
            step=2,
            artifact_path="docs/orchestrator-runs/create-brief/step-01-pm-draft-brief.md",
            decision="approved",
        )

        steps = load_runs(project_dir)
        hitls = load_hitl_log(project_dir)

        self.assertEqual(len(steps), 1)
        self.assertEqual(len(hitls), 1)
        self.assertEqual(steps[0]["run_id"], hitls[0]["run_id"],
                         "run_id must match so steps and HITL decisions can be joined")


class TestParseStepOutput(unittest.TestCase):
    """Unit tests for the output parser used by log_step."""

    def test_parses_tldr(self):
        parsed = parse_step_output(FAKE_OUTPUT)
        self.assertIn("Brief CB-4 drafted", parsed["tldr"])

    def test_parses_files_created(self):
        parsed = parse_step_output(FAKE_OUTPUT)
        self.assertIn("docs/bets/CB-4/brief.md", parsed["files_created"])

    def test_parses_dri_decisions(self):
        parsed = parse_step_output(FAKE_OUTPUT)
        self.assertGreater(len(parsed["dri_decisions"]), 0)

    def test_output_chars(self):
        parsed = parse_step_output(FAKE_OUTPUT)
        self.assertEqual(parsed["output_chars"], len(FAKE_OUTPUT))

    def test_empty_output_safe(self):
        parsed = parse_step_output("")
        self.assertEqual(parsed["tldr"], "")
        self.assertEqual(parsed["files_created"], [])
        self.assertEqual(parsed["dri_decisions"], [])


class TestGovernanceAudit(unittest.TestCase):
    """#2a: actor identity on gate decisions + build_audit assembling the
    who-did-what lineage with a cross-model-independence verdict."""

    def setUp(self):
        self.project_dir = Path(tempfile.mkdtemp())
        # isolate the user-local event spine to a temp home for this test
        self.home = tempfile.mkdtemp()
        self._old_home = os.environ.get("COMPASS_HOME")
        os.environ["COMPASS_HOME"] = self.home

    def tearDown(self):
        if self._old_home is None:
            os.environ.pop("COMPASS_HOME", None)
        else:
            os.environ["COMPASS_HOME"] = self._old_home
        os.environ.pop("COMPASS_ACTOR", None)

    def test_default_actor_env_override(self):
        from compass.orchestrator.logger import default_actor
        os.environ["COMPASS_ACTOR"] = "md@deloitte.com"
        self.assertEqual(default_actor(self.project_dir), "md@deloitte.com")

    def test_log_hitl_records_actor(self):
        from compass.orchestrator.logger import log_hitl, load_hitl_log
        os.environ["COMPASS_ACTOR"] = "approver@x.com"
        log_hitl(project_dir=self.project_dir, run_id="r1", workflow="build",
                 bet_id="CB-4", step=5, artifact_path=None, decision="approved")
        self.assertEqual(load_hitl_log(self.project_dir)[0]["actor"], "approver@x.com")

    def test_build_audit_independence_verdict_and_roles(self):
        from compass.orchestrator.logger import log_step, log_hitl, build_audit
        # implementer on claude, reviewer on codex → independent
        log_step(project_dir=self.project_dir, run_id="b1", workflow="build",
                 bet_id="CB-4", step=1, agent="engineer", task="implement-story",
                 host="claude", model="claude-opus", output=FAKE_OUTPUT)
        log_step(project_dir=self.project_dir, run_id="b1", workflow="build",
                 bet_id="CB-4", step=3, agent="reviewer", task="review-pr",
                 host="codex", model="gpt-5", output=FAKE_OUTPUT)
        log_hitl(project_dir=self.project_dir, run_id="b1", workflow="build",
                 bet_id="CB-4", step=6, artifact_path=None, decision="approved",
                 actor="md@deloitte.com")
        audit = build_audit(self.project_dir, bet_id="CB-4")
        self.assertTrue(audit["cross_model_independence"]["independent"])
        roles = {s["agent"]: s["role"] for s in audit["steps"]}
        self.assertEqual(roles["engineer"], "implementer")
        self.assertEqual(roles["reviewer"], "reviewer")
        self.assertEqual(audit["gates"][0]["actor"], "md@deloitte.com")

    def test_build_audit_flags_same_model_review(self):
        from compass.orchestrator.logger import log_step, build_audit
        # implementer AND reviewer both on claude → NOT independent
        for agent in ("engineer", "reviewer"):
            log_step(project_dir=self.project_dir, run_id="b2", workflow="build",
                     bet_id="CB-9", step=1, agent=agent, task="t",
                     host="claude", model="claude-opus", output=FAKE_OUTPUT)
        audit = build_audit(self.project_dir, bet_id="CB-9")
        self.assertFalse(audit["cross_model_independence"]["independent"])

    def test_build_audit_captures_launcher_from_spine(self):
        from compass.orchestrator import events as ev
        from compass.orchestrator.logger import log_step, build_audit
        ev.jsonl_sink()(ev.make_event(
            ev.RUN_START, run_id="b3", bet_id="CB-4", workflow="build",
            actor="launcher@x.com"))
        log_step(project_dir=self.project_dir, run_id="b3", workflow="build",
                 bet_id="CB-4", step=1, agent="engineer", task="implement-story",
                 host="claude", model=None, output=FAKE_OUTPUT)
        audit = build_audit(self.project_dir, bet_id="CB-4", run_id="b3")
        self.assertEqual(audit["launchers"].get("b3"), "launcher@x.com")

    def test_format_audit_markdown(self):
        from compass.orchestrator.logger import log_step, build_audit, format_audit_markdown
        log_step(project_dir=self.project_dir, run_id="b4", workflow="build",
                 bet_id="CB-4", step=1, agent="engineer", task="implement-story",
                 host="claude", model="claude-opus", output=FAKE_OUTPUT)
        md = format_audit_markdown(build_audit(self.project_dir, bet_id="CB-4"))
        self.assertIn("Governance audit", md)
        self.assertIn("Cross-model review independence", md)
        self.assertIn("engineer.implement-story", md)


if __name__ == "__main__":
    unittest.main(verbosity=2)
