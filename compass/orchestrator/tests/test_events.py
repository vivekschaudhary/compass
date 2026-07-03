"""Tests for the event spine (#104) and the portfolio cockpit."""
import json
import os
import tempfile
import unittest
from datetime import datetime
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
            ev.make_event(ev.RUN_START, run_id="r1", project="home", workflow="build",
                          bet_id="CB-7", project_dir="/repos/home",
                          compass_dir="/repos/compass/compass"),
            ev.make_event(ev.GATE_OPEN, run_id="r1", step=6, kind="hitl", title="review gate"),
        ]
        runs = cockpit.fold_runs(events)
        cmd = cockpit._approve_cmd(runs["r1"])
        self.assertIn("compass.orchestrator.run build", cmd)
        self.assertIn("--bet CB-7", cmd)
        self.assertIn("--from-step 6", cmd)
        self.assertIn("--decide approve", cmd)
        # #154: the copy-paste MUST carry --run-id (else the resume orphans this gate)
        # and the real captured project_dir, so it actually runs + closes THIS gate.
        self.assertIn("--run-id r1", cmd)
        self.assertIn("--project-dir /repos/home", cmd)
        # #178: and the framework dir, else a manual run hits the stale project/compass
        self.assertIn("--compass-dir /repos/compass/compass", cmd)
        self.assertNotIn(" --approve ", f" {cmd} ")   # the old bare bridge is gone

    def test_gate_age_rendered(self):
        # #154: a gate carries its open ts so the cockpit can show how long it's
        # been awaiting — the "I stepped out and couldn't see it" signal.
        from datetime import datetime, timezone, timedelta
        opened = datetime(2026, 6, 25, 22, 13, 42, tzinfo=timezone.utc)
        gate = {"step": 4, "kind": "hitl", "title": "g", "ts": opened.isoformat()}
        now = opened + timedelta(hours=6, minutes=2)
        self.assertEqual(cockpit._gate_age_str(gate, now), "6h02m")
        # no ts / no now → no age (graceful)
        self.assertEqual(cockpit._gate_age_str({"step": 4}, now), "")
        self.assertEqual(cockpit._gate_age_str(gate, None), "")

    def test_fold_captures_gate_ts(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", workflow="create-story"),
            ev.make_event(ev.GATE_OPEN, run_id="r1", step=4, kind="hitl", title="g"),
        ]
        runs = cockpit.fold_runs(events)
        self.assertIsNotNone(runs["r1"]["open_gate"].get("ts"))  # ts threaded for age

    def test_fold_captures_story_id_and_label(self):
        # #176: a story-scoped build's card shows the STORY id, not the parent bet.
        events = [
            ev.make_event(ev.RUN_START, run_id="b1", project="home", workflow="build",
                          bet_id="WLT-27", story_id="WLT-27-2"),
        ]
        run = cockpit.fold_runs(events)["b1"]
        self.assertEqual(run["story_id"], "WLT-27-2")
        self.assertEqual(run["bet_id"], "WLT-27")          # parent kept for resume/--bet
        self.assertEqual(cockpit._scope_label(run), "WLT-27-2")
        # bet-scoped build (no story) → label falls back to the bet
        self.assertEqual(cockpit._scope_label({"bet_id": "WLT-27", "story_id": None}), "WLT-27")


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
        self.assertIn("location.reload", out)               # auto-reload (JS, #128 — not meta-refresh)
        self.assertIn("Awaiting your decision", out)
        self.assertIn("In flight", out)
        self.assertIn("Done", out)
        self.assertIn("CB-7", out)                           # an in-flight run
        self.assertIn("all steps complete", out)             # a done run's reason
        self.assertIn("--decide approve", out)               # awaiting run's resume cmd (#154)
        self.assertIn("--run-id r1", out)                    # carries the run id so it closes THIS gate

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

    def test_action_submit_pauses_autorefresh(self):
        # #177: clicking approve/launch must STOP the auto-reload, else the GET
        # location.reload() races the POST → "I clicked approve and nothing happened."
        out = cockpit.render_html(cockpit.fold_runs(self._events()), actions=True,
                                  snapshot_ts="t", default_project_dir="/repos/home")
        # _act sets the shared pause flag on submit, and the reload tick honors it
        self.assertIn("window.__cpause=true", out)
        self.assertIn("if(window.__cpause)return", out)
        self.assertNotIn("if(paused)return", out)   # old per-closure flag is gone
        self.assertIsInstance(cockpit.build_page(self._events(), snapshot_ts="t"), bytes)


