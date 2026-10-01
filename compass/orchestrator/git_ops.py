"""
Branch and worktree management for write-mode orchestrator runs.

Split out of run.py (which otherwise interleaves this git/worktree plumbing
with CLI parsing, Jira resolution, PR lifecycle, and the step-dispatch loop).
Every public function here shells out to `git` itself — callers pass a
project_dir and get back a branch name / worktree path / list of paths acted
on; none of it knows about workflow steps or agents.
"""
import re
import sys
from pathlib import Path

# Workflow → branch type prefix (config.yaml branch_pattern `<type>/<id>-<slug>`).
_WORKFLOW_BRANCH_TYPE = {
    "fix": "fix",
    "ops": "ops",
    "triage": "fix",
    "build": "feat",
    "create-story": "feat",
    "create-brief": "feat",
    "create-epic-architecture": "feat",
}


_SLUG_STOPWORDS = {
    "the", "a", "an", "i", "we", "to", "of", "in", "on", "at", "is", "it", "its",
    "im", "and", "or", "but", "while", "when", "get", "got", "see", "my", "me",
    "as", "be", "that", "this", "with", "for", "should", "user", "am", "are",
}


def _slug(text: str, words: int = 6) -> str:
    """Lowercase hyphen-slug from the first few MEANINGFUL words (stopwords dropped)."""
    import re as _re
    cleaned = _re.sub(r"[^a-z0-9\s-]", "", (text or "").lower())
    toks = [w for w in cleaned.split() if w and w not in _SLUG_STOPWORDS]
    if not toks:
        toks = cleaned.split()  # fallback: all words were stopwords
    slug = "-".join(toks[:words]).strip("-")
    return slug[:40] or "work"


def _work_branch_name(workflow: str, epic_id: str, context: str) -> str:
    """
    Branch name per config.yaml `<type>/<id>-<slug>` (#99). Strips a leading
    'bug:'/'incident:' label from the context before slugging.
    """
    typ = _WORKFLOW_BRANCH_TYPE.get(workflow, "chore")
    ctx = re.sub(r"^\s*(bug|incident|enhancement|change)\s*:\s*", "", context or "", flags=re.IGNORECASE)
    slug = _slug(ctx)
    return f"{typ}/{epic_id}-{slug}" if epic_id else f"{typ}/{slug}"


def _prior_run_branch(run_id):
    """#157: on a `--from-step` resume, recover the branch the ORIGINAL run recorded
    in its `run_start` (event spine), so the resume reuses it instead of cutting a
    NEW branch from the resume's input. The live bug: a dashboard merge-gate resume
    re-ran the branch logic with the bet-context blob as `context`, producing a
    garbage branch `feat/WLT-26-bet-context-wlt-26-briefmd-----id`. Returns the
    recorded branch name, or None (no spine / no branch recorded)."""
    if not run_id:
        return None
    try:
        from . import events as _ev
        for e in reversed(_ev.load_events()):
            if (e.get("run_id") == run_id and e.get("type") == _ev.RUN_START
                    and e.get("branch")):
                return e["branch"]
    except Exception:
        return None
    return None


