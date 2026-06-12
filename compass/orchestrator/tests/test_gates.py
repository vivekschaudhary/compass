"""Tests for the #70 slice — requirement gates, artifact promotion, manual approval bridge.

Covers: requires_approved frontmatter parsing, Artifact target parsing,
dual-acceptance requirement checks (hitl.jsonl OR status frontmatter),
artifact body extraction + frontmatter injection, filesystem push with
honest fallback labels, and the --approve/--reject round-trip.
"""
import json
import tempfile
import unittest
from pathlib import Path

from compass.orchestrator.connector import (
    extract_artifact_body,
    push_artifact,
    read_frontmatter_status,
    set_frontmatter_status,
)
from compass.orchestrator.graph import load_workflow, load_workflow_meta
from compass.orchestrator.run import _manual_hitl_decision, _requirement_met

COMPASS_DIR = Path(__file__).resolve().parents[2]
WORKFLOWS = COMPASS_DIR / "workflows"


def _tmp_md(content: str, dirpath: Path = None) -> Path:
    f = tempfile.NamedTemporaryFile(
        "w", suffix=".md", delete=False, dir=dirpath, encoding="utf-8"
    )
    f.write(content)
    f.close()
    return Path(f.name)


class TestWorkflowMeta(unittest.TestCase):
    def test_inline_list(self):
        p = _tmp_md("---\nname: x\nrequires_approved: [docs/a.md, docs/b.md]\n---\nbody\n")
        try:
            self.assertEqual(
                load_workflow_meta(p)["requires_approved"], ["docs/a.md", "docs/b.md"]
            )
        finally:
            p.unlink()

    def test_block_list(self):
        p = _tmp_md(
            "---\nname: x\nrequires_approved:\n  - docs/a.md\n  - docs/bets/<bet-id>/brief.md\n---\n"
        )
        try:
            self.assertEqual(
                load_workflow_meta(p)["requires_approved"],
                ["docs/a.md", "docs/bets/<bet-id>/brief.md"],
            )
        finally:
            p.unlink()

    def test_absent(self):
        p = _tmp_md("---\nname: x\n---\nbody\n")
        try:
            self.assertEqual(load_workflow_meta(p)["requires_approved"], [])
        finally:
            p.unlink()

    def test_real_create_brief_requirements(self):
        meta = load_workflow_meta(WORKFLOWS / "create-brief.md")
        self.assertEqual(
            meta["requires_approved"],
            ["docs/foundation/product.md", "docs/foundation/architecture.md"],
        )


class TestArtifactTargetParsing(unittest.TestCase):
    def test_target_parsed_from_hitl_step(self):
        p = _tmp_md(
            "# W\n\n## Dispatch graph\n\n### Step 1. **HITL gate** (human)\n\n"
            "**Dispatches:** HUMAN\n**Artifact target:** `docs/foundation/product.md`\n"
        )
        try:
            steps = load_workflow(p)
            self.assertEqual(steps[0].artifact_target, "docs/foundation/product.md")
        finally:
            p.unlink()

    def test_no_target_is_none(self):
        p = _tmp_md(
            "# W\n\n## Dispatch graph\n\n### Step 1. **HITL gate** (human)\n\n**Dispatches:** HUMAN\n"
        )
        try:
            self.assertIsNone(load_workflow(p)[0].artifact_target)
        finally:
            p.unlink()

    def test_real_workflows(self):
        sp = load_workflow(WORKFLOWS / "setup-product.md")
        self.assertEqual(
            next(s for s in sp if s.is_hitl).artifact_target,
            "docs/foundation/product.md",
        )
        cb = load_workflow(WORKFLOWS / "create-brief.md")
        self.assertEqual(
            next(s for s in cb if s.is_hitl).artifact_target,
            "docs/bets/<bet-id>/brief.md",
        )
        build = load_workflow(WORKFLOWS / "build.md")
        self.assertIsNone(next(s for s in build if s.is_hitl).artifact_target)


