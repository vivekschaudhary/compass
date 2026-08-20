"""
Tests for `compass.orchestrator.validate` — the JSON view of what the parsers actually extract.

Two jobs here. The first is ordinary: validate reports the right thing for the shipped specs. The
second is a COUPLING GUARD. validate deliberately calls run.py's private `_read_*` readers and
graph.load_workflow rather than reimplementing their regexes, because a second implementation
would drift from the one that really runs. The cost of that choice is that a rename in run.py
breaks the editor silently — so these tests assert validate's output equals what those readers
return directly. Rename one and this fails loudly in CI, which is the whole point.
"""
import json
import subprocess
import sys
import unittest
from pathlib import Path

from compass.orchestrator import graph, validate
from compass.orchestrator import run as runmod

REPO = Path(__file__).resolve().parents[3]
COMPASS = REPO / "compass"
WORKFLOW = COMPASS / "workflows" / "create-product-brief.md"
AGENT = COMPASS / "agents" / "product-manager.md"
SPRINT0 = COMPASS / "templates" / "sprint-0.md"


class TestShippedSpecsParse(unittest.TestCase):
    """Every shipped workflow must still parse. These files are about to become user-editable;
    if the defaults themselves don't validate, no editor built on this can be trusted."""

    def test_every_shipped_workflow_parses(self):
        files = sorted((COMPASS / "workflows").glob("*.md"))
        self.assertGreater(len(files), 5, "expected the shipped dispatch graphs")
        graphs = 0
        for f in files:
            with self.subTest(workflow=f.name):
                r = validate.validate_workflow(f.read_text(encoding="utf-8"))
                self.assertTrue(r["ok"], f"{f.name} is not usable")
                self.assertEqual(
                    [], [w for w in r["warnings"] if "does not exist" in w],
                    f"{f.name} has a route pointing at a missing step",
                )
                if r["has_dispatch_graph"]:
                    graphs += 1
                    self.assertTrue(r["steps"], f"{f.name} declares a graph but yielded no steps")
        self.assertGreater(graphs, 5, "expected several real dispatch graphs in the corpus")

    def test_declaring_a_graph_with_no_steps_is_not_ok(self):
        # The distinction the corpus forced: a report-style workflow legitimately has no steps, but
        # a file that CLAIMS to be a graph and yields none is broken. Conflating the two would
        # either make 9 shipped workflows uneditable or let a gutted graph save cleanly.
        r = validate.validate_workflow("# W\n\n## Dispatch graph\n\nSome prose, no steps.\n")
        self.assertFalse(r["ok"])
        self.assertTrue(r["has_dispatch_graph"])

    def test_report_style_workflow_is_ok_without_steps(self):
        r = validate.validate_workflow("# Status\n\n## Purpose\n\nSurface current state.\n")
        self.assertTrue(r["ok"])
        self.assertFalse(r["has_dispatch_graph"])
        self.assertEqual(r["steps"], [])

    def test_every_shipped_agent_parses(self):
        for f in sorted((COMPASS / "agents").glob("*.md")):
            with self.subTest(agent=f.name):
                r = validate.validate_agent(f.read_text(encoding="utf-8"))
                self.assertTrue(r["ok"])
                self.assertTrue(r["preferred_hosts"], f"{f.name} resolved to no hosts")


class TestCouplingToRunPy(unittest.TestCase):
    """validate must report exactly what the orchestrator would read. If these drift, the editor
    shows a human one thing while the runtime does another."""

    def test_agent_fields_match_the_real_readers(self):
        r = validate.validate_agent(AGENT.read_text(encoding="utf-8"))
        self.assertEqual(r["preferred_hosts"], runmod._read_preferred_hosts(AGENT))
        self.assertEqual(r["executor_tools"], runmod._read_agent_tools(AGENT))
        self.assertEqual(r["model_tier"] or "", runmod._read_model_tier(AGENT))
        self.assertEqual(r["loads_bet_catalog"], runmod._reads_bet_catalog(AGENT))

    def test_workflow_steps_match_the_real_parser(self):
        r = validate.validate_workflow(WORKFLOW.read_text(encoding="utf-8"))
        real = graph.load_workflow(WORKFLOW)
        self.assertEqual([s["n"] for s in r["steps"]], [s.number for s in real])
        self.assertEqual([s["hitl"] for s in r["steps"]], [s.is_hitl for s in real])
        self.assertEqual([s["agent"] for s in r["steps"]], [s.agent for s in real])