def _ensure_work_branch(project_dir, branch_name: str):
    """
    Put write-mode work on a branch, never on main/master (#99), branched from a
    FRESH base (#143). Returns the branch the work will run on, or None if
    project_dir isn't a git repo.

    Behavior:
      - already on `branch_name` (a resume) → reuse it
      - `branch_name` already exists → switch to it (resume / re-run)
      - otherwise → create `branch_name` from a fresh base (fetched `origin/main`),
        **never stacking on whatever feature branch happens to be checked out.**

    #143: the old code reused *any* current non-main branch, so a leftover branch
    from a prior run got stacked on — carrying its (already-merged) commits into
    the next fix's PR → merge conflicts + review scope-creep (live: PR #116
    conflicted because an accounts fix stacked on the merged welcome-back branch).
    Falls back to the current HEAD when there's no remote/base or the clean
    checkout fails (e.g. a dirty tree).
    """
    import subprocess

    def git(*args):
        return subprocess.run(
            ["git", "-C", str(project_dir), *args],
            capture_output=True, text=True,
        )

    if git("rev-parse", "--is-inside-work-tree").returncode != 0:
        return None
    current = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if current == branch_name:
        return branch_name  # resume — already on the work branch
    if git("rev-parse", "--verify", "--quiet", branch_name).returncode == 0:
        # branch already exists (resume / re-run) — switch to it, don't recreate
        return branch_name if git("checkout", branch_name).returncode == 0 else (current or None)
    # fresh branch — base it on a clean origin/main, NOT the current (possibly
    # leftover) branch. Fetch best-effort; fall through local refs.
    git("fetch", "origin", "--quiet")
    base = next(
        (b for b in ("origin/main", "origin/master", "main", "master")
         if git("rev-parse", "--verify", "--quiet", b).returncode == 0),
        None,
    )
    if base and git("checkout", "-b", branch_name, base).returncode == 0:
        return branch_name
    # #173: the clean checkout failed — almost always a DIRTY TREE (leftover work +
    # orchestrator telemetry from the prior run). The old code silently fell back to
    # `checkout -b` from the CURRENT branch, stacking the new story's work on the
    # previous one → cumulative, conflicting PRs (live: WLT-27-2's PR contained
    # WLT-27-1's commits; -3 contained both). Instead, STASH the dirty tree (incl.
    # untracked) so the work branch starts CLEAN from the fresh base. The stash is
    # recoverable (`git stash list`) — nothing is discarded — and we do NOT pop it
    # onto the new branch (that would re-introduce the contamination).
    if base:
        stash = git("stash", "push", "--include-untracked",
                    "-m", f"compass auto-stash before {branch_name}")
        stashed = stash.returncode == 0 and "No local changes" not in stash.stdout
        if stashed and git("checkout", "-b", branch_name, base).returncode == 0:
            print(f"[branch] stashed a dirty tree to start '{branch_name}' clean from "
                  f"{base} — prior residue is on the stash (recover via `git stash list`), "
                  f"NOT stacked onto this branch (#173)")
            return branch_name
    # last resort — no remote/base (or stash failed): current HEAD. May stack; loud.
    made = git("checkout", "-b", branch_name)
    if made.returncode == 0:
        print(f"[branch] WARNING: could not isolate from a fresh base — '{branch_name}' "
              f"is cut from the current HEAD and MAY include prior work (#173).",
              file=sys.stderr)
        return branch_name
    return current or None


def _worktree_root(project_dir) -> Path:
    """#174: where isolated build worktrees live — under ~/.compass (OUTSIDE the repo),
    namespaced by project label, so concurrent story builds never share a working tree."""
    from . import events as _ev
    return _ev.compass_home() / "worktrees" / _ev.project_label(project_dir)


def _ensure_work_worktree(project_dir, branch_name: str):
    """#174: create (or reuse) a git WORKTREE on `branch_name`, based on a fresh
    origin/main, at a path outside the repo. Returns the worktree Path, or None if
    project_dir isn't a git repo or the worktree can't be created (the caller then
    falls back to the single-tree `_ensure_work_branch`). Unlike `_ensure_work_branch`
    — which switches the ONE working tree, so two builds in flight collide on the
    shared index (#173's stacking) — a worktree gives each build its own checkout, so
    genuinely *parallel* story builds are isolated. The worktree shares the repo's .git
    (commits land in the same object store), so `gh pr create` from it works unchanged.
    """
    import subprocess

    def git(*args):
        return subprocess.run(["git", "-C", str(project_dir), *args],
                              capture_output=True, text=True)

    if git("rev-parse", "--is-inside-work-tree").returncode != 0:
        return None
    wt = _worktree_root(project_dir) / branch_name.replace("/", "__")
    # already present (resume / re-run) → reuse the existing checkout
    if wt.exists():
        return wt
    wt.parent.mkdir(parents=True, exist_ok=True)
    git("fetch", "origin", "--quiet")  # best-effort
    base = next(
        (b for b in ("origin/main", "origin/master", "main", "master")
         if git("rev-parse", "--verify", "--quiet", b).returncode == 0),
        None,
    )
    if git("rev-parse", "--verify", "--quiet", branch_name).returncode == 0:
        add = git("worktree", "add", str(wt), branch_name)   # branch exists → attach
    elif base:
        add = git("worktree", "add", "-b", branch_name, str(wt), base)  # fresh off base
    else:
        add = git("worktree", "add", "-b", branch_name, str(wt))  # no base → current HEAD
    return wt if add.returncode == 0 else None


