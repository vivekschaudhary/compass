"""
PR lifecycle for code-producing workflows: diffing, uncommitted-work detection,
title/body, open/merge via `gh`, and the review-context/delivery-warning copy
that reads on those states.

Split out of run.py (which otherwise interleaves this with CLI parsing,
Jira resolution, branch/worktree management, and the step-dispatch loop).
"""
import re

# Workflows whose output is CODE and therefore ships via PR → merge → deploy,
# as opposed to an authoring workflow (brief/story/architecture) whose output
# IS the deliverable. Referenced throughout run.py's dispatch loop to decide
# whether PR/check-suite/delivery-warning logic applies to a given run.
_CODE_WORKFLOWS = ("fix", "build", "ops")


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


def _merge_next_steps(pr_url, epic_id) -> str:
    """#157: the explicit next-step block printed when a MERGE gate is approved but
    NOT auto-merged — so the operator isn't left at '[handle manually]' with no idea
    what to do (the live gap: gate cleared, run 'completed', nothing shipped)."""
    pr = f"merge the PR — {pr_url}" if pr_url else "merge the PR on your host"
    nxt = f"/create-story {epic_id}" if epic_id else "/create-story <bet> for the next slice"
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


def _dirty_pr_note(exec_dir, work_branch) -> str:
    """#109: after a FAILED check gate, an agent that (against #92) opened its OWN PR
    leaves it dirty with the failing code. Detect it so the halt message doesn't falsely
    claim 'no dirty PR'. Returns a warning naming the PR, or '' when none exists."""
    if not work_branch:
        return ""
    url = _pr_url_any_state(exec_dir, work_branch)
    if not url:
        return ""
    return (f"\n  ⚠ a PR is already open for this branch ({url}) and now holds the "
            f"FAILING code — the agent should NOT have opened it (#92; the orchestrator "
            f"opens the PR only on green). Close it or push the fix before merge.")
