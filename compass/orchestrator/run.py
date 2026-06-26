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

# #159: workflows whose WHOLE JOB is to author a doc artifact (brief, story,
# foundation/portfolio/architecture docs), reviewed via their HITL gate — not a PR.
# They are USELESS read-only: with allow_write=False the claude-code host runs
# `claude -p --permission-mode default`, so every agent file-write hangs on a
# permission prompt no headless UI can answer (the live create-brief that authored
# WLT-27 then landed NOTHING in docs/bets/). So they default to write-enabled —
# unlike _CODE_WORKFLOWS, which keep explicit --allow-write for branch/PR discipline.
_AUTHORING_WORKFLOWS = (
    "setup-product", "setup-foundation-architecture", "create-bet-portfolio",
    "create-brief", "create-bet-architecture", "create-story",
)


def _resolve_allow_write(workflow_name: str, allow_write: bool) -> bool:
    """#159: authoring workflows default to write-enabled (useless read-only). Code
    workflows keep the caller's explicit choice (the branch→PR lane stays opt-in)."""
    return True if workflow_name in _AUTHORING_WORKFLOWS else allow_write


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
    r"|(?:waiting|pending|blocked)\s+on[^\n]{0,40}(?:permission|approval)"
    r"|(?:awaiting|pending)[^\n]{0,30}(?:permission|approval)"
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
    # no remote/base, or the clean checkout failed (e.g. dirty tree) → current HEAD
    made = git("checkout", "-b", branch_name)
    return branch_name if made.returncode == 0 else (current or None)


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


def _write_artifact(
    project_dir: Path, workflow: str, step_num: int,
    agent: str, task: str, content: str,
) -> Path:
    """Write step output to docs/orchestrator-runs/<workflow>/step-<N>-<agent>-<task>.md."""
    run_dir = project_dir / "docs" / "orchestrator-runs" / workflow
    run_dir.mkdir(parents=True, exist_ok=True)
    out_file = run_dir / f"step-{step_num:02d}-{agent}-{task}.md"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    header = (
        f"---\nworkflow: {workflow}\nstep: {step_num}\nagent: {agent}\n"
        f"task: {task}\ngenerated: {timestamp}\n---\n\n"
    )
    out_file.write_text(header + content, encoding="utf-8")
    return out_file


def _write_rejection_note(
    project_dir: Path, workflow: str, step_num: int, feedback: str,
) -> Path:
    """Write a HITL rejection note alongside the step artifact."""
    run_dir = project_dir / "docs" / "orchestrator-runs" / workflow
    run_dir.mkdir(parents=True, exist_ok=True)
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
    project_dir: Path, workflow: str, steps: list, up_to_step: int,
) -> list:
    """Load step outputs from artifact files for steps < up_to_step."""
    run_dir = project_dir / "docs" / "orchestrator-runs" / workflow
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


# ─────────────────────────────────────────────────────────────────────────────
# Core workflow runner — returns (prior_outputs, artifact_paths)
# ─────────────────────────────────────────────────────────────────────────────

