"""Tests for compass/scripts/consistency-check.py (#93).

The repo must be self-consistent (the checks pass on HEAD), and each check must
actually detect its drift class — otherwise the mechanization is theatre.
"""
import importlib.util
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
_spec = importlib.util.spec_from_file_location(
    "consistency_check", REPO_ROOT / "compass" / "scripts" / "consistency-check.py"
)
cc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cc)


class TestRepoIsConsistent(unittest.TestCase):
    def test_no_drift_on_head(self):
        self.assertEqual(cc.run_all(REPO_ROOT), [])


class TestDetectsDrift(unittest.TestCase):
    """Mirror the real repo into a tmp dir, inject one drift, assert it's caught."""

    def _mirror(self) -> Path:
        self._tmp = tempfile.TemporaryDirectory()
        root = Path(self._tmp.name)
        (root / "compass" / "workflows").mkdir(parents=True)
        (root / "compass" / "framework").mkdir(parents=True)
        (root / "compass" / "orchestrator").mkdir(parents=True)
        # two dispatch-graph workflows
        for name in ("a", "b"):
            (root / "compass" / "workflows" / f"{name}.md").write_text(
                "# wf\n\n## Dispatch graph\n\n### Step 1. `x.y`\n", encoding="utf-8"
            )
        # canon with 2 Compass-original entries
        (root / "compass" / "framework" / "canon.md").write_text(
            "## Compass-original patterns\n\n### one\nx\n\n### two\ny\n", encoding="utf-8"
        )
        # AGENTS claiming the matching truths
        (root / "AGENTS.md").write_text(
            "2 of 17 workflows now in dispatch-graph shape; "
            "catalog 7 shapes / 2 patterns.\n", encoding="utf-8"
        )
        (root / "README.md").write_text("orchestrator v0.4-alpha ships\n", encoding="utf-8")
        (root / "CLAUDE.md").write_text("notes\n", encoding="utf-8")
        return root

    def tearDown(self):
        if hasattr(self, "_tmp"):
            self._tmp.cleanup()

    def test_clean_mirror_passes(self):
        root = self._mirror()
        self.assertEqual(cc.run_all(root), [])

    def test_dispatch_count_drift_caught(self):
        root = self._mirror()
        (root / "AGENTS.md").write_text(
            "5 of 17 workflows; catalog 7 shapes / 2 patterns.\n", encoding="utf-8"
        )
        probs = cc.check_dispatch_graph_count(root)
        self.assertTrue(any("dispatch-graph count drift" in p for p in probs))

    def test_catalog_count_drift_caught(self):
        root = self._mirror()
        (root / "AGENTS.md").write_text(
            "2 of 17 workflows; catalog 7 shapes / 9 patterns.\n", encoding="utf-8"
        )
        probs = cc.check_catalog_count(root)
        self.assertTrue(any("catalog count drift" in p for p in probs))

    def test_version_self_claim_caught(self):
        root = self._mirror()
        (root / "README.md").write_text("orchestrator v0.4-alpha-7 ships\n", encoding="utf-8")
        probs = cc.check_version_self_claims(root)
        self.assertTrue(any("hardcoded orchestrator" in p for p in probs))


if __name__ == "__main__":
    unittest.main()
