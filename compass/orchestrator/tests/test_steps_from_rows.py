"""graph.steps_from_rows: the published workflow_step rows ARE the dispatch graph.

`number` is the row's `ord` — the value the app sends as `--step` — so the graph and the app cannot
disagree about which step is which.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from compass.orchestrator import graph


def row(ord, kind="agent", agent=None, task=None, title="t", nests=None):
    return {"ord": ord, "kind": kind, "role_code": agent, "agent": agent, "task": task,
            "title": title, "nests": nests, "depends_on": []}


class TestStepsFromRows(unittest.TestCase):
    def test_number_is_the_rows_ord(self):
        steps = graph.steps_from_rows([row(4, agent="engineer", task="respond-to-review"),
                                       row(1, agent="engineer", task="implement-story")])
        self.assertEqual([s.number for s in steps], [1, 4])   # sorted by ord, not input order

    def test_agent_step(self):
        s = graph.steps_from_rows([row(1, agent="engineer", task="implement-story", title="Implement")])[0]
        self.assertEqual((s.agent, s.task, s.agent_file, s.is_hitl, s.title),
                         ("engineer", "implement-story", "engineer.md", False, "Implement"))

    def test_hitl_row_is_a_gate_with_no_agent(self):
        s = graph.steps_from_rows([row(5, kind="hitl", agent="principal-engineer", task="approve-build")])[0]
        self.assertTrue(s.is_hitl)
        self.assertIsNone(s.agent)
        self.assertIsNone(s.task)
        self.assertIsNone(s.agent_file)

    def test_a_nesting_row_dispatches_no_agent(self):
        s = graph.steps_from_rows([row(8, kind="workflow", agent="staff-engineer", task="scaffold-repos",
                                       nests="scaffold-repo")])[0]
        self.assertEqual(s.nests, "scaffold-repo")
        self.assertIsNone(s.agent)
        self.assertIsNone(s.task)

    def test_a_rows_reads_travel_with_its_step(self):
        r = row(1, agent="engineer", task="implement-story")
        r["reads"] = ["stories/{epic}", "epic/{epic}"]
        self.assertEqual(graph.steps_from_rows([r])[0].reads, ["stories/{epic}", "epic/{epic}"])
        self.assertEqual(graph.steps_from_rows([row(2, agent="a", task="t")])[0].reads, [])

    def test_missing_title_falls_back_to_the_task(self):
        s = graph.steps_from_rows([row(1, agent="a", task="do-it", title=None)])[0]
        self.assertEqual(s.title, "do-it")

    def test_the_seeds_build_rows_line_up_with_their_ord(self):
        """The seed is what the DB is imported from; its ord is what the app passes as --step."""
        import csv
        seed = Path(__file__).resolve().parents[2] / "seed" / "workflow-steps.csv"
        rows = [r for r in csv.DictReader(seed.open()) if r["workflow"] == "build"]
        steps = graph.steps_from_rows([row(int(r["ord"]), kind=r["kind"], agent=r["role"], task=r["task"])
                                       for r in rows])
        self.assertEqual([s.number for s in steps], list(range(1, len(rows) + 1)))
        self.assertEqual([s.task for s in steps if not s.is_hitl],
                         ["implement-story", "write-e2e-tests", "review-pr", "respond-to-review"])


if __name__ == "__main__":
    unittest.main()
