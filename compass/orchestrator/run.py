#!/usr/bin/env python3
"""
Compass orchestrator CLI — v0.4-alpha (current alpha tracked in CHANGELOG.md)

Usage:
    python3 -m compass.orchestrator.run <workflow> [options]
    python3 -m compass.orchestrator.run --pipeline w1,w2,w3 [options]

    compass run <workflow> [options]          # if installed via pip

Options:
    --project-dir PATH   Root of the project repo (default: current directory)
    --dry-run            Print the dispatch graph without executing
    --pipeline W1,W2,…   Run multiple workflows in sequence, passing context
                         from each to the next (e.g. create-brief,
                         create-bet-architecture,build)
    --step N             Execute only step N in the single workflow (ignored
                         when --pipeline is set)
    --from-step N        Resume from step N, loading steps 1..N-1 from prior
                         artifact files (use after a HITL rejection)
    --context TEXT       Inline context string for the first step of the first
                         workflow (skips the interactive input prompt)
    --model ID           Model ID override applied to whichever host is selected
                         (e.g., claude-opus-4-8, gpt-4o, gemini-2.0-flash)
    --no-write           Print output to stdout only; do not write artifact files
"""
import argparse
import os
import re
import sys
import textwrap
from pathlib import Path
from datetime import datetime


# ─────────────────────────────────────────────────────────────────────────────
# Utility helpers
# ─────────────────────────────────────────────────────────────────────────────

class BudgetExceeded(RuntimeError):
    """Raised mid-run when accumulated spend crosses --max-cost (#116). Halts the
    run cleanly with a resume hint instead of burning more budget."""


def _read_preferred_hosts(agent_file: Path) -> list:
    """Parse preferred_hosts from agent file YAML frontmatter."""
    text = agent_file.read_text(encoding="utf-8")
    fm_match = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if not fm_match:
        return ["claude"]
    fm_text = fm_match.group(1)
    ph_match = re.search(r'^preferred_hosts:\s*\[([^\]]+)\]', fm_text, re.MULTILINE)
    if not ph_match:
        return ["claude"]
    return [h.strip() for h in ph_match.group(1).split(",")]


def _review_diff(project_dir, max_chars: int = 50000) -> str:
    """#138: the branch diff vs its base, for the Reviewer. The reviewer runs on
    codex/gemini — bare API adapters with NO tools (no gh/filesystem/shell), so it
    cannot fetch the PR itself (live: Codex asked the user to paste the diff). The
    orchestrator fetches it and injects it as context. Returns '' if unavailable."""
    import subprocess
    d = ""
    for base in ("origin/main", "main", "origin/master", "master"):
        try:
            r = subprocess.run(
                ["git", "-C", str(project_dir), "diff", f"{base}...HEAD"],
                capture_output=True, text=True, timeout=30)
        except Exception:
            continue
        if r.returncode == 0 and r.stdout.strip():
            d = r.stdout
            break
    if not d:  # fallback: uncommitted working-tree changes
        try:
            r = subprocess.run(["git", "-C", str(project_dir), "diff", "HEAD"],
                               capture_output=True, text=True, timeout=30)
            d = r.stdout if r.returncode == 0 else ""
        except Exception:
            d = ""
    if len(d) > max_chars:
        d = d[:max_chars] + "\n…[diff truncated]"
    return d


def _uncommitted_code(project_dir) -> list:
    """#145: CODE files left uncommitted after a write-mode run — the work isn't
    delivered (no commit → no PR → no deploy; live: a `/fix` left AccountCard.tsx
    uncommitted with no PR, so nothing shipped). Excludes the orchestrator's own
    bookkeeping (docs/orchestrator-runs/, docs/role-activity/, *.jsonl) so only
    real source/test changes count. [] if not a git repo."""
    import subprocess
    try:
        r = subprocess.run(["git", "-C", str(project_dir), "status", "--porcelain"],
                           capture_output=True, text=True, timeout=15)
    except Exception:
        return []
    if r.returncode != 0:
        return []
    skip = ("docs/orchestrator-runs/", "docs/role-activity/")
    out = []
    for line in r.stdout.splitlines():
        path = line[3:].strip().strip('"')
        if not path or path.endswith(".jsonl"):
            continue
        if any(s in path for s in skip):
            continue
        out.append(path)
    return out


def _is_merge_gate(title: str) -> bool:
    """#147: a HITL gate whose approval should MERGE the PR (delivery closure).
    Detected by 'merge' in the gate title (e.g. 'HITL gate — approve merge')."""
    return "merge" in (title or "").lower()


def _open_pr_url(project_dir, branch):
    """#157: best-effort URL of the open PR for `branch` (so a merge gate can point
    the operator at it). Returns the URL or None — never raises into the run."""
    if not branch:
        return None
    import json as _json
    import subprocess
    try:
        r = subprocess.run(["gh", "pr", "view", branch, "--json", "url,state"],
                           cwd=str(project_dir), capture_output=True, text=True, timeout=60)
    except Exception:
        return None
    if r.returncode != 0:
        return None
    try:
        o = _json.loads(r.stdout)
        return o.get("url") if o.get("state") == "OPEN" else None
    except (ValueError, TypeError):
        return None


def _pr_url_any_state(project_dir, branch):
    """#71: the PR URL for `branch` regardless of state (open OR merged) — the fix
    record links its PR even on a resume/retro projection. Best-effort; None on failure."""
    if not branch:
        return None
    import json as _json
    import subprocess
    try:
        r = subprocess.run(["gh", "pr", "view", branch, "--json", "url"],
                           cwd=str(project_dir), capture_output=True, text=True, timeout=60)
        return _json.loads(r.stdout).get("url") if r.returncode == 0 else None
    except Exception:
        return None


def _merge_next_steps(pr_url, bet_id) -> str:
    """#157: the explicit next-step block printed when a MERGE gate is approved but
    NOT auto-merged — so the operator isn't left at '[handle manually]' with no idea
    what to do (the live gap: gate cleared, run 'completed', nothing shipped)."""
    pr = f"merge the PR — {pr_url}" if pr_url else "merge the PR on your host"
    nxt = f"/create-story {bet_id}" if bet_id else "/create-story <bet> for the next slice"
    return (f"\n✅ Approved — your turn to ship:\n"
            f"   1. {pr}\n"
            f"   2. Then cut the next slice: {nxt}\n"
            f"   (Set COMPASS_AUTO_MERGE=1 to have approval merge for you.)")


def _merge_pr(project_dir, branch):
    """#147: on approval of a merge gate, merge the PR for `branch` — the delivery
    closure (merge → the host auto-deploys on main, e.g. Vercel). Best-effort:
    returns (ok, message), never raises into the run; falls back to manual merge."""
    import json as _json
    import subprocess

    def gh(args):
        try:
            return subprocess.run(["gh", *args], cwd=str(project_dir),
                                  capture_output=True, text=True, timeout=60)
        except Exception:
            return None

    view = gh(["pr", "view", branch, "--json", "number,state,url"])
    if not view or view.returncode != 0:
        return (False, f"no open PR found for '{branch}' (gh unavailable or none) — merge manually")
    try:
        pr = _json.loads(view.stdout)
    except Exception:
        return (False, "could not read PR info — merge manually")
    if pr.get("state") != "OPEN":
        return (False, f"PR {pr.get('url')} is {pr.get('state', '?')}, not OPEN — nothing to merge")
    merged = gh(["pr", "merge", str(pr["number"]), "--squash", "--delete-branch"])
    if merged and merged.returncode == 0:
        return (True, f"merged PR {pr['url']} (squash) — deploy follows (host auto-deploys on main)")
    err = ((merged.stderr if merged else "") or "").strip()[:200]
    return (False, f"merge failed for PR {pr.get('url')}: {err or 'unknown'} — check CI/conflicts, merge manually")


_CODE_WORKFLOWS = ("fix", "build", "ops")

# #92: after one of these code-producing steps commits+pushes, the orchestrator runs
# the CI-parity check suite in the worktree and opens the PR only on green.
_CHECK_TASKS = frozenset({"triage-and-fix", "implement-story", "apply-ops-change",
                          "respond-to-review"})

# Per-stack default check suite — CI-parity commands the orchestrator runs to VERIFY a
# branch before opening a PR (not the agent's self-report). The project overrides via
# `config.yaml checks:` to mirror its exact CI. Install-first kills the missing-deps class.
_STACK_CHECKS = {
    "nextjs-ts": ["pnpm install --frozen-lockfile", "pnpm lint", "pnpm typecheck",
                  "pnpm test", "pnpm build"],
    "dotnet-blazor": ["dotnet format --verify-no-changes", "dotnet build -c Release",
                      "dotnet test"],
}

# #159: workflows whose WHOLE JOB is to author a doc artifact (brief, story,
# foundation/portfolio/architecture docs), reviewed via their HITL gate — not a PR.
_AUTHORING_WORKFLOWS = (
    "setup-product", "setup-foundation-architecture", "create-bet-portfolio",
    "create-brief", "create-bet-architecture", "create-story",
)

# #179: every PRODUCING workflow — authoring (docs) OR code (build/fix/ops) — needs to
# write, so write is the DEFAULT, not an opt-in. A producing workflow run read-only is
# useless: the claude-code host runs read-only, so every file-write hangs on a
# permission prompt no headless UI can answer → the agent burns the turn and goes red
# (live: WLT-27-5/6 builds launched without the checkbox → engineer wrote nothing). The
# old opt-in for code workflows was pure friction — the branch-never-main discipline
# (#99) already protects `main`, so the checkbox guarded nothing. `--dry-run` is the
# explicit read-only override; read-only reporting workflows (status/dashboard/…) just
# never request write and aren't listed here.
_WRITE_BY_DEFAULT = _AUTHORING_WORKFLOWS + _CODE_WORKFLOWS


def _resolve_allow_write(workflow_name: str, allow_write: bool) -> bool:
    """#179: a producing workflow (authoring or code) writes by default; everything
    else keeps the caller's choice. Extends #159 (authoring-only) to build/fix/ops."""
    return True if workflow_name in _WRITE_BY_DEFAULT else allow_write


def _delivery_warning(workflow_name: str, leftover: list) -> str:
    """#145/#150: the end-of-run 'work not delivered' warning, tailored by workflow.
    Code workflows (fix/build/ops) ship via PR → deploy; doc workflows (create-brief
    /-story/-architecture, setup-*) deliver the artifact itself, so 'no deploy' is
    nonsensical — just say 'commit the artifacts'."""
    shown = ", ".join(leftover[:5]) + ("…" if len(leftover) > 5 else "")
    if workflow_name in _CODE_WORKFLOWS:
        return (f"⚠ DELIVERY INCOMPLETE — {len(leftover)} code file(s) left "
                f"uncommitted ({shown}). The work is NOT delivered: no commit → "
                f"no PR → no deploy. Commit the change + open a PR before merge.")
    return (f"⚠ ARTIFACTS UNCOMMITTED — {len(leftover)} file(s) written but not "
            f"committed ({shown}). The work is on disk but unsaved — commit the "
            f"artifact(s) (e.g. the brief / status docs) to keep it.")


def _with_review_context(user_message: str, diff: str) -> str:
    """Prepend the code-under-review diff so a tool-less reviewer can actually
    review it (#138). No-op when there's no diff."""
    if not diff:
        return user_message
    return ("## Code under review — `git diff` of the work branch vs its base\n"
            "(You have no repo/PR tool access on this host; review THIS diff.)\n\n"
            "**Scope (#95): review ONLY this diff.** Every BLOCKER/ISSUE MUST cite a "
            "file + line that appears BELOW. Do NOT comment on files not shown here, and "
            "do NOT raise the reachability / wiring / test-coverage of code this diff "
            "did not change — that is OUT OF SCOPE for this PR (at most a NIT note, never "
            "a gating finding). If you cannot tie a concern to a changed line, omit it.\n\n"
            f"```diff\n{diff}\n```\n\n---\n\n" + user_message)


def _remap_claude_cli(preferred_hosts: list) -> list:
    """#120: route Claude steps to the subscription-backed CLI host when opted in
    (--claude-cli / COMPASS_CLAUDE_HOST=cli). Remaps ONLY `claude` → `claude-code`;
    reviewer hosts (codex/gemini) are untouched, preserving cross-model review
    independence (the no-same-host-self-review principle)."""
    return ["claude-code" if h == "claude" else h for h in preferred_hosts]


def _remap_codex_cli(preferred_hosts: list) -> list:
    """#155: route Codex steps to the subscription-backed Codex CLI host when opted in
    (--codex-cli / COMPASS_CODEX_HOST=cli). Remaps ONLY `codex` → `codex-cli`. This is
    what makes the REVIEWER (preferred_hosts [codex, gemini]) reachable for a CLI-only
    operator with no API key — codex ≠ claude, so review independence is preserved."""
    return ["codex-cli" if h == "codex" else h for h in preferred_hosts]


# #125 dispatch-on-outcome: a step whose agent REFUSES (per [refuse-escalate])
# must HALT the run, not let the workflow cascade into steps that also refuse
# (live evidence: a misrouted /ops run cascaded 4 refusals then crashed on an API
# limit). Refusals carry a structured sentinel — a line beginning `REFUSE:` /
# `[REFUSE]` / `**Refuse(d/ing):**` — so detection is exact, not a fuzzy scan of
# prose that merely discusses refusing. Only the first few lines are inspected.
_REFUSAL_RE = re.compile(
    r"^\s*(?:\*\*|\[)?\s*REFUS(?:E|ED|ING)\b", re.IGNORECASE
)


def _is_refusal(result: str) -> bool:
    """True if the agent output leads with a refusal sentinel (#125)."""
    if not result:
        return False
    for line in result.strip().splitlines()[:5]:
        if _REFUSAL_RE.match(line):
            return True
    return False


# #149: a step that *ran* isn't a step that *succeeded*. Beyond the hard REFUSE:
# sentinel (#125, which halts), agents often emit a SOFT non-completion — a plan, a
# confabulated block, a permission claim — yet the step was still marked ✓ done.
# These high-precision phrases (seen repeatedly in live runs) classify such output
# as "incomplete" so the dashboard shows ✗, not ✓. Conservative by design: a normal
# completed step doesn't contain "permission not granted" or "the plan is ready".
_INCOMPLETE_RE = re.compile(
    r"permission(?:s)?\s+(?:to\s+\w+\s+)?(?:is\s+)?not\s+(?:been\s+)?(?:auto-)?(?:granted|approved)"
    r"|write\s+permission[^\n]{0,60}(?:not|grant|approve)"
    r"|not\s+auto-approved"
    r"|can'?t\s+access\s+the\s+(?:codebase|repo|home-app)"
    r"|don'?t\s+have\s+(?:read|write|file)?\s*access"
    r"|the\s+plan\s+is\s+ready"
    r"|here'?s\s+the\s+plan"
    r"|approve\s+the\s+[\"']?(?:exit\s+plan|plan)"
    r"|\bblocker:\s"
    r"|requires?\s+(?:a\s+)?permission\s+grant"
    # #159: the no-TTY write-block class the live create-brief hit — the agent
    # narrates "please click Allow" / "waiting on permission approval" / "the
    # permission dialog should be appearing" instead of writing. High-precision:
    # a completed step never asks the operator to approve a write dialog.
    r"|click\s+[\"']?allow[\"']?"
    r"|permission\s+dialog"
    r"|(?:waiting|pending|blocked)\s+on[^\n]{0,40}permission"
    r"|(?:awaiting|pending)[^\n]{0,30}permission"
    r"|approve\s+(?:the\s+|both\s+|two\s+)?(?:file\s+)?writes?\b"
    r"|please\s+approve[^\n]{0,30}(?:write|file|dialog|prompt)",
    re.IGNORECASE,
)


def _classify_outcome(result: str) -> tuple:
    """Classify a step's output as ('done', '') or ('incomplete', reason) (#149).
    Used to mark each step ✓/✗ in the dashboard — the orchestrator confirms a step
    *did its job*, not just that it returned. Conservative: defaults to done."""
    if not result or not result.strip():
        return ("incomplete", "empty output — the step produced nothing")
    m = _INCOMPLETE_RE.search(result)
    if m:
        return ("incomplete", f"output signals a block/plan, not completed work (\"{m.group(0)[:40]}…\")")
    return ("done", "")


