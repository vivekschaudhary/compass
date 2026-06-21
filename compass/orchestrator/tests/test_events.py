"""Tests for the event spine (#104) and the portfolio cockpit."""
import json
import os
import tempfile
import unittest
from pathlib import Path

from compass.orchestrator import events as ev
from compass.orchestrator import cockpit


class TestMakeEvent(unittest.TestCase):
    def test_shape(self):
        e = ev.make_event(ev.STEP_START, step=2, title="X", agent="pm", task="t")
        self.assertEqual(e["type"], "step_start")
        self.assertEqual(e["step"], 2)
        self.assertIn("ts", e)
        # ISO-8601 UTC
        self.assertTrue(e["ts"].endswith("+00:00") or "T" in e["ts"])

    def test_project_label_is_basename(self):
        self.assertEqual(ev.project_label("/a/b/home-app"), "home-app")


class TestCompassHome(unittest.TestCase):
    def test_honors_env(self):
        old = os.environ.get("COMPASS_HOME")
        try:
            os.environ["COMPASS_HOME"] = "/tmp/ch-test-xyz"
            self.assertEqual(ev.compass_home(), Path("/tmp/ch-test-xyz"))
            self.assertEqual(
                ev.events_path(),
                Path("/tmp/ch-test-xyz") / "orchestrator" / "events.jsonl",
            )
        finally:
            if old is None:
                os.environ.pop("COMPASS_HOME", None)
            else:
                os.environ["COMPASS_HOME"] = old


class TestSinks(unittest.TestCase):
    def test_jsonl_sink_appends(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "events.jsonl"
            sink = ev.jsonl_sink(p)
            sink(ev.make_event(ev.RUN_START, run_id="r1"))
            sink(ev.make_event(ev.RUN_END, run_id="r1", status="completed"))
            lines = p.read_text().splitlines()
            self.assertEqual(len(lines), 2)
            self.assertEqual(json.loads(lines[0])["type"], "run_start")

    def test_multi_sink_fans_out_and_isolates_failure(self):
        seen = []
        def good(e): seen.append(e["type"])
        def bad(e): raise RuntimeError("boom")
        fan = ev.multi_sink(bad, good)  # bad first — must not stop good
        fan(ev.make_event(ev.NOTE, text="hi"))
        self.assertEqual(seen, ["note"])

    def test_terminal_sink_renders_each_type(self):
        # Should not raise on any event type.
        for e in [
            ev.make_event(ev.TOOL_USE, name="read_file", input={"path": "a"}),
            ev.make_event(ev.TOOL_RESULT, name="read_file", is_error=False, summary="ok"),
            ev.make_event(ev.NOTE, text="n"),
            ev.make_event(ev.GATE_OPEN, step=2, title="gate"),
            ev.make_event(ev.GATE_DECISION, step=2, decision="approved"),
            ev.make_event(ev.RUN_END, status="completed", reason="done"),
            ev.make_event(ev.RUN_START),
            ev.make_event(ev.STEP_START, step=1),
        ]:
            ev.terminal_sink(e)  # no assertion — just must not raise

    def test_load_events_skips_bad_lines(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "events.jsonl"
            p.write_text('{"type":"note","run_id":"r"}\n\nNOT JSON\n')
            out = ev.load_events(p)
            self.assertEqual(len(out), 1)


class TestCockpitFold(unittest.TestCase):
    def _events(self, *evs):
        return list(evs)

    def test_open_gate_is_awaiting(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="triage", bet_id=None),
            ev.make_event(ev.STEP_START, run_id="r1", step=2, agent="support", task="classify-intake"),
            ev.make_event(ev.GATE_OPEN, run_id="r1", step=2, kind="routing", title="intake gate"),
        ]
        runs = cockpit.fold_runs(events)
        self.assertIsNotNone(runs["r1"]["open_gate"])
        self.assertEqual(runs["r1"]["open_gate"]["step"], 2)

    def test_decision_clears_gate(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="triage"),
            ev.make_event(ev.GATE_OPEN, run_id="r1", step=2, kind="hitl", title="g"),
            ev.make_event(ev.GATE_DECISION, run_id="r1", step=2, decision="approved"),
        ]
        runs = cockpit.fold_runs(events)
        self.assertIsNone(runs["r1"]["open_gate"])
        self.assertFalse(runs["r1"]["ended"])

    def test_run_end_marks_done(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="fix"),
            ev.make_event(ev.RUN_END, run_id="r1", status="completed", reason="all steps complete"),
        ]
        runs = cockpit.fold_runs(events)
        self.assertTrue(runs["r1"]["ended"])
        self.assertEqual(runs["r1"]["status"], "completed")

    def test_portfolio_spans_projects(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="triage"),
            ev.make_event(ev.GATE_OPEN, run_id="r1", step=2, kind="hitl", title="g1"),
            ev.make_event(ev.RUN_START, run_id="r2", project="crypto", workflow="build"),
            ev.make_event(ev.STEP_START, run_id="r2", step=3, agent="engineer", task="implement-story"),
        ]
        runs = cockpit.fold_runs(events)
        out = cockpit.render(runs)
        self.assertIn("home", out)
        self.assertIn("crypto", out)
        self.assertIn("AWAITING YOUR DECISION (1)", out)
        self.assertIn("IN FLIGHT (1)", out)

    def test_project_filter(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="triage"),
            ev.make_event(ev.GATE_OPEN, run_id="r1", step=2, kind="hitl", title="g1"),
            ev.make_event(ev.RUN_START, run_id="r2", project="crypto", workflow="build"),
            ev.make_event(ev.STEP_START, run_id="r2", step=3),
        ]
        runs = cockpit.fold_runs(events)
        out = cockpit.render(runs, project_filter="crypto")
        self.assertIn("crypto", out)
        self.assertNotIn("triage", out)

    def test_approve_command_well_formed(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="build", bet_id="CB-7"),
            ev.make_event(ev.GATE_OPEN, run_id="r1", step=6, kind="hitl", title="review gate"),
        ]
        runs = cockpit.fold_runs(events)
        cmd = cockpit._approve_cmd(runs["r1"])
        self.assertIn("compass.orchestrator.run build", cmd)
        self.assertIn("--bet CB-7", cmd)
        self.assertIn("--from-step 6", cmd)
        self.assertIn("--approve", cmd)


