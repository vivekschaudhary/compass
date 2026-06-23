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


def _ensure_work_branch(project_dir, branch_name: str):
    """
    Put write-mode work on a branch, never on main/master (#99).

    Returns the branch the work will run on, or None if project_dir isn't a git
    repo. If already on a non-main branch, reuses it. If on main/master, creates
    (or checks out) branch_name. Carries any working changes along.
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
    if current and current not in ("main", "master"):
        return current  # already on a work branch
    made = git("checkout", "-b", branch_name)
    if made.returncode == 0:
        return branch_name
    # branch may already exist — switch to it
    switched = git("checkout", branch_name)
    return branch_name if switched.returncode == 0 else current or None


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


def _collect_input(step_label: str, inline_context: str = "") -> str:
    """Return user context for a step, either inline or via interactive prompt."""
    if inline_context:
        print(f"[context] {inline_context[:120]}{'...' if len(inline_context) > 120 else ''}")
        return inline_context
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


def _build_user_message(task: str, user_context: str, prior_outputs: list) -> str:
    """Build the user message for a step, prepending prior step outputs as context."""
    parts = []
    if prior_outputs:
        parts.append("## Prior step outputs (workflow context)\n")
        for entry in prior_outputs:
            label = f"[{entry.get('workflow', '')} — " if entry.get('workflow') else "["
            parts.append(
                f"### {label}Step {entry['step']}: {entry['agent']}.{entry['task']}]\n"
            )
            output = entry["output"]
            if len(output) > 3000:
                output = output[:3000] + "\n\n[... truncated for context window ...]"
            parts.append(output)
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
) -> tuple:
    """
    Execute a single workflow dispatch graph.

    Returns (prior_outputs, artifact_paths):
      prior_outputs  — list of step output dicts (step, agent, task, host, output)
      artifact_paths — list of relative path strings for written artifacts
    """
    from .graph import load_workflow, load_workflow_meta
    from .hitl import handle_hitl_gate
    from .hosts.router import select_host, dispatch_to_host
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
    run_id = f"{workflow_name}--{bet_id or 'no-bet'}--{_ts}"

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

    # Write-mode work lands on a work branch, never directly on main (#99) —
    # the framework's branch→review→merge discipline. Only when --allow-write.
    work_branch = None
    if allow_write:
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

    def emit(type, **fields):
        _fan(ev.make_event(
            type, project=_project, run_id=run_id,
            workflow=workflow_name, bet_id=bet_id, **fields
        ))

    emit(ev.RUN_START, allow_write=allow_write, branch=work_branch)

    last_artifact_path = None
    last_agent_output = ""
    first_step = True
    skipped = set()  # steps in a not-taken branch (#96 conditional dispatch)
    handed_off = False  # set when a #103 cross-workflow hand-off ends the run early

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
                f"  Set the matching key ({', '.join('ANTHROPIC_API_KEY' if h == 'claude' else 'OPENAI_API_KEY' if h in ('codex', 'chatgpt') else 'GEMINI_API_KEY' for h in preferred_hosts)}), "
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
        print(f"Agent      : {agent_label}")
        print(f"Task       : {step.task}")
        print(f"Host       : {host}  (preferred: {preferred_hosts})")
        if model:
            print(f"Model      : {model} (override)")
        if prior_outputs:
            print(f"Context    : {len(prior_outputs)} prior step(s) passed")

        # First step of this workflow uses --context; subsequent steps prompt
        inline = context if first_step else ""
        first_step = False

        user_context = _collect_input(step.title, inline)

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
        else:
            tools_note = ""
        print(f"\nDispatching to {host}{tools_note} …")
        if agent_tools and host == "claude":
            # #111 heartbeat: a tool step's first model turn (reading the agent
            # file + reasoning) can run 1–2 min before the first tool line prints,
            # so it looks frozen. Set the expectation; the spine has live detail.
            print("  (first model turn can take ~1–2 min before tool activity appears — "
                  "watch `python3 -m compass.orchestrator.cockpit --run <id>`)")
        try:
            result = dispatch_to_host(
                host, str(agent_file), step.task, user_message, model=model,
                tools=agent_tools or None, project_dir=project_dir,
                allow_write=allow_write, max_tool_iterations=max_tool_iterations,
                on_event=emit,
            )
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
            model=model,
            output=result,
            artifact_path=str(last_artifact_path.relative_to(project_dir)) if last_artifact_path else None,
        )
        emit(ev.STEP_END, step=step.number,
             gate_result=rec.get("gate_result"), output_chars=rec.get("output_chars"))

        prior_outputs.append({
            "step": step.number,
            "agent": step.agent,
            "task": step.task,
            "host": host,
            "workflow": workflow_name,
            "output": result,
        })

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
