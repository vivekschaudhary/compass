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
from compass.orchestrator.run import (
    _manual_hitl_decision, _requirement_met, _promote_artifact,
    _resolve_bet_for_story, _is_story_id, _load_story_context, _work_branch_name,
)

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
            # confluence with no creds → honest 'not configured' fallback (still cached)
            label = push_artifact(project, "docs/c.md", "x\n", "confluence")
            self.assertIn("filesystem fallback — confluence not configured", label)
            self.assertTrue((project / "docs/c.md").exists())
            # an unrecognized backend still degrades honestly
            label = push_artifact(project, "docs/d.md", "y\n", "notion")
            self.assertEqual(label, "filesystem fallback — notion not implemented")
            self.assertTrue((project / "docs/d.md").exists())

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


class TestPromoteArtifact(unittest.TestCase):
    """#project-on-create: the shared promote/project helper — projects the draft on
    gate arrival (status as-is) and re-projects on approval (status approved), reading
    the on-disk artifact so the distribution pointer survives (idempotent)."""

    def _project(self):
        return Path(tempfile.mkdtemp())

    def test_reads_ondisk_preserves_pointer(self):
        project = self._project()
        rel = "docs/bets/CB-1/stories/CB-1-1/story.md"
        target = project / rel
        target.parent.mkdir(parents=True)
        target.write_text("---\nid: CB-1-1\nstatus: proposed\njira_key: PROJ-7\n---\n# Story\n",
                          encoding="utf-8")
        label = _promote_artifact(project, project / "compass", rel, "FALLBACK-OUTPUT",
                                  "run1", status="approved")
        written = target.read_text(encoding="utf-8")
        self.assertIn("jira_key: PROJ-7", written)       # pointer read from disk, not lost
        self.assertIn("status: approved", written)       # flipped on approval
        self.assertNotIn("FALLBACK-OUTPUT", written)     # on-disk used, not the step output
        self.assertEqual(label, "filesystem")            # no creds → filesystem cache

    def test_status_none_projects_draft_asis(self):
        project = self._project()
        rel = "docs/bets/CB-2/stories/CB-2-1/story.md"
        (project / rel).parent.mkdir(parents=True)
        (project / rel).write_text("---\nid: CB-2-1\nstatus: proposed\n---\n# S\n", encoding="utf-8")
        _promote_artifact(project, project / "compass", rel, "FB", "run1", status=None)
        self.assertIn("status: proposed", (project / rel).read_text(encoding="utf-8"))  # unchanged

    def test_falls_back_to_step_output(self):
        project = self._project()
        rel = "docs/x.md"
        _promote_artifact(project, project / "compass", rel,
                          "# Title\nbody\n## Output summary\nmeta", "r", status="approved")
        written = (project / rel).read_text(encoding="utf-8")
        self.assertIn("# Title", written)
        self.assertNotIn("Output summary", written)      # body extracted from the output
        self.assertIn("status: approved", written)

    def test_no_write_returns_none(self):
        project = self._project()
        self.assertIsNone(_promote_artifact(project, project / "compass", "docs/x.md",
                                            "x", "r", no_write=True))
        self.assertFalse((project / "docs/x.md").exists())


class TestStoryScoping(unittest.TestCase):
    """#172: story-scoped build — a story id resolves to its parent bet (so the
    requirement gate checks the bet brief, not a nonexistent story brief), loads
    focused single-story context, and branches on the story id for parallel builds."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.project = Path(self._tmp.name)
        # docs/bets/WLT-27/{brief.md,architecture.md} + stories/WLT-27-1, -2
        bet = self.project / "docs" / "bets" / "WLT-27"
        (bet / "stories" / "WLT-27-1").mkdir(parents=True)
        (bet / "stories" / "WLT-27-2").mkdir(parents=True)
        (bet / "brief.md").write_text("---\nid: WLT-27\nstatus: approved\n---\n# Bet\n", encoding="utf-8")
        (bet / "architecture.md").write_text("---\nstatus: approved\n---\n# Arch\n", encoding="utf-8")
        (bet / "stories" / "WLT-27-1" / "story.md").write_text(
            "---\nid: WLT-27-1\nstatus: ready\n---\n# Manual account form\nBuild the form.\n", encoding="utf-8")
        (bet / "stories" / "WLT-27-2" / "story.md").write_text(
            "---\nid: WLT-27-2\n---\n# CSV wizard\nSibling story — out of scope.\n", encoding="utf-8")

    def tearDown(self):
        self._tmp.cleanup()

    def test_resolve_bet_from_filesystem(self):
        self.assertEqual(_resolve_bet_for_story(self.project, "WLT-27-1"), "WLT-27")

    def test_resolve_bet_fallback_strips_segment(self):
        # No dir on disk yet (e.g. dry-run before stories exist) → strip trailing -<n>.
        self.assertEqual(_resolve_bet_for_story(self.project, "CB-9-3"), "CB-9")

    def test_resolve_bet_unresolvable(self):
        self.assertIsNone(_resolve_bet_for_story(self.project, "noseparator"))

    def test_is_story_id_true_for_story(self):
        self.assertTrue(_is_story_id(self.project, "WLT-27-1"))

    def test_is_story_id_false_for_bet(self):
        # A bet dir exists → it's a bet, not a story (even though it has a dash).
        self.assertFalse(_is_story_id(self.project, "WLT-27"))

    def test_is_story_id_false_for_unknown(self):
        self.assertFalse(_is_story_id(self.project, "WLT-99-1"))

    def test_story_context_is_focused(self):
        ctx = _load_story_context(self.project, "WLT-27", "WLT-27-1")
        self.assertIn("Implement ONLY story WLT-27-1", ctx)
        self.assertIn("Manual account form", ctx)   # the target story
        self.assertIn("# Bet", ctx)                  # parent bet brief
        self.assertIn("# Arch", ctx)                 # parent bet architecture
        self.assertNotIn("CSV wizard", ctx)          # sibling story stays out of scope

    def test_branch_name_keyed_on_story(self):
        # Parallel story builds get distinct branches (feat/<story>-…), not one feat/<bet>-….
        b1 = _work_branch_name("build", "WLT-27-1", "manual account form")
        b2 = _work_branch_name("build", "WLT-27-2", "csv wizard")
        self.assertTrue(b1.startswith("feat/WLT-27-1-"))
        self.assertNotEqual(b1, b2)


if __name__ == "__main__":
    unittest.main()
