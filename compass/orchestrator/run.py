#!/usr/bin/env python3
"""
Compass orchestrator CLI — v0.4-alpha-4

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
) -> tuple:
    """
    Execute a single workflow dispatch graph.

    Returns (prior_outputs, artifact_paths):
      prior_outputs  — list of step output dicts (step, agent, task, host, output)
      artifact_paths — list of relative path strings for written artifacts
    """
    from .graph import load_workflow
    from .hitl import handle_hitl_gate
    from .hosts.router import select_host, dispatch_to_host
    from .logger import log_step, log_hitl

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

    # ── dry-run ──────────────────────────────────────────────────────────────
    if dry_run:
        print(f"\nDispatch graph: {workflow_name}")
        print(f"{'─' * 50}")
        for s in steps:
            if s.is_hitl:
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

    last_artifact_path = None
    last_agent_output = ""
    first_step = True

    for step in steps:
        if only_step is not None and step.number != only_step:
            continue
        if from_step is not None and step.number < from_step:
            continue

        print(f"\n{'─' * 60}")
        print(f"[{workflow_name}] Step {step.number}: {step.title}")
        print(f"{'─' * 60}")

        # ── HITL gate ────────────────────────────────────────────────────────
        if step.is_hitl:
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
            log_hitl(
                project_dir=project_dir,
                run_id=run_id,
                workflow=workflow_name,
                bet_id=bet_id,
                step=step.number,
                artifact_path=artifact_rel,
                decision=decision,
                feedback=result.get("feedback") or None,
            )
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
                sys.exit(0)
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
            print(
                f"Warning: agent file for '{step.agent}' not found. Skipping.",
                file=sys.stderr,
            )
            continue

        # ── host selection ───────────────────────────────────────────────────
        preferred_hosts = _read_preferred_hosts(agent_file)
        host = select_host(preferred_hosts)

        if host is None:
            print(
                f"Warning: no host available for step {step.number} "
                f"({step.agent}.{step.task}).\n"
                f"  preferred_hosts: {preferred_hosts}\n"
                f"  Set one of: ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY",
                file=sys.stderr,
            )
            continue

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
        user_message = _build_user_message(step.task, user_context, prior_outputs)

        print(f"\nDispatching to {host} …")
        try:
            result = dispatch_to_host(
                host, str(agent_file), step.task, user_message, model=model,
            )
        except (RuntimeError, ImportError) as exc:
            print(f"Error: {exc}", file=sys.stderr)
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
        log_step(
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

        prior_outputs.append({
            "step": step.number,
            "agent": step.agent,
            "task": step.task,
            "host": host,
            "workflow": workflow_name,
            "output": result,
        })

    return prior_outputs, artifact_paths


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────────────────────

def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="compass run",
        description="Compass orchestrator v0.4-alpha-4",
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
    args = parser.parse_args(argv)

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
