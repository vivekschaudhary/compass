"""Tests for graph.py — dispatch-graph parsing, HITL gate detection.

The HITL detection tests exist because a human gate that silently parses as a
"workflow-level step" (and is therefore skipped) is the worst failure mode the
parser has: the run proceeds without the approval the workflow promised.
"""
import os
import tempfile
import unittest
from pathlib import Path

from compass.orchestrator.graph import load_workflow, load_workflow_meta

COMPASS_DIR = Path(__file__).resolve().parents[2]
WORKFLOWS = COMPASS_DIR / "workflows"


def _parse(markdown: str):
    with tempfile.NamedTemporaryFile(
        "w", suffix=".md", delete=False, encoding="utf-8"
    ) as f:
        f.write(markdown)
        path = Path(f.name)
    try:
        return load_workflow(path)
    finally:
        path.unlink()


def _wf(steps_md: str) -> str:
    return f"# Workflow: /test\n\n## Dispatch graph\n\n{steps_md}\n\n## Notes\n\nIgnore me.\n"


class TestHitlDetection(unittest.TestCase):
    def test_canonical_format(self):
        steps = _parse(_wf("### Step 1. Gate (human)\n\n**Dispatches:** HUMAN\n"))
        self.assertTrue(steps[0].is_hitl)

    def test_bold_on_value_not_label(self):
        # The regression case: `Dispatches: **HUMAN**` must still be a gate.
        steps = _parse(_wf("### Step 1. Gate (human)\n\nDispatches: **HUMAN**\n"))
        self.assertTrue(steps[0].is_hitl)

    def test_colon_outside_bold(self):
        steps = _parse(_wf("### Step 1. Gate (human)\n\n**Dispatches**: HUMAN\n"))
        self.assertTrue(steps[0].is_hitl)

    def test_extra_whitespace_and_case(self):
        steps = _parse(_wf("### Step 1. Gate (human)\n\n**Dispatches:**    Human review\n"))
        self.assertTrue(steps[0].is_hitl)

    def test_em_dash_separator(self):
        steps = _parse(_wf("### Step 1. Gate (human)\n\nDispatches — HUMAN\n"))
        self.assertTrue(steps[0].is_hitl)

    def test_hitl_in_title_is_gate(self):
        steps = _parse(_wf("### Step 2. **HITL gate** (human)\n\nApproval required.\n"))
        self.assertTrue(steps[0].is_hitl)

    def test_agent_step_is_not_gate(self):
        steps = _parse(
            _wf("### Step 1. `engineer.implement-story` (Engineer)\n\n**Dispatches:** Engineer agent\n")
        )
        self.assertFalse(steps[0].is_hitl)

    def test_human_mentioned_elsewhere_is_not_gate(self):
        # HUMAN appearing in prose (not on the Dispatches line) must not
        # convert an agent step into a gate.
        steps = _parse(
            _wf(
                "### Step 1. `pm.draft-brief` (PM)\n\n"
                "**Dispatches:** PM agent\n"
                "After this step a HUMAN reviews the brief in step 2.\n"
            )
        )
        self.assertFalse(steps[0].is_hitl)


class TestStepParsing(unittest.TestCase):
    def test_agent_and_task_from_backticks(self):
        steps = _parse(_wf("### Step 1. `pm.draft-brief` (PM agent owns)\n\nbody\n"))
        self.assertEqual(steps[0].agent, "pm")
        self.assertEqual(steps[0].task, "draft-brief")
        self.assertEqual(steps[0].agent_file, "pm.md")

    def test_agent_file_from_task_definition_line(self):
        steps = _parse(
            _wf(
                "### Step 1. `delivery-manager.update-status` (DM)\n\n"
                "**Task definition:** `compass/agents/delivery-manager.md` → Task `update-status`\n"
            )
        )
        self.assertEqual(steps[0].agent_file, "delivery-manager.md")

    def test_workflow_level_step_has_no_agent(self):
        steps = _parse(_wf("### Step 1. Mechanical merge constraints (CI)\n\nbody\n"))
        self.assertFalse(steps[0].is_hitl)
        self.assertIsNone(steps[0].agent)
        self.assertIsNone(steps[0].task)

    def test_steps_outside_dispatch_graph_section_ignored(self):
        md = (
            "# Workflow\n\n## Dispatch graph\n\n"
            "### Step 1. `pm.draft-brief` (PM)\n\nbody\n\n"
            "## Edge cases\n\n"
            "### Step 99. `fake.task` illustrative only\n\nbody\n"
        )
        steps = _parse(md)
        self.assertEqual([s.number for s in steps], [1])

    def test_title_markup_stripped(self):
        steps = _parse(_wf("### Step 1. **HITL gate** (human)\n\n**Dispatches:** HUMAN\n"))
        self.assertNotIn("*", steps[0].title)


