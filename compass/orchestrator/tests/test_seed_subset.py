"""The seed is a SUBSET of the framework's dispatch graphs, never a superset.

The framework ships a graph for every workflow it knows how to run; an installation seeds the ones it
actually runs. So a graph with no seed row is normal and must not fail the build — before this, a
four-workflow test seed could not be committed without first deleting thirteen dispatch graphs that
were perfectly correct.

The reverse still fails: a seed row with no graph is a workflow the app WILL run that the framework
never declared, which is the case `plan-kickoff` and `staff-engagement` were.

Run against a copy of the real script in a temp tree — `ROOT` is derived from `__file__`, so a copy
three directories deep makes the temp tree its repo and no fixture has to be faked.
"""
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "seed-consistency-check.py"

STEPS_HEADER = "workflow,ord,kind,role,task,produces,output,reads,conditional,nests,title,depends_on\n"
WORKFLOWS_HEADER = "code,label,workstream,phase,owner_role,trigger,enabled,repeatable,inputs,outputs\n"


def graph(task: str) -> str:
    """A dispatch graph with one step, in the heading format `graph_steps` parses."""
    return f"# A workflow\n\n### Step 1. `delivery-manager.{task}` (Delivery Manager agent owns)\n"


class SeedIsASubset(unittest.TestCase):
    def run_check(self, seeded: list[str], graphed: list[str]):
        """Build a temp repo with these workflows seeded and these graphed, and run the checker."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "compass" / "scripts").mkdir(parents=True)
            (root / "compass" / "workflows").mkdir()
            (root / "compass" / "seed").mkdir()
            shutil.copy(SCRIPT, root / "compass" / "scripts" / SCRIPT.name)

            for code in graphed:
                (root / "compass" / "workflows" / f"{code}.md").write_text(graph("do-the-thing"))

            (root / "compass" / "seed" / "workflows.csv").write_text(
                WORKFLOWS_HEADER
                + "".join(f"{c},{c},Delivery,Discovery,delivery-manager,,TRUE,FALSE,,\n" for c in seeded))
            (root / "compass" / "seed" / "workflow-steps.csv").write_text(
                STEPS_HEADER
                + "".join(f"{c},1,agent,delivery-manager,do-the-thing,,,,,,Do the thing,\n" for c in seeded))
            (root / "compass" / "seed" / "criteria.csv").write_text(
                "workflow,task,kind,text,subject_kind,subject_ref,operator,value\n")

            proc = subprocess.run(
                [sys.executable, str(root / "compass" / "scripts" / SCRIPT.name), "--check"],
                capture_output=True, text=True)
            return proc.returncode, proc.stdout + proc.stderr

    def test_a_graph_nobody_seeded_is_reported_but_does_not_fail(self):
        code, out = self.run_check(seeded=["taken-up"], graphed=["taken-up", "left-alone"])
        self.assertEqual(code, 0, out)
        self.assertIn("NOT TAKEN UP", out)
        self.assertIn("left-alone", out)
        # The old class is gone, not renamed — a lingering `unseeded` line means it still fails.
        self.assertNotIn("unseeded", out)

    def test_a_seeded_workflow_with_no_graph_fails(self):
        code, out = self.run_check(seeded=["taken-up", "invented"], graphed=["taken-up"])
        self.assertEqual(code, 1, out)
        self.assertIn("missing-graph", out)
        self.assertIn("invented", out)

    def test_a_seed_that_matches_its_graphs_exactly_passes(self):
        code, out = self.run_check(seeded=["taken-up"], graphed=["taken-up"])
        self.assertEqual(code, 0, out)
        self.assertIn("No NEW drift", out)


if __name__ == "__main__":
    unittest.main()
