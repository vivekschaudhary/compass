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
import subprocess

import os

from compass.orchestrator.run import (
    _manual_hitl_decision, _requirement_met, _promote_artifact,
    _resolve_bet_for_story, _is_story_id, _build_story_gate, _load_story_context, _work_branch_name,
    _story_dependencies, _story_human_deliverable_blockers, _ensure_work_branch,
    _ensure_work_worktree, prune_worktrees, _cleanup_merged_worktree, _module_mismatch_warning,
    _read_story_fm_list, _overlapping_inflight_builds,
    _step_dir, _write_artifact,
)
from compass.orchestrator.logger import ensure_runs_dir, log_step

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

    # ── #171 mechanical design/copy gate ──────────────────────────────────────
    def _set(self, story_id, **fm):
        p = self.project / "docs" / "bets" / "WLT-27" / "stories" / story_id / "story.md"
        p.parent.mkdir(parents=True, exist_ok=True)
        body = "".join(f"{k.replace('_', '')}: {v}\n" for k, v in fm.items())
        p.write_text(f"---\nid: {story_id}\n{body}---\n# {story_id}\n", encoding="utf-8")

    def test_dependencies_inline_and_block_forms(self):
        self.assertEqual(_story_dependencies("---\ndependencies: [A, B]\n---\n"), ["A", "B"])
        self.assertEqual(_story_dependencies("---\ndependencies:\n  - A\n  - B\n---\n"), ["A", "B"])
        self.assertEqual(_story_dependencies("---\ndependencies:\n  - <other story id>\n---\n"), [])
        self.assertEqual(_story_dependencies("---\nid: x\n---\n"), [])

    def test_blocked_when_design_dep_not_ready(self):
        self._set("WLT-27-2", type="design", owner="human", status="needs-design")
        self._set("WLT-27-3", type="copy", owner="human", status="needs-copy")
        self._set("WLT-27-1", type="story", owner="agent", status="needs-design",
                  dependencies="[WLT-27-2, WLT-27-3]")
        blockers = _story_human_deliverable_blockers(self.project, "WLT-27", "WLT-27-1")
        self.assertEqual({b[0] for b in blockers}, {"WLT-27-2", "WLT-27-3"})

    def test_unblocked_when_design_and_copy_ready(self):
        self._set("WLT-27-2", type="design", owner="human", status="ready")
        self._set("WLT-27-3", type="copy", owner="human", status="ready")
        self._set("WLT-27-1", type="story", owner="agent", status="ready",
                  dependencies="[WLT-27-2, WLT-27-3]")
        self.assertEqual(_story_human_deliverable_blockers(self.project, "WLT-27", "WLT-27-1"), [])

    def test_feature_ordering_dep_does_not_block(self):
        # An old-shape feature→feature dependency (type: story) must NOT be treated as a
        # human deliverable even if its own status is needs-design — no false block (#171).
        self._set("WLT-27-2", type="story", owner="agent", status="needs-design")
        self._set("WLT-27-1", type="story", owner="agent", status="ready",
                  dependencies="[WLT-27-2]")
        self.assertEqual(_story_human_deliverable_blockers(self.project, "WLT-27", "WLT-27-1"), [])

    def test_no_dependencies_never_blocks(self):
        self._set("WLT-27-1", type="story", owner="agent", status="ready", dependencies="[]")
        self.assertEqual(_story_human_deliverable_blockers(self.project, "WLT-27", "WLT-27-1"), [])

    # ── #103 build story-scope gate ───────────────────────────────────────────
    def test_build_refuses_bet_with_stories(self):
        # /build WLT-27 (a bet with 2 stories) must refuse and name a story to pick.
        msg = _build_story_gate(self.project, "build", "WLT-27", None)
        self.assertIsNotNone(msg)
        self.assertIn("story-scoped", msg)
        self.assertIn("2 story", msg)
        self.assertIn("WLT-27-1", msg)  # points at a concrete story to run

    def test_build_refuses_bet_with_no_stories(self):
        # A bet with no stories yet → point at /create-story, not a story id.
        (self.project / "docs" / "bets" / "CB-9").mkdir(parents=True)
        msg = _build_story_gate(self.project, "build", "CB-9", None)
        self.assertIsNotNone(msg)
        self.assertIn("no stories yet", msg)
        self.assertIn("/create-story CB-9", msg)

    def test_build_allows_real_story(self):
        # story_id resolved → no refusal.
        self.assertIsNone(_build_story_gate(self.project, "build", "WLT-27", "WLT-27-1"))

    def test_gate_is_build_only(self):
        # fix/ops are NOT story-scoped — never refused by this gate.
        self.assertIsNone(_build_story_gate(self.project, "fix", "WLT-27", None))
        self.assertIsNone(_build_story_gate(self.project, "ops", "WLT-27", None))

    def test_gate_noop_without_bet(self):
        self.assertIsNone(_build_story_gate(self.project, "build", None, None))

    def test_gate_does_not_fire_on_resume(self):
        # #107: the cockpit's merge-gate resume passes the PARENT bet (--bet WLT-27) +
        # --from-step N without the story scope. The entry gate must NOT re-fire and
        # block the human's merge approval. from_step set → always None.
        self.assertIsNone(_build_story_gate(self.project, "build", "WLT-27", None, from_step=6))
        # sanity: same args WITHOUT from_step still refuses (proves the guard frees it)
        self.assertIsNotNone(_build_story_gate(self.project, "build", "WLT-27", None))