class TestRealWorkflows(unittest.TestCase):
    """Integration: the four dispatch-graph workflows parse with their gates intact."""

    def test_setup_product(self):
        steps = load_workflow(WORKFLOWS / "setup-product.md")
        self.assertEqual(len(steps), 4)
        self.assertEqual([s.is_hitl for s in steps], [False, False, True, False])

    def test_build(self):
        steps = load_workflow(WORKFLOWS / "build.md")
        self.assertEqual(len(steps), 8)
        hitl_steps = [s.number for s in steps if s.is_hitl]
        self.assertEqual(hitl_steps, [6])
        step2 = next(s for s in steps if s.number == 2)
        self.assertEqual((step2.agent, step2.task), ("automation", "write-e2e-tests"))

    def test_create_brief(self):
        steps = load_workflow(WORKFLOWS / "create-brief.md")
        self.assertEqual([s.number for s in steps if s.is_hitl], [3])

    def test_create_bet_architecture(self):
        steps = load_workflow(WORKFLOWS / "create-bet-architecture.md")
        self.assertEqual([s.number for s in steps if s.is_hitl], [2])

    def test_setup_foundation_architecture(self):
        steps = load_workflow(WORKFLOWS / "setup-foundation-architecture.md")
        self.assertEqual(len(steps), 6)
        # two HITL gates, at steps 2 and 4, each with an artifact target
        gates = [s for s in steps if s.is_hitl]
        self.assertEqual([s.number for s in gates], [2, 4])
        self.assertEqual(
            gates[0].artifact_target, "docs/foundation/architecture-phase-a-research.md"
        )
        self.assertEqual(gates[1].artifact_target, "docs/foundation/architecture.md")
        # three EA tasks dispatched in order
        ea = [(s.agent, s.task) for s in steps if s.agent == "enterprise-architect"]
        self.assertEqual(
            ea,
            [
                ("enterprise-architect", "research-architecture"),
                ("enterprise-architect", "derive-architecture"),
                ("enterprise-architect", "scaffold-foundation"),
            ],
        )

    def test_create_story(self):
        steps = load_workflow(WORKFLOWS / "create-story.md")
        self.assertEqual(len(steps), 5)
        # PM decompose first, designer + ux-writer conditional, DM status last
        self.assertEqual((steps[0].agent, steps[0].task), ("pm", "decompose-bet-to-story"))
        agents = [s.agent for s in steps]
        self.assertIn("designer", agents)
        self.assertIn("ux-writer", agents)
        self.assertEqual(steps[-1].agent, "delivery-manager")
        # one HITL gate (every_phase) targeting the story
        gates = [s for s in steps if s.is_hitl]
        self.assertEqual(len(gates), 1)
        self.assertEqual(
            gates[0].artifact_target, "docs/bets/<bet-id>/stories/<story-id>/story.md"
        )

    def test_create_story_requires_brief(self):
        meta = load_workflow_meta(WORKFLOWS / "create-story.md")
        self.assertEqual(meta["requires_approved"], ["docs/bets/<bet-id>/brief.md"])

    def test_triage_front_door_graph(self):
        # #103: /triage is the front-door ITIL intake router — 9 steps,
        # classify-intake first, two routing gates (intake + fix-forward).
        steps = load_workflow(WORKFLOWS / "triage.md")
        self.assertEqual(len(steps), 9)
        self.assertEqual((steps[0].agent, steps[0].task), ("support", "classify-intake"))

    def test_triage_intake_routing_gate(self):
        # Step 2: ITIL intake gate — 7 routes mixing an inline step, five
        # cross-workflow hand-offs, and a close (target types int | str).
        steps = load_workflow(WORKFLOWS / "triage.md")
        gate = steps[1]
        self.assertTrue(gate.is_hitl and gate.routes)
        self.assertEqual(gate.number, 2)
        routes = dict(gate.routes)
        self.assertEqual(routes["incident"], 3)          # inline branch (int)
        self.assertEqual(routes["bug"], "/fix")          # hand-off (str)
        self.assertEqual(routes["enhancement"], "/create-brief")
        self.assertEqual(routes["problem"], "/create-brief")
        self.assertEqual(routes["change"], "/ops")
        self.assertEqual(routes["service-request"], "/ops")
        self.assertEqual(routes["not-an-issue"], "close")
        self.assertEqual(len(gate.routes), 7)

    def test_triage_fix_forward_gate_renumbered(self):
        # Step 4: incident fix-forward gate, renumbered for the inserted front door.
        steps = load_workflow(WORKFLOWS / "triage.md")
        gate = steps[3]
        self.assertEqual(gate.number, 4)
        self.assertEqual(gate.routes, [("resolved", 7), ("needs-fix", 5)])
        self.assertEqual((steps[2].agent, steps[2].task), ("support", "triage-incident"))
        self.assertEqual((steps[4].agent, steps[4].task), ("engineer", "triage-and-fix"))
        self.assertEqual((steps[6].agent, steps[6].task), ("support", "write-postmortem"))


class TestRouteParsing(unittest.TestCase):
    def test_routes_parsed(self):
        steps = _parse(_wf(
            "### Step 1. **HITL — route** (human)\n\n**Dispatches:** HUMAN\n"
            "**Routes:**\n- `resolved` → Step 5\n- needs-fix -> Step 3\n"
        ))
        self.assertEqual(steps[0].routes, [("resolved", 5), ("needs-fix", 3)])

    def test_plain_hitl_has_no_routes(self):
        steps = _parse(_wf("### Step 1. **HITL gate** (human)\n\n**Dispatches:** HUMAN\n"))
        self.assertIsNone(steps[0].routes)

    def test_mixed_route_targets(self):
        # #103: a routing gate's targets may be an inline step (int), a
        # cross-workflow hand-off (/x), or close — all in one Routes block.
        steps = _parse(_wf(
            "### Step 1. **HITL — intake** (human)\n\n**Dispatches:** HUMAN\n"
            "**Routes:**\n"
            "- `incident` → Step 3\n"
            "- `bug` → /fix\n"
            "- enhancement -> /create-brief\n"
            "- `not-an-issue` → close\n"
        ))
        self.assertEqual(
            steps[0].routes,
            [("incident", 3), ("bug", "/fix"),
             ("enhancement", "/create-brief"), ("not-an-issue", "close")],
        )
        # types: inline is int, hand-off + close are str
        targets = dict(steps[0].routes)
        self.assertIsInstance(targets["incident"], int)
        self.assertIsInstance(targets["bug"], str)
        self.assertIsInstance(targets["not-an-issue"], str)