class TestRunEmitsLifecycle(unittest.TestCase):
    """Integration: a real _run_workflow call emits RUN_START … RUN_END to the
    user-local spine, even on an early halt (no host available)."""

    def test_runstart_and_runend_on_hostless_halt(self):
        from compass.orchestrator import run as runmod

        repo = Path(__file__).resolve().parents[3]
        compass_dir = repo / "compass"
        with tempfile.TemporaryDirectory() as proj, tempfile.TemporaryDirectory() as ch:
            os.environ["COMPASS_HOME"] = ch
            # Ensure no host is selectable so the run halts at step 1's dispatch.
            saved = {k: os.environ.pop(k, None) for k in
                     ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY")}
            try:
                with self.assertRaises(SystemExit):
                    runmod._run_workflow(
                        "triage", Path(proj), compass_dir,
                        context="something broke",
                    )
                events = ev.load_events(Path(ch) / "orchestrator" / "events.jsonl")
                types = [e["type"] for e in events]
                self.assertEqual(types[0], ev.RUN_START)
                self.assertIn(ev.STEP_START, types)
                self.assertEqual(types[-1], ev.RUN_END)
                self.assertEqual(events[-1]["status"], "halted")
                # all events carry the run_id + project label
                self.assertTrue(all(e.get("run_id") for e in events))
                self.assertTrue(all(e.get("project") == Path(proj).name for e in events))
            finally:
                os.environ.pop("COMPASS_HOME", None)
                for k, v in saved.items():
                    if v is not None:
                        os.environ[k] = v


if __name__ == "__main__":
    unittest.main()
