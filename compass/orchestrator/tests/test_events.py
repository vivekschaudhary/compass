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
            ev.make_event(ev.USAGE, model="claude-opus-4-8", input_tokens=10,
                          output_tokens=5, cache_read_input_tokens=8,
                          cache_creation_input_tokens=2),
        ]:
            ev.terminal_sink(e)  # no assertion — just must not raise

    def test_usage_type_exists(self):
        self.assertEqual(ev.USAGE, "usage")

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


class TestCostRollup(unittest.TestCase):
    def test_usage_accumulates_per_run(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="fix", model="claude-opus-4-8"),
            ev.make_event(ev.USAGE, run_id="r1", model="claude-opus-4-8",
                          input_tokens=100, output_tokens=20,
                          cache_read_input_tokens=900, cache_creation_input_tokens=0),
            ev.make_event(ev.USAGE, run_id="r1", model="claude-opus-4-8",
                          input_tokens=50, output_tokens=10,
                          cache_read_input_tokens=950, cache_creation_input_tokens=0),
        ]
        runs = cockpit.fold_runs(events)
        u = runs["r1"]["usage"]
        self.assertEqual(u["input"], 150)
        self.assertEqual(u["output"], 30)
        self.assertEqual(u["cache_read"], 1850)
        self.assertEqual(runs["r1"]["model"], "claude-opus-4-8")

    def test_cost_usd_accounts_for_cache(self):
        # 1M input @ $15, 1M output @ $75, 1M cache-read @ $1.5, 1M cache-write @ $18.75
        usage = {"input": 1_000_000, "output": 1_000_000,
                 "cache_read": 1_000_000, "cache_creation": 1_000_000}
        cost = cockpit.cost_usd(usage, "claude-opus-4-8")
        self.assertAlmostEqual(cost, 15 + 75 + 1.5 + 18.75, places=4)

    def test_cache_savings_positive(self):
        # All-cached input should cost far less than full input price.
        usage = {"input": 0, "output": 0, "cache_read": 1_000_000, "cache_creation": 0}
        full = cockpit._full_input_cost(usage, "opus")   # 1M @ $15
        actual = cockpit.cost_usd({**usage, "output": 0}, "opus")  # 1M @ $1.5
        self.assertAlmostEqual(full, 15.0, places=4)
        self.assertAlmostEqual(actual, 1.5, places=4)
        self.assertGreater(full - actual, 0)

    def test_spend_section_present_when_usage(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="fix", model="claude-opus-4-8"),
            ev.make_event(ev.USAGE, run_id="r1", model="claude-opus-4-8",
                          input_tokens=1000, output_tokens=200,
                          cache_read_input_tokens=5000, cache_creation_input_tokens=500),
            ev.make_event(ev.RUN_END, run_id="r1", status="completed", reason="done"),
        ]
        out = cockpit.render(cockpit.fold_runs(events))
        self.assertIn("SPEND", out)
        self.assertIn("saved", out)
        self.assertIn("home", out)

    def test_spend_section_omitted_without_usage(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="fix"),
            ev.make_event(ev.RUN_END, run_id="r1", status="completed", reason="done"),
        ]
        out = cockpit.render(cockpit.fold_runs(events))
        self.assertNotIn("SPEND", out)

    def test_price_override_via_env(self):
        old = os.environ.get("COMPASS_PRICES")
        try:
            os.environ["COMPASS_PRICES"] = '{"opus": [30, 150]}'
            self.assertEqual(cockpit._price_for("claude-opus-4-8"), (30, 150))
        finally:
            if old is None:
                os.environ.pop("COMPASS_PRICES", None)
            else:
                os.environ["COMPASS_PRICES"] = old