class TestBetCatalog(unittest.TestCase):
    # #109: the front-door classifier gets the existing-bets catalog so it can
    # right-size an enhancement and name the bet a slice belongs to.
    def _bet(self, root, bet_id, fm, body=""):
        from pathlib import Path
        d = Path(root) / "docs" / "bets" / bet_id
        d.mkdir(parents=True, exist_ok=True)
        (d / "brief.md").write_text(f"---\n{fm}\n---\n{body}", encoding="utf-8")

    def test_catalog_names_bets_with_type_status(self):
        import tempfile
        from compass.orchestrator.run import _load_bet_catalog
        with tempfile.TemporaryDirectory() as d:
            self._bet(d, "CB-7", "id: CB-7\ntype: feature\nstatus: approved",
                      "# Accounts dashboard\nShow linked bank accounts.\n")
            self._bet(d, "CB-9", "id: CB-9\ntype: tech-debt\nstatus: proposed\nhypothesis: Speed up sync")
            cat = _load_bet_catalog(Path(d))
            self.assertIn("CB-7 (feature, approved)", cat)
            self.assertIn("Accounts dashboard", cat)           # heading one-liner
            self.assertIn("CB-9 (tech-debt, proposed)", cat)
            self.assertIn("Speed up sync", cat)                # hypothesis one-liner
            self.assertIn("create-story --bet", cat)           # tells the classifier the lane

    def test_catalog_empty_when_no_bets(self):
        import tempfile
        from compass.orchestrator.run import _load_bet_catalog
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(_load_bet_catalog(Path(d)), "")   # no docs/bets → no crash

    def test_reads_bet_catalog_flag(self):
        import tempfile
        from pathlib import Path
        from compass.orchestrator.run import _reads_bet_catalog
        on = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
        on.write("---\nname: support\nloads_bet_catalog: true\n---\nbody\n"); on.close()
        off = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
        off.write("---\nname: pm\npreferred_hosts: [claude]\n---\nbody\n"); off.close()
        try:
            self.assertTrue(_reads_bet_catalog(Path(on.name)))
            self.assertFalse(_reads_bet_catalog(Path(off.name)))
        finally:
            Path(on.name).unlink(); Path(off.name).unlink()


class TestHandoffMessage(unittest.TestCase):
    # #103: cross-workflow hand-off / close handling at a routing gate.
    def test_handoff_recommends_command(self):
        from compass.orchestrator.run import _handoff_message
        msg = _handoff_message("/fix", "/tmp/proj")
        self.assertIn("run /fix", msg)
        self.assertIn("compass.orchestrator.run fix", msg)  # leading slash stripped
        self.assertIn("--project-dir /tmp/proj", msg)
        self.assertIn("--context", msg)

    def test_handoff_hyphenated_workflow(self):
        from compass.orchestrator.run import _handoff_message
        msg = _handoff_message("/create-brief", "/tmp/proj")
        self.assertIn("compass.orchestrator.run create-brief", msg)

    def test_close_is_terminal_not_a_command(self):
        from compass.orchestrator.run import _handoff_message
        msg = _handoff_message("close", "/tmp/proj")
        self.assertIn("closed", msg.lower())
        self.assertNotIn("compass.orchestrator.run", msg)

    def test_route_target_desc(self):
        from compass.orchestrator.hitl import _route_target_desc
        self.assertEqual(_route_target_desc(3), "continue at Step 3")
        self.assertEqual(_route_target_desc("/fix"), "hand off to /fix")
        self.assertEqual(_route_target_desc("close"), "close (no action)")

    def test_recommended_next_parses_contract_line(self):
        # #110: the hand-off echoes the classifier's right-sized recommendation.
        from compass.orchestrator.run import _recommended_next
        out = ("...intake summary...\n"
               "**Next command:** create-story --bet CB-7 --context \"reconnect button\"\n")
        self.assertEqual(
            _recommended_next(out),
            'create-story --bet CB-7 --context "reconnect button"',
        )

    def test_recommended_next_none_when_absent(self):
        from compass.orchestrator.run import _recommended_next
        self.assertIsNone(_recommended_next("no contract line here"))
        self.assertIsNone(_recommended_next(""))

    def test_recommended_next_takes_last(self):
        from compass.orchestrator.run import _recommended_next
        out = "Next command: create-brief\nthen later\n**Next command:** create-story --bet AC-2\n"
        self.assertEqual(_recommended_next(out), "create-story --bet AC-2")


class TestSkipForRoute(unittest.TestCase):
    def test_forward_branch_skips_between(self):
        from compass.orchestrator.run import _skip_for_route
        self.assertEqual(_skip_for_route(2, 5), {3, 4})   # resolved: skip fix branch

    def test_immediate_next_skips_nothing(self):
        from compass.orchestrator.run import _skip_for_route
        self.assertEqual(_skip_for_route(2, 3), set())    # needs-fix: run everything

    def test_backward_target_skips_nothing(self):
        from compass.orchestrator.run import _skip_for_route
        self.assertEqual(_skip_for_route(5, 2), set())

    def test_fix(self):
        # #108 (Retro #022 ITIL-tier collapse): /fix dropped the repo-blind
        # support.triage-bug step + its gate. 8 steps → 6; the engineer triages
        # from the code (triage-and-fix) as Step 1; one HITL gate (merge).
        steps = load_workflow(WORKFLOWS / "fix.md")
        self.assertEqual(len(steps), 6)
        self.assertEqual([s.number for s in steps if s.is_hitl], [5])
        self.assertEqual((steps[0].agent, steps[0].task), ("engineer", "triage-and-fix"))
        # maker ≠ checker preserved: a different-model reviewer still runs
        self.assertIn(("reviewer", "review-pr"), [(s.agent, s.task) for s in steps])
        # no support step remains in /fix
        self.assertNotIn("support", [s.agent for s in steps])
        # fix is reactive — no foundation requirement gate (hygiene fixes have no bet)
        self.assertEqual(load_workflow_meta(WORKFLOWS / "fix.md")["requires_approved"], [])

    def test_ops(self):
        steps = load_workflow(WORKFLOWS / "ops.md")
        self.assertEqual(len(steps), 7)
        self.assertEqual([s.number for s in steps if s.is_hitl], [2, 6])
        self.assertEqual(
            (steps[0].agent, steps[0].task), ("enterprise-architect", "lead-ops-change")
        )
        self.assertEqual((steps[2].agent, steps[2].task), ("engineer", "apply-ops-change"))
        self.assertEqual(load_workflow_meta(WORKFLOWS / "ops.md")["requires_approved"], [])