class TestCockpitStaleness(unittest.TestCase):
    """#30: the cockpit warns when its own code changed on disk since it started, so a
    merged dashboard fix doesn't sit invisible until a manual restart."""

    def test_is_stale_none_and_matching(self):
        self.assertFalse(cockpit._code_is_stale(None))                        # not tracking → never stale
        self.assertFalse(cockpit._code_is_stale(cockpit._code_fingerprint()))  # same content → fresh

    def test_is_stale_when_content_differs(self):
        self.assertTrue(cockpit._code_is_stale("a-different-fingerprint"))    # content changed → stale

    def test_mtime_bump_without_content_change_is_not_stale(self):
        # #82: git checkout/switch bumps mtime without changing bytes — must NOT false-fire
        import os
        fp = cockpit._code_fingerprint()
        os.utime(cockpit.__file__, None)          # touch: new mtime, identical content
        self.assertFalse(cockpit._code_is_stale(fp))

    def test_banner_shown_only_when_stale(self):
        stale = cockpit.render_html({}, snapshot_ts="t", code_stale=True)
        fresh = cockpit.render_html({}, snapshot_ts="t", code_stale=False)
        self.assertIn("Dashboard code was updated on disk", stale)
        self.assertIn("relaunch", stale)
        self.assertNotIn("Dashboard code was updated on disk", fresh)

    def test_banner_names_a_runnable_relaunch_command(self):
        # the banner must name a command that actually works — never the non-existent
        # bare `cockpit`. It shows the installed console script OR the module form.
        stale = cockpit.render_html({}, snapshot_ts="t", code_stale=True)
        self.assertRegex(stale, r"compass-cockpit --serve|python3 -m compass\.orchestrator\.cockpit --serve")
        self.assertNotIn("<code>cockpit --serve</code>", stale)

    def test_relaunch_cmd_falls_back_to_module_form(self):
        # #78: no console script on PATH → the always-works module form (the case for a
        # user without `pip install -e .`).
        import shutil
        orig = shutil.which
        try:
            shutil.which = lambda name: None
            self.assertEqual(cockpit._relaunch_cmd(),
                             "python3 -m compass.orchestrator.cockpit --serve")
            shutil.which = lambda name: "/usr/local/bin/compass-cockpit"
            self.assertEqual(cockpit._relaunch_cmd(), "compass-cockpit --serve")
        finally:
            shutil.which = orig

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


