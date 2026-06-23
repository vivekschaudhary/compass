"""Tests for compass/scripts/sync-into-consumer.py (#114).

Loads the script by file path (it's a CLI script, not a package module) and
exercises the pure plan + the apply path against tmp framework/consumer trees,
verifying the overwrite/preserve/prune policy that keeps a consumer's own files
(config.yaml, docs/) safe.
"""
import importlib.util
import tempfile
import unittest
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "sync-into-consumer.py"
_spec = importlib.util.spec_from_file_location("sync_into_consumer", _SCRIPT)
sync = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sync)


def _fake_framework(root: Path):
    """Minimal framework tree with the machinery the policy copies."""
    (root / "compass" / "agents").mkdir(parents=True)
    (root / "compass" / "agents" / "support.md").write_text("FRESH support", encoding="utf-8")
    (root / "compass" / "workflows").mkdir(parents=True)
    (root / "compass" / "workflows" / "fix.md").write_text("FRESH fix", encoding="utf-8")
    (root / "compass" / "workflows" / "improvements.md").write_text("FRAMEWORK log", encoding="utf-8")
    (root / "compass" / "workflows" / "retros").mkdir()
    (root / "compass" / "workflows" / "retros" / "r1.md").write_text("retro", encoding="utf-8")
    for d in ("framework", "templates", "scripts", "orchestrator"):
        (root / "compass" / d).mkdir(parents=True)
        (root / "compass" / d / "x.txt").write_text("fw", encoding="utf-8")
    (root / "AGENTS.md").write_text("FRESH AGENTS", encoding="utf-8")
    (root / "CLAUDE.md").write_text("FRESH CLAUDE", encoding="utf-8")
    (root / ".claude" / "skills").mkdir(parents=True)
    (root / ".claude" / "skills" / "fix").mkdir()
    (root / ".codex" / "prompts").mkdir(parents=True)


def _fake_consumer(root: Path):
    """A consumer with stale machinery + its OWN content that must survive."""
    (root / "compass" / "agents").mkdir(parents=True)
    (root / "compass" / "agents" / "support.md").write_text("STALE support", encoding="utf-8")
    (root / "compass" / "config.yaml").write_text("hitl_level: strict  # MINE", encoding="utf-8")
    (root / "compass" / "roles").mkdir()
    (root / "compass" / "roles" / "legacy.md").write_text("keep", encoding="utf-8")
    (root / "docs" / "bets").mkdir(parents=True)
    (root / "docs" / "keep.md").write_text("MY PROJECT DOC", encoding="utf-8")
    (root / "PROJECT.md").write_text("MY PROJECT", encoding="utf-8")
    (root / ".github" / "workflows").mkdir(parents=True)
    (root / ".github" / "workflows" / "ci.yml").write_text("MY CI", encoding="utf-8")


class TestPlanSync(unittest.TestCase):
    def test_classification(self):
        with tempfile.TemporaryDirectory() as f, tempfile.TemporaryDirectory() as c:
            fw, con = Path(f), Path(c)
            _fake_framework(fw)
            _fake_consumer(con)
            plan = sync.plan_sync(fw, con)
            rels = [r for r, _ in plan["overwrite"]]
            self.assertIn("compass/agents", rels)
            self.assertIn("compass/workflows", rels)
            self.assertIn("AGENTS.md", rels)
            self.assertIn(".claude/skills", rels)
            # the consumer's own files are NOT in the overwrite set
            self.assertNotIn("compass/config.yaml", rels)
            self.assertNotIn("docs", rels)
            self.assertNotIn(".github", rels)
            # the framework's meta-logs are pruned (they exist in the consumer? no —
            # prune checks the CONSUMER; here consumer has none, so prune is empty)
            self.assertEqual(plan["prune"], [])

    def test_missing_in_framework_skipped(self):
        with tempfile.TemporaryDirectory() as f, tempfile.TemporaryDirectory() as c:
            fw, con = Path(f), Path(c)
            _fake_framework(fw)
            (fw / ".codex" / "prompts").rmdir()  # remove one machinery path
            plan = sync.plan_sync(fw, Path(c))
            self.assertIn(".codex/prompts", plan["missing_in_framework"])
            self.assertNotIn(".codex/prompts", [r for r, _ in plan["overwrite"]])


class TestApplyPlan(unittest.TestCase):
    def test_apply_overwrites_machinery_preserves_consumer_prunes_logs(self):
        with tempfile.TemporaryDirectory() as f, tempfile.TemporaryDirectory() as c:
            fw, con = Path(f), Path(c)
            _fake_framework(fw)
            _fake_consumer(con)
            # consumer also has a stale framework meta-log that must be pruned
            (con / "compass" / "workflows").mkdir(parents=True, exist_ok=True)
            (con / "compass" / "workflows" / "improvements.md").write_text("OLD log", encoding="utf-8")

            plan = sync.plan_sync(fw, con)
            self.assertIn("compass/workflows/improvements.md", plan["prune"])
            summary = sync.apply_plan(plan, fw, con, backup=True)

            # machinery overwritten
            self.assertEqual((con / "compass" / "agents" / "support.md").read_text(), "FRESH support")
            self.assertEqual((con / "AGENTS.md").read_text(), "FRESH AGENTS")
            # consumer's own files preserved
            self.assertEqual((con / "compass" / "config.yaml").read_text(), "hitl_level: strict  # MINE")
            self.assertEqual((con / "docs" / "keep.md").read_text(), "MY PROJECT DOC")
            self.assertEqual((con / "PROJECT.md").read_text(), "MY PROJECT")
            self.assertEqual((con / ".github" / "workflows" / "ci.yml").read_text(), "MY CI")
            self.assertTrue((con / "compass" / "roles" / "legacy.md").exists())
            # framework meta-log pruned from the consumer
            self.assertFalse((con / "compass" / "workflows" / "improvements.md").exists())
            # backup made
            self.assertIsNotNone(summary["backup"])
            self.assertTrue(Path(summary["backup"]).exists())

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as f, tempfile.TemporaryDirectory() as c:
            fw, con = Path(f), Path(c)
            _fake_framework(fw)
            _fake_consumer(con)
            rc = sync.main([str(con), "--framework", str(fw)])  # no --apply
            self.assertEqual(rc, 0)
            # consumer's stale agent is UNCHANGED (dry-run wrote nothing)
            self.assertEqual((con / "compass" / "agents" / "support.md").read_text(), "STALE support")
            self.assertFalse((con / ".compass-backups").exists())


if __name__ == "__main__":
    unittest.main()