class TestGateDetection(unittest.TestCase):
    """HITL detection is deliberately formatting-tolerant (graph.py). These pin that tolerance, so
    a future 'tidy-up' of those regexes can't quietly narrow it."""

    def setUp(self):
        self.src = WORKFLOW.read_text(encoding="utf-8")
        self.base = validate.validate_workflow(self.src)

    def test_baseline_has_gates(self):
        self.assertGreater(self.base["hitl_count"], 0)

    def test_bold_placement_does_not_lose_a_gate(self):
        # The variant graph.py's own comment calls out. It is HANDLED — asserted here so it stays
        # handled, rather than assumed.
        for variant in ["Dispatches: **HUMAN**", "**Dispatches:** Human", "- **Dispatches:** HUMAN"]:
            with self.subTest(variant=variant):
                mutated = self.src.replace("**Dispatches:** HUMAN", variant)
                self.assertEqual(
                    validate.validate_workflow(mutated)["hitl_count"], self.base["hitl_count"],
                )

    def test_a_damaged_step_heading_silently_rewrites_the_graph(self):
        """The REAL silent-corruption vector, and why hitl_count alone is not a sufficient signal.

        Demote one `### Step N.` heading and its body merges into the previous step: a dispatch
        step flips to HITL, its agent disappears from the workflow, and the HITL COUNT IS
        UNCHANGED. Nothing about the totals looks wrong.
        """
        mutated = self.src.replace("### Step 2.", "#### Step 2.")
        r = validate.validate_workflow(mutated)

        self.assertEqual(r["hitl_count"], self.base["hitl_count"], "count is unchanged — the trap")
        self.assertLess(len(r["steps"]), len(self.base["steps"]), "a step vanished")
        self.assertNotEqual(r["agents"], self.base["agents"], "an agent stopped being dispatched")
        self.assertTrue(self.base["steps"][0]["agent"] and not r["steps"][0]["agent"],
                        "a dispatch step became a human gate")
        # The intrinsic tell: numbering is no longer 1..N.
        self.assertTrue(any("not 1.." in w for w in r["warnings"]),
                        f"expected a numbering warning, got {r['warnings']}")


class TestRefusals(unittest.TestCase):
    def test_empty_content_is_not_ok(self):
        r = validate.validate_workflow("")
        self.assertFalse(r["ok"])
        self.assertTrue(any("empty" in w.lower() for w in r["warnings"]))

    def test_prose_with_no_steps_is_not_ok(self):
        self.assertTrue(validate.validate_workflow("# Notes\n\nSome prose.\n")["ok"])  # report-style

    def test_step_dispatching_no_agent_warns(self):
        r = validate.validate_workflow(
            "## Dispatch graph\n\n### Step 1. Do a thing\n\nSome text.\n"
        )
        self.assertTrue(any("dispatches no agent" in w for w in r["warnings"]))

    def test_route_to_a_missing_step_warns(self):
        r = validate.validate_workflow(
            "## Dispatch graph\n\n### Step 1. HITL gate\n\n"
            "**Dispatches:** HUMAN\n\n- approve → `Step 9`\n"
        )
        self.assertTrue(any("Step 9" in w for w in r["warnings"]))

    def test_empty_agent_file_is_not_ok(self):
        self.assertFalse(validate.validate_agent("   ")["ok"])

    def test_agent_without_frontmatter_warns_but_still_defaults(self):
        r = validate.validate_agent("# PM\n\nSome instructions.\n")
        self.assertTrue(r["ok"])
        self.assertEqual(r["preferred_hosts"], ["claude"])
        self.assertTrue(any("frontmatter" in w for w in r["warnings"]))


class TestTable(unittest.TestCase):
    COLUMNS = ["ticket", "workflow", "owner", "gate"]

    def test_parses_the_shipped_sprint0(self):
        r = validate.validate_table(SPRINT0.read_text(encoding="utf-8"), "Tickets", self.COLUMNS)
        self.assertTrue(r["ok"])
        self.assertEqual(r["warnings"], [])
        self.assertEqual(r["rows"][0]["owner"], "delivery-manager")

    def test_missing_section_is_reported_not_silent(self):
        r = validate.validate_table("# Doc\n", "Tickets", self.COLUMNS)
        self.assertFalse(r["ok"])
        self.assertTrue(any("Tickets" in w for w in r["warnings"]))

    def test_short_row_is_reported(self):
        md = ("## Tickets\n| # | ticket | workflow | owner | gate |\n|---|---|---|---|---|\n"
              "| 1 | A | /x | pm | g |\n| 2 | B | /y |\n")
        r = validate.validate_table(md, "Tickets", self.COLUMNS)
        self.assertTrue(any("Row 2" in w for w in r["warnings"]))

    def test_empty_cell_is_reported(self):
        md = ("## Tickets\n| # | ticket | workflow | owner | gate |\n|---|---|---|---|---|\n"
              "| 1 | A |  | pm | g |\n")
        r = validate.validate_table(md, "Tickets", self.COLUMNS)
        self.assertTrue(any("empty workflow" in w for w in r["warnings"]))


class TestCli(unittest.TestCase):
    """The app shells this, so the process contract matters as much as the functions."""

    def _run(self, args, stdin=""):
        return subprocess.run(
            [sys.executable, "-m", "compass.orchestrator.validate", *args],
            input=stdin, capture_output=True, text=True, cwd=REPO,
        )

    def test_stdin_workflow_exits_zero_and_prints_json(self):
        p = self._run(["--kind", "workflow", "--file", "-"], WORKFLOW.read_text(encoding="utf-8"))
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertTrue(json.loads(p.stdout)["ok"])

    def test_unusable_content_exits_one(self):
        # So CI can use this directly, without parsing the JSON.
        p = self._run(["--kind", "workflow", "--file", "-"],
                      "## Dispatch graph\n\nprose, no steps\n")
        self.assertEqual(p.returncode, 1)
        self.assertFalse(json.loads(p.stdout)["ok"])

    def test_table_requires_section_and_columns(self):
        p = self._run(["--kind", "table", "--file", "-"], "x")
        self.assertEqual(p.returncode, 2)

    def test_missing_file_exits_two_with_json(self):
        p = self._run(["--kind", "workflow", "--file", "/nonexistent/x.md"])
        self.assertEqual(p.returncode, 2)
        self.assertFalse(json.loads(p.stdout)["ok"])


if __name__ == "__main__":
    unittest.main()
