"""_run_workflow reads framework content from the SpecSource, never from `compass/` on disk.

Each test points `compass_dir` at a directory that does not exist, so a read that still reached
the disk would fail here instead of passing by accident on the repo's own files.
"""
import contextlib
import io
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from compass.orchestrator import run as R
from compass.orchestrator import spec_source as S
from compass.orchestrator.tests._specs import compass_specs

NOWHERE = Path("/nonexistent-compass-dir")
HOSTS = ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY")


def run_halting(specs, workflow="triage"):
    """Drive _run_workflow with no host reachable; return (exit_code, stderr)."""
    saved = {k: os.environ.pop(k, None) for k in HOSTS}
    err = io.StringIO()
    try:
        with tempfile.TemporaryDirectory() as proj, tempfile.TemporaryDirectory() as ch:
            os.environ["COMPASS_HOME"] = ch
            with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()), \
                    self_raises() as caught:
                R._run_workflow(workflow, Path(proj), NOWHERE, context="x", specs=specs)
    finally:
        os.environ.pop("COMPASS_HOME", None)
        for k, v in saved.items():
            if v is not None:
                os.environ[k] = v
    return caught["code"], err.getvalue()


@contextlib.contextmanager
def self_raises():
    caught = {"code": None}
    try:
        yield caught
    except SystemExit as e:
        caught["code"] = e.code


class TestRunReadsSpecSource(unittest.TestCase):
    def test_runs_with_compass_dir_absent(self):
        code, err = run_halting(compass_specs())
        # It got past the workflow and agent lookups and stopped where it should: no host.
        self.assertEqual(code, 2)
        self.assertIn("no host available", err)

    def test_missing_workflow_halts_naming_the_row(self):
        code, err = run_halting(S.InMemorySpecSource())
        self.assertEqual(code, 1)
        self.assertIn("no published workflow 'triage'", err)

    def test_missing_agent_row_halts_rather_than_skipping(self):
        full = compass_specs()
        no_agents = S.InMemorySpecSource(workflows=full.workflows)
        code, err = run_halting(no_agents)
        self.assertEqual(code, 2)
        self.assertIn("no spec_file row for agents/", err)

    def test_requires_a_spec_source(self):
        with self.assertRaises(ValueError):
            R._run_workflow("triage", Path("."), NOWHERE, context="x")


class TestPromptFile(unittest.TestCase):
    def test_holds_the_text_for_the_dispatch_then_deletes_it(self):
        with S.prompt_file("# Agent\nbody") as path:
            self.assertEqual(Path(path).read_text(encoding="utf-8"), "# Agent\nbody")
        self.assertFalse(Path(path).exists())

    def test_deletes_it_when_the_dispatch_raises(self):
        with self.assertRaises(RuntimeError):
            with S.prompt_file("x") as path:
                raise RuntimeError("host failed")
        self.assertFalse(Path(path).exists())


if __name__ == "__main__":
    unittest.main()
