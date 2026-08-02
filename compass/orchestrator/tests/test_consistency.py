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
        (root / "compass" / "orchestrator" / "hosts").mkdir(parents=True)
        # router with the authoritative supported-hosts enumeration
        (root / "compass" / "orchestrator" / "hosts" / "router.py").write_text(
            'raise RuntimeError("Unknown host: x. Supported: claude, claude-code, '
            'codex, chatgpt, openai, gemini")\n', encoding="utf-8"
        )
        # two dispatch-graph workflows
        for name in ("a", "b"):
            (root / "compass" / "workflows" / f"{name}.md").write_text(
                "# wf\n\n## Dispatch graph\n\n### Step 1. `x.y`\n", encoding="utf-8"
            )
        # canon with 2 Compass-original entries
        (root / "compass" / "framework" / "canon.md").write_text(
            "## Compass-original patterns\n\n### one\nx\n\n### two\ny\n", encoding="utf-8"
        )
        # AGENTS claiming the matching truths + a host table mentioning every
        # router-supported host (chatgpt is the openai-family alias → `openai`)
        (root / "AGENTS.md").write_text(
            "2 of 18 workflows now in dispatch-graph shape; "
            "catalog 7 shapes / 2 patterns.\n"
            "Hosts: `claude` `claude-code` `codex` `openai` `gemini`\n",
            encoding="utf-8",
        )
        (root / "README.md").write_text("orchestrator v0.4-alpha ships\n", encoding="utf-8")
        (root / "CLAUDE.md").write_text("notes\n", encoding="utf-8")
        # #122: a config declaring a resolvable CI-parity suite. The shipped config is
        # also every consumer's template, so it must never regress to commented examples.
        (root / "compass" / "config.yaml").write_text(
            "checks:\n  - make verify\n", encoding="utf-8"
        )
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
            "5 of 18 workflows; catalog 7 shapes / 2 patterns.\n", encoding="utf-8"
        )
        probs = cc.check_dispatch_graph_count(root)
        self.assertTrue(any("dispatch-graph count drift" in p for p in probs))

    def test_catalog_count_drift_caught(self):
        root = self._mirror()
        (root / "AGENTS.md").write_text(
            "2 of 18 workflows; catalog 7 shapes / 9 patterns.\n", encoding="utf-8"
        )
        probs = cc.check_catalog_count(root)
        self.assertTrue(any("catalog count drift" in p for p in probs))

    def test_version_self_claim_caught(self):
        root = self._mirror()
        (root / "README.md").write_text("orchestrator v0.4-alpha-7 ships\n", encoding="utf-8")
        probs = cc.check_version_self_claims(root)
        self.assertTrue(any("hardcoded orchestrator" in p for p in probs))

    def test_host_list_drift_caught(self):
        # router gains a host the AGENTS.md table doesn't document → caught
        root = self._mirror()
        (root / "compass" / "orchestrator" / "hosts" / "router.py").write_text(
            'raise RuntimeError("Unknown host: x. Supported: claude, claude-code, '
            'codex, chatgpt, openai, gemini, frobnicate")\n', encoding="utf-8"
        )
        probs = cc.check_host_list(root)
        self.assertTrue(any("host-list drift" in p and "frobnicate" in p for p in probs))

    def test_host_list_alias_not_flagged(self):
        # chatgpt is satisfied by the `openai` row — must NOT be flagged
        root = self._mirror()
        probs = cc.check_host_list(root)
        self.assertEqual(probs, [])

    def test_version_unified_drift_caught(self):
        # #38: config.yaml framework_version vs pyproject version disagree → caught
        root = self._mirror()
        (root / "compass" / "config.yaml").write_text(
            "framework_version: 1.0.0-rc.1\n", encoding="utf-8")
        (root / "pyproject.toml").write_text(
            '[project]\nversion = "0.4.0a1"\n', encoding="utf-8")
        probs = cc.check_version_unified(root)
        self.assertTrue(any("version drift" in p for p in probs))

    def test_version_unified_normalized_match(self):
        # 1.0.0-rc.1 (config, human) == 1.0.0rc1 (pyproject, PEP 440) → no drift
        root = self._mirror()
        (root / "compass" / "config.yaml").write_text(
            "framework_version: 1.0.0-rc.1\n", encoding="utf-8")
        (root / "pyproject.toml").write_text(
            '[project]\nversion = "1.0.0rc1"\n', encoding="utf-8")
        self.assertEqual(cc.check_version_unified(root), [])

    # ── #122: the shipped config is also every consumer's template. It shipped with
    # `checks:` commented out, so every project began life resolving zero checks — and
    # a code workflow resolving zero checks now HALTS (#123).
    def test_config_checks_commented_out_caught(self):
        root = self._mirror()
        (root / "compass" / "config.yaml").write_text(
            "# checks:\n#   - pnpm lint\n#   - pnpm build\n", encoding="utf-8")
        probs = cc.check_config_declares_checks(root)
        self.assertTrue(any("config-checks drift" in p for p in probs), probs)

    def test_config_missing_entirely_caught(self):
        root = self._mirror()
        (root / "compass" / "config.yaml").unlink()
        probs = cc.check_config_declares_checks(root)
        self.assertTrue(any("config-checks drift" in p for p in probs), probs)

    def test_stack_alone_satisfies_the_check(self):
        """A `stack:` with a shipped default suite is a valid way to declare checks."""
        root = self._mirror()
        (root / "compass" / "config.yaml").write_text("stack: nextjs-ts\n", encoding="utf-8")
        self.assertEqual(cc.check_config_declares_checks(root), [])


if __name__ == "__main__":
    unittest.main()