class TestRequirementMet(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.project = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def _write_hitl(self, records):
        log = self.project / "docs" / "orchestrator-runs" / "hitl.jsonl"
        log.parent.mkdir(parents=True, exist_ok=True)
        log.write_text(
            "".join(json.dumps(r) + "\n" for r in records), encoding="utf-8"
        )

    def test_met_via_hitl_record(self):
        self._write_hitl(
            [{"canonical_path": "docs/foundation/product.md", "decision": "approved"}]
        )
        met, how = _requirement_met(self.project, "docs/foundation/product.md")
        self.assertTrue(met)
        self.assertIn("hitl.jsonl", how)

    def test_met_via_status_frontmatter(self):
        f = self.project / "docs" / "foundation" / "product.md"
        f.parent.mkdir(parents=True)
        f.write_text("---\nstatus: approved\n---\n# P\n", encoding="utf-8")
        met, how = _requirement_met(self.project, "docs/foundation/product.md")
        self.assertTrue(met)
        self.assertIn("frontmatter", how)

    def test_unmet(self):
        met, _ = _requirement_met(self.project, "docs/foundation/product.md")
        self.assertFalse(met)

    def test_proposed_status_is_unmet(self):
        f = self.project / "docs" / "foundation" / "product.md"
        f.parent.mkdir(parents=True)
        f.write_text("---\nstatus: proposed\n---\n# P\n", encoding="utf-8")
        met, _ = _requirement_met(self.project, "docs/foundation/product.md")
        self.assertFalse(met)

    def test_latest_decision_wins(self):
        self._write_hitl(
            [
                {"canonical_path": "docs/x.md", "decision": "approved"},
                {"canonical_path": "docs/x.md", "decision": "rejected"},
            ]
        )
        met, _ = _requirement_met(self.project, "docs/x.md")
        self.assertFalse(met)


class TestPromotionHelpers(unittest.TestCase):
    def test_extract_strips_output_summary(self):
        out = "---\nstatus: proposed\n---\n# Brief\n\nBody.\n\n## Output summary\n\n**TL;DR:** meta\n"
        body = extract_artifact_body(out)
        self.assertIn("# Brief", body)
        self.assertNotIn("Output summary", body)

    def test_extract_verbatim_without_summary(self):
        out = "# Brief\n\nBody.\n"
        self.assertEqual(extract_artifact_body(out), out)

    def test_status_replaced_in_existing_frontmatter(self):
        content = "---\nstatus: proposed\nowner: pm\n---\n# B\n"
        result = set_frontmatter_status(content, "approved", "run-1")
        self.assertIn("status: approved", result)
        self.assertNotIn("status: proposed", result)
        self.assertIn("source_run: run-1", result)
        self.assertIn("owner: pm", result)

    def test_frontmatter_injected_when_absent(self):
        result = set_frontmatter_status("# Bare\n", "approved", "run-2")
        self.assertTrue(result.startswith("---\nstatus: approved\n"))
        self.assertIn("# Bare", result)

    def test_push_filesystem_and_fallback_label(self):
        with tempfile.TemporaryDirectory() as d:
            project = Path(d)
            label = push_artifact(project, "docs/a/b.md", "content\n", "filesystem")
            self.assertEqual(label, "filesystem")
            self.assertEqual((project / "docs/a/b.md").read_text(), "content\n")
            label = push_artifact(project, "docs/c.md", "x\n", "confluence")
            self.assertEqual(label, "filesystem fallback — confluence not implemented")
            self.assertTrue((project / "docs/c.md").exists())

    def test_read_frontmatter_status(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "a.md"
            f.write_text("---\nstatus: approved\n---\n", encoding="utf-8")
            self.assertEqual(read_frontmatter_status(f), "approved")
            self.assertEqual(read_frontmatter_status(Path(d) / "missing.md"), "")


class TestManualBridge(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.project = Path(self._tmp.name).resolve()

    def tearDown(self):
        self._tmp.cleanup()

    def _hitl_records(self):
        log = self.project / "docs" / "orchestrator-runs" / "hitl.jsonl"
        if not log.exists():
            return []
        return [json.loads(l) for l in log.read_text().splitlines() if l.strip()]

    def test_approve_flips_status_and_logs(self):
        f = self.project / "docs" / "foundation" / "product.md"
        f.parent.mkdir(parents=True)
        f.write_text("---\nstatus: proposed\n---\n# P\n", encoding="utf-8")
        code = _manual_hitl_decision(
            self.project, "docs/foundation/product.md", "approved", None, None
        )
        self.assertEqual(code, 0)
        self.assertEqual(read_frontmatter_status(f), "approved")
        records = self._hitl_records()
        self.assertEqual(records[-1]["decision"], "approved")
        self.assertEqual(records[-1]["canonical_path"], "docs/foundation/product.md")
        self.assertEqual(records[-1]["workflow"], "manual")
        # the requirement gate now passes via BOTH mechanisms
        self.assertTrue(_requirement_met(self.project, "docs/foundation/product.md")[0])

    def test_reject_logs_without_touching_file(self):
        f = self.project / "docs" / "b.md"
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("---\nstatus: proposed\n---\n", encoding="utf-8")
        code = _manual_hitl_decision(self.project, "docs/b.md", "rejected", "needs work", None)
        self.assertEqual(code, 0)
        self.assertEqual(read_frontmatter_status(f), "proposed")
        records = self._hitl_records()
        self.assertEqual(records[-1]["decision"], "rejected")
        self.assertEqual(records[-1]["feedback"], "needs work")

    def test_approve_missing_file_errors(self):
        code = _manual_hitl_decision(self.project, "docs/nope.md", "approved", None, None)
        self.assertEqual(code, 2)

    def test_path_outside_project_errors(self):
        code = _manual_hitl_decision(self.project, "/etc/hosts", "approved", None, None)
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
