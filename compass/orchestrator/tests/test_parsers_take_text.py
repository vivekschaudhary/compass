"""The workflow and agent-file parsers take TEXT, so the text can come from the spec table.

Two things are pinned: the text parser and the file wrapper agree on every real file, and the text
parser does not read the disk at all (the wrapper is the only thing that does).
"""
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from compass.orchestrator import graph, run as R

COMPASS = Path(__file__).resolve().parents[2]


def _steps(steps):
    return [(s.number, s.agent, s.task, s.is_hitl, s.agent_file, s.nests) for s in steps]


class TestTextEqualsFile(unittest.TestCase):
    def test_every_workflow_parses_the_same_from_text(self):
        for wf in sorted((COMPASS / "workflows").glob("*.md")):
            with self.subTest(wf.name):
                self.assertEqual(_steps(graph.parse_workflow(wf.read_text())), _steps(graph.load_workflow(wf)))
                self.assertEqual(graph.parse_workflow_meta(wf.read_text()), graph.load_workflow_meta(wf))

    def test_every_agent_frontmatter_parses_the_same_from_text(self):
        for f in sorted((COMPASS / "agents").glob("*.md")):
            text = f.read_text(encoding="utf-8")
            with self.subTest(f.name):
                self.assertEqual(R.parse_preferred_hosts(text), R._read_preferred_hosts(f))
                self.assertEqual(R.parse_agent_tools(text), R._read_agent_tools(f))
                self.assertEqual(R.parse_model_tier(text), R._read_model_tier(f))
                self.assertEqual(R.parse_reads_bet_catalog(text), R._reads_bet_catalog(f))


class TestTextParsersDoNotTouchTheDisk(unittest.TestCase):
    def test_no_read_happens(self):
        wf = (COMPASS / "workflows" / "build.md").read_text()
        agent = (COMPASS / "agents" / "engineer.md").read_text(encoding="utf-8")
        boom = mock.Mock(side_effect=AssertionError("a text parser read the disk"))
        with mock.patch.object(Path, "read_text", boom), mock.patch("builtins.open", boom):
            self.assertTrue(graph.parse_workflow(wf))
            graph.parse_workflow_meta(wf)
            R.parse_preferred_hosts(agent)
            R.parse_agent_tools(agent)
            R.parse_model_tier(agent)
            R.parse_reads_bet_catalog(agent)

    def test_frontmatter_survives_what_the_db_row_has_stripped(self):
        """The stored agent rows have no `## Tasks I own`; the frontmatter is untouched."""
        text = "---\npreferred_hosts: [codex, gemini]\nmodel_tier: deep\nloads_bet_catalog: true\n---\n\n# Agent\n\n## Identity\n\nx\n"
        self.assertEqual(R.parse_preferred_hosts(text), ["codex", "gemini"])
        self.assertEqual(R.parse_model_tier(text), "deep")
        self.assertTrue(R.parse_reads_bet_catalog(text))

    def test_no_frontmatter_defaults_are_unchanged(self):
        self.assertEqual(R.parse_preferred_hosts("# no frontmatter"), ["claude"])
        self.assertEqual(R.parse_agent_tools("# no frontmatter"), [])


if __name__ == "__main__":
    unittest.main()
