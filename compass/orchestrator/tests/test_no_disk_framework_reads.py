"""The orchestrator reads framework content from the database, never from `compass/` on disk.

Two guards, because each catches what the other cannot:

  static      no orchestrator source builds a path into the framework's content folders. A new
              `compass_dir / "agents" / ...` fails here before anyone runs it.
  behavioural a real `_run_workflow` and the cockpit's workflow views run with every read under
              those folders made an error. This catches a read the static pattern does not name
              (a different variable, a path built from `__file__`).

`config.yaml` is the one framework file that stays on disk, by decision (#227), so it is not in the
guarded set.
"""
import builtins
import contextlib
import io
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from compass.orchestrator import cockpit, run as R
from compass.orchestrator.tests._specs import compass_specs

COMPASS = Path(__file__).resolve().parents[2]
ORCH = COMPASS / "orchestrator"
GUARDED = ("agents", "workflows", "stacks", "templates", "framework", "roles")

# A path into one of the guarded folders: `x / "agents"`, `/ "workflows" /`, `compass_dir/agents/`.
PATH_INTO_FRAMEWORK = re.compile(
    r"""(/\s*["'](?:%s)["'])|(compass_dir\)?\s*/\s*["']?(?:%s)\b)""" % ("|".join(GUARDED), "|".join(GUARDED)))
# Lines allowed to name them: the "which code is running" check inspects directory existence only.
ALLOWED = ("_module_mismatch_warning", "(running / ")


class TestStatic(unittest.TestCase):
    def test_no_source_builds_a_path_into_the_framework_folders(self):
        offenders = []
        for f in sorted(ORCH.glob("*.py")) + sorted((ORCH / "hosts").glob("*.py")):
            for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
                code = line.split("#", 1)[0]
                if PATH_INTO_FRAMEWORK.search(code) and not any(a in code for a in ALLOWED):
                    offenders.append(f"{f.relative_to(COMPASS.parent)}:{n}: {line.strip()}")
        self.assertEqual(offenders, [], "framework content must come from spec_source, not the disk:\n"
                         + "\n".join(offenders))


class TestBehavioural(unittest.TestCase):
    def _guard(self):
        """Patch the readers so any access under a guarded folder raises."""
        forbidden = [str((COMPASS / d).resolve()) for d in GUARDED]
        real_open, real_read_text = builtins.open, Path.read_text

        def check(path):
            try:
                p = str(Path(path).resolve())
            except (TypeError, OSError):
                return
            if any(p == d or p.startswith(d + os.sep) for d in forbidden):
                raise AssertionError(f"read framework content from disk: {p}")

        def guarded_open(file, *a, **k):
            if isinstance(file, (str, os.PathLike)):
                check(file)
            return real_open(file, *a, **k)

        def guarded_read_text(self, *a, **k):
            check(self)
            return real_read_text(self, *a, **k)

        return mock.patch.object(builtins, "open", guarded_open), mock.patch.object(Path, "read_text", guarded_read_text)

    def test_the_guard_itself_catches_a_read(self):
        p_open, p_read = self._guard()
        with p_open, p_read, self.assertRaises(AssertionError):
            (COMPASS / "agents" / "engineer.md").read_text()

    def test_run_workflow_reads_nothing_from_the_framework_folders(self):
        specs = compass_specs()
        saved = {k: os.environ.pop(k, None) for k in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY")}
        p_open, p_read = self._guard()
        try:
            with tempfile.TemporaryDirectory() as proj, tempfile.TemporaryDirectory() as home:
                os.environ["COMPASS_HOME"] = home
                with p_open, p_read, contextlib.redirect_stdout(io.StringIO()), \
                        contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaises(SystemExit) as cm:
                        R._run_workflow("triage", Path(proj), Path("/nonexistent"), context="x", specs=specs)
                # It reached the host-selection halt (exit 2) — past the graph, agent and stack reads.
                self.assertEqual(cm.exception.code, 2)
        finally:
            os.environ.pop("COMPASS_HOME", None)
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v

    def test_the_cockpit_workflow_views_read_nothing_from_the_framework_folders(self):
        specs = compass_specs()
        p_open, p_read = self._guard()
        with p_open, p_read:
            self.assertTrue(cockpit.load_graph_steps("fix", specs))
            self.assertIn("triage", cockpit._known_workflows(specs))


if __name__ == "__main__":
    unittest.main()