def _read_agent_tools(agent_file: Path) -> list:
    """
    Parse the optional `executor_tools:` list from agent frontmatter (#87 slice 1).

    Distinct from `required_tools`/`optional_tools` (abstract capability
    declarations): `executor_tools` names the concrete read tools the
    orchestrator grants this agent during a tool-using run (e.g. engineer.md
    `executor_tools: [read_file, glob, grep]`). When present AND the selected
    host supports tool-use, the agent runs a tool loop instead of a single-shot
    call. Absent → empty list → single-shot path (unchanged).
    """
    text = agent_file.read_text(encoding="utf-8")
    fm_match = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if not fm_match:
        return []
    t_match = re.search(r'^executor_tools:\s*\[([^\]]+)\]', fm_match.group(1), re.MULTILINE)
    if not t_match:
        return []
    return [t.strip() for t in t_match.group(1).split(",") if t.strip()]


def _read_model_tier(agent_file: Path) -> str:
    """Optional `model_tier:` frontmatter (#115). 'deep' → the frontier model
    (Opus for Claude); absent/anything else → the economy default (Sonnet).
    No agent ships 'deep' — opt up here when an agent needs the frontier model."""
    text = agent_file.read_text(encoding="utf-8")
    fm = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if not fm:
        return ""
    m = re.search(r'^model_tier:\s*([\w-]+)', fm.group(1), re.MULTILINE)
    return (m.group(1).strip().lower() if m else "")


def _reads_bet_catalog(agent_file: Path) -> bool:
    """
    True if the agent declares `loads_bet_catalog: true` in frontmatter (#109).

    When set, the orchestrator injects the project's bet catalog (existing bets'
    ids + types + statuses + one-liners) into the agent's step context — so
    `support.classify-intake` can right-size an enhancement and name the specific
    bet a slice belongs to (`/create-story --bet <X>`) instead of reflexively
    routing every enhancement to `/create-brief`.
    """
    text = agent_file.read_text(encoding="utf-8")
    fm_match = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if not fm_match:
        return False
    return bool(re.search(r'^loads_bet_catalog:\s*true\b', fm_match.group(1), re.MULTILINE | re.IGNORECASE))


