"""Exec control-tower WBS view tests (#3) — program→bet→story from artifact
frontmatter, correlated with the spine, with manage-by-exception + RAG."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import wbs, events as ev


def _bet(project, bid, status, depends_on="[]", stories=None):
    bdir = project / "docs" / "bets" / bid
    bdir.mkdir(parents=True, exist_ok=True)
    (bdir / "brief.md").write_text(
        f"---\nid: {bid}\ntype: feature\nstatus: {status}\npriority: P1\n"
        f"depends_on: {depends_on}\n---\n# {bid} title\n", encoding="utf-8")
    for sid, sstatus, *rest in (stories or []):
        sdir = bdir / "stories" / sid
        sdir.mkdir(parents=True, exist_ok=True)
        jk = f"\njira_key: {rest[0]}" if rest else ""
        (sdir / "story.md").write_text(
            f"---\nid: {sid}\nbet: {bid}\nstatus: {sstatus}{jk}\n---\n# {sid}\n", encoding="utf-8")


class TestWbs(unittest.TestCase):
    def setUp(self):
        self.project = Path(tempfile.mkdtemp())
        self.home = tempfile.mkdtemp()
        self._old = os.environ.get("COMPASS_HOME")
        os.environ["COMPASS_HOME"] = self.home

    def tearDown(self):
        os.environ.pop("COMPASS_HOME", None) if self._old is None \
            else os.environ.__setitem__("COMPASS_HOME", self._old)

    def test_hierarchy_and_story_pointers(self):
        _bet(self.project, "CB-1", "in-build",
             stories=[("CB-1-1", "merged", "PROJ-7"), ("CB-1-2", "ready")])
        w = wbs.build_wbs(self.project)
        self.assertEqual(w["summary"]["bets"], 1)
        bet = w["bets"][0]
        self.assertEqual((bet["id"], bet["story_count"]), ("CB-1", 2))
        self.assertEqual(bet["stories"][0]["jira_key"], "PROJ-7")

    def test_blocked_by_unshipped_dep_is_red(self):
        _bet(self.project, "CB-1", "proposed")            # dep not shipped
        _bet(self.project, "CB-2", "approved", depends_on="[CB-1]")
        cb2 = next(b for b in wbs.build_wbs(self.project)["bets"] if b["id"] == "CB-2")
        self.assertEqual(cb2["rag"], "red")
        self.assertTrue(any("blocked by CB-1" in a["reason"] for a in cb2["attention"]))

    def test_shipped_is_green_no_attention(self):
        _bet(self.project, "CB-9", "shipped")
        bet = wbs.build_wbs(self.project)["bets"][0]
        self.assertEqual(bet["rag"], "green")
        self.assertEqual(bet["attention"], [])

    def test_proposed_no_runs_flags_not_started(self):
        _bet(self.project, "CB-5", "proposed")
        bet = wbs.build_wbs(self.project)["bets"][0]
        self.assertTrue(any(a["reason"] == "not started" for a in bet["attention"]))

    def test_awaiting_gate_from_spine(self):
        _bet(self.project, "CB-3", "in-build")
        sink = ev.jsonl_sink()
        sink(ev.make_event(ev.RUN_START, run_id="r1", bet_id="CB-3", workflow="build",
                           project_dir=str(self.project)))
        sink(ev.make_event(ev.GATE_OPEN, run_id="r1", bet_id="CB-3", workflow="build",
                           step=5, title="HITL gate"))
        cb3 = next(b for b in wbs.build_wbs(self.project)["bets"] if b["id"] == "CB-3")
        self.assertEqual(cb3["open_gates"], 1)
        self.assertTrue(any("awaiting gate" in a["reason"] for a in cb3["attention"]))

    def test_list_parses_bracketed_and_quoted(self):
        # [Codex review] inline-flow forms incl. quotes
        self.assertEqual(wbs._list("[CB-1, CB-2]"), ["CB-1", "CB-2"])
        self.assertEqual(wbs._list("[\"CB-1\", 'CB-2']"), ["CB-1", "CB-2"])
        self.assertEqual(wbs._list("[]"), [])
        self.assertEqual(wbs._list(None), [])

    def test_render_contains_sections(self):
        _bet(self.project, "CB-1", "proposed", stories=[("CB-1-1", "ready")])
        out = wbs.render_wbs(wbs.build_wbs(self.project))
        self.assertIn("Control tower", out)
        self.assertIn("NEEDS ATTENTION", out)       # CB-1 proposed → not started
        self.assertIn("WBS (program", out)
        self.assertIn("CB-1-1", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