class TestBudgetPricing(unittest.TestCase):
    # #116: pricing moved to events.py; per-event cost + budget accumulation.
    def test_cost_of_usage_event(self):
        e = ev.make_event(ev.USAGE, model="claude-opus-4-8",
                          input_tokens=1_000_000, output_tokens=0,
                          cache_read_input_tokens=0, cache_creation_input_tokens=0)
        self.assertAlmostEqual(ev.cost_of_usage_event(e), 15.0, places=4)  # 1M opus in @ $15

    def test_sonnet_cheaper_than_opus(self):
        u = {"input": 1_000_000, "output": 1_000_000, "cache_read": 0, "cache_creation": 0}
        opus = ev.cost_usd(u, "claude-opus-4-8")
        sonnet = ev.cost_usd(u, "claude-sonnet-4-6")
        self.assertLess(sonnet, opus)
        self.assertAlmostEqual(opus / sonnet, 5.0, places=1)   # ~5× — the #115 lever

    def test_budget_accumulation_crosses_cap(self):
        events = [ev.make_event(ev.USAGE, model="claude-sonnet-4-6",
                                input_tokens=1_000_000, output_tokens=0,
                                cache_read_input_tokens=0, cache_creation_input_tokens=0)
                  for _ in range(3)]                    # 3 × ($3) = $9
        total = sum(ev.cost_of_usage_event(e) for e in events)
        self.assertAlmostEqual(total, 9.0, places=4)
        self.assertGreater(total, 5.0)                  # would trip a $5 --max-cost

    def test_budget_exceeded_class(self):
        from compass.orchestrator.run import BudgetExceeded
        self.assertTrue(issubclass(BudgetExceeded, RuntimeError))


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

    def test_run_id_override_is_used(self):
        # #121: a passed run_id_override is stamped on every spine event so a
        # resumed run continues the same cockpit row (no duplicate fork).
        from compass.orchestrator import run as runmod

        repo = Path(__file__).resolve().parents[3]
        compass_dir = repo / "compass"
        with tempfile.TemporaryDirectory() as proj, tempfile.TemporaryDirectory() as ch:
            os.environ["COMPASS_HOME"] = ch
            saved = {k: os.environ.pop(k, None) for k in
                     ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY")}
            try:
                with self.assertRaises(SystemExit):
                    runmod._run_workflow(
                        "triage", Path(proj), compass_dir,
                        context="x", run_id_override="fixed-run-id-42",
                    )
                events = ev.load_events(Path(ch) / "orchestrator" / "events.jsonl")
                self.assertTrue(events)
                self.assertTrue(all(e.get("run_id") == "fixed-run-id-42" for e in events))
            finally:
                os.environ.pop("COMPASS_HOME", None)
                for k, v in saved.items():
                    if v is not None:
                        os.environ[k] = v


class TestActionEndpoints(unittest.TestCase):
    """#119 — the cockpit relays browser launches/decisions to compass-run. The
    arg-builder is pure (no spawn) and always injects the gate floor + cost cap."""

    def setUp(self):
        self.td = tempfile.mkdtemp()
        self.defaults = {"known": ["triage", "build", "fix"], "project_dir": None,
                         "max_cost": 5.0, "compass_dir": "/fw/compass"}

    def test_run_argv_has_gate_floor_and_cap(self):
        argv = cockpit._build_run_argv(
            "run", {"workflow": "triage", "project_dir": self.td}, self.defaults)
        self.assertEqual(argv[:5],
                         [__import__("sys").executable, "-u", "-m", "compass.orchestrator.run", "triage"])
        self.assertIn("-u", argv)                       # #140: unbuffered → live log
        self.assertIn("--non-interactive", argv)        # gate floor still fires
        self.assertIn("--max-cost", argv)               # budget cap still fires
        self.assertEqual(argv[argv.index("--max-cost") + 1], "5.0")
        self.assertNotIn("--allow-write", argv)         # off unless requested

    def test_run_argv_allow_write_only_when_requested(self):
        argv = cockpit._build_run_argv(
            "run", {"workflow": "build", "project_dir": self.td, "allow_write": "1",
                    "context": "ctx", "bet": "CB-7"}, self.defaults)
        self.assertIn("--allow-write", argv)
        self.assertEqual(argv[argv.index("--context") + 1], "ctx")
        self.assertEqual(argv[argv.index("--bet") + 1], "CB-7")

    def test_unknown_workflow_rejected(self):
        out = cockpit._build_run_argv(
            "run", {"workflow": "rm-rf", "project_dir": self.td}, self.defaults)
        self.assertEqual(out[0], "error")

    def test_missing_project_dir_rejected(self):
        out = cockpit._build_run_argv(
            "run", {"workflow": "triage", "project_dir": "/no/such/dir"}, self.defaults)
        self.assertEqual(out[0], "error")

    def test_decide_argv_resumes_at_step(self):
        argv = cockpit._build_run_argv(
            "decide", {"workflow": "triage", "project_dir": self.td, "step": "2",
                       "decide": "approve"}, self.defaults)
        self.assertEqual(argv[argv.index("--from-step") + 1], "2")
        self.assertEqual(argv[argv.index("--decide") + 1], "approve")
        self.assertIn("--non-interactive", argv)

    def test_decide_bad_step_rejected(self):
        out = cockpit._build_run_argv(
            "decide", {"workflow": "triage", "project_dir": self.td, "step": "x",
                       "decide": "approve"}, self.defaults)
        self.assertEqual(out[0], "error")

    def test_decide_continues_same_run_id(self):
        # #121: a valid run_id is threaded as --run-id so the resume continues the
        # paused run (clears the gate) instead of forking a duplicate.
        argv = cockpit._build_run_argv(
            "decide", {"workflow": "triage", "project_dir": self.td, "step": "2",
                       "decide": "bug", "run_id": "triage--no-bet--20260624T010101"},
            self.defaults)
        self.assertEqual(argv[argv.index("--run-id") + 1],
                         "triage--no-bet--20260624T010101")

    def test_decide_rejects_bogus_run_id(self):
        argv = cockpit._build_run_argv(
            "decide", {"workflow": "triage", "project_dir": self.td, "step": "2",
                       "decide": "bug", "run_id": "../etc/passwd; rm -rf"},
            self.defaults)
        self.assertNotIn("--run-id", argv)  # invalid id dropped, not passed

    def test_decide_carries_bet_and_mode(self):
        # #156: THE fix — a bet-scoped resume must pass --bet (else the requirement
        # gate exits 3 before the gate step = "approved but nothing happened"), and
        # carry the run's write perm + subscription CLI hosts.
        argv = cockpit._build_run_argv(
            "decide", {"workflow": "build", "project_dir": self.td, "step": "6",
                       "decide": "approve", "bet": "WLT-26",
                       "allow_write": "1", "claude_cli": "1", "codex_cli": "1"},
            self.defaults)
        self.assertEqual(argv[argv.index("--bet") + 1], "WLT-26")
        self.assertIn("--allow-write", argv)
        self.assertIn("--claude-cli", argv)
        self.assertIn("--codex-cli", argv)

    def test_decide_omits_mode_when_absent(self):
        # a read-only / API / bet-less run carries none of them (no false flags)
        argv = cockpit._build_run_argv(
            "decide", {"workflow": "triage", "project_dir": self.td, "step": "2",
                       "decide": "approve"}, self.defaults)
        for f in ("--bet", "--allow-write", "--claude-cli", "--codex-cli"):
            self.assertNotIn(f, argv)

    def test_run_still_carries_bet_and_writes(self):
        # the /run path keeps --bet + --allow-write after the shared-block refactor
        argv = cockpit._build_run_argv(
            "run", {"workflow": "build", "project_dir": self.td, "bet": "WLT-26",
                    "allow_write": "1", "context": "build it"}, self.defaults)
        self.assertEqual(argv[argv.index("--bet") + 1], "WLT-26")
        self.assertIn("--allow-write", argv)
        self.assertEqual(argv[argv.index("--context") + 1], "build it")

    def test_fold_captures_run_mode(self):
        # #156: run mode comes off run_start so a /decide resume can reuse it
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", workflow="build", bet_id="WLT-26",
                          allow_write=True, codex_cli=True, claude_cli=True),
            ev.make_event(ev.GATE_OPEN, run_id="r1", step=6, kind="hitl", title="merge"),
        ]
        r = cockpit.fold_runs(events)["r1"]
        self.assertTrue(r["allow_write"])
        self.assertTrue(r["codex_cli"])
        self.assertTrue(r["claude_cli"])

    def test_decide_form_includes_bet_hidden_field(self):
        # the BUTTON path (HTML form) must carry bet — the actual bug surface
        runs = {"r1": {"run_id": "r1", "project": "home", "workflow": "build",
                       "bet_id": "WLT-26", "project_dir": self.td, "ended": False,
                       "steps": {}, "allow_write": True, "codex_cli": True,
                       "open_gate": {"step": 6, "kind": "hitl", "title": "merge"}}}
        html = cockpit.render_html(runs, actions=True, default_project_dir=self.td)
        self.assertIn("name='bet' value='WLT-26'", html)
        self.assertIn("name='codex_cli'", html)

    def test_render_html_actions_on_shows_forms(self):
        runs = {"r1": {"run_id": "r1", "project": "home", "workflow": "triage",
                       "project_dir": self.td, "ended": False, "steps": {},
                       "open_gate": {"step": 2, "kind": "hitl", "title": "gate"}}}
        html = cockpit.render_html(runs, actions=True, default_project_dir=self.td)
        self.assertIn("Launch a workflow", html)
        self.assertIn("action='/run'", html)
        self.assertIn("action='/decide'", html)
        self.assertIn("approve</button>", html)

    def test_render_html_actions_off_is_read_only(self):
        runs = {"r1": {"run_id": "r1", "project": "home", "workflow": "triage",
                       "project_dir": self.td, "ended": False, "steps": {},
                       "open_gate": {"step": 2, "kind": "hitl", "title": "gate"}}}
        html = cockpit.render_html(runs, actions=False)
        self.assertNotIn("Launch a workflow", html)
        self.assertNotIn("action='/run'", html)
        self.assertIn("read-only", html)

    def test_fold_captures_project_dir(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="r1", project="home",
                          workflow="triage", project_dir="/abs/home"),
        ]
        runs = cockpit.fold_runs(events)
        self.assertEqual(runs["r1"]["project_dir"], "/abs/home")

    def test_known_workflows_excludes_advance(self):
        repo = Path(__file__).resolve().parents[3]
        names = cockpit._known_workflows(repo / "compass")
        self.assertIn("triage", names)
        self.assertNotIn("advance", names)

    def test_run_log_path_and_link(self):
        # #133: valid run id → a log path under runs/; invalid id → None (no traversal)
        lp = cockpit._run_log_path("triage--no-bet--20260625T010101")
        self.assertIsNotNone(lp)
        self.assertTrue(str(lp).endswith("orchestrator/runs/triage--no-bet--20260625T010101.log"))
        self.assertIsNone(cockpit._run_log_path("../../etc/passwd"))
        self.assertIsNone(cockpit._run_log_path(""))
        # link shown only in actionable mode
        self.assertIn("/log?run=r1", cockpit._log_link("r1", True))
        self.assertEqual(cockpit._log_link("r1", False), "")

    def test_run_argv_pins_run_id_for_launch(self):
        # #133: a /run with a minted run_id passes --run-id (so output → named log)
        argv = cockpit._build_run_argv(
            "run", {"workflow": "triage", "project_dir": self.td,
                    "run_id": "triage--no-bet--20260625T010101"}, self.defaults)
        self.assertEqual(argv[argv.index("--run-id") + 1], "triage--no-bet--20260625T010101")

    def test_render_html_shows_log_links_in_actionable_mode(self):
        runs = {"r1": {"run_id": "triage--no-bet--20260625T1", "project": "p",
                       "workflow": "triage", "project_dir": self.td, "ended": True,
                       "status": "completed", "reason": "done", "steps": {}, "open_gate": None}}
        on = cockpit.render_html(runs, actions=True, default_project_dir=self.td)
        off = cockpit.render_html(runs, actions=False)
        self.assertIn("/log?run=triage--no-bet--20260625T1", on)
        self.assertNotIn("/log?run=", off)

    def test_doc_link_and_artifact_dir(self):
        # #136: review link + artifact-dir resolution
        self.assertIn("/doc?run=r1", cockpit._doc_link("r1"))
        self.assertEqual(cockpit._doc_link(""), "")
        run = {"project_dir": "/proj", "workflow": "create-brief"}
        d = cockpit._run_artifact_dir(run)
        self.assertTrue(str(d).endswith("/proj/docs/orchestrator-runs/create-brief"))
        self.assertIsNone(cockpit._run_artifact_dir({"project_dir": None, "workflow": "x"}))
        self.assertIsNone(cockpit._run_artifact_dir({"project_dir": "/p"}))  # no workflow

    def test_extract_pr_urls(self):
        # #142: pull PR/MR URLs out of agent narration, de-duped
        txt = ("PR #116 open: https://github.com/vivekschaudhary/home-app/pull/116\n"
               "see also https://github.com/vivekschaudhary/home-app/pull/116 and "
               "https://gitlab.com/g/p/merge_requests/7")
        urls = cockpit._extract_pr_urls(txt)
        self.assertEqual(urls, [
            "https://github.com/vivekschaudhary/home-app/pull/116",
            "https://gitlab.com/g/p/merge_requests/7"])
        self.assertEqual(cockpit._extract_pr_urls(""), [])

    def test_changes_link_gating(self):
        self.assertIn("/changes?run=r1", cockpit._changes_link("r1"))
        self.assertEqual(cockpit._changes_link(""), "")

    def test_awaiting_card_has_review_link(self):
        runs = {"r1": {"run_id": "triage--no-bet--20260625T1", "project": "p",
                       "workflow": "triage", "project_dir": self.td, "ended": False,
                       "steps": {}, "open_gate": {"step": 2, "kind": "hitl", "title": "g"}}}
        html = cockpit.render_html(runs, actions=True, default_project_dir=self.td)
        self.assertIn("/doc?run=triage--no-bet--20260625T1", html)  # review ↗ on the gate

    def test_render_html_actions_have_confirm_and_disable(self):
        # #122: every action form confirms + `_act` disables all buttons on submit
        runs = {"r1": {"run_id": "r1", "project": "home", "workflow": "triage",
                       "project_dir": self.td, "ended": False, "steps": {},
                       "open_gate": {"step": 2, "kind": "hitl", "title": "gate"}}}
        html = cockpit.render_html(runs, actions=True, default_project_dir=self.td)
        self.assertIn("onsubmit=", html)
        self.assertIn("function _act", html)
        self.assertIn("disabled=true", html)

    def test_step_outcome_failed_renders_cross(self):
        # #149: a STEP_END with outcome=incomplete folds to status 'failed' (✗)
        events = [
            ev.make_event(ev.RUN_START, run_id="x", workflow="fix", project="p",
                          project_dir=self.td),
            {"type": ev.STEP_START, "run_id": "x", "step": 1, "agent": "tech-writer",
             "task": "accumulate-changelog", "ts": "2026-06-25T00:00:00+00:00"},
            {"type": ev.STEP_END, "run_id": "x", "step": 1, "outcome": "incomplete",
             "outcome_reason": "permission not granted", "ts": "2026-06-25T00:00:30+00:00"},
        ]
        runs = cockpit.fold_runs(events)
        self.assertEqual(runs["x"]["steps"][1]["status"], "failed")
        rows, _ = cockpit._run_step_rows(runs["x"], [])
        self.assertTrue(any(r[1] == "failed" for r in rows))
        html = cockpit.render_html(runs)
        self.assertIn("✗", html)               # cross icon for the failed step
        self.assertIn("class='failed'", html)

    def test_step_outcome_done_renders_check(self):
        events = [
            ev.make_event(ev.RUN_START, run_id="y", workflow="fix", project="p"),
            {"type": ev.STEP_START, "run_id": "y", "step": 1, "agent": "engineer",
             "task": "triage-and-fix", "ts": "2026-06-25T00:00:00+00:00"},
            {"type": ev.STEP_END, "run_id": "y", "step": 1, "outcome": "done",
             "ts": "2026-06-25T00:00:30+00:00"},
        ]
        runs = cockpit.fold_runs(events)
        self.assertEqual(runs["y"]["steps"][1]["status"], "done")

    def test_step_durations_and_spinner(self):
        # #130: done steps show start→end duration; the running step shows live
        # elapsed; the running glyph is the spinner ◐ (CSS-animated).
        from datetime import datetime, timezone
        now = datetime(2026, 6, 25, 0, 5, 0, tzinfo=timezone.utc)
        events = [
            ev.make_event(ev.RUN_START, run_id="d1", project="p", workflow="triage"),
            {"type": ev.STEP_START, "run_id": "d1", "step": 1, "agent": "support",
             "task": "classify-intake", "ts": "2026-06-25T00:00:00+00:00"},
            {"type": ev.STEP_END, "run_id": "d1", "step": 1,
             "ts": "2026-06-25T00:00:12+00:00"},
            {"type": ev.STEP_START, "run_id": "d1", "step": 2, "agent": "engineer",
             "task": "triage-and-fix", "ts": "2026-06-25T00:02:00+00:00"},
        ]
        runs = cockpit.fold_runs(events)
        rows, _ = cockpit._run_step_rows(runs["d1"], graph_steps=[], now=now)
        durs = {n: dur for n, status, label, dur in rows}
        self.assertEqual(durs[1], "12s")          # done: 00:00 → 00:12
        self.assertEqual(durs[2], "3m00s")        # running: 00:02 → now 00:05
        html = cockpit.render_html(runs, now=now)
        self.assertIn("◐", html)                   # spinner glyph on the running step
        self.assertIn("@keyframes spin", html)     # CSS animation present
        self.assertIn("class='dur'", html)         # duration rendered

    def test_no_meta_refresh_uses_guarded_reload(self):
        # #128: blind meta-refresh wiped the Launch form mid-typing — replaced by
        # a JS reload that pauses on compose and skips focused fields.
        runs = {"r1": {"run_id": "r1", "project": "p", "workflow": "triage",
                       "project_dir": self.td, "ended": False, "steps": {},
                       "open_gate": None}}
        for actions in (True, False):
            html = cockpit.render_html(runs, actions=actions, default_project_dir=self.td)
            self.assertNotIn("http-equiv", html)        # no whole-page meta refresh
            self.assertIn("location.reload", html)       # JS reload instead
            self.assertIn("paused", html)                # pauses while composing
            self.assertIn("activeElement", html)         # never reloads a focused field

    def test_gate_already_actioned(self):
        # open gate → not actioned; decided/ended → actioned; unknown → False
        open_evt = [ev.make_event(ev.RUN_START, run_id="g1", workflow="triage"),
                    ev.make_event(ev.GATE_OPEN, run_id="g1", step=2, kind="routing")]
        self.assertFalse(cockpit._gate_already_actioned(open_evt, "g1"))

        decided = open_evt + [ev.make_event(ev.GATE_DECISION, run_id="g1", step=2,
                                            decision="bug")]
        self.assertTrue(cockpit._gate_already_actioned(decided, "g1"))
        self.assertFalse(cockpit._gate_already_actioned(decided, "nope"))
        self.assertFalse(cockpit._gate_already_actioned(decided, ""))