def _run_workflow(
    workflow_name: str,
    project_dir: Path,
    compass_dir: Path,
    context: str = "",
    bet_id: str = None,
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
    from .logger import log_step, log_hitl
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
        print(f"[{workflow_name}: authoring workflow → write-enabled by default "
              f"(#159 — artifacts can't be produced read-only)]")

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
    run_id = run_id_override or f"{workflow_name}--{bet_id or 'no-bet'}--{_ts}"

    prior_outputs = list(initial_prior_outputs or [])
    artifact_paths = []

    # --from-step: load prior steps from disk
    if from_step is not None:
        print(f"\nResuming from step {from_step} — loading prior outputs from disk …")
        disk_outputs = _load_prior_outputs_from_disk(
            project_dir, workflow_name, steps, from_step
        )
        prior_outputs = list(initial_prior_outputs or []) + disk_outputs
        print(f"  {len(disk_outputs)} prior step(s) loaded.\n")

    # --full-project: load portfolio-wide context (foundation + all bets + status)
    if full_project:
        fp_context = _load_full_project_context(project_dir)
        context = fp_context + ("\n\n" + context if context else "")
        print(f"[full-project] Loaded foundation + portfolio context from {project_dir}/docs/")

    # --bet: load existing bet artifacts as initial context
    if bet_id:
        bet_context = _load_bet_context(project_dir, bet_id)
        context = bet_context + ("\n\n" + context if context else "")
        print(f"[bet] Loaded context for {bet_id} from docs/bets/{bet_id}/")

    # Write-mode CODE work lands on a work branch, never directly on main (#99) —
    # the branch→review→merge discipline. #151: DOC workflows (create-brief/-story/
    # -architecture, setup-*) are reviewed via their HITL gate, not a PR — they skip
    # the work-branch dance (no spurious feat/work branch) and write on the current
    # branch; their artifacts are committed, not deployed (the #150 message guides).
    work_branch = None
    if allow_write and workflow_name in _CODE_WORKFLOWS:
        if from_step is not None:
            # #157: a resume must REUSE the original run's branch (recorded in the
            # spine), never regenerate a name from the input — a dashboard merge-gate
            # resume passed the bet-context blob as `context` and cut a garbage branch
            # (`feat/WLT-26-bet-context-…`), stranding the work + confusing delivery.
            work_branch = _prior_run_branch(run_id)
            if work_branch:
                _ensure_work_branch(project_dir, work_branch)  # checkout the existing branch
                print(f"[branch] resumed on '{work_branch}' (reused from the original run)")
            else:
                print("[branch] resume — no recorded branch; staying on the current branch")
        else:
            bname = _work_branch_name(workflow_name, bet_id, context)
            work_branch = _ensure_work_branch(project_dir, bname)
            if work_branch:
                print(f"[branch] write-mode work on '{work_branch}' (not main) — open a PR + merge after review")

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
        _fan(event)
        if event.get("type") == ev.USAGE:
            run_cost["usd"] += ev.cost_of_usage_event(event)
            if max_cost and run_cost["usd"] > max_cost:
                raise BudgetExceeded(
                    f"run spend ~${run_cost['usd']:.2f} exceeded --max-cost ${max_cost:.2f}"
                )

    def emit(type, **fields):
        _sink(ev.make_event(type, **fields))

    emit(ev.RUN_START, allow_write=allow_write, branch=work_branch,
         # #156: record the run's host MODE so a dashboard /decide resume can carry it
         # forward (reuse the subscription CLI hosts, not silently fall back to the API).
         claude_cli=claude_cli, codex_cli=codex_cli,
         project_dir=str(project_dir))  # #119: full path so the cockpit can resume any run

    last_artifact_path = None
    last_agent_output = ""
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
            emit(ev.GATE_DECISION, step=step.number, decision=choice["route"])
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

            # Promotion (#70): approval is the write trigger — push the gated
            # draft to its canonical path with status: approved.
            canonical_rel = connector_label = None
            if result["approved"] and step.artifact_target:
                from .connector import (
                    extract_artifact_body,
                    push_artifact,
                    resolve_connector,
                    set_frontmatter_status,
                )
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
                    content = set_frontmatter_status(
                        extract_artifact_body(last_agent_output), "approved", run_id
                    )
                    if no_write:
                        print(f"[no-write: would promote → {canonical_rel}]")
                        canonical_rel = None
                    else:
                        connector_label = push_artifact(
                            project_dir,
                            canonical_rel,
                            content,
                            resolve_connector(project_dir, compass_dir),
                        )
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
            emit(ev.GATE_DECISION, step=step.number, decision=decision)
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
                        project_dir, workflow_name, step.number, result["feedback"]
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
            diff = _review_diff(project_dir)
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
                tools=agent_tools or None, project_dir=project_dir,
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
        except Exception as exc:
            # Any dispatch failure — API 400s, rate limits, network, SDK errors
            # (#112) — halts CLEANLY with a resume hint, never a raw traceback.
            # (KeyboardInterrupt is BaseException, so Ctrl-C still propagates.)
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
                step.agent, step.task, result,
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
                f"(authoring workflows are write-enabled by default since #159; if "
                f"you see permission-dialog narration, the host couldn't write).")
        print("\n" + warn, file=sys.stderr)
        emit(ev.NOTE, text=warn)

    if not handed_off:
        emit(ev.RUN_END, status="completed", reason="all steps complete")

    return prior_outputs, artifact_paths


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

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

    # ── log / dri / hitl-log report modes (no workflow needed) ──────────────
    if args.log or args.dri or args.hitl_log:
        from .logger import print_run_table, dri_decisions_report, print_hitl_table
        project_dir = Path(args.project_dir).resolve()
        if args.log:
            print_run_table(project_dir)
        if args.dri:
            dri_decisions_report(project_dir)
        if args.hitl_log:
            print_hitl_table(project_dir)
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

    # ── single workflow ───────────────────────────────────────────────────────
    if args.workflow:
        _run_workflow(
            workflow_name=args.workflow,
            project_dir=project_dir,
            compass_dir=compass_dir,
            context=args.context,
            bet_id=args.bet,
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