class TestWorkBranchIsolation(unittest.TestCase):
    """#173: a build branch must start from a CLEAN fresh base, never silently stack on
    the previous build's branch — the cause of cumulative, conflicting story PRs (a
    story's PR contained sibling stories' commits because builds branched off the prior
    dirty tree instead of main)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "t@t")
        self._git("config", "user.name", "t")
        (self.repo / "base.txt").write_text("base\n", encoding="utf-8")
        self._git("add", "-A"); self._git("commit", "-qm", "base")
        # a prior-build branch carrying its OWN commit — the thing we must NOT stack on
        self._git("checkout", "-qb", "feat/prev-story")
        (self.repo / "prev.txt").write_text("prev story work\n", encoding="utf-8")
        self._git("add", "-A"); self._git("commit", "-qm", "prev story")

    def tearDown(self):
        self._tmp.cleanup()

    def _git(self, *a):
        return subprocess.run(["git", "-C", str(self.repo), *a],
                              capture_output=True, text=True)

    def test_clean_tree_branches_off_main_not_current(self):
        # on feat/prev-story, clean tree → new branch comes off main, no prev.txt
        b = _ensure_work_branch(self.repo, "feat/new-story")
        self.assertEqual(b, "feat/new-story")
        self.assertFalse((self.repo / "prev.txt").exists())  # did NOT stack on prev

    def test_dirty_tree_stashes_and_starts_clean(self):
        # uncommitted change to prev.txt (committed on feat/prev-story, ABSENT on main)
        # blocks the clean checkout — old code then stacked on feat/prev-story; now it
        # stashes the residue and branches clean off main.
        (self.repo / "prev.txt").write_text("uncommitted residue\n", encoding="utf-8")
        b = _ensure_work_branch(self.repo, "feat/clean-story")
        self.assertEqual(b, "feat/clean-story")
        self.assertEqual((self.repo / "base.txt").read_text(encoding="utf-8"), "base\n")  # off main
        self.assertFalse((self.repo / "prev.txt").exists())            # NOT stacked on prev
        self.assertIn("stash@{0}", self._git("stash", "list").stdout)  # residue preserved, recoverable

    def test_branch_name_uses_clean_context_not_blob(self):
        # the #173 naming half: a build with no user context yields a clean name, never a
        # slug of the loaded bet/story blob (`feat/WLT-27-bet-context-wlt-27-briefmd-…`).
        self.assertEqual(_work_branch_name("build", "WLT-27-2", ""), "feat/WLT-27-2-work")
        blobby = "## Bet context — WLT-27\n\n### brief.md\n---\nid: WLT-27\n"
        self.assertNotIn("bet-context", _work_branch_name("build", "WLT-27-2", "fix login bug"))
        # and a real user context still slugs cleanly
        self.assertEqual(_work_branch_name("build", "WLT-27-2", "fix login bug"),
                         "feat/WLT-27-2-fix-login-bug")


class TestWorktreeIsolation(unittest.TestCase):
    """#174: by default each build runs in its own git WORKTREE branched off main, so
    parallel story builds get independent checkouts and never share the one working
    tree (the root of #173's stacking)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._home = tempfile.TemporaryDirectory()
        self._old = os.environ.get("COMPASS_HOME")
        os.environ["COMPASS_HOME"] = self._home.name
        self.repo = Path(self._tmp.name)
        self._git("init", "-q", "-b", "main")
        self._git("config", "user.email", "t@t")
        self._git("config", "user.name", "t")
        (self.repo / "base.txt").write_text("base\n", encoding="utf-8")
        self._git("add", "-A"); self._git("commit", "-qm", "base")

    def tearDown(self):
        # remove worktrees before temp cleanup so git doesn't choke on the link dirs
        self._git("worktree", "prune")
        os.environ.pop("COMPASS_HOME", None) if self._old is None \
            else os.environ.__setitem__("COMPASS_HOME", self._old)
        self._tmp.cleanup(); self._home.cleanup()

    def _git(self, *a):
        return subprocess.run(["git", "-C", str(self.repo), *a],
                              capture_output=True, text=True)

    def test_creates_worktree_off_main(self):
        wt = _ensure_work_worktree(self.repo, "feat/WLT-27-2-work")
        self.assertIsNotNone(wt)
        self.assertTrue(Path(wt).is_dir())
        self.assertNotEqual(Path(wt).resolve(), self.repo.resolve())   # separate checkout
        self.assertTrue((Path(wt) / "base.txt").exists())              # branched off main
        # the worktree is on its own branch
        head = subprocess.run(["git", "-C", str(wt), "rev-parse", "--abbrev-ref", "HEAD"],
                              capture_output=True, text=True).stdout.strip()
        self.assertEqual(head, "feat/WLT-27-2-work")

    def test_two_stories_get_independent_worktrees(self):
        a = _ensure_work_worktree(self.repo, "feat/WLT-27-2-a")
        b = _ensure_work_worktree(self.repo, "feat/WLT-27-3-b")
        self.assertNotEqual(Path(a).resolve(), Path(b).resolve())      # parallel-safe
        # edits in one don't touch the other
        (Path(a) / "a.txt").write_text("A\n", encoding="utf-8")
        self.assertFalse((Path(b) / "a.txt").exists())

    def test_reuse_existing_worktree_on_resume(self):
        first = _ensure_work_worktree(self.repo, "feat/WLT-27-2-resume")
        again = _ensure_work_worktree(self.repo, "feat/WLT-27-2-resume")
        self.assertEqual(Path(first).resolve(), Path(again).resolve())

    def test_non_git_dir_returns_none(self):
        self.assertIsNone(_ensure_work_worktree(Path(self._home.name), "feat/x"))

    def test_prune_removes_clean_keeps_dirty(self):
        clean = _ensure_work_worktree(self.repo, "feat/done")
        dirty = _ensure_work_worktree(self.repo, "feat/inflight")
        (Path(dirty) / "wip.txt").write_text("uncommitted\n", encoding="utf-8")  # in-flight
        removed = prune_worktrees(self.repo)
        self.assertEqual(len(removed), 1)        # exactly the clean one
        self.assertFalse(Path(clean).exists())   # finished worktree removed
        self.assertTrue(Path(dirty).exists())    # in-flight worktree kept

    def test_cleanup_merged_scoped_to_that_branch(self):
        # #104: at merge time, prune ONLY the merged unit's worktree + its local branch;
        # a sibling in-flight build is untouched.
        merged = _ensure_work_worktree(self.repo, "feat/WLT-27-2-work")
        sibling = _ensure_work_worktree(self.repo, "feat/WLT-27-3-work")
        (Path(sibling) / "wip.txt").write_text("in-flight\n", encoding="utf-8")
        removed = _cleanup_merged_worktree(self.repo, "feat/WLT-27-2-work")
        self.assertEqual([Path(p).resolve() for p in removed], [Path(merged).resolve()])
        self.assertFalse(Path(merged).exists())                              # merged worktree gone
        self.assertTrue(Path(sibling).exists())                              # sibling kept
        self.assertEqual(self._git("branch", "--list", "feat/WLT-27-2-work").stdout.strip(), "")
        self.assertIn("feat/WLT-27-3-work", self._git("branch", "--list").stdout)  # sibling branch kept

    def test_cleanup_merged_keeps_dirty_worktree(self):
        # a worktree with uncommitted work is NEVER force-removed, even if named.
        wt = _ensure_work_worktree(self.repo, "feat/WLT-27-4-work")
        (Path(wt) / "wip.txt").write_text("uncommitted\n", encoding="utf-8")
        removed = _cleanup_merged_worktree(self.repo, "feat/WLT-27-4-work")
        self.assertEqual(removed, [])
        self.assertTrue(Path(wt).exists())

    def test_cleanup_merged_no_branch_is_noop(self):
        self.assertEqual(_cleanup_merged_worktree(self.repo, None), [])


class TestModuleMismatchWarning(unittest.TestCase):
    """#40: warn when the running orchestrator is a vendored framework copy that differs
    from --compass-dir, but never false-warn for an installed (site-packages) module."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        # a "vendored framework copy" = a compass dir with workflows/ (+ agents/)
        self.vendored = self.root / "home-app" / "compass"
        (self.vendored / "workflows").mkdir(parents=True)
        (self.vendored / "agents").mkdir(parents=True)
        # the real target framework
        self.real = self.root / "compass" / "compass"
        (self.real / "workflows").mkdir(parents=True)
        # an installed-package dir (no workflows/agents — like site-packages)
        self.installed = self.root / "site-packages" / "compass"
        (self.installed / "orchestrator").mkdir(parents=True)

    def tearDown(self):
        self._tmp.cleanup()

    def test_none_without_compass_dir(self):
        self.assertIsNone(_module_mismatch_warning(None, running=self.vendored))

    def test_none_when_running_matches_target(self):
        self.assertIsNone(_module_mismatch_warning(str(self.real), running=self.real))

    def test_warns_on_vendored_mismatch(self):
        w = _module_mismatch_warning(str(self.real), running=self.vendored)
        self.assertIsNotNone(w)
        self.assertIn("stale-module risk", w)
        self.assertIn(str(self.vendored), w)

    def test_no_warn_for_installed_package(self):
        # mismatch, but the running dir isn't a framework checkout (no workflows/agents)
        self.assertIsNone(_module_mismatch_warning(str(self.real), running=self.installed))


class TestTelemetryGitignore(unittest.TestCase):
    """#175: orchestrator run state (jsonl telemetry + step artifacts) must stay OUT of
    git — it dirtied the tree every run (defeating fresh-base isolation) and got swept
    into code PRs by the engineer's `git add -A`."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.project = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_ensure_runs_dir_writes_gitignore(self):
        d = ensure_runs_dir(self.project)
        gi = (d / ".gitignore").read_text(encoding="utf-8")
        self.assertEqual(d, self.project / "docs" / "orchestrator-runs")
        self.assertIn("*", gi)
        self.assertIn("!.gitignore", gi)

    def test_log_step_creates_gitignore(self):
        log_step(self.project, "run1", "build", "WLT-27", 1, "engineer",
                 "implement-story", "claude-code", None, "**TL;DR** did the thing\n")
        gi = self.project / "docs" / "orchestrator-runs" / ".gitignore"
        self.assertTrue(gi.exists())                                  # telemetry self-ignores
        self.assertTrue((self.project / "docs" / "orchestrator-runs" / "runs.jsonl").exists())


class TestSiblingOverlap(unittest.TestCase):
    """#26: a story-scoped build that overlaps an in-flight build of the same module
    (shared area_tags, or a declared dependency) warns — same-module stories merge
    serially."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.project = Path(self._tmp.name)
        self.stories = self.project / "docs" / "bets" / "WLT-27" / "stories"

    def tearDown(self):
        self._tmp.cleanup()

    def _story(self, sid, *, area_tags="[]", dependencies="[]"):
        d = self.stories / sid
        d.mkdir(parents=True, exist_ok=True)
        (d / "story.md").write_text(
            f"---\nid: {sid}\narea_tags: {area_tags}\ndependencies: {dependencies}\n---\n# {sid}\n",
            encoding="utf-8")

    def _inflight(self, sid):
        return {f"build--{sid}--x": {"workflow": "build", "ended": False, "story_id": sid}}

    def test_read_fm_list_inline_and_block(self):
        self._story("WLT-27-2", area_tags="[accounts, csv]")
        self.assertEqual(_read_story_fm_list(self.project, "WLT-27", "WLT-27-2", "area_tags"),
                         {"accounts", "csv"})

    def test_shared_area_overlaps(self):
        self._story("WLT-27-3", area_tags="[accounts, csv]")
        self._story("WLT-27-4", area_tags="[accounts]")
        overlaps = _overlapping_inflight_builds(self.project, "WLT-27", "WLT-27-4",
                                                runs=self._inflight("WLT-27-3"))
        self.assertEqual(len(overlaps), 1)
        self.assertEqual(overlaps[0][0], "WLT-27-3")
        self.assertIn("shared area: accounts", overlaps[0][1])

    def test_dependency_overlaps(self):
        self._story("WLT-27-3", area_tags="[]")
        self._story("WLT-27-4", area_tags="[]", dependencies="[WLT-27-3]")
        overlaps = _overlapping_inflight_builds(self.project, "WLT-27", "WLT-27-4",
                                                runs=self._inflight("WLT-27-3"))
        self.assertEqual([o[0] for o in overlaps], ["WLT-27-3"])
        self.assertIn("dependency", overlaps[0][1])

    def test_disjoint_no_overlap(self):
        self._story("WLT-27-3", area_tags="[dashboard]")
        self._story("WLT-27-4", area_tags="[accounts]")
        self.assertEqual(
            _overlapping_inflight_builds(self.project, "WLT-27", "WLT-27-4",
                                         runs=self._inflight("WLT-27-3")), [])

    def test_ended_build_and_self_ignored(self):
        self._story("WLT-27-4", area_tags="[accounts]")
        runs = {"a": {"workflow": "build", "ended": True, "story_id": "WLT-27-3"},   # ended
                "b": {"workflow": "build", "ended": False, "story_id": "WLT-27-4"}}  # self
        self.assertEqual(
            _overlapping_inflight_builds(self.project, "WLT-27", "WLT-27-4", runs=runs), [])


class TestRunScopedArtifacts(unittest.TestCase):
    """#27: concurrent same-workflow runs write step artifacts to run-scoped dirs so
    they don't clobber each other's step-*.md."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.project = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_step_dir_run_scoped_vs_flat(self):
        flat = _step_dir(self.project, "build")
        scoped = _step_dir(self.project, "build", "build--WLT-27-2--x")
        self.assertTrue(str(flat).endswith("orchestrator-runs/build"))
        self.assertTrue(str(scoped).endswith("orchestrator-runs/build/build--WLT-27-2--x"))
        self.assertTrue(scoped.is_dir())

    def test_concurrent_runs_dont_clobber(self):
        a = _write_artifact(self.project, "build", 1, "engineer", "implement-story",
                            "AAA content", "build--WLT-27-2--x")
        b = _write_artifact(self.project, "build", 1, "engineer", "implement-story",
                            "BBB content", "build--WLT-27-3--y")
        self.assertNotEqual(a, b)                       # different run-scoped paths
        self.assertIn("AAA content", a.read_text())
        self.assertIn("BBB content", b.read_text())     # NOT overwritten by the other run

    def test_run_artifact_dir_prefers_per_run_then_flat(self):
        from compass.orchestrator.cockpit import _run_artifact_dir
        rid = "build--WLT-27-4--z"
        _write_artifact(self.project, "build", 1, "e", "t", "x", rid)  # creates per-run dir
        run = {"project_dir": str(self.project), "workflow": "build", "run_id": rid}
        self.assertTrue(str(_run_artifact_dir(run)).endswith(rid))     # per-run preferred
        # a run with no per-run dir → flat fallback
        legacy = {"project_dir": str(self.project), "workflow": "build", "run_id": "nope--1"}
        self.assertTrue(str(_run_artifact_dir(legacy)).endswith("orchestrator-runs/build"))


if __name__ == "__main__":
    unittest.main()