class TestStaleRuns(unittest.TestCase):
    """#5 coherence floor: detect + auto-halt abandoned in-flight runs so the board
    can't show a zombie forever."""

    NOW = datetime.fromisoformat("2026-06-28T12:00:00+00:00")
    OLD = "2026-06-28T10:00:00+00:00"      # 2h ago
    RECENT = "2026-06-28T11:59:30+00:00"   # 30s ago

    def test_is_stale(self):
        self.assertTrue(ev.is_stale({"started": "x", "ended": False, "last_ts": self.OLD},
                                    self.NOW, 100))
        self.assertFalse(ev.is_stale({"started": "x", "ended": False, "last_ts": self.RECENT},
                                     self.NOW, 100))
        self.assertFalse(ev.is_stale({"started": "x", "ended": True, "last_ts": self.OLD},
                                     self.NOW, 100))  # ended → not stale
        self.assertFalse(ev.is_stale({"started": None}, self.NOW, 100))  # never started

    def test_halt_stale_runs_reaps_only_stale(self):
        events = [
            {"run_id": "stale", "type": ev.RUN_START, "ts": self.OLD,
             "workflow": "build", "bet_id": "CB-1"},
            {"run_id": "ended", "type": ev.RUN_START, "ts": self.OLD},
            {"run_id": "ended", "type": ev.RUN_END, "ts": self.OLD, "status": "completed"},
            {"run_id": "fresh", "type": ev.RUN_START, "ts": self.RECENT},
        ]
        emitted = []
        halted = ev.halt_stale_runs(now=self.NOW, threshold=100,
                                    sink=emitted.append, events=events)
        self.assertEqual(halted, ["stale"])
        self.assertEqual(emitted[0]["type"], ev.RUN_END)
        self.assertEqual(emitted[0]["status"], "halted")
        self.assertEqual(emitted[0]["run_id"], "stale")
        self.assertIn("stale", emitted[0]["reason"])

    def test_halt_stale_runs_idempotent(self):
        events = [{"run_id": "z", "type": ev.RUN_START, "ts": self.OLD}]
        self.assertEqual(
            ev.halt_stale_runs(now=self.NOW, threshold=100, sink=lambda e: None, events=events),
            ["z"])
        # once the halt event is in the spine, a re-run finds it ended → no-op
        events.append({"run_id": "z", "type": ev.RUN_END, "ts": self.OLD, "status": "halted"})
        self.assertEqual(
            ev.halt_stale_runs(now=self.NOW, threshold=100, sink=lambda e: None, events=events),
            [])

    def test_targeted_reap_halts_only_named_run(self):
        # #28: --reap-stale --run-id X halts ONLY X, even though it's FRESH (not stale),
        # and never touches other in-flight runs.
        events = [
            {"run_id": "keep", "type": ev.RUN_START, "ts": self.OLD,   # stale, but not named
             "workflow": "build"},
            {"run_id": "target", "type": ev.RUN_START, "ts": self.RECENT,  # fresh, but named
             "workflow": "build", "bet_id": "CB-9"},
        ]
        emitted = []
        halted = ev.halt_stale_runs(now=self.NOW, threshold=100, sink=emitted.append,
                                    events=events, run_id="target")
        self.assertEqual(halted, ["target"])                      # only the named run
        self.assertEqual(emitted[0]["run_id"], "target")
        self.assertEqual(emitted[0]["status"], "halted")
        self.assertIn("operator-reaped", emitted[0]["reason"])

    def test_targeted_reap_skips_ended_and_unknown(self):
        events = [
            {"run_id": "done", "type": ev.RUN_START, "ts": self.OLD},
            {"run_id": "done", "type": ev.RUN_END, "ts": self.OLD, "status": "completed"},
        ]
        # naming an already-ended run → no-op; naming an unknown run → no-op
        self.assertEqual(ev.halt_stale_runs(now=self.NOW, sink=lambda e: None,
                                            events=events, run_id="done"), [])
        self.assertEqual(ev.halt_stale_runs(now=self.NOW, sink=lambda e: None,
                                            events=events, run_id="nope"), [])


if __name__ == "__main__":
    unittest.main()