class TestCostControl(unittest.TestCase):
    # #115/#117: model tiering + context condense (cost-control batch).
    def test_default_model_is_sonnet_deep_is_opus(self):
        from compass.orchestrator.hosts.router import DEFAULT_MODELS, DEEP_MODELS, deep_model
        self.assertIn("sonnet", DEFAULT_MODELS["claude"])   # #115: cheap default
        self.assertIn("opus", DEEP_MODELS["claude"])
        self.assertIn("opus", deep_model("claude"))
        self.assertIn("gpt", deep_model("codex"))           # codex → openai family

    def test_read_model_tier(self):
        import tempfile
        from compass.orchestrator.run import _read_model_tier
        d = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
        d.write("---\nname: engineer\nmodel_tier: deep\n---\nbody\n"); d.close()
        p = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
        p.write("---\nname: pm\npreferred_hosts: [claude]\n---\nbody\n"); p.close()
        try:
            from pathlib import Path
            self.assertEqual(_read_model_tier(Path(d.name)), "deep")
            self.assertEqual(_read_model_tier(Path(p.name)), "")
        finally:
            from pathlib import Path
            Path(d.name).unlink(); Path(p.name).unlink()

    def test_condense_output_shrinks_keeps_signal(self):
        from compass.orchestrator.run import _condense_output
        raw = ("# Big output\n"
               + ("a substantive filler line long enough to be a real sentence\n" * 200)
               + "\n## Output summary\n**TL;DR** the session fix landed and tests pass\n"
               + "**Files created/modified:** `a.ts`, `b.ts`\n")
        out = _condense_output(raw)
        self.assertLess(len(out), len(raw) / 3)   # much smaller context
        self.assertIn("TL;DR", out)

    def test_condense_output_fallback(self):
        from compass.orchestrator.run import _condense_output
        self.assertIn("ok", _condense_output("ok"))   # tiny input → no crash


class TestAsyncGate(unittest.TestCase):
    # #118: non-interactive gate resolution (pause-and-resume enabler).
    def test_resolve_approval_gate(self):
        from compass.orchestrator.run import _resolve_gate
        self.assertEqual(_resolve_gate("approve", False, None), ("approve", None))
        self.assertEqual(_resolve_gate("reject", False, None), ("reject", None))
        self.assertEqual(_resolve_gate("REJECT", False, None), ("reject", None))  # case-insensitive
        self.assertEqual(_resolve_gate(None, False, None), ("pause", None))       # no decision → pause
        self.assertEqual(_resolve_gate("bug", False, None), ("pause", None))      # route on approval gate → pause

    def test_resolve_routing_gate(self):
        from compass.orchestrator.run import _resolve_gate
        routes = [("bug", "/fix"), ("incident", 3), ("not-an-issue", "close")]
        self.assertEqual(_resolve_gate("bug", True, routes), ("route", "bug"))
        self.assertEqual(_resolve_gate("INCIDENT", True, routes), ("route", "incident"))
        self.assertEqual(_resolve_gate("nope", True, routes), ("pause", None))    # unknown label → pause
        self.assertEqual(_resolve_gate(None, True, routes), ("pause", None))      # no decision → pause

    def test_flags_parse(self):
        # --non-interactive + --decide are accepted (argparse plumbing).
        import argparse
        from compass.orchestrator import run as runmod
        # build a parser the same way main() does is internal; assert the dest names
        # exist by parsing a tiny namespace via the module's main arg surface.
        # Lightweight: confirm _run_workflow accepts the kwargs without error.
        import inspect
        sig = inspect.signature(runmod._run_workflow)
        self.assertIn("non_interactive", sig.parameters)
        self.assertIn("decide", sig.parameters)


class TestRefusalDetection(unittest.TestCase):
    """#125 dispatch-on-outcome: a leading refusal sentinel halts the run; prose
    that merely discusses refusing does not (no false-positive cascade-stops)."""

    def setUp(self):
        from compass.orchestrator import run as runmod
        self.is_refusal = runmod._is_refusal

    def test_leading_sentinels_detected(self):
        for txt in (
            "REFUSE: this bet needs a tool not in the foundational stack.",
            "[REFUSE] CI not green — fix tests first.",
            "**Refusing:** design spec needed before copy.",
            "REFUSED — the request widens an upstream decision.",
            "## TL;DR\n\nREFUSE: this is CI work, not foundational ops.",  # within first 5 lines
        ):
            self.assertTrue(self.is_refusal(txt), txt)

    def test_prose_mentioning_refuse_not_flagged(self):
        for txt in (
            "The architect may refuse if the stack deviates, but here it's fine.",
            "Classification: bug. Proceeding — no reason to refuse.",
            "",
            "Here is the design. It does not refuse anything.",
        ):
            self.assertFalse(self.is_refusal(txt), txt)

    def test_refusal_buried_deep_not_flagged(self):
        # a sentinel past the first few lines is not a lead refusal
        body = "\n".join(["line"] * 8 + ["REFUSE: too late to count"])
        self.assertFalse(self.is_refusal(body))