# Workflow → branch type prefix (config.yaml branch_pattern `<type>/<id>-<slug>`).
_WORKFLOW_BRANCH_TYPE = {
    "fix": "fix",
    "ops": "ops",
    "triage": "fix",
    "build": "feat",
    "create-story": "feat",
    "create-brief": "feat",
    "create-bet-architecture": "feat",
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


def _work_branch_name(workflow: str, bet_id: str, context: str) -> str:
    """
    Branch name per config.yaml `<type>/<id>-<slug>` (#99). Strips a leading
    'bug:'/'incident:' label from the context before slugging.
    """
    typ = _WORKFLOW_BRANCH_TYPE.get(workflow, "chore")
    ctx = re.sub(r"^\s*(bug|incident|enhancement|change)\s*:\s*", "", context or "", flags=re.IGNORECASE)
    slug = _slug(ctx)
    return f"{typ}/{bet_id}-{slug}" if bet_id else f"{typ}/{slug}"


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


def _project_artifact(project_dir: Path, compass_dir, rel: str, transport=None) -> tuple:
    """#34: on-demand one-way projection of an EXISTING artifact to its configured
    backend (Jira for stories, Confluence for foundation/brief/architecture — per
    config.yaml connectors), or an honest filesystem-fallback label when uncredentialed.
    Returns (rel, label). Distinct from gate-approval promotion: lets you push the
    product brief + docs so the team SEES them, without re-running a workflow."""
    from .connector import resolve_connector_for_artifact, push_artifact
    target = project_dir / rel
    if not target.exists():
        return (rel, "ERROR — not found")
    content = target.read_text(encoding="utf-8")
    conn = resolve_connector_for_artifact(rel, project_dir, compass_dir)
    return (rel, push_artifact(project_dir, rel, content, conn, transport=transport))


def _bet_doc_paths(project_dir: Path, bet: str) -> list:
    """#34: the product docs of a bet, in push order — brief/architecture/research
    (→ Confluence) then each story (→ Jira). Only paths that exist on disk."""
    base = Path("docs") / "bets" / bet
    rels = []
    for name in ("brief.md", "architecture.md", "research.md"):
        if (project_dir / base / name).exists():
            rels.append(str(base / name))
    stories = project_dir / base / "stories"
    if stories.is_dir():
        for sf in sorted(stories.glob("*/story.md")):
            rels.append(str(sf.relative_to(project_dir)))
    return rels


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


def _skip_for_route(router_number: int, target: int) -> set:
    """
    Steps to skip when a routing gate (#96) chooses `target`.

    Forward-only: skip everything strictly between the gate and the chosen
    target (the not-taken branch). Choosing the immediate next step (or any
    backward target) skips nothing.
    """
    if target <= router_number + 1:
        return set()
    return set(range(router_number + 1, target))


def _resolve_gate(decide, is_routing: bool, routes=None):
    """Non-interactive gate decision (#118). `decide` is the relayed human choice
    (a --decide flag today, a dashboard POST later). Returns (action, label):
      approval gate: ("approve"|"reject", None), else ("pause", None)
      routing gate:  ("route", <matched label>) if decide matches a route, else ("pause", None)
    The gate logic in run.py still executes — nothing here auto-decides; this only
    maps a supplied decision to an action, or pauses when none/invalid."""
    d = (decide or "").strip().lower()
    if is_routing:
        for label, _target in (routes or []):
            if label.lower() == d:
                return ("route", label)
        return ("pause", None)
    if d in ("approve", "reject"):
        return (d, None)
    return ("pause", None)


_GATE_APPROVED_STATES = {"approved", "ready", "accepted"}


def _revert_self_approval(artifact_path):
    """#153: an agent must NOT self-approve a gated artifact — approval is the
    human's decision at the HITL gate (Principle #16, [refuse-escalate]). The
    headless execute directive (#139) could push a doc agent to over-execute and
    flip its own status to approved/ready (live: a WLT-26 architecture written
    `status: Approved` before its gate). Prompt discipline alone didn't hold (the
    agent ignored four explicit 'never self-approve' lines), so this is the
    mechanical backstop: at the gate, if the artifact already claims an approved
    state, revert it to `proposed` so the human actually decides. Case-insensitive
    (catches `Approved`). Returns the reverted-from status if it reset, else None."""
    if artifact_path is None or not artifact_path.exists():
        return None
    from .connector import read_frontmatter_status, set_frontmatter_status
    status = read_frontmatter_status(artifact_path)
    if status.lower() not in _GATE_APPROVED_STATES:
        return None
    try:
        content = artifact_path.read_text(encoding="utf-8")
        artifact_path.write_text(
            set_frontmatter_status(content, "proposed"), encoding="utf-8")
    except OSError:
        return None
    return status


def _resume_hint(workflow_name, step_num, run_id, project_dir, allow_write, decide):
    """#154: the copy-paste CLI line to resume a paused gate. `--run-id` is
    load-bearing — without it a CLI resume mints a NEW run_id and the ORIGINAL gate
    stays '⏸ awaiting' in the cockpit forever (a real trap: the printed hint used to
    omit it, so following it orphaned the gate; the dashboard avoids this by reusing
    the id via #121). `--project-dir` is included so the resume targets the right
    repo, not the cwd."""
    cmd = (f"    python3 -m compass.orchestrator.run {workflow_name} "
           f"--project-dir {project_dir} --run-id {run_id} "
           f"--from-step {step_num} --non-interactive --decide {decide}")
    if allow_write:
        cmd += " --allow-write"
    return cmd


def _recommended_next(output: str):
    """
    The right-sized next command a step recommended (#110), parsed from a single
    contract line `**Next command:** <cmd>` in its output. `classify-intake`
    emits it so the hand-off echoes the right-sized lane (e.g. `create-story
    --bet CB-7`) instead of the gate's static fallback target. Returns the last
    such command, or None.
    """
    if not output:
        return None
    hits = re.findall(
        r'^\s*\**\s*Next command:\s*\**\s*(.+?)\s*$',
        output, re.IGNORECASE | re.MULTILINE,
    )
    cmd = hits[-1].strip().strip('`').strip() if hits else None
    return cmd or None


def _handoff_message(target: str, project_dir, last_artifact_path=None) -> str:
    """
    Render the recommendation printed when a routing gate (#103) routes to a
    cross-workflow hand-off (`/fix`, `/create-brief`, `/ops`) or `close`.

    v1 hand-off = recommend, don't chain: this workflow's job (classify + route)
    is done; the human runs the recommended command. Auto-chaining is v2 (#87
    surface 3). The category→workflow mapping lives in the dispatch graph's
    Routes block, not here — `target` IS the workflow path.
    """
    if target == "close":
        return "[closed — no action taken; logged as the routing decision]"

    wf = target.lstrip("/")
    if last_artifact_path:
        try:
            ctx = f'--context "$(cat {last_artifact_path.relative_to(project_dir)})"'
        except (ValueError, AttributeError):
            ctx = '--context "<paste the triage classification above>"'
    else:
        ctx = '--context "<paste the triage classification above>"'
    return (
        f"Next: run {target} on this item (the triage classification is above).\n"
        f"  python3 -m compass.orchestrator.run {wf} "
        f"--project-dir {project_dir} {ctx}\n"
        f"(v1 hand-off — auto-chaining is deferred to v2; run the command to continue.)"
    )


def _collect_input(step_label: str, inline_context: str = "", non_interactive: bool = False) -> str:
    """Return user context for a step, either inline or via interactive prompt.
    #134: in non-interactive (headless / dashboard) runs, NEVER prompt — there's
    no terminal to type into, so `input()` would deadlock the run forever (a
    dashboard `create-brief` froze at step 2 for 14 min on exactly this). Use the
    inline context (the initial --context for step 1; nothing for later steps)."""
    if inline_context:
        print(f"[context] {inline_context[:120]}{'...' if len(inline_context) > 120 else ''}")
        return inline_context
    if non_interactive:
        return ""
    print(
        f"\nEnter context / input for this step.\n"
        f"End with a line containing only '.':\n"
    )
    lines = []
    while True:
        try:
            line = input()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if line == ".":
            break
        lines.append(line)
    return "\n".join(lines)


def _step_dir(project_dir: Path, workflow: str, run_id: str = None) -> Path:
    """#27: the dir holding a run's step artifacts. **Run-scoped** —
    docs/orchestrator-runs/<workflow>/<run_id>/ — so concurrent same-workflow builds
    don't clobber each other's `step-*.md` (the collision Retro #031 flagged). Falls
    back to the flat <workflow>/ dir when no run_id (legacy / non-run contexts). Drops
    the #175 .gitignore via ensure_runs_dir."""
    from .logger import ensure_runs_dir
    d = ensure_runs_dir(project_dir) / workflow
    if run_id:
        d = d / run_id.replace("/", "__")
    d.mkdir(parents=True, exist_ok=True)
    return d


def _write_artifact(
    project_dir: Path, workflow: str, step_num: int,
    agent: str, task: str, content: str, run_id: str = None,
) -> Path:
    """Write step output to docs/orchestrator-runs/<workflow>/<run_id>/step-<N>-<agent>-<task>.md (#27)."""
    run_dir = _step_dir(project_dir, workflow, run_id)
    out_file = run_dir / f"step-{step_num:02d}-{agent}-{task}.md"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    header = (
        f"---\nworkflow: {workflow}\nstep: {step_num}\nagent: {agent}\n"
        f"task: {task}\ngenerated: {timestamp}\n---\n\n"
    )
    out_file.write_text(header + content, encoding="utf-8")
    return out_file


def _write_rejection_note(
    project_dir: Path, workflow: str, step_num: int, feedback: str, run_id: str = None,
) -> Path:
    """Write a HITL rejection note alongside the step artifact (run-scoped, #27)."""
    run_dir = _step_dir(project_dir, workflow, run_id)
    note_file = run_dir / f"step-{step_num:02d}-hitl-rejected.md"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    content = (
        f"---\nworkflow: {workflow}\nstep: {step_num}\nstatus: rejected\n"
        f"timestamp: {timestamp}\n---\n\n"
        f"# HITL Rejection — Step {step_num}\n\n"
        f"**Timestamp:** {timestamp}\n\n"
    )
    if feedback:
        content += f"## Reviewer feedback\n\n{feedback}\n\n"
    content += (
        f"## To regenerate the rejected artifact\n\n"
        f"Rerun from the step that produced it (the HITL gate re-fires after):\n\n"
        f"```bash\n"
        f"python3 -m compass.orchestrator.run {workflow} --from-step {max(1, step_num - 1)}\n"
        f"```\n"
    )
    note_file.write_text(content, encoding="utf-8")
    return note_file


def _requirement_met(project_dir: Path, rel_path: str) -> tuple:
    """
    Check whether an artifact requirement is approved (#70 dual acceptance).

    Returns (met: bool, how: str|None). PASS via either mechanism:
      - hitl.jsonl: latest record whose canonical_path or artifact_path
        matches has decision "approved"
      - frontmatter: the file exists with `status: approved`
    """
    from .connector import read_frontmatter_status
    from .logger import load_hitl_log

    latest = None
    for r in load_hitl_log(project_dir):
        if rel_path in (r.get("canonical_path"), r.get("artifact_path")):
            latest = r.get("decision")  # records are chronological; last wins
    if latest == "approved":
        return True, "hitl.jsonl approved record"

    if read_frontmatter_status(project_dir / rel_path) == "approved":
        return True, "status: approved frontmatter"

    return False, None


def _producer_hint(rel_path: str) -> str:
    """Name the workflow that produces a required artifact path."""
    if rel_path.endswith("foundation/product.md"):
        return "setup-product"
    if rel_path.endswith("foundation/architecture.md"):
        return "setup-foundation-architecture"
    if rel_path.endswith("brief.md"):
        return "create-brief"
    if rel_path.endswith("architecture.md"):
        return "create-bet-architecture"
    return None


def _manual_hitl_decision(
    project_dir: Path, path_arg: str, decision: str, feedback: str, bet_id: str
) -> int:
    """
    Manual approval bridge (#70 / C6): one command satisfies BOTH gate
    mechanisms — appends a hitl.jsonl record AND (on approve) flips the
    artifact's `status:` frontmatter to approved.
    """
    from datetime import datetime, timezone

    from .connector import set_frontmatter_status
    from .logger import log_hitl

    target = Path(path_arg)
    if not target.is_absolute():
        target = project_dir / path_arg
    try:
        rel = str(target.resolve().relative_to(project_dir))
    except ValueError:
        print(
            f"Error: {path_arg} is not inside the project directory {project_dir}.",
            file=sys.stderr,
        )
        return 2

    run_id = f"manual--{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}"

    if decision == "approved":
        if not target.exists():
            print(f"Error: artifact not found: {target}", file=sys.stderr)
            return 2
        content = set_frontmatter_status(
            target.read_text(encoding="utf-8"), "approved", run_id
        )
        target.write_text(content, encoding="utf-8")
        print(f"[{rel} → status: approved]")

    log_hitl(
        project_dir=project_dir,
        run_id=run_id,
        workflow="manual",
        bet_id=bet_id,
        step=0,
        artifact_path=rel,
        decision=decision,
        feedback=feedback or None,
        connector="filesystem" if decision == "approved" else None,
        canonical_path=rel if decision == "approved" else None,
    )
    print(f"[hitl.jsonl ← {decision}: {rel}]")
    return 0


def _load_prior_outputs_from_disk(
    project_dir: Path, workflow: str, steps: list, up_to_step: int, run_id: str = None,
) -> list:
    """Load step outputs from artifact files for steps < up_to_step. Reads the
    run-scoped dir when `run_id` is given (#27), else the legacy flat <workflow>/ dir —
    and falls back to flat if the run-scoped dir has no artifacts (resuming a pre-#27 run)."""
    run_dir = _step_dir(project_dir, workflow, run_id)
    if run_id and not any(run_dir.glob("step-*.md")):
        run_dir = project_dir / "docs" / "orchestrator-runs" / workflow   # legacy fallback
    prior_outputs = []
    for step in steps:
        if step.number >= up_to_step:
            break
        if step.is_hitl or not step.agent or not step.task:
            continue
        artifact = run_dir / f"step-{step.number:02d}-{step.agent}-{step.task}.md"
        if artifact.exists():
            raw = artifact.read_text(encoding="utf-8")
            content = re.sub(r'^---\n.*?\n---\n\n?', '', raw, flags=re.DOTALL, count=1)
            prior_outputs.append({
                "step": step.number,
                "agent": step.agent,
                "task": step.task,
                "host": "disk",
                "output": content,
            })
            print(f"  [loaded from disk] step {step.number}: {step.agent}.{step.task}")
        else:
            print(
                f"  [warning] artifact not found for step {step.number} "
                f"({step.agent}.{step.task}) — context gap",
                file=sys.stderr,
            )
    return prior_outputs


def _condense_output(text: str) -> str:
    """Condense a prior step's output to its structured signal (#117) — TL;DR +
    files created/modified + next-command — instead of a 3000-char raw slice.
    Big token cut on later steps (and on Sonnet, #115). Falls back to a short
    head slice when there's no parseable Output-summary."""
    from .logger import parse_step_output
    p = parse_step_output(text or "")
    lines = []
    if p.get("tldr"):
        lines.append(f"TL;DR: {p['tldr']}")
    created = p.get("files_created") or []
    modified = p.get("files_modified") or []
    if created:
        lines.append("Created: " + ", ".join(created[:12]))
    if modified:
        lines.append("Modified: " + ", ".join(modified[:12]))
    if p.get("next_command"):
        lines.append(f"Next: {p['next_command']}")
    if lines:
        return "\n".join(lines)
    # no structured summary — fall back to a short head slice
    head = (text or "").strip()
    return head[:800] + ("\n[... truncated ...]" if len(head) > 800 else "")


def _build_user_message(task: str, user_context: str, prior_outputs: list) -> str:
    """Build the user message for a step, prepending CONDENSED prior step outputs
    as context (#117) — structured summaries, not raw dumps, to keep tokens (and
    cost) down on multi-step runs."""
    parts = []
    if prior_outputs:
        parts.append("## Prior step outputs (condensed context)\n")
        for entry in prior_outputs:
            label = f"[{entry.get('workflow', '')} — " if entry.get('workflow') else "["
            parts.append(
                f"### {label}Step {entry['step']}: {entry['agent']}.{entry['task']}]\n"
            )
            parts.append(_condense_output(entry["output"]))
            parts.append("")
        parts.append("---\n")
    parts.append(f"Execute task: **{task}**")
    if user_context:
        parts.append(f"\n{user_context}")
    return "\n".join(parts)


def _load_full_project_context(project_dir: Path) -> str:
    """
    Load the full project picture for agents that need portfolio-wide context
    (e.g. delivery-manager.update-status).

    Reads (in order, if they exist):
      docs/foundation/product.md
      docs/foundation/architecture.md
      docs/foundation/plan.md
      docs/foundation/portfolio.md
      docs/status.md
      docs/bets/*/brief.md   (first 600 chars each — status overview, not full)
      PROJECT.md
    """
    parts = ["## Full project context\n"]

    for fname in ("product.md", "architecture.md", "plan.md", "portfolio.md"):
        f = project_dir / "docs" / "foundation" / fname
        if f.exists():
            parts.append(f"### docs/foundation/{fname}\n\n{f.read_text(encoding='utf-8')}\n")

    status_file = project_dir / "docs" / "status.md"
    if status_file.exists():
        parts.append(f"### docs/status.md\n\n{status_file.read_text(encoding='utf-8')}\n")

    bets_dir = project_dir / "docs" / "bets"
    if bets_dir.exists():
        bet_dirs = sorted(d for d in bets_dir.iterdir() if d.is_dir())
        if bet_dirs:
            parts.append("### Bet portfolio (brief summaries)\n")
            for bd in bet_dirs:
                brief = bd / "brief.md"
                if not brief.exists():
                    continue
                raw = brief.read_text(encoding="utf-8")
                summary = raw.strip()[:600]
                if len(raw.strip()) > 600:
                    summary += f"\n[... full brief at docs/bets/{bd.name}/brief.md ...]"
                parts.append(f"**{bd.name}:**\n{summary}\n")

    project_md = project_dir / "PROJECT.md"
    if project_md.exists():
        parts.append(f"### PROJECT.md\n\n{project_md.read_text(encoding='utf-8')}\n")

    return "\n".join(parts)


def _load_bet_catalog(project_dir: Path) -> str:
    """
    Compact catalog of existing bets (#109) — one line per `docs/bets/*/brief.md`:
    `<id> (<type>, <status>): <one-liner>`. Lets the front-door classifier match
    an enhancement to an existing bet (→ `/create-story --bet <id>`) instead of
    minting a redundant bet. Returns "" when there are no bets (→ recommend a new
    bet). Reads brief frontmatter + the first heading/hypothesis only — planning
    docs, not source.
    """
    bets_dir = project_dir / "docs" / "bets"
    if not bets_dir.exists():
        return ""
    lines = []
    for brief in sorted(bets_dir.glob("*/brief.md")):
        bet_id = brief.parent.name
        try:
            text = brief.read_text(encoding="utf-8")
        except OSError:
            continue
        fm = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
        fm_text = fm.group(1) if fm else ""
        body = text[fm.end():] if fm else text

        def _field(name):
            m = re.search(rf'^{name}:\s*(.+)$', fm_text, re.MULTILINE)
            return m.group(1).strip().strip('"\'') if m else None

        btype = _field("type") or "bet"
        status = _field("status") or "?"
        # one-liner: a `hypothesis:` frontmatter field, else the first `# ` heading,
        # else the first non-empty body line.
        oneliner = _field("hypothesis")
        if not oneliner:
            h = re.search(r'^#\s+(.+)$', body, re.MULTILINE)
            if h:
                oneliner = h.group(1).strip()
        if not oneliner:
            for ln in body.splitlines():
                if ln.strip():
                    oneliner = ln.strip()
                    break
        oneliner = (oneliner or "").lstrip("# ").strip()
        if len(oneliner) > 120:
            oneliner = oneliner[:120] + "…"
        lines.append(f"- {bet_id} ({btype}, {status}): {oneliner}")

    if not lines:
        return ""
    return (
        "## Existing bets (catalog)\n\n"
        "Match an enhancement to one of these (→ `/create-story --bet <id>`, no new "
        "brief) before proposing a new bet:\n\n" + "\n".join(lines) + "\n"
    )


def _load_bet_context(project_dir: Path, bet_id: str) -> str:
    """
    Load all existing artifacts for a bet as structured context.

    Reads (in order, if they exist):
      docs/bets/<ID>/brief.md
      docs/bets/<ID>/architecture.md
      docs/bets/<ID>/stories/*/story.md   (summaries — first 400 chars each)
      PROJECT.md

    Returns a context string ready to prepend to the first agent step.
    """
    bet_dir = project_dir / "docs" / "bets" / bet_id
    if not bet_dir.exists():
        # Bet dir doesn't exist yet — that's fine for create-brief
        return f"## Bet context\n\nBet ID: {bet_id}\n(No existing artifacts — new bet)\n"

    parts = [f"## Bet context — {bet_id}\n"]

    for artifact_name in ("brief.md", "architecture.md"):
        artifact = bet_dir / artifact_name
        if artifact.exists():
            content = artifact.read_text(encoding="utf-8")
            parts.append(f"### {artifact_name}\n\n{content}\n")

    # Story summaries (first 400 chars each — enough for status/context)
    stories_dir = bet_dir / "stories"
    if stories_dir.exists():
        story_files = sorted(stories_dir.glob("*/story.md"))
        if story_files:
            parts.append("### Stories (summaries)\n")
            for sf in story_files:
                raw = sf.read_text(encoding="utf-8")
                slug = sf.parent.name
                summary = raw.strip()[:400]
                if len(raw.strip()) > 400:
                    summary += "\n[... truncated ...]"
                parts.append(f"**{slug}:**\n{summary}\n")

    # Project-level context
    project_md = project_dir / "PROJECT.md"
    if project_md.exists():
        parts.append(f"### PROJECT.md\n\n{project_md.read_text(encoding='utf-8')}\n")

    return "\n".join(parts)


def _resolve_bet_for_story(project_dir: Path, story_id: str):
    """#172: map a story id (e.g. WLT-27-1) to its parent bet so a story-scoped
    build/fix can run. Authoritative source is the filesystem — the bet whose
    `docs/bets/<bet>/stories/<story_id>/story.md` exists. Falls back to stripping
    the trailing `-<n>` segment (WLT-27-1 → WLT-27) when the dir isn't found yet
    (e.g. a dry-run before stories exist). Returns the bet id, or None if neither
    resolves."""
    if not story_id:
        return None
    bets_dir = project_dir / "docs" / "bets"
    if bets_dir.is_dir():
        for story_md in bets_dir.glob(f"*/stories/{story_id}/story.md"):
            # docs/bets/<bet>/stories/<story_id>/story.md → parent bet is 3 up
            return story_md.parent.parent.parent.name
    # Fallback: strip the trailing numeric story segment.
    m = re.match(r"^(.*)-\d+$", story_id)
    return m.group(1) if m else None


def _is_story_id(project_dir: Path, candidate: str) -> bool:
    """#172: True if `candidate` names a story (a `docs/bets/*/stories/<candidate>/`
    dir exists) rather than a bet (`docs/bets/<candidate>/`). Lets a single id field
    (the dashboard's, or `--bet`) accept either — a story id auto-resolves to its
    parent bet + story scope instead of failing the requirement gate on a bet brief
    that never existed (the WLT-27-1 'looks hung' bug)."""
    if not candidate:
        return False
    bets_dir = project_dir / "docs" / "bets"
    if (bets_dir / candidate).is_dir():
        return False  # it's a bet
    return any(bets_dir.glob(f"*/stories/{candidate}/story.md"))


def _build_story_gate(project_dir: Path, workflow_name: str, bet_id, story_id, from_step=None):
    """#103: /build is STORY-scoped (`/build <story-id>` implements ONE story). If an
    operator names a BET instead (bet_id resolved, story_id not), refuse — building a
    bet collapses the whole Epic into one un-decomposed, un-reviewable mega-PR (live:
    `/build WLT-28` implemented the entire debt bet — 28 files — as PR #144). `fix` and
    `ops` are NOT story-scoped, so this gate is build-only. Returns a refusal message,
    or None when the invocation is fine (a real story, or a non-build workflow).

    #107: ENTRY gate only — returns None on a RESUME (`from_step` set). The cockpit's
    merge-gate resume passes the PARENT bet_id (--bet WLT-28) for the requirement gate
    plus `--from-step N`, WITHOUT the story scope — re-running this gate then mis-read
    that as a bet-level build and halted the human's merge approval (live: WLT-28-3 stuck
    at step 6). On resume the story was already chosen at dispatch, so never re-gate."""
    if from_step or workflow_name != "build" or story_id or not bet_id:
        return None
    stories = sorted(
        (project_dir / "docs" / "bets" / bet_id / "stories").glob("*/story.md"))
    if stories:
        return (f"{bet_id} is a bet with {len(stories)} story(ies) — /build is "
                f"story-scoped. Run /build <story-id> (e.g. {stories[0].parent.name}).")
    return (f"{bet_id} is a bet, not a story, and has no stories yet — run "
            f"/create-story {bet_id} to slice it, then /build <story-id>.")


def _story_dependencies(content: str) -> list:
    """Parse a story's `dependencies:` frontmatter into a list of story ids. Handles
    both the inline-flow form (`[A, B]` / `A, B`) and block-style `  - A` lines, and
    drops template placeholders (`<other story id>`). Returns [] if none."""
    fm = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not fm:
        return []
    block = fm.group(1)
    m = re.search(r"^dependencies[ \t]*:[ \t]*(.*(?:\n[ \t]+-.*)*)$", block, re.MULTILINE)
    if not m:
        return []
    raw = m.group(1)
    items = []
    inline, _, rest = raw.partition("\n")
    for x in inline.strip().strip("[]").split(","):
        items.append(x)
    for line in rest.splitlines():
        lm = re.match(r"^[ \t]+-\s*(.*)$", line)
        if lm:
            items.append(lm.group(1))
    return [x.strip().strip("\"'") for x in items
            if x.strip().strip("\"'") and not x.strip().startswith("<")]


def _story_human_deliverable_blockers(project_dir: Path, bet_id: str, story_id: str) -> list:
    """#171: the 'always block' design/copy gate. Returns a list of
    (dep_id, dep_type, dep_status) for each of the target story's dependencies that is
    a **design/copy story not yet `ready`** (i.e. a human hasn't delivered the Figma/
    copy). Empty list → nothing blocking. Only design/copy-TYPE deps block — a plain
    feature-ordering dependency does NOT — so stories predating #171 are never
    false-blocked. Missing/unreadable files are skipped (fail-open per dep)."""
    from .connector import _frontmatter_field
    if not (bet_id and story_id):
        return []
    stories = project_dir / "docs" / "bets" / bet_id / "stories"
    try:
        content = (stories / story_id / "story.md").read_text(encoding="utf-8")
    except OSError:
        return []
    blockers = []
    for dep in _story_dependencies(content):
        try:
            dcontent = (stories / dep / "story.md").read_text(encoding="utf-8")
        except OSError:
            continue
        dtype = _frontmatter_field(dcontent, "type")
        dstatus = _frontmatter_field(dcontent, "status")
        if dtype in ("design", "copy") and dstatus != "ready":
            blockers.append((dep, dtype, dstatus))
    return blockers


def _read_story_fm_list(project_dir: Path, bet_id: str, story_id: str, field: str) -> set:
    """#26: read a story's frontmatter list field (e.g. `area_tags`, `dependencies`) as a
    set of ids/tags. Handles inline (`[a, b]`/`a, b`) + block (`  - a`) forms; drops
    template placeholders (`<…>`). Empty set on any miss."""
    try:
        content = (Path(project_dir) / "docs" / "bets" / bet_id / "stories"
                   / story_id / "story.md").read_text(encoding="utf-8")
    except OSError:
        return set()
    fm = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not fm:
        return set()
    m = re.search(rf"^{re.escape(field)}[ \t]*:[ \t]*(.*(?:\n[ \t]+-.*)*)$",
                  fm.group(1), re.MULTILINE)
    if not m:
        return set()
    inline, _, rest = m.group(1).partition("\n")
    items = list(inline.strip().strip("[]").split(","))
    for line in rest.splitlines():
        lm = re.match(r"^[ \t]+-\s*(.*)$", line)
        if lm:
            items.append(lm.group(1))
    return {x.strip().strip("\"'") for x in items
            if x.strip().strip("\"'") and not x.strip().startswith("<")}


def _overlapping_inflight_builds(project_dir: Path, bet_id: str, story_id: str,
                                 runs: dict = None) -> list:
    """#26: a story-scoped build that overlaps another IN-FLIGHT build of the SAME module
    will conflict at merge — same-module stories merge serially (live: WLT-27-2/3/4 on
    the CSV module). Overlap = shared `area_tags`, or a declared dependency, between the
    target story and an in-flight build's story. Returns [(other_story_id, reason)].
    `runs` is the folded spine (injectable for tests). Best-effort; never raises."""
    if not (bet_id and story_id):
        return []
    target_tags = _read_story_fm_list(project_dir, bet_id, story_id, "area_tags")
    target_deps = _read_story_fm_list(project_dir, bet_id, story_id, "dependencies")
    if runs is None:
        try:
            from . import events as ev
            from .cockpit import fold_runs
            runs = fold_runs(ev.load_events())
        except Exception:
            return []
    overlaps = []
    for r in runs.values():
        if r.get("workflow") != "build" or r.get("ended"):
            continue
        other = r.get("story_id")
        if not other or other == story_id:
            continue
        reasons = []
        shared = target_tags & _read_story_fm_list(project_dir, bet_id, other, "area_tags")
        if shared:
            reasons.append("shared area: " + ", ".join(sorted(shared)))
        other_deps = _read_story_fm_list(project_dir, bet_id, other, "dependencies")
        if other in target_deps or story_id in other_deps:
            reasons.append("a declared dependency between them")
        if reasons:
            overlaps.append((other, "; ".join(reasons)))
    return overlaps


def _load_story_context(project_dir: Path, bet_id: str, story_id: str) -> str:
    """#172: focused context for a story-scoped build — the parent bet's brief +
    architecture (the load-bearing decisions) plus the FULL target story, with an
    explicit instruction to implement ONLY this story. Distinct from
    _load_bet_context (which summarizes every story for whole-bet work): a parallel
    story build must not wander into sibling stories' scope."""
    bet_dir = project_dir / "docs" / "bets" / bet_id
    parts = [f"## Build scope — story {story_id} (bet {bet_id})\n",
             f"**Implement ONLY story {story_id}.** Other stories in this bet are "
             f"out of scope for this run — they build in their own runs/branches.\n"]
    for artifact_name in ("brief.md", "architecture.md"):
        artifact = bet_dir / artifact_name
        if artifact.exists():
            parts.append(f"### bet {artifact_name}\n\n{artifact.read_text(encoding='utf-8')}\n")
    story_md = bet_dir / "stories" / story_id / "story.md"
    if story_md.exists():
        parts.append(f"### story {story_id}\n\n{story_md.read_text(encoding='utf-8')}\n")
    else:
        parts.append(f"### story {story_id}\n\n(No story.md on disk at "
                     f"docs/bets/{bet_id}/stories/{story_id}/ — run /create-story first.)\n")
    project_md = project_dir / "PROJECT.md"
    if project_md.exists():
        parts.append(f"### PROJECT.md\n\n{project_md.read_text(encoding='utf-8')}\n")
    return "\n".join(parts)


def _resolve_compass_file(compass_dir: Path, project_dir: Path, rel_path: str):
    """Override resolution (stack-agnostic core): a project overrides any
    Compass-shipped file (stack profile, and later templates/workflows) WITHOUT
    forking by placing it under `<project>/compass-overrides/<rel_path>`. Returns the
    project override if present, else the Compass default, else None. 'Opinionated
    defaults, fully overridable' — the same resolver extends to templates/workflows."""
    override = project_dir / "compass-overrides" / rel_path
    if override.exists():
        return override
    default = compass_dir / rel_path
    return default if default.exists() else None


def _read_stack_from_config(compass_dir: Path):
    """Read the `stack:` field from compass/config.yaml — selects which stack profile
    (`compass/stacks/<stack>.md`) is injected into the delivery agents. None if unset
    (agents run stack-neutral). The stack is pluggable config, never hardcoded in an
    agent file."""
    config_file = compass_dir / "config.yaml"
    if not config_file.exists():
        return None
    m = re.search(r'^stack:\s*([^\s#]+)', config_file.read_text(encoding="utf-8"),
                  re.MULTILINE)
    return m.group(1).strip() if m else None


def _load_stack_context(compass_dir: Path, project_dir: Path, stack: str) -> str:
    """Load the active stack profile as agent context. Agents carry stack-neutral
    methodology; the profile supplies the stack's build/test commands, runtime-artifact
    paths, and framework runtime contracts the agents verify. Override-resolved.
    Returns '' if no profile file is found for `stack`."""
    profile = _resolve_compass_file(compass_dir, project_dir, f"stacks/{stack}.md")
    if profile is None:
        return ""
    return f"## Active stack profile — {stack}\n\n{profile.read_text(encoding='utf-8')}\n"


def _cross_workflow_context(workflow_name: str, prior_outputs: list, artifact_paths: list) -> str:
    """
    Build a context summary to pass from the end of one workflow into the
    first step of the next. Keeps it compact — just enough for the next
    agent to know what was produced and where to find the artifacts.
    """
    lines = [f"## Completed workflow: {workflow_name}\n"]
    if artifact_paths:
        lines.append("**Artifacts written:**")
        for p in artifact_paths:
            lines.append(f"  - {p}")
        lines.append("")
    if prior_outputs:
        last = prior_outputs[-1]
        lines.append(
            f"**Last step:** {last['agent']}.{last['task']} "
            f"(host: {last.get('host', 'unknown')})"
        )
        summary = last["output"].strip()[:800]
        if len(last["output"].strip()) > 800:
            summary += "\n[... see artifact for full output ...]"
        lines.append(f"\n**Output summary:**\n{summary}")
    return "\n".join(lines)


def _promote_artifact(project_dir, compass_dir, canonical_rel, fallback_output,
                      run_id, status=None, no_write=False):
    """Write the canonical artifact + project it to its system of record (Jira/
    Confluence). Reads the on-disk artifact when present (so the stored distribution
    pointer is reused → an idempotent update, not a duplicate); else falls back to the
    step output. `status` forces a frontmatter status (e.g. 'approved'); None projects
    the draft as-is. Returns the connector label, or None in no-write mode."""
    from .connector import (extract_artifact_body, push_artifact,
                            resolve_connector_for_artifact, set_frontmatter_status)
    if no_write:
        return None
    target = project_dir / canonical_rel
    base = (target.read_text(encoding="utf-8") if target.exists()
            else extract_artifact_body(fallback_output))
    content = set_frontmatter_status(base, status, run_id) if status else base
    return push_artifact(project_dir, canonical_rel, content,
                         resolve_connector_for_artifact(canonical_rel, project_dir, compass_dir))


def _fix_title(output: str) -> str:
    """Best-effort short title from the engineer's triage output (TL;DR or first H1)."""
    for pat in (r"^\*\*TL;DR:?\*\*\s*(.+)$", r"^#\s+(.+)$"):
        m = re.search(pat, output or "", re.MULTILINE)
        if m:
            return m.group(1).strip().rstrip(".")[:100]
    return ""


def _render_fix_record(fid, ftype, bet_id, severity, pr_url, title, today) -> str:
    """#71: a minimal fix record (Compass-primary). `type:` drives the Jira issue type
    (bug→Bug, enhancement→Story). The PR carries the full triage; this is the tracked item."""
    jira_type = "Story" if ftype == "enhancement" else "Bug"
    return (
        "---\n"
        f"id: {fid}\n"
        f"type: {ftype}\n"
        f"bet: {bet_id or 'null'}\n"
        f"hygiene: {'false' if bet_id else 'true'}\n"
        "status: in_review\n"
        f"severity: {severity}\n"
        f"pr: {pr_url or 'null'}\n"
        "author: Engineer\n"
        f"created: {today}\n"
        "---\n\n"
        f"# Fix: {title or fid}\n\n"
        "Tracked fix record (#71). Full triage — symptom/repro, root cause, regression "
        "test, and the minimum fix — is in the PR.\n\n"
        f"- **PR:** {pr_url or '(none yet)'}\n"
        f"- **type:** {ftype} → Jira {jira_type}\n"
        f"- **severity:** {severity}\n"
    )


def _project_fix_record(project_dir, compass_dir, bet_id, work_branch,
                        last_agent_output, run_id):
    """#71: the ORCHESTRATOR (not the agent) writes the fix record from the engineer's
    classification + PR and PROJECTS it to Jira as a Bug (defect) / Story (enhancement).
    Moving this out of agent prose closes the Principle #14 hole that left #71's Jira
    creation to a headless agent that skipped it. Best-effort — returns the connector
    label (`jira (KAN-42, created)` | `filesystem fallback — …`), never raises into the run."""
    from datetime import datetime, timezone
    from .connector import (push_artifact, resolve_connector_for_artifact,
                            resolve_issue_type)
    try:
        out = last_agent_output or ""
        # a /fix is a DEFECT by default; enhancement only on an explicit marker, so a
        # mis-read defaults to Bug (the common case), never silently mislabels.
        ftype = ("enhancement"
                 if re.search(r"classification\s*:\s*enhancement|type\s*:\s*enhancement",
                              out, re.IGNORECASE)
                 else "bug")
        sev = re.search(r"\bP([0-3])\b", out)
        severity = f"P{sev.group(1)}" if sev else "P2"
        # link the PR regardless of state — at projection time it's open, but a
        # resume/retro projection should still link a merged PR.
        pr_url = _pr_url_any_state(project_dir, work_branch) or ""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        slug = ((work_branch or run_id or "fix").split("/")[-1]
                .replace("fix--", "").replace("fix/", "")[:40].strip("-") or "fix")
        fid = f"FIX-{today}-{slug}"
        rel = (f"docs/bets/{bet_id}/fixes/{fid}.md" if bet_id
               else f"docs/fixes/{fid}.md")
        content = _render_fix_record(fid, ftype, bet_id, severity, pr_url,
                                     _fix_title(out), today)
        # idempotency: if the record already exists, carry its stored jira_key into the
        # regenerated content so a re-projection UPDATES the same issue, not a duplicate.
        existing = project_dir / rel
        if existing.exists():
            from .connector import _frontmatter_field, _set_frontmatter_field
            jk = _frontmatter_field(existing.read_text(encoding="utf-8"), "jira_key")
            if jk:
                content = _set_frontmatter_field(content, "jira_key", jk)
        # route via the PROJECT's connector config (the consumer declares ticketing: jira)
        conn = resolve_connector_for_artifact(rel, project_dir, None)
        label = push_artifact(project_dir, rel, content, conn,
                              issue_type=resolve_issue_type(rel, content))
        if bet_id and label and label.startswith("jira ("):   # bet-linked → under the Epic
            _parent_fix_under_epic(project_dir, bet_id, rel)
        return label
    except Exception as exc:
        return f"filesystem fallback — fix projection error: {exc}"


def _parent_fix_under_epic(project_dir, bet_id, fix_rel):
    """#71/#35: put a bet-linked fix's Jira issue under the bet's Epic. Best-effort."""
    from .connector import _frontmatter_field, project_bet_jira_structure
    from . import stores
    try:
        project_bet_jira_structure(project_dir, bet_id)   # ensure the Epic exists
        brief = Path(project_dir) / "docs" / "bets" / bet_id / "brief.md"
        epic_key = (_frontmatter_field(brief.read_text(encoding="utf-8"), "jira_epic_key")
                    if brief.exists() else None)
        fix_key = _frontmatter_field(
            (Path(project_dir) / fix_rel).read_text(encoding="utf-8"), "jira_key")
        auth = stores.jira_auth()
        if auth and epic_key and fix_key:
            stores.jira_set_parent(auth, fix_key, epic_key)
    except Exception:
        pass


def _read_checks_from_config(project_dir):
    """#92: read a `checks:` list (inline `[a, b]` or block `- a`) from the PROJECT's
    config.yaml — the CI-parity commands the orchestrator runs before opening a PR."""
    config = Path(project_dir) / "compass" / "config.yaml"
    if not config.exists():
        return []
    cmds, in_block = [], False
    for line in config.read_text(encoding="utf-8").splitlines():
        s = line.split("#")[0].rstrip()
        if re.match(r"^checks\s*:", s):
            inline = s.split(":", 1)[1].strip()
            if inline.startswith("["):
                return [x.strip().strip("\"'") for x in inline.strip("[]").split(",") if x.strip()]
            in_block = True
            continue
        if in_block:
            m = re.match(r"^\s+-\s*(.+)$", s)
            if m:
                cmds.append(m.group(1).strip().strip("\"'"))
            elif s and not s[0].isspace():
                break  # left the checks block
    return cmds


def _resolve_checks(project_dir, compass_dir):
    """#92: the CI-parity check commands. Prefers the project's `config.yaml checks:`
    (set to mirror its CI); falls back to the active stack's default suite. Empty →
    nothing declared (a warning, not a silent skip)."""
    return (_read_checks_from_config(project_dir)
            or list(_STACK_CHECKS.get(_read_stack_from_config(compass_dir) or "", [])))


def _run_checks(exec_dir, checks, runner=None):
    """#92: run each CI-parity check IN THE WORKTREE. Returns (ok, failed_cmd, tail).
    Stops at the first failure. `runner` injectable for tests. Never raises."""
    import subprocess
    runner = runner or (lambda cmd, cwd: subprocess.run(
        cmd, shell=True, cwd=str(cwd), capture_output=True, text=True, timeout=1800))
    for cmd in checks:
        print(f"  [check] {cmd}", flush=True)
        try:
            r = runner(cmd, exec_dir)
        except Exception as exc:
            return (False, cmd, f"could not run: {exc}")
        if getattr(r, "returncode", 1) != 0:
            tail = ((getattr(r, "stdout", "") or "") + (getattr(r, "stderr", "") or ""))[-2000:]
            return (False, cmd, tail)
    return (True, None, "")


def _pr_title(exec_dir, work_branch):
    """#97: a MEANINGFUL PR title — the branch's primary conventional commit subject
    (`fix:`/`feat:` — the engineer's own one-line description of the change), NOT the
    `TL;DR:` run-status blurb. Falls back to the branch slug."""
    import subprocess

    def _git(*args):
        return subprocess.run(["git", "-C", str(exec_dir), *args],
                              capture_output=True, text=True, timeout=30)
    try:
        base = ""
        for ref in ("origin/main", "main", "origin/master", "master"):
            mb = _git("merge-base", "HEAD", ref)
            if mb.returncode == 0 and mb.stdout.strip():
                base = mb.stdout.strip()
                break
        if base:
            subs = [s.strip() for s in _git("log", f"{base}..HEAD", "--format=%s")
                    .stdout.splitlines() if s.strip()]
            for s in subs:                                # prefer a fix:/feat: subject
                if re.match(r"^(fix|feat|perf|refactor|chore)(\(.+\))?:", s, re.IGNORECASE):
                    return s[:100]
            if subs:
                return subs[-1][:100]                     # oldest commit = the primary change
    except Exception:
        pass
    return ((work_branch or "change").split("/")[-1].replace("-", " ")[:100] or "change")


def _ensure_pr(exec_dir, work_branch, body_output):
    """#92: the ORCHESTRATOR opens the PR (once) AFTER the check gate passes — a PR is
    only ever created on green checks (clean from creation, #89). Idempotent: reuse an
    existing PR for the branch. Best-effort; returns the PR URL or None."""
    if not work_branch:
        return None
    existing = _pr_url_any_state(exec_dir, work_branch)
    if existing:
        return existing
    import subprocess
    from .connector import extract_artifact_body
    title = _pr_title(exec_dir, work_branch)          # #97: from the commit, not the TL;DR
    body = (extract_artifact_body(body_output)[:4000] if body_output
            else "Opened by the orchestrator after CI-parity checks passed (#92).")
    try:
        r = subprocess.run(["gh", "pr", "create", "--head", work_branch,
                            "--title", title, "--body", body],
                           cwd=str(exec_dir), capture_output=True, text=True, timeout=120)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Core workflow runner — returns (prior_outputs, artifact_paths)
# ─────────────────────────────────────────────────────────────────────────────

def _run_workflow(
    workflow_name: str,
    project_dir: Path,
    compass_dir: Path,
    context: str = "",
    bet_id: str = None,
    story_id: str = None,
    full_project: bool = False,
    model: str = None,
    no_write: bool = False,
    only_step: int = None,
    from_step: int = None,
    initial_prior_outputs: list = None,
    dry_run: bool = False,
    skip_missing: bool = False,
    allow_write: bool = False,
    max_tool_iterations: int = None,
    no_events: bool = False,
    max_cost: float = None,
    non_interactive: bool = False,
    decide: str = None,
    claude_cli: bool = False,
    codex_cli: bool = False,
    run_id_override: str = None,
    auto_merge: bool = False,
) -> tuple:
    """
    Execute a single workflow dispatch graph.

    Returns (prior_outputs, artifact_paths):
      prior_outputs  — list of step output dicts (step, agent, task, host, output)
      artifact_paths — list of relative path strings for written artifacts
    """
    from .graph import load_workflow, load_workflow_meta
    from .hitl import handle_hitl_gate
    from .hosts.router import select_host, dispatch_to_host, deep_model
    from .logger import log_step, log_hitl, default_actor
    from . import events as ev

    workflow_file = compass_dir / "workflows" / f"{workflow_name}.md"
    if not workflow_file.exists():
        print(
            f"Error: workflow file not found: {workflow_file}",
            file=sys.stderr,
        )
        sys.exit(1)

    steps = load_workflow(workflow_file)
    if not steps:
        print(
            f"Warning: no dispatch steps found in {workflow_file}.\n"
            f"  Is this workflow in dispatch-graph shape? "
            f"See compass/framework/canon.md [workflow-as-dispatch-graph].",
            file=sys.stderr,
        )
        sys.exit(1)

    # #159: authoring workflows write artifacts as their whole job — default them to
    # write-enabled so a dashboard launch without the "allow writes" checkbox still
    # lands the brief/story instead of silently permission-blocking every write.
    if _resolve_allow_write(workflow_name, allow_write) and not allow_write:
        allow_write = True
        print(f"[{workflow_name}: producing workflow → write-enabled by default "
              f"(#179 — a doc/code workflow can't produce anything read-only; "
              f"use --dry-run for a read-only pass)]")

    # ── requirement gate (#70 redesign) ──────────────────────────────────────
    # A workflow's frontmatter may declare `requires_approved:` artifact paths.
    # PASS per path: approved hitl.jsonl record OR `status: approved`
    # frontmatter (v0.3.x dual acceptance — the orchestrator/manual bridge).
    requirements = load_workflow_meta(workflow_file)["requires_approved"]
    if requirements:
        unmet = []
        print(f"\nRequirement gate — {workflow_name} requires approved:")
        for req in requirements:
            if "<bet-id>" in req and not bet_id:
                print(f"  ✗ {req}  (pass --bet <ID> to resolve <bet-id>)")
                unmet.append(req)
                continue
            rel = req.replace("<bet-id>", bet_id or "")
            ok, how = _requirement_met(project_dir, rel)
            if ok:
                print(f"  ✓ {rel}  ({how})")
            else:
                print(f"  ✗ {rel}  (no approval found)")
                unmet.append(rel)
        if unmet and not dry_run:
            print(
                f"\nError: {len(unmet)} requirement(s) not approved. "
                f"Halting — gates are load-bearing.",
                file=sys.stderr,
            )
            for path in unmet:
                hint = _producer_hint(path)
                if hint:
                    print(f"  {path} → produced by: python3 -m compass.orchestrator.run {hint}", file=sys.stderr)
            print(
                f"  Already approved outside the orchestrator? Record it:\n"
                f"    python3 -m compass.orchestrator.run --approve <path>",
                file=sys.stderr,
            )
            sys.exit(3)
        if unmet and dry_run:
            print("  [dry-run: reporting only — a live run would halt here (exit 3)]")

    # ── build story-scope gate (#103) — /build is story-scoped; refuse a bet-id ──────
    # `/build <story-id>` implements ONE story. Given a BET (no story resolved) it would
    # collapse the whole Epic into one un-decomposed, un-reviewable mega-PR (live: /build
    # WLT-28 built the entire debt bet as PR #144). Refuse loud, point at /create-story.
    # fix/ops are not story-scoped → _build_story_gate returns None for them.
    #
    # #107: ENTRY gate only — never fires on a RESUME. The cockpit's merge-gate resume
    # passes the PARENT bet_id (--bet WLT-28) for the requirement gate + `--from-step N`,
    # WITHOUT the story scope. Re-running the gate then mis-read that as a bet-level build
    # and halted the human's merge approval (live: WLT-28-3 stuck at step 6). On resume the
    # story was already chosen at dispatch, so `from_step` set ⇒ skip this gate entirely.
    _bsg = _build_story_gate(project_dir, workflow_name, bet_id, story_id, from_step)
    if _bsg:
        print(f"\nBuild scope gate — {_bsg}")
        if not dry_run:
            print("\nError: /build is story-scoped. Halting — building a bet collapses "
                  "the Epic into one un-reviewable PR (#103).", file=sys.stderr)
            sys.exit(3)
        print("  [dry-run: reporting only — a live run would halt here (exit 3)]")

    # ── design/copy gate (#171) — mechanical 'always block' for a story-scoped build ─
    # A UI feature must NOT build until its design/copy dependencies are HUMAN-delivered
    # (status: ready). Enforced mechanically here (not just in the engineer agent's
    # instructions) so the HITL deliverable is load-bearing, like #153's gates. Only
    # design/copy-TYPE deps block — a plain feature-ordering dependency never does, so
    # old-shape stories that predate #171 are never false-blocked.
    if story_id and workflow_name in _CODE_WORKFLOWS:
        blockers = _story_human_deliverable_blockers(project_dir, bet_id, story_id)
        if blockers:
            print(f"\nDesign/copy gate — {story_id} is blocked by un-delivered human deliverables:")
            for dep, dtype, dstatus in blockers:
                print(f"  ⛔ {dep} ({dtype}, status: {dstatus}) — a human must deliver it and flip status → ready")
            if not dry_run:
                print("\nError: build blocked — a human designer/writer must deliver the Figma/copy "
                      "into the listed story(ies) and flip them to `status: ready` before this UI "
                      "feature can build. Halting — design/copy gates are load-bearing (#171).",
                      file=sys.stderr)
                sys.exit(3)
            print("  [dry-run: reporting only — a live run would halt here (exit 3)]")

    # ── sibling-overlap warning (#26) — same-module stories merge serially ──────────
    # A story-scoped build that overlaps another IN-FLIGHT build of the same module will
    # conflict at merge (live: WLT-27-4 vs the CSV-module siblings). Warn loudly but do
    # NOT block — the operator may know what they're doing; the PM should have sequenced
    # them (decompose-bet-to-story #26). Non-fatal.
    if story_id and workflow_name in _CODE_WORKFLOWS:
        for other, reason in _overlapping_inflight_builds(project_dir, bet_id, story_id):
            print(f"⚠ overlap (#26): {story_id} overlaps the in-flight build of {other} "
                  f"({reason}). Same-module stories merge SERIALLY — building them in "
                  f"parallel will conflict at merge. Consider waiting for {other} to merge "
                  f"first, or sequence them via `dependencies`.", file=sys.stderr)

    # ── dry-run ──────────────────────────────────────────────────────────────
    if dry_run:
        print(f"\nDispatch graph: {workflow_name}")
        print(f"{'─' * 50}")
        for s in steps:
            if s.is_hitl and s.routes:
                routes_desc = ", ".join(
                    f"{lbl}→{t}" for lbl, t in s.routes
                )
                marker, label = "[ROUTE]", f"routing gate — {routes_desc}"
            elif s.is_hitl:
                marker, label = "[HITL]", "human gate"
            elif s.agent and s.task:
                marker = f"[{s.agent}.{s.task}]"
                agent_file = None
                for subdir in ("agents", "roles"):
                    candidate = compass_dir / subdir / (s.agent_file or f"{s.agent}.md")
                    if candidate.exists():
                        agent_file = candidate
                        break
                if agent_file:
                    ph = _read_preferred_hosts(agent_file)
                    selected = select_host(ph)
                    label = f"→ {selected or 'NO HOST AVAILABLE'} (preferred: {ph})"
                else:
                    label = f"→ agent file not found"
            else:
                marker, label = "[workflow]", s.title
            print(f"  Step {s.number:2d}  {marker:45s}  {label}")
        # #110: routing-gate targets shown above are the STATIC fallbacks; the
        # live hand-off echoes the classifier's right-sized `Next command:`.
        if any(s.is_hitl and s.routes for s in steps):
            print("\n  note: routing-gate targets are static fallbacks — the live run "
                  "uses the\n        classifier's right-sized recommendation "
                  "(e.g. enhancement → /create-story --bet <id>).")
        print()
        return [], []

    # ── execution ─────────────────────────────────────────────────────────────
    from datetime import datetime as _dt
    _ts = _dt.now().strftime("%Y%m%dT%H%M%S")
    # #121: a --from-step resume (e.g. the dashboard /decide) must CONTINUE the
    # paused run, not fork a new id — otherwise the original lingers in the
    # cockpit's ⏸ awaiting queue forever and the resume shows as a duplicate run.
    # #172: a story-scoped run keys its identity on the story (parallel story
    # builds get distinct run ids / logs / branches), falling back to the bet.
    _scope_id = story_id or bet_id
    run_id = run_id_override or f"{workflow_name}--{_scope_id or 'no-bet'}--{_ts}"
    actor = default_actor(project_dir)  # who launched this run — the audit-trail identity

    prior_outputs = list(initial_prior_outputs or [])
    artifact_paths = []

    # --from-step: load prior steps from disk
    if from_step is not None:
        print(f"\nResuming from step {from_step} — loading prior outputs from disk …")
        disk_outputs = _load_prior_outputs_from_disk(
            project_dir, workflow_name, steps, from_step, run_id
        )
        prior_outputs = list(initial_prior_outputs or []) + disk_outputs
        print(f"  {len(disk_outputs)} prior step(s) loaded.\n")

    # #173: keep the ORIGINAL user-supplied context for branch naming, BEFORE the
    # bet/story/full-project blobs are prepended below. Slugging the loaded blob
    # produced garbage branches like `feat/WLT-27-bet-context-wlt-27-briefmd-----id`
    # (the #157 fix only covered the resume path; fresh runs still slugged the blob).
    user_context = context

    # --full-project: load portfolio-wide context (foundation + all bets + status)
    if full_project:
        fp_context = _load_full_project_context(project_dir)
        context = fp_context + ("\n\n" + context if context else "")
        print(f"[full-project] Loaded foundation + portfolio context from {project_dir}/docs/")

    # --story: focused single-story context (#172) — only the target story + the
    # parent bet's brief/architecture, so a parallel story build stays in scope.
    # Falls through to whole-bet context when no story scope is set.
    if story_id and bet_id:
        story_context = _load_story_context(project_dir, bet_id, story_id)
        context = story_context + ("\n\n" + context if context else "")
        print(f"[story] Scoped to {story_id} (bet {bet_id}) — "
              f"docs/bets/{bet_id}/stories/{story_id}/")
    elif bet_id:
        # --bet: load existing bet artifacts as initial context
        bet_context = _load_bet_context(project_dir, bet_id)
        context = bet_context + ("\n\n" + context if context else "")
        print(f"[bet] Loaded context for {bet_id} from docs/bets/{bet_id}/")

    # Stack profile (stack-agnostic core): the delivery agents stay stack-neutral and
    # read the project's build/test/runtime contracts from a pluggable profile selected
    # by config.yaml `stack:` (override-resolved). Loaded once here; injected per
    # delivery step below. No `stack:` (or no profile) → agents run stack-neutral.
    stack = _read_stack_from_config(compass_dir)
    stack_profile_text = _load_stack_context(compass_dir, project_dir, stack) if stack else ""
    if stack and stack_profile_text:
        print(f"[stack] Loaded stack profile '{stack}'")
    elif stack:
        print(f"[stack] config declares stack '{stack}' but no profile found "
              f"(compass/stacks/{stack}.md or compass-overrides/stacks/) — agents run "
              f"stack-neutral", file=sys.stderr)

    # Write-mode CODE work lands on a work branch, never directly on main (#99) —
    # the branch→review→merge discipline. #151: DOC workflows (create-brief/-story/
    # -architecture, setup-*) are reviewed via their HITL gate, not a PR — they skip
    # the work-branch dance (no spurious feat/work branch) and write on the current
    # branch; their artifacts are committed, not deployed (the #150 message guides).
    # #174: exec_dir is WHERE the host edits/commits — the canonical project_dir by
    # default, or an isolated git worktree when --worktree is on. Telemetry, gates, and
    # artifact reads always stay on project_dir; only the host's cwd moves.
    exec_dir = project_dir

    def _place_work(branch_name, *, resume=False):
        """Put the work on `branch_name` in an isolated git WORKTREE and return
        (branch, exec_dir). This is the DEFAULT (#174 — standard per-unit-of-work
        isolation: each story build gets its own checkout branched off main, so builds
        never share the one working tree → genuinely parallel). Falls back to the
        single tree (#173 stash-isolated) only when a worktree can't be created (not a
        git repo, git too old, etc.) — automatic resilience, not a knob."""
        wt = _ensure_work_worktree(project_dir, branch_name)
        if wt:
            print(f"[worktree] {'resumed' if resume else 'isolated'} build in {wt} on "
                  f"'{branch_name}' — branched off main, parallel-safe "
                  f"(remove with `git worktree remove`)")
            return branch_name, wt
        placed = _ensure_work_branch(project_dir, branch_name)
        if placed and not resume:
            print(f"[branch] write-mode work on '{placed}' (single tree — worktree "
                  f"unavailable) — open a PR + merge after review")
        elif placed:
            print(f"[branch] resumed on '{placed}' (single tree)")
        return placed, project_dir

    work_branch = None
    if allow_write and workflow_name in _CODE_WORKFLOWS:
        if from_step is not None:
            # #157: a resume must REUSE the original run's branch (recorded in the
            # spine), never regenerate a name from the input — a dashboard merge-gate
            # resume passed the bet-context blob as `context` and cut a garbage branch
            # (`feat/WLT-26-bet-context-…`), stranding the work + confusing delivery.
            work_branch = _prior_run_branch(run_id)
            if work_branch:
                work_branch, exec_dir = _place_work(work_branch, resume=True)
            else:
                print("[branch] resume — no recorded branch; staying on the current branch")
        else:
            # #172: a story-scoped build branches on the story id (feat/<story>-…)
            # so multiple stories of one bet can build in parallel without colliding
            # on a single feat/<bet>-… branch.
            bname = _work_branch_name(workflow_name, story_id or bet_id, user_context)
            work_branch, exec_dir = _place_work(bname)

    # Event spine (#104): one emit per run, stamping project/run_id/workflow onto
    # every event and fanning to the terminal + the user-local events.jsonl
    # (~/.compass/orchestrator/) the portfolio cockpit reads. --no-events / --dry-run
    # suppress the durable sink (telemetry is best-effort, never a project artifact).
    _project = ev.project_label(project_dir)
    _sinks = [ev.terminal_sink]
    if not no_events and not dry_run:
        _sinks.append(ev.jsonl_sink())
    _fan = ev.multi_sink(*_sinks)
    run_cost = {"usd": 0.0}  # accumulated spend this run (#116)

    def _sink(event: dict):
        """on_event sink — takes a full event dict (the convention claude.py's
        tool loop uses). Stamps run identity, fans to terminal + jsonl, and
        (#116) accumulates spend on `usage` events, raising BudgetExceeded when a
        --max-cost cap is crossed (propagates out of the tool loop → clean halt).
        Fixes #104's wiring bug: run.py previously passed an emit(type, **fields)
        function as on_event, but the loop calls on_event(dict) — so tool/usage
        events were mangled (never rendered, never priced)."""
        event.setdefault("project", _project)
        event.setdefault("run_id", run_id)
        event.setdefault("workflow", workflow_name)
        event.setdefault("bet_id", bet_id)
        if story_id:
            event.setdefault("story_id", story_id)
        _fan(event)
        if event.get("type") == ev.USAGE:
            run_cost["usd"] += ev.cost_of_usage_event(event)
            if max_cost and run_cost["usd"] > max_cost:
                raise BudgetExceeded(
                    f"run spend ~${run_cost['usd']:.2f} exceeded --max-cost ${max_cost:.2f}"
                )

    def emit(type, **fields):
        _sink(ev.make_event(type, **fields))

    emit(ev.RUN_START, allow_write=allow_write, branch=work_branch, actor=actor,
         # #156: record the run's host MODE so a dashboard /decide resume can carry it
         # forward (reuse the subscription CLI hosts, not silently fall back to the API).
         claude_cli=claude_cli, codex_cli=codex_cli,
         project_dir=str(project_dir),  # #119: full path so the cockpit can resume any run
         compass_dir=str(compass_dir))  # #178: so the copy-paste approve targets the right framework dir

    last_artifact_path = None
    # On a --from-step resume the prior agent step was loaded from disk (not re-run),
    # so seed last_agent_output from it — else a gate-resume can't promote/flip the
    # artifact ("no prior step output to promote"). _promote_artifact still reads the
    # on-disk artifact for the actual content.
    last_agent_output = prior_outputs[-1].get("output", "") if prior_outputs else ""
    first_step = True
    skipped = set()  # steps in a not-taken branch (#96 conditional dispatch)
    handed_off = False  # set when a #103 cross-workflow hand-off ends the run early
    incomplete_steps = []  # #159: steps that returned but didn't do their job

    for step in steps:
        if only_step is not None and step.number != only_step:
            continue
        if from_step is not None and step.number < from_step:
            continue
        if step.number in skipped:
            print(f"\n[step {step.number} skipped — not on the chosen branch]")
            continue

        print(f"\n{'─' * 60}")
        print(f"[{workflow_name}] Step {step.number}: {step.title}")
        print(f"{'─' * 60}")
        emit(ev.STEP_START, step=step.number, title=step.title,
             agent=step.agent, task=step.task)

        # ── routing gate (#96, [conditional-dispatch]) ────────────────────────
        if step.is_hitl and step.routes:
            from .hitl import handle_routing_gate
            emit(ev.GATE_OPEN, step=step.number, kind="routing", title=step.title)
            if non_interactive:
                # #118: don't block on input — apply --decide or pause-and-exit.
                action, label = _resolve_gate(decide, True, step.routes)
                decide = None  # consume — later gates this run pause
                if action == "pause":
                    labels = " / ".join(lbl for lbl, _ in step.routes)
                    print(
                        f"\n⏸ paused at routing gate (step {step.number}) — awaiting a route.\n"
                        f"  Resume with one of [{labels}]:\n"
                        + _resume_hint(workflow_name, step.number, run_id,
                                       project_dir, allow_write, "<route>")
                    )
                    sys.exit(0)  # clean pause (no RUN_END → cockpit shows ⏸ awaiting)
                choice = {"route": label, "target": dict(step.routes)[label]}
            else:
                choice = handle_routing_gate(
                    step.number, step.title, step.routes, last_agent_output
                )
            target = choice["target"]
            log_hitl(
                project_dir=project_dir,
                run_id=run_id,
                workflow=workflow_name,
                bet_id=bet_id,
                step=step.number,
                artifact_path=None,
                decision=choice["route"],
            )
            emit(ev.GATE_DECISION, step=step.number, decision=choice["route"], actor=actor)
            if isinstance(target, int):
                # Inline branch (#96): skip the not-taken steps, keep walking.
                skipped.update(_skip_for_route(step.number, target))
                print(f"[route → {choice['route']} (continue at step {target})]")
                continue
            # Cross-workflow hand-off or close (#103): this workflow's job —
            # classify + route — is done. Recommend the next command and end
            # the run cleanly (break → normal success finalization).
            print(f"\n[route → {choice['route']} — hand off to {target}]")
            # #110: prefer the prior step's right-sized recommendation (e.g.
            # classify-intake's `Next command: create-story --bet CB-7`) over the
            # gate's static fallback target; fall back to the generic message.
            rec = _recommended_next(last_agent_output)
            if rec:
                print(f"Recommended (right-sized):\n  {rec}")
                print(f"  [route default was {target} — use the recommendation above if it differs]")
            else:
                print(_handoff_message(target, project_dir, last_artifact_path))
            emit(ev.HANDOFF, step=step.number, target=target)
            emit(ev.RUN_END, status="completed", reason=f"handed off to {target}")
            handed_off = True
            break

        # ── HITL gate ────────────────────────────────────────────────────────
        if step.is_hitl:
            emit(ev.GATE_OPEN, step=step.number, kind="hitl", title=step.title)
            # #153: backstop the no-self-approve rule mechanically — if the prior
            # step's agent already marked the gated artifact approved, revert to
            # `proposed` so this gate is a real human decision, not a rubber stamp.
            if step.artifact_target and last_artifact_path:
                reverted = _revert_self_approval(last_artifact_path)
                if reverted:
                    print(
                        f"⚠ self-approval reverted (#153): the agent set "
                        f"`status: {reverted}` on {last_artifact_path.name} BEFORE this "
                        f"gate — reset to `proposed`. Approval is your decision here "
                        f"(Principle #16)."
                    )
                    emit(ev.NOTE, text=(f"self-approval reverted ({reverted}→proposed) "
                                        f"on step {step.number} [#153]"))

            # Project the DRAFT to its system of record on ARRIVAL at the gate — the
            # team sees the story/doc in Jira/Confluence immediately (in its draft
            # status), not only after approval. Approval re-projects as approved
            # (idempotent via the stored pointer). Fires even when the gate then pauses.
            # [Codex review] Guarded twice so an UNAPPROVED draft never lands in the
            # canonical filesystem: (1) only when the agent ALREADY wrote the canonical
            # file (we never fabricate it from step output pre-approval — that stays
            # approval-gated); (2) only for EXTERNAL connectors (jira/confluence), so a
            # filesystem-only setup is unchanged.
            if (step.artifact_target and not no_write
                    and not ("<bet-id>" in step.artifact_target and not bet_id)):
                _draft_rel = step.artifact_target.replace("<bet-id>", bet_id or "")
                from .connector import resolve_connector_for_artifact
                if ((project_dir / _draft_rel).exists()
                        and resolve_connector_for_artifact(
                            _draft_rel, project_dir, compass_dir) != "filesystem"):
                    _draft_label = _promote_artifact(project_dir, compass_dir, _draft_rel,
                                                     last_agent_output, run_id, status=None,
                                                     no_write=no_write)
                    if _draft_label and "fallback" not in _draft_label:
                        print(f"[projected draft → {_draft_rel} via {_draft_label}]")

            if non_interactive:
                # #118: don't block on input — apply --decide or pause-and-exit.
                action, _ = _resolve_gate(decide, False, None)
                decide = None  # consume
                if action == "pause":
                    print(
                        f"\n⏸ paused at HITL gate (step {step.number}) — awaiting your decision.\n"
                        f"  Resume:\n"
                        + _resume_hint(workflow_name, step.number, run_id,
                                       project_dir, allow_write, "approve|reject")
                    )
                    sys.exit(0)  # clean pause (no RUN_END → cockpit shows ⏸ awaiting)
                result = {"approved": action == "approve"}
                if action == "reject":
                    result["feedback"] = "(non-interactive reject via --decide)"
            else:
                result = handle_hitl_gate(
                    step.number,
                    step.title,
                    last_artifact=last_artifact_path,
                    last_output=last_agent_output,
                )
            artifact_rel = (
                str(last_artifact_path.relative_to(project_dir))
                if last_artifact_path else None
            )
            decision = "approved" if result["approved"] else "rejected"

            # Promotion (#70): approval flips status → approved and RE-projects the
            # artifact (idempotent update of the same Jira issue / Confluence page that
            # the draft projection above already created — the pointer is on disk).
            canonical_rel = connector_label = None
            if result["approved"] and step.artifact_target:
                if "<bet-id>" in step.artifact_target and not bet_id:
                    print(
                        f"Warning: cannot promote — artifact target "
                        f"'{step.artifact_target}' needs --bet <ID>. "
                        f"Promote manually with --approve once written.",
                        file=sys.stderr,
                    )
                elif not last_agent_output:
                    print(
                        "Warning: no prior step output to promote.",
                        file=sys.stderr,
                    )
                else:
                    canonical_rel = step.artifact_target.replace("<bet-id>", bet_id or "")
                    if no_write:
                        print(f"[no-write: would promote → {canonical_rel}]")
                        canonical_rel = None
                    else:
                        connector_label = _promote_artifact(
                            project_dir, compass_dir, canonical_rel, last_agent_output,
                            run_id, status="approved", no_write=no_write)
                        print(f"[promoted → {canonical_rel} via {connector_label}]")

            log_hitl(
                project_dir=project_dir,
                run_id=run_id,
                workflow=workflow_name,
                bet_id=bet_id,
                step=step.number,
                artifact_path=artifact_rel,
                decision=decision,
                feedback=result.get("feedback") or None,
                connector=connector_label,
                canonical_path=canonical_rel,
            )
            emit(ev.GATE_DECISION, step=step.number, decision=decision, actor=actor)
            print(f"[hitl → {decision}]")

            # #147 delivery closure: approving a MERGE gate actually merges the PR
            # (→ host auto-deploys on main). Opt-in (--auto-merge); the human's
            # approval is the authorization, so this honors the gate, doesn't bypass
            # it. Best-effort — a failure (CI red, conflict, no gh) notes loudly and
            # leaves the PR for a manual merge; it never turns an approval into a halt.
            if result["approved"] and auto_merge and work_branch and _is_merge_gate(step.title):
                ok, msg = _merge_pr(project_dir, work_branch)
                print(f"[auto-merge{'' if ok else ' ⚠'}] {msg}")
                emit(ev.NOTE, text=f"auto-merge: {msg}")
            elif result["approved"] and _is_merge_gate(step.title) and not auto_merge:
                # #157: no auto-merge → don't leave the operator at "[handle manually]"
                # with no idea what to do. Spell out the next step (merge the PR, then
                # the next story) and point at the actual PR when we can find it.
                steps_msg = _merge_next_steps(_open_pr_url(project_dir, work_branch), bet_id)
                print(steps_msg)
                emit(ev.NOTE, text="merge gate approved — next: merge the PR, then /create-story")

            if not result["approved"]:
                if not no_write:
                    note_path = _write_rejection_note(
                        project_dir, workflow_name, step.number, result["feedback"], run_id
                    )
                    print(f"[rejection note → {note_path.relative_to(project_dir)}]")
                print(
                    f"\nWorkflow '{workflow_name}' halted at HITL gate (step {step.number}).\n"
                    f"To rerun from this step:\n"
                    f"  python3 -m compass.orchestrator.run {workflow_name} "
                    f"--from-step {max(1, step.number - 1)}"
                )
                emit(ev.RUN_END, status="halted",
                     reason=f"rejected at HITL gate (step {step.number})")
                # Non-zero: a rejected gate is a halted run, not a success —
                # CI and pipeline callers must not read this as green.
                sys.exit(1)
            continue

        # ── workflow-level steps (no agent) ──────────────────────────────────
        if not step.agent or not step.task:
            print(f"  [workflow-level step — no agent dispatch; handle manually]")
            continue

        # ── resolve agent file ───────────────────────────────────────────────
        agent_file = None
        for subdir in ("agents", "roles"):
            candidate = compass_dir / subdir / (step.agent_file or f"{step.agent}.md")
            if candidate.exists():
                agent_file = candidate
                break

        if agent_file is None:
            if skip_missing:
                print(
                    f"STEP {step.number} SKIPPED (explicit --skip-missing): "
                    f"agent file for '{step.agent}' not found. "
                    f"Log this skip as a DRI Decision with rationale.",
                    file=sys.stderr,
                )
                continue
            print(
                f"Error: agent file for '{step.agent}' not found "
                f"(looked in {compass_dir}/agents/ and {compass_dir}/roles/).\n"
                f"  Halting — no silent skips (AGENTS.md principle).\n"
                f"  Fix the dispatch graph or agent file, then resume with "
                f"--from-step {step.number}.\n"
                f"  To skip explicitly instead, rerun with --skip-missing "
                f"(the skip must be logged as a DRI Decision).",
                file=sys.stderr,
            )
            emit(ev.RUN_END, status="halted",
                 reason=f"agent file for '{step.agent}' not found (step {step.number})")
            sys.exit(2)

        # ── host selection ───────────────────────────────────────────────────
        preferred_hosts = _read_preferred_hosts(agent_file)
        if claude_cli:
            preferred_hosts = _remap_claude_cli(preferred_hosts)
        if codex_cli:
            preferred_hosts = _remap_codex_cli(preferred_hosts)
        host = select_host(preferred_hosts)

        if host is None:
            if skip_missing:
                print(
                    f"STEP {step.number} SKIPPED (explicit --skip-missing): "
                    f"no host available for {step.agent}.{step.task} "
                    f"(preferred_hosts: {preferred_hosts}). "
                    f"Log this skip as a DRI Decision with rationale.",
                    file=sys.stderr,
                )
                continue
            print(
                f"Error: no host available for step {step.number} "
                f"({step.agent}.{step.task}).\n"
                f"  preferred_hosts: {preferred_hosts}\n"
                f"  Halting — no silent skips (AGENTS.md principle). Skipping a "
                f"review step would mean the run ships with NO independent review.\n"
                f"  Set the matching key ({', '.join('install + log into the `claude` CLI (or drop --claude-cli)' if h == 'claude-code' else 'ANTHROPIC_API_KEY' if h == 'claude' else 'OPENAI_API_KEY' if h in ('codex', 'chatgpt') else 'GEMINI_API_KEY' for h in preferred_hosts)}), "
                f"then resume with --from-step {step.number}.\n"
                f"  To skip explicitly instead, rerun with --skip-missing "
                f"(the skip must be logged as a DRI Decision).",
                file=sys.stderr,
            )
            emit(ev.RUN_END, status="halted",
                 reason=f"no host for {step.agent}.{step.task} (step {step.number})")
            sys.exit(2)

        try:
            agent_label = agent_file.relative_to(project_dir)
        except ValueError:
            agent_label = agent_file
        # Per-step model (#115): explicit --model wins; else `model_tier: deep`
        # → frontier model; else None → router default (Sonnet, the economy tier).
        tier = _read_model_tier(agent_file)
        step_model = model or (deep_model(host) if tier == "deep" else None)

        print(f"Agent      : {agent_label}")
        print(f"Task       : {step.task}")
        print(f"Host       : {host}  (preferred: {preferred_hosts})")
        if model:
            print(f"Model      : {model} (override)")
        elif tier == "deep":
            print(f"Model      : {step_model} (model_tier: deep)")
        if prior_outputs:
            print(f"Context    : {len(prior_outputs)} prior step(s) passed")

        # First step of this workflow uses --context; subsequent steps prompt
        inline = context if first_step else ""
        first_step = False

        user_context = _collect_input(step.title, inline, non_interactive=non_interactive)

        # #138: the Reviewer runs on a tool-less host (codex/gemini) and can't fetch
        # the PR/diff itself — inject the branch diff so it has something to review.
        if step.agent in ("reviewer", "security-reviewer"):
            # #102: diff the WORKTREE where the code was written (exec_dir), NOT the
            # shared main checkout (project_dir) — the latter sits on whatever branch
            # the operator last left it on, so the reviewer would review the WRONG
            # branch entirely (live: a WLT-28 build reviewed an unrelated accounts fix
            # branch). exec_dir falls back to project_dir for non-isolated runs.
            diff = _review_diff(exec_dir)
            if diff:
                user_context = _with_review_context(user_context, diff)
                print("[review] injected branch diff as context (reviewer host has no repo tools)")

        # Bet catalog (#109): agents that declare `loads_bet_catalog: true` (e.g.
        # support.classify-intake) get the existing-bets list prepended so they can
        # right-size an enhancement and name the bet a slice belongs to.
        if _reads_bet_catalog(agent_file):
            catalog = _load_bet_catalog(project_dir)
            if catalog:
                user_context = catalog + "\n" + user_context
                print("[bet-catalog] injected existing-bets list for right-sizing")

        # Stack profile (stack-agnostic core): delivery agents read the project's
        # stack-specific contracts from the pluggable profile instead of hardcoding
        # them. Inject for the agents that act on code.
        if stack_profile_text and step.agent in (
            "engineer", "reviewer", "security-reviewer", "automation"
        ):
            user_context = stack_profile_text + "\n" + user_context
            print(f"[stack] injected '{stack}' profile for {step.agent}")

        user_message = _build_user_message(step.task, user_context, prior_outputs)

        agent_tools = _read_agent_tools(agent_file)
        if agent_tools and host == "claude":
            granted = [t for t in agent_tools if t in ("read_file", "glob", "grep") or allow_write]
            mode = "read+write" if allow_write else "read-only"
            tools_note = f" (tools: {', '.join(granted)} — {mode})"
        elif agent_tools and host == "claude-code":
            # #120: Claude Code owns its tool loop; allow_write maps to the
            # permission mode (bypassPermissions=edits+bash, else default=read-only).
            mode = "bypassPermissions: edits+bash" if allow_write else "default: read-only"
            tools_note = f" (Claude Code tools — {mode})"
        else:
            tools_note = ""
        print(f"\nDispatching to {host}{tools_note} …")
        if agent_tools and host in ("claude", "claude-code"):
            # #111 heartbeat: a tool step's first model turn (reading the agent
            # file + reasoning) can run 1–2 min before the first tool line prints,
            # so it looks frozen. Set the expectation; the spine has live detail.
            print("  (first model turn can take ~1–2 min before tool activity appears — "
                  "watch `python3 -m compass.orchestrator.cockpit --run <id>`)")
        try:
            result = dispatch_to_host(
                host, str(agent_file), step.task, user_message, model=step_model,
                tools=agent_tools or None, project_dir=exec_dir,  # #174: worktree when isolated
                allow_write=allow_write, max_tool_iterations=max_tool_iterations,
                on_event=_sink,
            )
        except BudgetExceeded as exc:
            print(
                f"\n💰 Budget cap reached at step {step.number}: {exc}\n"
                f"  Run halted to protect spend. Resume with a higher cap:\n"
                f"    python3 -m compass.orchestrator.run {workflow_name} "
                f"--from-step {step.number} --max-cost <higher>"
                + (f" --allow-write" if allow_write else ""),
                file=sys.stderr,
            )
            emit(ev.RUN_END, status="halted", reason=str(exc))
            sys.exit(1)
        except KeyboardInterrupt:
            # #83: operator Ctrl-C. The dispatch runner already killed the child
            # process group; halt the RUN CLEANLY (emit RUN_END so it doesn't hang
            # in-flight forever + orphan the worktree) with a one-line message, not a
            # raw traceback. Resume from this step whenever you want.
            print(
                f"\n⏹  Interrupted — halting the run and stopping the process. "
                f"Resume:\n"
                f"    python3 -m compass.orchestrator.run {workflow_name} "
                f"--from-step {step.number}"
                + (f" --allow-write" if allow_write else ""),
                file=sys.stderr,
            )
            emit(ev.RUN_END, status="halted",
                 reason=f"interrupted by operator at step {step.number}")
            sys.exit(130)
        except Exception as exc:
            # Any dispatch failure — API 400s, rate limits, network, SDK errors
            # (#112) — halts CLEANLY with a resume hint, never a raw traceback.
            print(
                f"Error dispatching step {step.number} ({step.agent}.{step.task}) "
                f"to {host}: {exc}\n"
                f"  Run halted. Fix the cause, then resume:\n"
                f"    python3 -m compass.orchestrator.run {workflow_name} "
                f"--from-step {step.number}"
                + (f" --allow-write" if allow_write else ""),
                file=sys.stderr,
            )
            emit(ev.RUN_END, status="halted",
                 reason=f"dispatch error at step {step.number}: {type(exc).__name__}: {exc}")
            sys.exit(1)

        print(f"\n{'=' * 60}")
        print(f"[{workflow_name} — Step {step.number}: {step.agent}.{step.task} via {host}]")
        print(f"{'=' * 60}\n")
        print(result)
        print()

        if not no_write:
            artifact_path = _write_artifact(
                project_dir, workflow_name, step.number,
                step.agent, step.task, result, run_id,
            )
            rel = str(artifact_path.relative_to(project_dir))
            print(f"[artifact → {rel}]")
            artifact_paths.append(rel)
            last_artifact_path = artifact_path
        else:
            last_artifact_path = None

        last_agent_output = result

        # Log structured record to runs.jsonl
        rec = log_step(
            project_dir=project_dir,
            run_id=run_id,
            workflow=workflow_name,
            bet_id=bet_id,
            step=step.number,
            agent=step.agent,
            task=step.task,
            host=host,
            model=step_model,
            output=result,
            artifact_path=str(last_artifact_path.relative_to(project_dir)) if last_artifact_path else None,
        )
        # #149: confirm the step actually did its job (not just that it returned).
        outcome, why = _classify_outcome(result)
        emit(ev.STEP_END, step=step.number, outcome=outcome, outcome_reason=why,
             gate_result=rec.get("gate_result"), output_chars=rec.get("output_chars"))
        if outcome != "done":
            incomplete_steps.append((step.number, step.agent, step.task, why))
            print(f"  ✗ step {step.number} ({step.agent}.{step.task}) looks "
                  f"INCOMPLETE — {why}", file=sys.stderr)
        if run_cost["usd"] > 0:
            print(f"[cost] run ~${run_cost['usd']:.3f}"
                  + (f" / ${max_cost:.2f} cap" if max_cost else " (no cap — set --max-cost)"))

        prior_outputs.append({
            "step": step.number,
            "agent": step.agent,
            "task": step.task,
            "host": host,
            "workflow": workflow_name,
            "output": result,
        })

        # #125 dispatch-on-outcome: the refusal is now recorded (printed, written,
        # logged) — halt rather than cascade into steps that would also refuse.
        if _is_refusal(result):
            print(
                f"\n[refused] step {step.number} ({step.agent}.{step.task}) "
                f"returned a refusal — halting (dispatch-on-outcome, #125). The "
                f"refusal is recorded above; act on its escalation, then resume:\n"
                f"  python3 -m compass.orchestrator.run {workflow_name} "
                f"--from-step {step.number}",
                file=sys.stderr,
            )
            emit(ev.RUN_END, status="halted",
                 reason=f"agent refused at step {step.number} ({step.agent}.{step.task})")
            sys.exit(1)

        # #92: mechanical, CI-parity CHECK GATE. After a code-producing step commits +
        # pushes, the ORCHESTRATOR runs ALL checks (lint/typecheck/test/build) in the
        # worktree — 'checks green' is VERIFIED, not the agent's self-report — and opens
        # the PR ONLY on green, so a PR is never created dirty (#89, [fail-loud-not-silent],
        # parallels #71). Fixes the class where a lint/typecheck error first surfaced in CI.
        if (workflow_name in _CODE_WORKFLOWS and allow_write and not no_write
                and step.task in _CHECK_TASKS):
            checks = _resolve_checks(project_dir, compass_dir)
            if not checks:
                warn = ("⚠ NO CHECKS DECLARED — add a `checks:` list to config.yaml "
                        "(CI-parity) so the orchestrator verifies lint/typecheck/test/build "
                        "before the PR. Mechanical verification skipped this run.")
                print("\n" + warn, file=sys.stderr)
                emit(ev.NOTE, text=warn)
            else:
                print(f"\n[checks] running {len(checks)} CI-parity check(s) in {exec_dir} …")
                ok, failed, tail = _run_checks(exec_dir, checks)
                if not ok:
                    print(f"\n⚠ CHECKS FAILED — `{failed}`\n{tail}\n"
                          f"  Run halted BEFORE opening a PR (no dirty PR). Fix, then resume:\n"
                          f"    python3 -m compass.orchestrator.run {workflow_name} "
                          f"--from-step {step.number}"
                          + (" --allow-write" if allow_write else ""),
                          file=sys.stderr)
                    emit(ev.RUN_END, status="halted", reason=f"checks failed: {failed}")
                    sys.exit(1)
                print("  ✓ all checks passed")
                pr = _ensure_pr(exec_dir, work_branch, result)
                if pr:
                    print(f"[PR opened on green checks → {pr}]")
                    emit(ev.NOTE, text=f"PR opened on green checks → {pr}")

    # #145: a write-mode run that did real work but left it uncommitted hasn't
    # DELIVERED it (no commit → no PR → no deploy — the "I didn't see a deployment"
    # gap). Fail loud at completion so the result isn't mistaken for shipped.
    # #151: fires for doc workflows too (no work_branch) — they still need the
    # "commit the artifact" nudge even though they don't branch.
    if allow_write and not handed_off:
        leftover = _uncommitted_code(project_dir)
        if leftover:
            warn = _delivery_warning(workflow_name, leftover)
            print("\n" + warn, file=sys.stderr)
            emit(ev.NOTE, text=warn)

    # #159: an authoring workflow whose whole job is to write a doc artifact must
    # FAIL LOUD if a step produced no real work (permission-blocked / plan-only) —
    # otherwise the run reports "completed" while docs/bets/ stays empty (the live
    # create-brief that "worked" but landed no WLT-27 brief). [fail-loud-not-silent].
    if workflow_name in _AUTHORING_WORKFLOWS and incomplete_steps and not handed_off:
        names = ", ".join(f"step {n} ({a}.{t})" for n, a, t, _ in incomplete_steps)
        warn = (f"⚠ AUTHORING INCOMPLETE — {workflow_name} reported done but "
                f"{len(incomplete_steps)} step(s) did NOT produce their artifact "
                f"({names}). The doc was NOT written — check write permission "
                f"(producing workflows are write-enabled by default since #179; if "
                f"you see permission-dialog narration, the host couldn't write).")
        print("\n" + warn, file=sys.stderr)
        emit(ev.NOTE, text=warn)

    # #71: /fix must actually CREATE the Jira Bug/Story. The orchestrator writes the fix
    # record from the ENGINEER's classification + PR and projects it — not left to agent
    # prose (which the headless agent skipped, #89). Fail LOUD if Jira is configured but
    # nothing was tracked. [fail-loud-not-silent].
    if workflow_name == "fix" and not handed_off and not no_write:
        _eng_output = next((p["output"] for p in prior_outputs
                            if p.get("task") == "triage-and-fix"), last_agent_output)
        _fix_label = _project_fix_record(project_dir, compass_dir, bet_id, work_branch,
                                         _eng_output, run_id)
        if _fix_label:
            print(f"\n[fix tracked → {_fix_label}]")
            emit(ev.NOTE, text=f"fix tracked → {_fix_label}")
            if "fallback" in _fix_label and "not configured" not in _fix_label:
                warn = (f"⚠ TRACKING INCOMPLETE — /fix produced no Jira item "
                        f"({_fix_label}). The work isn't on the board.")
                print("\n" + warn, file=sys.stderr)
                emit(ev.NOTE, text=warn)

    if not handed_off:
        emit(ev.RUN_END, status="completed", reason="all steps complete")

    return prior_outputs, artifact_paths


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

def _module_mismatch_warning(compass_dir, running=None) -> str:
    """#40: warn when the RUNNING orchestrator code is a VENDORED framework copy that
    differs from --compass-dir — the footgun where `python -m compass.orchestrator.run`
    from a consumer dir loads that consumer's stale `compass/` (so new flags error as
    'unrecognized') even though --compass-dir names the real framework. The running
    code lives at `compass/orchestrator/run.py`, so its framework dir is
    `Path(__file__).parents[1]` (overridable via `running` for tests); we only warn when
    that dir is itself a framework checkout (has `workflows/`/`agents/` siblings) — NOT
    an installed package in site-packages — so a clean `pip install -e .` never
    false-warns. Returns the warning string, or None."""
    if not compass_dir:
        return None
    running = (Path(running) if running else Path(__file__).parents[1]).resolve()
    target = Path(compass_dir).resolve()
    if running == target:
        return None
    if (running / "workflows").is_dir() or (running / "agents").is_dir():
        return (f"⚠ stale-module risk (#40): running orchestrator code from {running}, "
                f"but --compass-dir points at {target}. You're likely running a VENDORED "
                f"compass copy (e.g. from a consumer dir), not the framework you named — "
                f"new flags/fixes may be missing. Run from the compass repo dir, or "
                f"`pip install -e .` there for a cwd-independent `compass-run`.")
    return None


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="compass run",
        description="Compass orchestrator v0.4-alpha",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Single workflow:
              python3 -m compass.orchestrator.run setup-product --dry-run
              python3 -m compass.orchestrator.run setup-product \\
                --context "Personal finance app for millennials."

            Pipeline — PM → Architect → Build (cross-workflow handoff):
              python3 -m compass.orchestrator.run \\
                --pipeline create-brief,create-bet-architecture,build \\
                --context "We are building a crypto portfolio tracker."

            Resume after HITL rejection on step 3:
              python3 -m compass.orchestrator.run setup-product --from-step 3

            Multi-host (Reviewer → Codex when OPENAI_API_KEY set):
              export ANTHROPIC_API_KEY=sk-ant-...
              export OPENAI_API_KEY=sk-...
              python3 -m compass.orchestrator.run build
        """),
    )
    parser.add_argument(
        "workflow",
        nargs="?",
        help="Workflow name (e.g., setup-product). Omit when using --pipeline.",
    )
    parser.add_argument("--project-dir", default=".", metavar="PATH")
    parser.add_argument(
        "--compass-dir",
        default=None,
        metavar="PATH",
        dest="compass_dir",
        help=(
            "Path to the Compass framework directory (the folder containing "
            "agents/, workflows/, framework/). Defaults to <project-dir>/compass. "
            "Override this when Compass lives in a separate repo from your project."
        ),
    )
    parser.add_argument(
        "--pipeline",
        default=None,
        metavar="W1,W2,…",
        help="Comma-separated list of workflows to run in sequence",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--step", type=int, default=None, metavar="N")
    parser.add_argument(
        "--from-step", type=int, default=None, metavar="N", dest="from_step",
    )
    parser.add_argument("--context", default="", metavar="TEXT")
    parser.add_argument(
        "--bet",
        default=None,
        metavar="ID",
        help=(
            "Bet ID to work on (e.g., CB-4). Automatically loads "
            "docs/bets/<ID>/brief.md, architecture.md, and story summaries "
            "as context for the first agent step."
        ),
    )
    parser.add_argument(
        "--story",
        default=None,
        metavar="ID",
        help=(
            "Story ID to build (e.g., WLT-27-1). Scopes a build/fix to ONE story "
            "and auto-resolves its parent bet for the requirement gate, so multiple "
            "stories of a bet can build in parallel on their own branches. A story "
            "id passed to --bet is auto-detected and routed here (#172)."
        ),
    )
    parser.add_argument(
        "--full-project",
        action="store_true",
        dest="full_project",
        help=(
            "Load the full project picture as context: docs/foundation/ "
            "(product, architecture, plan, portfolio), docs/status.md, and "
            "all bet brief summaries. Use for delivery-manager workflows where "
            "portfolio-wide state is needed (e.g. update-status, plan)."
        ),
    )
    parser.add_argument("--model", default=None)
    parser.add_argument(
        "--claude-cli",
        action="store_true",
        dest="claude_cli",
        help=(
            "Dispatch Claude steps via the logged-in `claude` CLI (subscription, "
            "no ANTHROPIC_API_KEY) instead of the metered API (#120). Remaps only "
            "the `claude` host → `claude-code`; reviewers stay on Codex/Gemini. "
            "Equivalent to COMPASS_CLAUDE_HOST=cli (which the dashboard inherits)."
        ),
    )
    parser.add_argument(
        "--codex-cli",
        action="store_true",
        dest="codex_cli",
        help=(
            "Dispatch Codex steps via the logged-in `codex` CLI (subscription, no "
            "OPENAI_API_KEY) instead of the metered API (#155). Remaps only the "
            "`codex` host → `codex-cli` — this is what makes the REVIEWER reachable "
            "for a CLI-only operator (codex ≠ claude → review independence holds). "
            "Equivalent to COMPASS_CODEX_HOST=cli (which the dashboard inherits)."
        ),
    )
    parser.add_argument("--no-write", action="store_true")
    parser.add_argument(
        "--no-events",
        action="store_true",
        dest="no_events",
        help=(
            "Suppress the user-local event spine (~/.compass/orchestrator/"
            "events.jsonl) for this run. Terminal progress still prints; the "
            "portfolio cockpit just won't see this run."
        ),
    )
    parser.add_argument(
        "--max-cost",
        type=float,
        default=None,
        dest="max_cost",
        metavar="USD",
        help=(
            "Halt the run when estimated spend crosses this dollar cap (#116) — "
            "a budget seatbelt. Checked on every usage event (mid-tool-loop too); "
            "halts with a --from-step resume hint. Default: no cap."
        ),
    )
    parser.add_argument(
        "--non-interactive",
        action="store_true",
        dest="non_interactive",
        help=(
            "Don't block on HITL gates (#118). The run pauses-and-exits at a gate "
            "(emitting it to the cockpit's awaiting queue); resume with --from-step "
            "N --decide <approve|reject|route>. Enables headless/CI and dashboard-"
            "driven runs."
        ),
    )
    parser.add_argument(
        "--auto-merge",
        action="store_true",
        dest="auto_merge",
        help=(
            "Delivery closure (#147): approving a 'merge' HITL gate actually runs "
            "`gh pr merge --squash --delete-branch` on the work branch's PR (→ the "
            "host auto-deploys on main, e.g. Vercel). Off by default (approve records "
            "the decision; you merge manually). The human's approval is the "
            "authorization — this honors the gate, never bypasses it. Best-effort: a "
            "failed merge (CI red / conflict / no gh) notes loudly, doesn't halt."
        ),
    )
    parser.add_argument(
        "--run-id",
        default=None,
        dest="run_id",
        help=(
            "Continue an existing run id instead of starting a fresh one (#121). "
            "Used by the dashboard /decide so a resumed gate clears from the "
            "cockpit's awaiting queue rather than forking a duplicate run."
        ),
    )
    parser.add_argument(
        "--decide",
        default=None,
        metavar="approve|reject|ROUTE",
        help=(
            "With --non-interactive, the decision to apply at the FIRST gate the "
            "(resumed) run reaches: approve/reject for an approval gate, or a route "
            "label for a routing gate. Consumed once; later gates pause."
        ),
    )
    parser.add_argument(
        "--max-tool-iterations",
        type=int,
        default=None,
        dest="max_tool_iterations",
        metavar="N",
        help=(
            "Cap on a tool-using step's read/write/run loop (default 50). On "
            "reaching it the agent does a final tools-disabled summary turn "
            "rather than aborting — raise it for big tasks, lower to fail fast."
        ),
    )
    parser.add_argument(
        "--allow-write",
        action="store_true",
        dest="allow_write",
        help=(
            "Grant tool-using agents the WRITE tools (write_file, bash) in "
            "addition to read tools. OFF by default — without it, executor_tools "
            "are read-only. bash is sandboxed to the project + screened against a "
            "destructive-command denylist. Use only when you intend the "
            "orchestrator to modify the working tree."
        ),
    )
    parser.add_argument(
        "--skip-missing",
        action="store_true",
        dest="skip_missing",
        help=(
            "Skip steps whose agent file or host is unavailable instead of "
            "halting. Skips are printed loudly and must be logged as DRI "
            "Decisions — the default (halt) enforces the no-silent-skips "
            "principle."
        ),
    )
    parser.add_argument(
        "--log",
        action="store_true",
        help="Print the run log table (docs/orchestrator-runs/runs.jsonl) and exit.",
    )
    parser.add_argument(
        "--dri",
        action="store_true",
        help="Print all DRI decisions extracted from logged runs and exit.",
    )
    parser.add_argument(
        "--hitl-log",
        action="store_true",
        dest="hitl_log",
        help="Print the HITL decision log (docs/orchestrator-runs/hitl.jsonl) and exit.",
    )
    parser.add_argument(
        "--export-audit",
        action="store_true",
        dest="export_audit",
        help="Export the governance audit (who-did-what lineage · cross-model "
             "independence · gate approvals + approver) and exit. Scope with "
             "--bet / --run-id; format with --audit-format.",
    )
    parser.add_argument(
        "--audit-format",
        dest="audit_format",
        choices=["json", "md"],
        default="json",
        help="Format for --export-audit (json | md). Default json.",
    )
    parser.add_argument(
        "--controls",
        dest="controls",
        default=None,
        help="Path to a control framework (controls.md) for --export-audit "
             "conformance mapping. Auto-discovered from docs/bets/<bet>/controls.md "
             "or docs/controls.md if omitted.",
    )
    parser.add_argument(
        "--wbs",
        action="store_true",
        help="Print the exec control-tower view — the program→bet→story Work "
             "Breakdown Structure with ground-truth status, manage-by-exception, "
             "and (where controls.md exists) SOW-conformance — then exit. "
             "Auto-reaps stale runs first (the board can't lie).",
    )
    parser.add_argument(
        "--wbs-verbose",
        action="store_true",
        dest="wbs_verbose",
        help="With --wbs: show every halted run in the exception list. By default "
             "terminal (shipped-bet) and superseded (older-than-latest) halts are "
             "collapsed — the surviving line carries the hidden count.",
    )
    parser.add_argument(
        "--reap-stale",
        action="store_true",
        dest="reap_stale",
        help="Halt abandoned/killed in-flight runs (no activity for "
             "$COMPASS_STALE_TIMEOUT, default 1800s) by emitting RUN_END(halted), so "
             "they stop showing in-flight forever; then exit. Add --run-id <id> to halt "
             "ONLY that run (targeted — won't catch other in-flight builds, #28).",
    )
    parser.add_argument(
        "--cancel",
        action="store_true",
        help="Cancel a run ON DEMAND (#80) — immediately halt it (RUN_END 'cancelled by "
             "operator') + prune its worktree, without waiting out the stale timeout. "
             "`--cancel --run-id <id>` cancels that run; bare `--cancel` cancels ALL "
             "in-flight runs for --project-dir; then exit.",
    )
    parser.add_argument(
        "--prune-worktrees",
        action="store_true",
        dest="prune_worktrees",
        help="Housekeeping (#175): remove finished (clean) build worktrees under "
             "~/.compass/worktrees/ so they don't pile up; in-flight (dirty) ones are "
             "kept. Then exit. (--project-dir selects the repo.)",
    )
    parser.add_argument(
        "--push",
        metavar="PATH",
        default=None,
        help=(
            "#34: project an existing artifact one-way to its configured backend "
            "(story → Jira, foundation/brief/architecture → Confluence; per "
            "config.yaml connectors), then exit. Credentialed from the environment "
            "(JIRA_*/CONFLUENCE_*/ATLASSIAN_*); uncredentialed → honest filesystem "
            "fallback. Stores the distribution pointer for idempotent re-push."
        ),
    )
    parser.add_argument(
        "--push-bet",
        metavar="BET",
        default=None,
        dest="push_bet",
        help=(
            "#34: project a whole bet's product docs at once — brief.md + "
            "architecture.md + research.md (→ Confluence) and every story (→ Jira). "
            "Then exit. Same env credentialing as --push."
        ),
    )
    parser.add_argument(
        "--approve",
        metavar="PATH",
        default=None,
        help=(
            "Manual approval bridge: flip PATH's frontmatter to "
            "status: approved AND append an approved hitl.jsonl record, "
            "then exit. Satisfies requirement gates from interactive sessions."
        ),
    )
    parser.add_argument(
        "--reject",
        metavar="PATH",
        default=None,
        help=(
            "Record a rejected hitl.jsonl decision for PATH (file untouched), "
            "then exit. Pair with --feedback."
        ),
    )
    parser.add_argument(
        "--feedback",
        default=None,
        metavar="TEXT",
        help="Reviewer feedback recorded with --reject (or --approve).",
    )
    args = parser.parse_args(argv)

    # #40: loud heads-up if we're running a vendored/stale compass module vs --compass-dir.
    _mm = _module_mismatch_warning(args.compass_dir)
    if _mm:
        print(_mm, file=sys.stderr)

    # ── manual approval bridge (no workflow needed) ──────────────────────────
    if args.approve or args.reject:
        if args.approve and args.reject:
            parser.error("Provide either --approve or --reject, not both.")
        code = _manual_hitl_decision(
            project_dir=Path(args.project_dir).resolve(),
            path_arg=args.approve or args.reject,
            decision="approved" if args.approve else "rejected",
            feedback=args.feedback,
            bet_id=args.bet,
        )
        sys.exit(code)

    # ── on-demand projection to Jira/Confluence (#34, no workflow needed) ──
    if args.push or args.push_bet:
        project_dir = Path(args.project_dir).resolve()
        compass_dir = (Path(args.compass_dir).resolve() if args.compass_dir
                       else project_dir / "compass")
        rels = ([args.push] if args.push
                else _bet_doc_paths(project_dir, args.push_bet))
        if not rels:
            print(f"Nothing to push (no docs found for {args.push or args.push_bet}).",
                  file=sys.stderr)
            sys.exit(1)
        print(f"Projecting {len(rels)} artifact(s) (Compass-primary → one-way):")
        any_fallback = False
        for rel, label in (_project_artifact(project_dir, compass_dir, r) for r in rels):
            mark = "→" if "fallback" not in label and "ERROR" not in label else "·"
            print(f"  {mark} {rel}  [{label}]")
            any_fallback = any_fallback or ("fallback" in label)
        if any_fallback:
            print("\nSome artifacts stayed in the filesystem cache — set the env creds to "
                  "project live:\n  JIRA_BASE_URL/EMAIL/API_TOKEN + JIRA_PROJECT  ·  "
                  "CONFLUENCE_BASE_URL/EMAIL/API_TOKEN + CONFLUENCE_SPACE  (or ATLASSIAN_* "
                  "shared).", file=sys.stderr)
        # #35: after a whole-bet push, wire the Jira STRUCTURE — epic + stories under it
        # + 'is blocked by' links from dependencies — so the program is visible, not flat.
        if args.push_bet and not any_fallback:
            from .connector import project_bet_jira_structure
            struct = project_bet_jira_structure(project_dir, args.push_bet)
            if struct:
                print("\nJira structure (#35 — epic · parents · blocked-by):")
                for a in struct:
                    print(f"  · {a}")
        return

    # ── log / dri / hitl-log / export-audit report modes (no workflow needed) ──
    if (args.log or args.dri or args.hitl_log or args.export_audit or args.wbs
            or args.reap_stale or args.cancel or args.prune_worktrees):
        from .logger import print_run_table, dri_decisions_report, print_hitl_table
        project_dir = Path(args.project_dir).resolve()
        if args.cancel:
            # #80: immediate operator cancel — halt now + free the worktree, no stale wait.
            from .events import cancel_inflight, project_label
            proj = None if args.run_id else project_label(str(project_dir))
            cancelled = cancel_inflight(run_id=args.run_id or None, project=proj)
            if args.run_id:
                print(f"cancelled run {args.run_id}" if cancelled
                      else f"nothing cancelled — {args.run_id} is not an in-flight run")
            else:
                print(f"cancelled {len(cancelled)} in-flight run(s)"
                      + (": " + ", ".join(cancelled) if cancelled else ""))
            removed = prune_worktrees(project_dir)
            if removed:
                print(f"pruned {len(removed)} worktree(s): {', '.join(removed)}")
        if args.reap_stale:
            from .events import halt_stale_runs
            # #28: --reap-stale --run-id X halts ONLY run X (targeted), so cleanup can't
            # catch other in-flight builds; bare --reap-stale keeps the global sweep.
            reaped = halt_stale_runs(run_id=args.run_id or None)
            if args.run_id:
                print(f"halted run {args.run_id}" if reaped
                      else f"nothing halted — {args.run_id} is not an in-flight run")
            else:
                print(f"halted {len(reaped)} stale run(s)"
                      + (": " + ", ".join(reaped) if reaped else ""))
        if args.prune_worktrees:
            removed = prune_worktrees(project_dir)
            print(f"removed {len(removed)} finished worktree(s)"
                  + (": " + ", ".join(removed) if removed else ""))
        if args.wbs:
            from .wbs import build_wbs, render_wbs
            from .events import halt_stale_runs
            reaped = halt_stale_runs()  # the tower reaps zombies when you look
            if reaped:
                print(f"[reaped {len(reaped)} stale run(s): {', '.join(reaped)}]\n")
            # #29: the tower also self-heals finished build worktrees — a merged/done
            # build's worktree is clean, so it's removed when you look (like stale runs).
            pruned = prune_worktrees(project_dir)
            if pruned:
                print(f"[pruned {len(pruned)} finished worktree(s)]\n")
            print(render_wbs(build_wbs(project_dir, with_conformance=True,
                                       show_halt_history=args.wbs_verbose,
                                       reconcile=True)))
        if args.log:
            print_run_table(project_dir)
        if args.dri:
            dri_decisions_report(project_dir)
        if args.hitl_log:
            print_hitl_table(project_dir)
        if args.export_audit:
            from .logger import build_audit, format_audit_markdown
            audit = build_audit(project_dir, bet_id=args.bet, run_id=args.run_id,
                                controls_path=args.controls)
            if args.audit_format == "md":
                print(format_audit_markdown(audit))
            else:
                print(json.dumps(audit, indent=2, ensure_ascii=False))
        return

    if not args.workflow and not args.pipeline:
        parser.error("Provide a workflow name or --pipeline W1,W2,…")
    if args.workflow and args.pipeline:
        parser.error("Provide either a workflow name or --pipeline, not both.")

    project_dir = Path(args.project_dir).resolve()
    compass_dir = (
        Path(args.compass_dir).resolve()
        if args.compass_dir
        else project_dir / "compass"
    )

    # #120: subscription CLI host — --claude-cli flag OR COMPASS_CLAUDE_HOST=cli
    # (the env var is how the dashboard opts in: spawned runs inherit os.environ).
    claude_cli = args.claude_cli or os.environ.get(
        "COMPASS_CLAUDE_HOST", "").lower() in ("cli", "claude-code")
    # #155: same opt-in shape for the Codex CLI host (makes the reviewer reachable
    # for a CLI-only operator) — --codex-cli flag OR COMPASS_CODEX_HOST=cli.
    codex_cli = args.codex_cli or os.environ.get(
        "COMPASS_CODEX_HOST", "").lower() in ("cli", "codex-cli")
    # #147: dashboard opts into auto-merge via env (spawned runs inherit it, like
    # COMPASS_CLAUDE_HOST) — export COMPASS_AUTO_MERGE=1 before `cockpit --serve`.
    auto_merge = args.auto_merge or os.environ.get(
        "COMPASS_AUTO_MERGE", "").lower() in ("1", "true", "yes")

    # #172: story-scoped build/fix. A story id may arrive via --story OR be typed
    # into --bet (the dashboard's single id field) — auto-detect the latter so
    # `/build WLT-27-1` resolves the parent bet for the requirement gate instead
    # of halting on a docs/bets/WLT-27-1/brief.md that never existed (the "looks
    # hung" bug). Resolve the parent bet; --bet always carries the BET id downstream.
    story_id = args.story
    if not story_id and args.bet and _is_story_id(project_dir, args.bet):
        story_id = args.bet
        args.bet = None
    if story_id and not args.bet:
        args.bet = _resolve_bet_for_story(project_dir, story_id)
        if not args.bet:
            parser.error(
                f"--story {story_id}: could not resolve a parent bet "
                f"(no docs/bets/*/stories/{story_id}/ and no <bet>-<n> pattern).")

    # ── single workflow ───────────────────────────────────────────────────────
    if args.workflow:
        _run_workflow(
            workflow_name=args.workflow,
            project_dir=project_dir,
            compass_dir=compass_dir,
            context=args.context,
            bet_id=args.bet,
            story_id=story_id,
            full_project=args.full_project,
            model=args.model,
            no_write=args.no_write,
            only_step=args.step,
            from_step=args.from_step,
            dry_run=args.dry_run,
            skip_missing=args.skip_missing,
            allow_write=args.allow_write,
            max_tool_iterations=args.max_tool_iterations,
            no_events=args.no_events,
            max_cost=args.max_cost,
            non_interactive=args.non_interactive,
            decide=args.decide,
            claude_cli=claude_cli,
            codex_cli=codex_cli,
            run_id_override=args.run_id,
            auto_merge=auto_merge,
        )
        return

    # ── pipeline mode ─────────────────────────────────────────────────────────
    workflow_names = [w.strip() for w in args.pipeline.split(",") if w.strip()]
    if not workflow_names:
        parser.error("--pipeline requires at least one workflow name.")

    if args.dry_run:
        for wf in workflow_names:
            _run_workflow(
                workflow_name=wf,
                project_dir=project_dir,
                compass_dir=compass_dir,
                dry_run=True,
            )
        return

    print(f"\n{'═' * 60}")
    print(f"PIPELINE: {' → '.join(workflow_names)}")
    print(f"{'═' * 60}")

    accumulated_outputs = []
    accumulated_paths = []
    next_context = args.context

    for idx, wf_name in enumerate(workflow_names):
        print(f"\n{'═' * 60}")
        print(f"PIPELINE [{idx + 1}/{len(workflow_names)}]: {wf_name}")
        print(f"{'═' * 60}")

        wf_outputs, wf_paths = _run_workflow(
            workflow_name=wf_name,
            project_dir=project_dir,
            compass_dir=compass_dir,
            context=next_context,
            bet_id=args.bet if idx == 0 else None,
            story_id=story_id if idx == 0 else None,
            full_project=args.full_project,
            model=args.model,
            no_write=args.no_write,
            # --step and --from-step only apply to the first workflow in pipeline
            only_step=args.step if idx == 0 else None,
            from_step=args.from_step if idx == 0 else None,
            initial_prior_outputs=accumulated_outputs,
            skip_missing=args.skip_missing,
            allow_write=args.allow_write,
            max_tool_iterations=args.max_tool_iterations,
            no_events=args.no_events,
            max_cost=args.max_cost,
            non_interactive=args.non_interactive,
            decide=args.decide,
            claude_cli=claude_cli,
            codex_cli=codex_cli,
        )

        accumulated_outputs.extend(wf_outputs)
        accumulated_paths.extend(wf_paths)

        # Build cross-workflow context for the next workflow's first step
        if idx < len(workflow_names) - 1:
            next_context = _cross_workflow_context(wf_name, wf_outputs, wf_paths)
            print(f"\n[pipeline] '{wf_name}' complete — handing off to '{workflow_names[idx + 1]}'")
            if wf_paths:
                print(f"[pipeline] artifacts: {', '.join(wf_paths)}")

    print(f"\n{'═' * 60}")
    print(f"PIPELINE COMPLETE: {' → '.join(workflow_names)}")
    print(f"Total steps dispatched: {len(accumulated_outputs)}")
    print(f"Artifacts written: {len(accumulated_paths)}")
    for p in accumulated_paths:
        print(f"  {p}")
    print(f"{'═' * 60}\n")


if __name__ == "__main__":
    main()
