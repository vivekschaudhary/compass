"""Tests for graph.py — dispatch-graph parsing, HITL gate detection.

The HITL detection tests exist because a human gate that silently parses as a
"workflow-level step" (and is therefore skipped) is the worst failure mode the
parser has: the run proceeds without the approval the workflow promised.
"""
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


if __name__ == "__main__":
    unittest.main()
