"""Tests for graph.py — dispatch-graph parsing, HITL gate detection.

The HITL detection tests exist because a human gate that silently parses as a
"workflow-level step" (and is therefore skipped) is the worst failure mode the
parser has: the run proceeds without the approval the workflow promised.
"""
import tempfile
import unittest
from pathlib import Path

from compass.orchestrator.graph import load_workflow

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


if __name__ == "__main__":
    unittest.main()