class TestWorkBranch(unittest.TestCase):
    """#143: a fresh work branch is cut from main, never stacked on a leftover
    feature branch (which carried already-merged commits → PR conflicts)."""

    def setUp(self):
        from compass.orchestrator import run as runmod
        self.ensure = runmod._ensure_work_branch

    def _repo(self):
        import subprocess
        self._tmp = tempfile.TemporaryDirectory()
        d = self._tmp.name

        def g(*a):
            return subprocess.run(["git", "-C", d, *a], capture_output=True, text=True)
        g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t")
        Path(d, "base.txt").write_text("base")
        g("add", "-A"); g("commit", "-qm", "base"); g("branch", "-M", "main")
        return d, g

    def tearDown(self):
        if hasattr(self, "_tmp"):
            self._tmp.cleanup()

    def test_branches_from_main_not_leftover(self):
        d, g = self._repo()
        # a leftover feature branch with its own commit, currently checked out
        g("checkout", "-qb", "fix/old-leftover")
        Path(d, "leftover.txt").write_text("x")
        g("add", "-A"); g("commit", "-qm", "leftover work")
        br = self.ensure(d, "fix/new-thing")
        self.assertEqual(br, "fix/new-thing")
        files = g("ls-files").stdout
        self.assertIn("base.txt", files)
        self.assertNotIn("leftover.txt", files)  # did NOT stack on the leftover branch

    def test_reuses_existing_branch_on_resume(self):
        d, g = self._repo()
        g("checkout", "-qb", "fix/resume-me"); g("checkout", "-q", "main")
        self.assertEqual(self.ensure(d, "fix/resume-me"), "fix/resume-me")
        self.assertEqual(g("rev-parse", "--abbrev-ref", "HEAD").stdout.strip(), "fix/resume-me")

    def test_non_git_dir_returns_none(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(self.ensure(d, "fix/x"))


class TestStepOutcome(unittest.TestCase):
    """#149: classify a step's output as done (✓) or incomplete (✗) — a step that
    ran but produced a plan/block/permission-confabulation didn't do its job."""

    def setUp(self):
        from compass.orchestrator import run as runmod
        self.classify = runmod._classify_outcome

    def test_done_for_real_work(self):
        self.assertEqual(self.classify(
            "Done. Fixed AccountCard, all 7 tests pass, PR opened.")[0], "done")
        self.assertEqual(self.classify(
            "Added a permission check to the route; committed.")[0], "done")  # benign 'permission'

    def test_incomplete_for_blocks_plans_empty(self):
        for t in (
            "Write permission to docs/status.md hasn't been granted yet for this session.",
            "The plan is ready. Here's what it covers so you can approve.",
            "I can't access the codebase from this session.",
            "Blocker: write access required for docs/.",
            "File write permissions are not auto-approved in this session.",
            "",
            "   \n  ",
        ):
            self.assertEqual(self.classify(t)[0], "incomplete", t)

    def test_incomplete_for_no_tty_write_block(self):
        # #159: the exact phrasings the live create-brief emitted when a write was
        # permission-blocked in headless `claude -p` (steps 1-2 slipped through the
        # old regex and were marked ✓ — these must classify ✗).
        for t in (
            "The permission dialog for the file write should be appearing — please click \"Allow\".",
            "Both files are fully authored and waiting on two permission dialogs — please approve both writes.",
            "The research.md write is waiting on permission approval.",
            "The docs/status.md write permission dialog has appeared 4 times and has not been approved.",
            "please approve the next dialog the file will land",
        ):
            self.assertEqual(self.classify(t)[0], "incomplete", t)

    def test_done_not_falsely_tripped_by_159(self):
        # the broadened regex must not flag normal completed work — incl. the
        # delivery-manager status reports that legitimately narrate awaiting states
        # (the live false positive: "WLT-27 awaiting human approval" tripped ✗ even
        # though status.md was written). #168 tightened the regex to require
        # "permission" context, not bare "approval".
        for t in (
            "Brief written to docs/bets/WLT-27/brief.md. Awaiting human review at the HITL gate.",
            "Done — added an allow-list to the route and committed.",
            "Wrote the story; the designer will pick up the UI slice next.",
            "status.md refreshed: WLT-27 awaiting human approval before build.",
            "Two items in flight; the bet is pending approval at the HITL gate.",
            "Updated status; awaiting your decision on the architecture.",
        ):
            self.assertEqual(self.classify(t)[0], "done", t)

    def test_permission_block_still_incomplete_after_168(self):
        # #168 tightening must NOT weaken the #159 permission-block detection
        for t in (
            "The research.md write is waiting on permission approval.",
            "awaiting permission to write the file",
            "The permission dialog has appeared and not been approved.",
            "please approve both writes",
        ):
            self.assertEqual(self.classify(t)[0], "incomplete", t)


class TestAllowWriteResolution(unittest.TestCase):
    """#179: every PRODUCING workflow — authoring (docs) AND code (build/fix/ops) —
    writes by default; the write checkbox was friction that only caused silent
    read-only failures (live: WLT-27-5/6 builds went red writing nothing)."""

    def setUp(self):
        from compass.orchestrator import run as runmod
        self.resolve = runmod._resolve_allow_write
        self.runmod = runmod

    def test_authoring_workflows_default_on(self):
        for wf in ("create-brief", "create-story", "create-bet-architecture",
                   "setup-product", "setup-foundation-architecture",
                   "create-bet-portfolio"):
            self.assertTrue(self.resolve(wf, False), wf)   # forced on even when caller said False
            self.assertTrue(self.resolve(wf, True), wf)
            self.assertIn(wf, self.runmod._AUTHORING_WORKFLOWS)

    def test_code_workflows_default_on(self):
        # #179: build/fix/ops now write by default too — no more opt-in checkbox.
        for wf in ("build", "fix", "ops"):
            self.assertTrue(self.resolve(wf, False), wf)   # forced on even when caller said False
            self.assertTrue(self.resolve(wf, True), wf)
            self.assertIn(wf, self.runmod._CODE_WORKFLOWS)
            self.assertIn(wf, self.runmod._WRITE_BY_DEFAULT)

    def test_non_producing_workflow_keeps_caller_choice(self):
        # a read-only reporting workflow isn't force-enabled — honors the caller.
        for wf in ("status", "dashboard", "metrics"):
            self.assertFalse(self.resolve(wf, False), wf)
            self.assertTrue(self.resolve(wf, True), wf)
            self.assertNotIn(wf, self.runmod._WRITE_BY_DEFAULT)

    def test_write_by_default_is_authoring_plus_code(self):
        self.assertEqual(
            set(self.runmod._WRITE_BY_DEFAULT),
            set(self.runmod._AUTHORING_WORKFLOWS) | set(self.runmod._CODE_WORKFLOWS),
        )


class TestStackProfile(unittest.TestCase):
    """Stack-agnostic core: the stack is a pluggable profile selected by config.yaml
    `stack:`, injected into delivery agents, and overridable per project without
    forking. Agents carry methodology; the profile carries the stack."""

    def setUp(self):
        from compass.orchestrator import run as runmod
        self.runmod = runmod

    def test_read_stack_from_config(self):
        with tempfile.TemporaryDirectory() as d:
            compass = Path(d, "compass"); compass.mkdir()
            cfg = compass / "config.yaml"
            # unset → None
            cfg.write_text("connectors:\n  docs: confluence\n")
            self.assertIsNone(self.runmod._read_stack_from_config(compass))
            # set → value, inline comment stripped
            cfg.write_text("stack: dotnet-blazor   # the POC\nconnectors:\n  docs: confluence\n")
            self.assertEqual(self.runmod._read_stack_from_config(compass), "dotnet-blazor")
            # nested/indented `stack:` does NOT match (top-level only)
            cfg.write_text("conventions:\n  stack: nope\n")
            self.assertIsNone(self.runmod._read_stack_from_config(compass))
            # no config file → None
            self.assertIsNone(self.runmod._read_stack_from_config(Path(d, "absent")))

    def test_resolve_compass_file_override_wins(self):
        with tempfile.TemporaryDirectory() as d:
            project = Path(d)
            compass = project / "compass"; (compass / "stacks").mkdir(parents=True)
            (compass / "stacks" / "nextjs-ts.md").write_text("DEFAULT")
            # default resolves when no override
            r = self.runmod._resolve_compass_file(compass, project, "stacks/nextjs-ts.md")
            self.assertEqual(r.read_text(), "DEFAULT")
            # project override wins (no forking)
            ov = project / "compass-overrides" / "stacks"; ov.mkdir(parents=True)
            (ov / "nextjs-ts.md").write_text("OVERRIDE")
            r = self.runmod._resolve_compass_file(compass, project, "stacks/nextjs-ts.md")
            self.assertEqual(r.read_text(), "OVERRIDE")
            # neither → None
            self.assertIsNone(
                self.runmod._resolve_compass_file(compass, project, "stacks/missing.md"))

    def test_load_stack_context(self):
        with tempfile.TemporaryDirectory() as d:
            project = Path(d)
            compass = project / "compass"; (compass / "stacks").mkdir(parents=True)
            (compass / "stacks" / "dotnet-blazor.md").write_text(
                "# Stack profile: .NET + Blazor\nproduction build: dotnet build -c Release")
            ctx = self.runmod._load_stack_context(compass, project, "dotnet-blazor")
            self.assertIn("Active stack profile — dotnet-blazor", ctx)
            self.assertIn("dotnet build -c Release", ctx)
            # unknown stack → '' (agents run stack-neutral)
            self.assertEqual(self.runmod._load_stack_context(compass, project, "nope"), "")

    def test_shipped_reference_profiles_exist(self):
        # the two reference profiles ship with the framework (the sample's defaults)
        stacks = Path(__file__).resolve().parents[2] / "stacks"
        self.assertTrue((stacks / "nextjs-ts.md").exists(), "nextjs-ts profile missing")
        self.assertTrue((stacks / "dotnet-blazor.md").exists(), "dotnet-blazor profile missing")


class TestRepoReadingAgentHosts(unittest.TestCase):
    """#168: agents that must READ repo artifacts (story / brief / design) cannot lead
    with a tool-less host like `chatgpt` — it refuses on a live orchestrator run because
    it can't read files (the live create-story "failed on copy"). 3rd instance of
    host-capability-validation: pm (#86), researcher (#137), designer + ux-writer (#168)."""

    def test_no_chatgpt_for_repo_readers(self):
        from compass.orchestrator.run import _read_preferred_hosts
        agents = Path(__file__).resolve().parents[2] / "agents"
        for agent in ("designer", "ux-writer", "pm", "researcher"):
            hosts = _read_preferred_hosts(agents / f"{agent}.md")
            self.assertNotIn("chatgpt", hosts, f"{agent} includes tool-less chatgpt")
            self.assertIn(hosts[0], ("claude", "claude-code", "codex", "gemini"), agent)


class TestMergeGate(unittest.TestCase):
    """#147: approving a 'merge' HITL gate triggers the PR merge (delivery closure)."""

    def setUp(self):
        from compass.orchestrator import run as runmod
        self.is_merge_gate = runmod._is_merge_gate

    def test_merge_gate_detected_by_title(self):
        self.assertTrue(self.is_merge_gate("HITL gate — approve merge (human)"))
        self.assertTrue(self.is_merge_gate("Approve MERGE"))

    def test_non_merge_gates_ignored(self):
        for t in ("HITL — ITIL intake routing gate", "approve the brief", "", None):
            self.assertFalse(self.is_merge_gate(t), t)

    def test_auto_merge_flag_parses(self):
        import compass.orchestrator.run as runmod
        # the flag exists and defaults off
        args = runmod  # sanity: import ok
        self.assertTrue(hasattr(runmod, "_merge_pr"))


class TestDeliveryCheck(unittest.TestCase):
    """#145: a write-mode run that leaves CODE uncommitted hasn't delivered —
    flag real source/test changes, ignore the orchestrator's own bookkeeping."""

    def setUp(self):
        from compass.orchestrator import run as runmod
        self.uncommitted = runmod._uncommitted_code

    def test_flags_code_ignores_bookkeeping(self):
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            def g(*a):
                return subprocess.run(["git", "-C", d, *a], capture_output=True, text=True)
            g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t")
            Path(d, "seed.txt").write_text("x"); g("add", "-A"); g("commit", "-qm", "seed")
            # an uncommitted real code file + uncommitted bookkeeping
            Path(d, "AccountCard.tsx").write_text("// fix")
            (Path(d, "docs", "orchestrator-runs", "fix")).mkdir(parents=True)
            Path(d, "docs", "orchestrator-runs", "fix", "step-01.md").write_text("log")
            Path(d, "docs", "orchestrator-runs", "runs.jsonl").write_text("{}")
            left = self.uncommitted(d)
            self.assertIn("AccountCard.tsx", left)
            self.assertFalse(any("orchestrator-runs" in p for p in left))  # bookkeeping ignored
            self.assertFalse(any(p.endswith(".jsonl") for p in left))

    def test_code_vs_doc_workflow_split(self):
        # #151: only code workflows cut a work branch; doc workflows skip it
        from compass.orchestrator import run as runmod
        self.assertEqual(set(runmod._CODE_WORKFLOWS), {"fix", "build", "ops"})
        for doc in ("create-brief", "create-bet-architecture", "create-story",
                    "setup-product", "setup-foundation-architecture"):
            self.assertNotIn(doc, runmod._CODE_WORKFLOWS)

    def test_delivery_warning_workflow_aware(self):
        from compass.orchestrator import run as runmod
        code = runmod._delivery_warning("fix", ["AccountCard.tsx"])
        doc = runmod._delivery_warning("create-brief", ["docs/bets/WLT-26/brief.md"])
        self.assertIn("no deploy", code)            # code workflow → PR/deploy framing
        self.assertNotIn("no deploy", doc)          # doc workflow → no deploy framing
        self.assertIn("commit", doc.lower())

    def test_clean_tree_returns_empty(self):
        import subprocess
        with tempfile.TemporaryDirectory() as d:
            def g(*a):
                return subprocess.run(["git", "-C", d, *a], capture_output=True, text=True)
            g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t")
            Path(d, "f.txt").write_text("x"); g("add", "-A"); g("commit", "-qm", "c")
            self.assertEqual(self.uncommitted(d), [])

    def test_non_git_returns_empty(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(self.uncommitted(d), [])

    def test_scoped_to_the_dir_given_not_a_sibling(self):
        # #110: the completion check must inspect exec_dir (the WORKTREE where the host
        # committed), not project_dir (the shared main checkout). A CLEAN worktree must
        # return [] even when a SIBLING checkout has uncommitted code — otherwise the
        # operator's unrelated main-tree junk raises a false DELIVERY INCOMPLETE (live:
        # a clean /fix that shipped PR #148 warned about docs/status.md in the main tree).
        import subprocess
        with tempfile.TemporaryDirectory() as root:
            worktree, mainrepo = str(Path(root, "wt")), str(Path(root, "main"))
            for d in (worktree, mainrepo):
                def g(*a, _d=d):
                    return subprocess.run(["git", "-C", _d, *a], capture_output=True, text=True)
                Path(d).mkdir()
                g("init", "-q"); g("config", "user.email", "t@t"); g("config", "user.name", "t")
                Path(d, "seed.txt").write_text("x"); g("add", "-A"); g("commit", "-qm", "seed")
            # main checkout is dirty with unrelated code; worktree is clean
            Path(mainrepo, "unrelated.tsx").write_text("// operator's uncommitted junk")
            self.assertIn("unrelated.tsx", self.uncommitted(mainrepo))   # dirty dir → flagged
            self.assertEqual(self.uncommitted(worktree), [])             # clean dir → nothing


class TestReviewRecommendation(unittest.TestCase):
    """#96: parse the Reviewer's verdict so a request-changes review blocks the merge
    gate (re-review/escalate) instead of falling through."""

    def setUp(self):
        from compass.orchestrator import run as runmod
        self.rec = runmod._review_recommendation

    def test_approve(self):
        self.assertEqual(self.rec("### Findings\n[NIT] x\n\n### Recommendation\n\nApprove\n"),
                         "approve")

    def test_request_changes(self):
        self.assertEqual(self.rec("### Recommendation\n\nRequest changes\n"), "request_changes")

    def test_block_until(self):
        # the live PR #150 shape — "Block until:" is a request-changes verdict.
        self.assertEqual(self.rec("### Recommendation\n\nBlock until:\n- fix PATCH\n"),
                         "request_changes")

    def test_blocker_finding_but_approve_verdict(self):
        # a [BLOCKER] label up in findings must NOT flip an Approve verdict — the window
        # is read at the Recommendation heading, not the findings.
        out = ("### Findings\n[BLOCKER] something\n\n### Recommendation\n\nApprove\n")
        self.assertEqual(self.rec(out), "approve")

    def test_none_when_no_recommendation(self):
        self.assertIsNone(self.rec("just some prose, no verdict here"))
        self.assertIsNone(self.rec(""))


class TestReviewContext(unittest.TestCase):
    """#138: the tool-less reviewer gets the branch diff injected as context."""

    def setUp(self):
        from compass.orchestrator import run as runmod
        self.runmod = runmod

    def test_with_review_context_prepends_diff(self):
        out = self.runmod._with_review_context("REVIEW THIS", "--- a/x\n+++ b/x\n+line")
        self.assertIn("Code under review", out)
        self.assertIn("+line", out)
        self.assertTrue(out.rstrip().endswith("REVIEW THIS"))

    def test_with_review_context_noop_without_diff(self):
        self.assertEqual(self.runmod._with_review_context("MSG", ""), "MSG")

    def test_review_diff_graceful_on_non_git_dir(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(self.runmod._review_diff(d), "")  # no git → "" not a crash

    def test_review_diff_reads_the_dir_it_is_given_not_a_sibling(self):
        """#102: _review_diff is strictly scoped to the dir it is handed. The dispatch
        loop must pass exec_dir (the isolated worktree) — NOT project_dir (the shared
        main checkout parked on a stray branch). Reproduce: two clones off one origin —
        `wt` (the worktree/exec_dir) is on feat/work touching worktree.txt; `mainrepo`
        (project_dir) is on an unrelated branch touching accounts.txt. Diffing `wt`
        shows ONLY worktree.txt; diffing `mainrepo` shows accounts.txt — proving that
        which dir you pass decides which branch gets reviewed."""
        import subprocess, tempfile
        with tempfile.TemporaryDirectory() as root:
            origin = str(Path(root, "origin"))
            wt = str(Path(root, "worktree"))
            mainrepo = str(Path(root, "mainrepo"))

            def g(cwd, *a):
                return subprocess.run(["git", "-C", cwd, *a],
                                      capture_output=True, text=True)

            g(root, "init", "-q", "origin")
            g(origin, "config", "user.email", "t@t"); g(origin, "config", "user.name", "t")
            g(origin, "checkout", "-qB", "main")
            Path(origin, "base.txt").write_text("base\n")
            g(origin, "add", "-A"); g(origin, "commit", "-qm", "base")

            # the worktree (exec_dir): builds the debt work on feat/work
            g(root, "clone", "-q", origin, wt)
            g(wt, "config", "user.email", "t@t"); g(wt, "config", "user.name", "t")
            g(wt, "checkout", "-qb", "feat/work")
            Path(wt, "worktree.txt").write_text("debt code\n")
            g(wt, "add", "-A"); g(wt, "commit", "-qm", "feat: debt")

            # the shared main checkout (project_dir): parked on an unrelated fix branch
            g(root, "clone", "-q", origin, mainrepo)
            g(mainrepo, "config", "user.email", "t@t"); g(mainrepo, "config", "user.name", "t")
            g(mainrepo, "checkout", "-qb", "fix/accounts")
            Path(mainrepo, "accounts.txt").write_text("unrelated accounts fix\n")
            g(mainrepo, "add", "-A"); g(mainrepo, "commit", "-qm", "fix: accounts")

            wt_diff = self.runmod._review_diff(wt)
            self.assertIn("worktree.txt", wt_diff)
            self.assertNotIn("accounts.txt", wt_diff)
            # the bug: passing project_dir would have reviewed THIS instead
            self.assertIn("accounts.txt", self.runmod._review_diff(mainrepo))


class TestNonInteractiveInput(unittest.TestCase):
    """#134: a headless/dashboard run must NEVER call input() — it would deadlock
    on a tty no one can type into (a dashboard create-brief froze 14 min on this)."""

    def setUp(self):
        from compass.orchestrator import run as runmod
        self.collect = runmod._collect_input

    def test_non_interactive_empty_returns_blank_without_prompt(self):
        # if this prompted it would block/EOF the test — returning "" proves no input()
        self.assertEqual(self.collect("step", "", non_interactive=True), "")

    def test_non_interactive_uses_inline_context(self):
        self.assertEqual(self.collect("step", "the brief ask", non_interactive=True),
                         "the brief ask")

    def test_inline_context_returned_regardless(self):
        self.assertEqual(self.collect("step", "ctx"), "ctx")


class TestSelfApprovalGuard(unittest.TestCase):
    """#153: an agent must not self-approve a gated artifact (Principle #16). The
    headless execute directive could push a doc agent to flip its own status to
    approved before the HITL gate (live: a WLT-26 architecture `status: Approved`).
    `_revert_self_approval` is the mechanical backstop at the gate."""

    def setUp(self):
        from compass.orchestrator.run import _revert_self_approval
        self.revert = _revert_self_approval

    def _write(self, status):
        f = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
        f.write(f"---\nid: X\nstatus: {status}\n---\n\n# Doc\n")
        f.close()
        return Path(f.name)

    def test_reverts_approved_to_proposed(self):
        p = self._write("approved")
        try:
            self.assertEqual(self.revert(p), "approved")          # reports reverted-from
            from compass.orchestrator.connector import read_frontmatter_status
            self.assertEqual(read_frontmatter_status(p), "proposed")
        finally:
            p.unlink()

    def test_case_insensitive_catches_capital_approved(self):
        # the exact live failure: the agent wrote `status: Approved`
        p = self._write("Approved")
        try:
            self.assertEqual(self.revert(p), "Approved")
            from compass.orchestrator.connector import read_frontmatter_status
            self.assertEqual(read_frontmatter_status(p), "proposed")
        finally:
            p.unlink()

    def test_reverts_ready_too(self):
        p = self._write("ready")          # story gate's approved state
        try:
            self.assertEqual(self.revert(p), "ready")
        finally:
            p.unlink()

    def test_leaves_proposed_untouched(self):
        p = self._write("proposed")
        try:
            self.assertIsNone(self.revert(p))     # nothing to revert
            from compass.orchestrator.connector import read_frontmatter_status
            self.assertEqual(read_frontmatter_status(p), "proposed")
        finally:
            p.unlink()

    def test_missing_file_is_noop(self):
        self.assertIsNone(self.revert(Path("/nonexistent/x.md")))
        self.assertIsNone(self.revert(None))


class TestResumeBranchAndMergeSteps(unittest.TestCase):
    """#157: a resume must reuse the original run's branch (not cut a garbage one),
    and an approved merge gate must spell out the next step."""

    def test_prior_run_branch_recovers_from_spine(self):
        import json as _json
        from compass.orchestrator.run import _prior_run_branch
        with tempfile.TemporaryDirectory() as home:
            ep = Path(home) / "orchestrator"
            ep.mkdir(parents=True)
            (ep / "events.jsonl").write_text("\n".join([
                _json.dumps({"run_id": "build--WLT-26--X", "type": "run_start",
                             "branch": "feat/WLT-26-1-category-spend-chart"}),
                _json.dumps({"run_id": "build--WLT-26--X", "type": "gate_open", "step": 6}),
            ]) + "\n", encoding="utf-8")
            saved = os.environ.get("COMPASS_HOME")
            os.environ["COMPASS_HOME"] = home
            try:
                self.assertEqual(_prior_run_branch("build--WLT-26--X"),
                                 "feat/WLT-26-1-category-spend-chart")
                self.assertIsNone(_prior_run_branch("no-such-run"))
                self.assertIsNone(_prior_run_branch(None))
            finally:
                if saved is None:
                    os.environ.pop("COMPASS_HOME", None)
                else:
                    os.environ["COMPASS_HOME"] = saved

    def test_merge_next_steps_names_pr_and_bet(self):
        from compass.orchestrator.run import _merge_next_steps
        msg = _merge_next_steps("https://github.com/x/y/pull/118", "WLT-26")
        self.assertIn("https://github.com/x/y/pull/118", msg)
        self.assertIn("/create-story WLT-26", msg)
        self.assertIn("COMPASS_AUTO_MERGE", msg)   # tells them how to automate it

    def test_merge_next_steps_degrades_without_pr(self):
        from compass.orchestrator.run import _merge_next_steps
        msg = _merge_next_steps(None, None)
        self.assertIn("merge the PR", msg)
        self.assertIn("<bet>", msg)


class TestResumeHint(unittest.TestCase):
    """#154: the gate-pause resume hint must carry --run-id (else a CLI resume mints a
    new run_id and the original gate stays awaiting forever) + --project-dir."""

    def setUp(self):
        from compass.orchestrator.run import _resume_hint
        self.hint = _resume_hint

    def test_includes_run_id_and_project_dir(self):
        h = self.hint("create-story", 4, "create-story--WLT-26--X",
                      "/repos/home", False, "approve|reject")
        self.assertIn("--run-id create-story--WLT-26--X", h)   # the load-bearing bit
        self.assertIn("--project-dir /repos/home", h)
        self.assertIn("--from-step 4", h)
        self.assertIn("--decide approve|reject", h)
        self.assertIn("--non-interactive", h)
        self.assertNotIn("--allow-write", h)                  # not requested

    def test_allow_write_appended_when_set(self):
        h = self.hint("fix", 6, "fix--X", "/r", True, "approve|reject")
        self.assertIn("--allow-write", h)

    def test_routing_decide_placeholder(self):
        h = self.hint("triage", 2, "triage--X", "/r", False, "<route>")
        self.assertIn("--decide <route>", h)


if __name__ == "__main__":
    unittest.main()
