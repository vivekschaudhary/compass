"""COMPASS_CLAUDE_HOST means the same thing to the orchestrator as to the app that spawns it.

The app's `requestedHost` accepts 1/true/on/yes/cli for the CLI and 0/false/off/no/api (or nothing)
for the API, and halts on anything else. The orchestrator used to accept only `cli`/`claude-code`,
so `COMPASS_CLAUDE_HOST=1` — which the app reads as the CLI — silently became the metered API here.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from compass.orchestrator.run import claude_host_requested


class TestClaudeHostRequested(unittest.TestCase):
    def test_the_spellings_the_app_reads_as_cli(self):
        for v in ("1", "true", "on", "yes", "cli", "claude-code", " CLI ", "True"):
            with self.subTest(v):
                self.assertTrue(claude_host_requested(v))

    def test_the_spellings_the_app_reads_as_api(self):
        for v in (None, "", "  ", "0", "false", "off", "no", "api", "API"):
            with self.subTest(v):
                self.assertFalse(claude_host_requested(v))

    def test_an_unknown_value_halts_rather_than_defaulting(self):
        for v in ("cl1", "codex", "2", "clii"):
            with self.subTest(v), self.assertRaises(ValueError):
                claude_host_requested(v)

    def test_matches_the_apps_table(self):
        """The two lists are read from select.ts so editing one side alone fails here."""
        import re
        src = (Path(__file__).resolve().parents[3] / "app/app/lib/agent/hosts/select.ts").read_text()
        cli = set(re.search(r'\[((?:"[^"]+",?\s*)+)\]\.includes\(raw\)\) return "cli"', src).group(1).replace('"', "").replace(" ", "").split(","))
        api = set(re.search(r'\[((?:"[^"]+",?\s*)+)\]\.includes\(raw\)\) return "api"', src).group(1).replace('"', "").replace(" ", "").split(","))
        for v in cli:
            self.assertTrue(claude_host_requested(v), v)
        for v in api:
            self.assertFalse(claude_host_requested(v), v)


if __name__ == "__main__":
    unittest.main()