def prune_worktrees(project_dir) -> list:
    """#175: housekeeping — remove finished (CLEAN) compass-managed build worktrees so
    they don't accumulate under ~/.compass/worktrees/. A worktree with uncommitted
    changes (an in-flight build) is KEPT; a clean one (work committed + pushed, or
    paused at a gate) is removed — a resume recreates it from the branch. Runs
    `git worktree prune` to clear admin entries for already-gone dirs. Returns the list
    of removed paths. Best-effort; never raises."""
    import subprocess

    def git(*args, cwd=None):
        return subprocess.run(["git", "-C", str(cwd or project_dir), *args],
                              capture_output=True, text=True)

    if git("rev-parse", "--is-inside-work-tree").returncode != 0:
        return []
    # resolve to dodge the macOS /var↔/private/var symlink (git emits the realpath)
    root = str(_worktree_root(project_dir).resolve())
    removed = []
    listing = git("worktree", "list", "--porcelain").stdout
    paths = [ln[len("worktree "):] for ln in listing.splitlines()
             if ln.startswith("worktree ")]
    for p in paths:
        if not str(Path(p).resolve()).startswith(root):
            continue  # only OUR build worktrees, never the main checkout
        dirty = git("status", "--porcelain", cwd=p).stdout.strip()
        if dirty:
            continue  # in-flight build — leave it
        if git("worktree", "remove", p).returncode == 0:
            removed.append(p)
    git("worktree", "prune")
    return removed


def _cleanup_merged_worktree(project_dir, work_branch) -> list:
    """#104: after a PR is MERGED (auto-merge path), remove THIS unit's worktree and
    delete its now-merged local branch — so finished worktrees don't accumulate under
    ~/.compass/worktrees/ until the next `--wbs` sweep. Scoped to `work_branch` only, so
    a sibling in-flight build is never touched. Safe-delete only (`branch -d`, never -D);
    a worktree with uncommitted changes is left in place. Best-effort; never raises.
    Returns the list of removed worktree paths (for logging/tests). The manual-merge
    path is still covered by the opportunistic prune_worktrees()."""
    import subprocess
    if not work_branch:
        return []

    def git(*args, cwd=None):
        try:
            return subprocess.run(["git", "-C", str(cwd or project_dir), *args],
                                  capture_output=True, text=True)
        except Exception:
            class _R:  # never raise into the run
                returncode, stdout, stderr = 1, "", ""
            return _R()

    if git("rev-parse", "--is-inside-work-tree").returncode != 0:
        return []
    root = str(_worktree_root(project_dir).resolve())
    removed = []
    listing = git("worktree", "list", "--porcelain").stdout
    # parse porcelain: pair each `worktree <path>` with its following `branch <ref>`
    path = None
    for ln in listing.splitlines():
        if ln.startswith("worktree "):
            path = ln[len("worktree "):]
        elif ln.startswith("branch ") and path is not None:
            ref = ln[len("branch "):]                       # e.g. refs/heads/feat/WLT-28-4-work
            if ref.endswith(f"/{work_branch}") or ref == f"refs/heads/{work_branch}":
                if (str(Path(path).resolve()).startswith(root)          # only OUR worktrees
                        and not git("status", "--porcelain", cwd=path).stdout.strip()):
                    if git("worktree", "remove", path).returncode == 0:
                        removed.append(path)
            path = None
    git("worktree", "prune")
    git("branch", "-d", work_branch)   # safe delete — no-op if not fully merged locally
    return removed
