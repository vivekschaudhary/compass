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

    def test_strip_inline_comment(self):
        # YAML inline comments (`#` after whitespace, outside quotes) are stripped;
        # `#` mid-token or quoted is preserved.
        self.assertEqual(wbs._strip_inline_comment("[CB-1] # why"), "[CB-1]")
        self.assertEqual(wbs._strip_inline_comment("CB-1 # sibling overlay"), "CB-1")
        self.assertEqual(wbs._strip_inline_comment("[CB-1]"), "[CB-1]")
        self.assertEqual(wbs._strip_inline_comment("foo (#171) bar"), "foo (#171) bar")
        self.assertEqual(wbs._strip_inline_comment('"a#b"'), '"a#b"')
        self.assertEqual(wbs._strip_inline_comment("# whole line"), "")

    def test_depends_on_with_inline_comment_resolves(self):
        # Regression: a valid-YAML inline comment on depends_on must NOT leak into
        # the dep id (was surfacing a phantom `(unknown)` blocker).
        _bet(self.project, "CB-1", "shipped")
        _bet(self.project, "CB-2", "approved",
             depends_on="[CB-1] # the shared substrate + orthogonality discipline")
        cb2 = next(b for b in wbs.build_wbs(self.project)["bets"] if b["id"] == "CB-2")
        self.assertEqual(cb2["depends_on"], ["CB-1"])
        # dep is shipped -> no phantom "(unknown)" blocker
        self.assertFalse(any("unknown" in a["reason"] for a in cb2["attention"]))

    def test_render_contains_sections(self):
        _bet(self.project, "CB-1", "proposed", stories=[("CB-1-1", "ready")])
        out = wbs.render_wbs(wbs.build_wbs(self.project))
        self.assertIn("Control tower", out)
        self.assertIn("NEEDS ATTENTION", out)       # CB-1 proposed → not started
        self.assertIn("WBS (program", out)
        self.assertIn("CB-1-1", out)


def _story(bdir, sid, *, status, type="story", owner="agent", dependencies="[]"):
    sdir = bdir / "stories" / sid
    sdir.mkdir(parents=True, exist_ok=True)
    (sdir / "story.md").write_text(
        f"---\nid: {sid}\ntype: {type}\nowner: {owner}\nstatus: {status}\n"
        f"dependencies: {dependencies}\n---\n# {sid}\n", encoding="utf-8")


class TestStoryDependencies(unittest.TestCase):
    """#171: design/copy are human-owned stories; a feature story depends on them and
    is BLOCKED until they're human-delivered (status: ready). The WBS surfaces the
    block + the awaiting-human design/copy stories under manage-by-exception."""

    def setUp(self):
        self.project = Path(tempfile.mkdtemp())
        self.home = tempfile.mkdtemp()
        self._old = os.environ.get("COMPASS_HOME")
        os.environ["COMPASS_HOME"] = self.home
        self.bdir = self.project / "docs" / "bets" / "WLT-27"
        self.bdir.mkdir(parents=True, exist_ok=True)
        (self.bdir / "brief.md").write_text(
            "---\nid: WLT-27\ntype: feature\nstatus: in-build\npriority: P1\n"
            "depends_on: []\n---\n# WLT-27 title\n", encoding="utf-8")

    def tearDown(self):
        os.environ.pop("COMPASS_HOME", None) if self._old is None \
            else os.environ.__setitem__("COMPASS_HOME", self._old)

    def _bet_node(self):
        return wbs.build_wbs(self.project)["bets"][0]

    def test_feature_blocked_by_undelivered_design(self):
        _story(self.bdir, "WLT-27-2", status="needs-design", type="design", owner="human")
        _story(self.bdir, "WLT-27-3", status="needs-copy", type="copy", owner="human")
        _story(self.bdir, "WLT-27-1", status="needs-design", type="story", owner="agent",
               dependencies="[WLT-27-2, WLT-27-3]")
        bet = self._bet_node()
        self.assertEqual(bet["rag"], "red")
        self.assertTrue(any("story WLT-27-1 blocked by" in a["reason"]
                            and "WLT-27-2" in a["reason"] for a in bet["attention"]))
        feat = next(s for s in bet["stories"] if s["id"] == "WLT-27-1")
        self.assertEqual(set(feat["blocked_by"]), {"WLT-27-2", "WLT-27-3"})

    def test_block_clears_when_design_and_copy_delivered(self):
        # human delivered both → status: ready → feature no longer blocked
        _story(self.bdir, "WLT-27-2", status="ready", type="design", owner="human")
        _story(self.bdir, "WLT-27-3", status="ready", type="copy", owner="human")
        _story(self.bdir, "WLT-27-1", status="ready", type="story", owner="agent",
               dependencies="[WLT-27-2, WLT-27-3]")
        bet = self._bet_node()
        feat = next(s for s in bet["stories"] if s["id"] == "WLT-27-1")
        self.assertEqual(feat["blocked_by"], [])
        self.assertFalse(any("blocked by" in a["reason"] for a in bet["attention"]))

    def test_human_owned_story_awaiting_delivery_is_amber(self):
        _story(self.bdir, "WLT-27-2", status="needs-design", type="design", owner="human")
        bet = self._bet_node()
        self.assertTrue(any(a["level"] == "amber" and "awaiting human delivery" in a["reason"]
                            for a in bet["attention"]))

    def test_owner_and_type_surface_on_story_node(self):
        _story(self.bdir, "WLT-27-2", status="needs-design", type="design", owner="human")
        node = self._bet_node()["stories"][0]
        self.assertEqual((node["type"], node["owner"]), ("design", "human"))

    def test_render_shows_blocked_and_human_tag(self):
        _story(self.bdir, "WLT-27-2", status="needs-design", type="design", owner="human")
        _story(self.bdir, "WLT-27-1", status="needs-design", type="story", owner="agent",
               dependencies="[WLT-27-2]")
        out = wbs.render_wbs(wbs.build_wbs(self.project))
        self.assertIn("(design, human)", out)
        self.assertIn("⛔ blocked by WLT-27-2", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