class TestStepCockpit(unittest.TestCase):
    # #111: step-level view — per-run step status + pending from the graph.
    def test_fold_builds_step_status_map(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="triage"),
            ev.make_event(ev.STEP_START, run_id="r1", step=1, agent="support", task="classify-intake"),
            ev.make_event(ev.STEP_END, run_id="r1", step=1),
            ev.make_event(ev.STEP_START, run_id="r1", step=2, title="intake gate"),
            ev.make_event(ev.GATE_OPEN, run_id="r1", step=2, kind="routing", title="intake gate"),
        ]
        steps = cockpit.fold_runs(events)["r1"]["steps"]
        self.assertEqual(steps[1]["status"], "done")
        self.assertEqual(steps[2]["status"], "awaiting")

    def test_render_run_shows_pending_from_graph(self):
        run = {
            "run_id": "r1", "project": "home", "workflow": "fix", "bet_id": None,
            "ended": False, "status": None, "reason": None,
            "steps": {1: {"status": "done", "agent": "engineer", "task": "triage-and-fix"},
                      2: {"status": "running", "agent": "automation", "task": "write-e2e-tests"}},
        }
        graph = [(1, "engineer", "triage-and-fix", False, ""),
                 (2, "automation", "write-e2e-tests", False, ""),
                 (3, "reviewer", "review-pr", False, ""),
                 (4, None, None, True, "approve merge")]
        out = cockpit.render_run(run, graph)
        self.assertIn("✓  1", out)
        self.assertIn("▶  2", out)
        self.assertIn("·  3", out)          # pending
        self.assertIn("reviewer.review-pr", out)
        self.assertIn("in flight", out)

    def test_render_run_ended_no_pending(self):
        run = {
            "run_id": "r1", "project": "home", "workflow": "triage", "bet_id": None,
            "ended": True, "status": "completed", "reason": "handed off to /fix",
            "steps": {1: {"status": "done", "agent": "support", "task": "classify-intake"},
                      2: {"status": "done", "title": "intake gate"}},
        }
        graph = [(n, None, None, False, f"s{n}") for n in range(1, 10)]  # 9-step triage
        out = cockpit.render_run(run, graph)
        self.assertIn("handed off to /fix", out)
        self.assertNotIn("·", out)          # ended run shows no pending steps

    def test_render_run_graph_unavailable_fallback(self):
        run = {"run_id": "r1", "project": "home", "workflow": "x", "bet_id": None,
               "ended": False, "status": None, "reason": None,
               "steps": {1: {"status": "done", "agent": "a", "task": "t"}}}
        out = cockpit.render_run(run, [])     # no graph
        self.assertIn("graph unavailable", out)
        self.assertIn("✓  1", out)

    def test_load_graph_steps_real_workflow(self):
        from pathlib import Path
        repo = Path(__file__).resolve().parents[3]
        steps = cockpit.load_graph_steps("fix", repo / "compass")
        self.assertEqual(len(steps), 6)      # the collapsed /fix (#108)
        self.assertEqual(steps[0][1:3], ("engineer", "triage-and-fix"))


class TestHtmlCockpit(unittest.TestCase):
    # #113: the HTML browser surface over the same spine data.
    def _events(self):
        return [
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="triage"),
            ev.make_event(ev.STEP_START, run_id="r1", step=1, agent="support", task="classify-intake"),
            ev.make_event(ev.STEP_END, run_id="r1", step=1),
            ev.make_event(ev.STEP_START, run_id="r1", step=2, title="intake gate"),
            ev.make_event(ev.GATE_OPEN, run_id="r1", step=2, kind="routing", title="intake gate"),
            ev.make_event(ev.RUN_START, run_id="r2", project="crypto", workflow="build", bet_id="CB-7"),
            ev.make_event(ev.STEP_START, run_id="r2", step=3, agent="engineer", task="implement-story"),
            ev.make_event(ev.RUN_START, run_id="r3", project="home", workflow="fix"),
            ev.make_event(ev.RUN_END, run_id="r3", status="completed", reason="all steps complete"),
        ]

    def test_render_html_has_sections_and_data(self):
        out = cockpit.render_html(cockpit.fold_runs(self._events()), snapshot_ts="2026-06-23")
        self.assertIn("<!doctype html>", out)
        self.assertIn("http-equiv='refresh'", out)          # auto-reload
        self.assertIn("Awaiting your decision", out)
        self.assertIn("In flight", out)
        self.assertIn("Done", out)
        self.assertIn("CB-7", out)                           # an in-flight run
        self.assertIn("all steps complete", out)             # a done run's reason
        self.assertIn("--approve", out)                      # the awaiting run's command

    def test_render_html_escapes(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="x", project="home", workflow="fix"),
            ev.make_event(ev.RUN_END, run_id="x", status="halted", reason="<script>alert(1)</script>"),
        ]
        out = cockpit.render_html(cockpit.fold_runs(events), snapshot_ts="t")
        self.assertNotIn("<script>alert(1)</script>", out)   # raw tag must not survive
        self.assertIn("&lt;script&gt;", out)                 # escaped instead

    def test_render_html_empty(self):
        out = cockpit.render_html({}, snapshot_ts="t")
        self.assertIn("<!doctype html>", out)
        self.assertIn("nothing waiting on you", out)         # no crash, valid page

    def test_build_page_returns_bytes(self):
        self.assertIsInstance(cockpit.build_page([], snapshot_ts="t"), bytes)
        self.assertIsInstance(cockpit.build_page(self._events(), snapshot_ts="t"), bytes)

    def test_step_rows_parity_text_and_html(self):
        # _run_step_rows is the single source both renderers use → no drift.
        run = {"run_id": "r", "project": "home", "workflow": "fix", "bet_id": None,
               "ended": False, "status": None, "reason": None,
               "steps": {1: {"status": "done", "agent": "engineer", "task": "triage-and-fix"}}}
        graph = [(1, "engineer", "triage-and-fix", False, ""),
                 (2, "reviewer", "review-pr", False, "")]
        rows, has_graph = cockpit._run_step_rows(run, graph)
        self.assertTrue(has_graph)
        self.assertEqual(rows[0][1], "done")
        self.assertEqual(rows[1][1], "pending")


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
