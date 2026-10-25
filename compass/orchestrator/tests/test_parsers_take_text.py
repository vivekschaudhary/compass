"""The workflow and agent-file parsers take TEXT, so the text can come from the spec table.

Pinned: they accept every real file in `compass/`, and they do not read the disk at all.
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


class TestShippedFilesParse(unittest.TestCase):
    """Every file the framework ships parses from its text — the product no longer has a Path reader
    to compare against, so this pins that the parsers accept what is actually in `compass/`."""

    def test_every_workflow_md_parses(self):
        for wf in sorted((COMPASS / "archive" / "workflows").glob("*.md")):
            with self.subTest(wf.name):
                text = wf.read_text(encoding="utf-8")
                self.assertIsInstance(graph.parse_workflow(text), list)
                self.assertIn("requires_approved", graph.parse_workflow_meta(text))

    def test_every_agent_frontmatter_parses(self):
        for f in sorted((COMPASS / "agents").glob("*.md")):
            text = f.read_text(encoding="utf-8")
            with self.subTest(f.name):
                self.assertTrue(R.parse_preferred_hosts(text))          # defaults to ["claude"], never empty
                self.assertIsInstance(R.parse_agent_tools(text), list)
                self.assertIsInstance(R.parse_model_tier(text), str)
                self.assertIsInstance(R.parse_reads_bet_catalog(text), bool)


class TestTextParsersDoNotTouchTheDisk(unittest.TestCase):
    def test_no_read_happens(self):
        wf = (COMPASS / "archive" / "workflows" / "build.md").read_text()
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
