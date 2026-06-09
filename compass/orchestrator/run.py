#!/usr/bin/env python3
"""
Compass orchestrator CLI — v0.4-alpha-3

Usage:
    python3 -m compass.orchestrator.run <workflow> [options]

    compass run <workflow> [options]          # if installed via pip

Options:
    --project-dir PATH   Root of the project repo (default: current directory)
    --dry-run            Print the dispatch graph without executing
    --step N             Execute only step N (1-indexed)
    --from-step N        Resume from step N, loading steps 1..N-1 from prior
                         artifact files (use after a HITL rejection to re-run
                         from the rejected step without re-running earlier steps)
    --context TEXT       Inline context string for the first agent step
                         (skips the interactive input prompt for that step)
    --model ID           Model ID override — applied to whichever host is selected
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


def _read_preferred_hosts(agent_file: Path) -> list:
    """
    Parse preferred_hosts from agent file YAML frontmatter.

    Expects format: preferred_hosts: [host1, host2, ...]
    Falls back to ["claude"] if frontmatter is absent or field not found.
    """
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
    """
    Return user context for a step.

    If inline_context is provided, echo it and return without prompting.
    Otherwise prompt interactively (end input with a line containing only '.').
    """
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


def _write_artifact(project_dir: Path, workflow: str, step_num: int, agent: str, task: str, content: str) -> Path:
    """
    Write step output to docs/orchestrator-runs/<workflow>/step-<N>-<agent>-<task>.md.
    Creates parent dirs as needed. Returns the written path.
    """
    run_dir = project_dir / "docs" / "orchestrator-runs" / workflow
    run_dir.mkdir(parents=True, exist_ok=True)
    out_file = run_dir / f"step-{step_num:02d}-{agent}-{task}.md"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    header = f"---\nworkflow: {workflow}\nstep: {step_num}\nagent: {agent}\ntask: {task}\ngenerated: {timestamp}\n---\n\n"
    out_file.write_text(header + content, encoding="utf-8")
    return out_file


def _write_rejection_note(project_dir: Path, workflow: str, step_num: int, feedback: str) -> Path:
    """
    Write a HITL rejection note alongside the step artifact.
    Gives reviewers a record of what was rejected and why.
    """
    run_dir = project_dir / "docs" / "orchestrator-runs" / workflow
    run_dir.mkdir(parents=True, exist_ok=True)
    note_file = run_dir / f"step-{step_num:02d}-hitl-rejected.md"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    content = (
        f"---\nworkflow: {workflow}\nstep: {step_num}\nstatus: rejected\ntimestamp: {timestamp}\n---\n\n"
        f"# HITL Rejection — Step {step_num}\n\n"
        f"**Timestamp:** {timestamp}\n\n"
    )
    if feedback:
        content += f"## Reviewer feedback\n\n{feedback}\n\n"
    content += (
        f"## To rerun from this step\n\n"
        f"```bash\n"
        f"python3 -m compass.orchestrator.run {workflow} --from-step {step_num}\n"
        f"```\n"
    )
    note_file.write_text(content, encoding="utf-8")
    return note_file


def _load_prior_outputs_from_disk(
    project_dir: Path, workflow: str, steps: list, up_to_step: int
) -> list:
    """
    Load step outputs from artifact files for steps < up_to_step.

    Used by --from-step N to reconstruct workflow context from prior run artifacts
    without re-dispatching those steps.
    """
    run_dir = project_dir / "docs" / "orchestrator-runs" / workflow
    prior_outputs = []

    for step in steps:
        if step.number >= up_to_step:
            break
        if step.is_hitl or not step.agent or not step.task:
            continue

        # Glob for the artifact file (step number + agent + task)
        pattern = f"step-{step.number:02d}-{step.agent}-{step.task}.md"
        artifact = run_dir / pattern
        if artifact.exists():
            raw = artifact.read_text(encoding="utf-8")
            # Strip YAML frontmatter before the content
            content = re.sub(r'^---\n.*?\n---\n\n?', '', raw, flags=re.DOTALL, count=1)
            prior_outputs.append({
                "step": step.number,
                "agent": step.agent,
                "task": step.task,
                "host": "disk",
                "output": content,
            })
            print(f"  [loaded from disk] step {step.number}: {step.agent}.{step.task} ({artifact.name})")
        else:
            print(
                f"  [warning] artifact not found for step {step.number} "
                f"({step.agent}.{step.task}) — context gap",
                file=sys.stderr,
            )

    return prior_outputs


def _build_user_message(task: str, user_context: str, prior_outputs: list) -> str:
    """
    Build the user message for a step, optionally prepending prior step outputs
    as context so the agent has the full workflow state.
    """
    parts = []

    if prior_outputs:
        parts.append("## Prior step outputs (workflow context)\n")
        for entry in prior_outputs:
            parts.append(f"### Step {entry['step']}: {entry['agent']}.{entry['task']}\n")
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


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="compass run",
        description="Compass orchestrator v0.4-alpha-3",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              # Print the dispatch graph for setup-product (no API calls):
              python3 -m compass.orchestrator.run setup-product --dry-run

              # Run only Step 1 with inline context:
              python3 -m compass.orchestrator.run setup-product --step 1 \\
                  --context "We are building a personal finance app for millennials."

              # Run the full workflow (writes artifacts to docs/orchestrator-runs/):
              python3 -m compass.orchestrator.run setup-product \\
                  --context "We are building a personal finance app for millennials."

              # After a HITL rejection on step 3, resume from step 3 (loads steps 1-2 from disk):
              python3 -m compass.orchestrator.run setup-product --from-step 3

              # Run without writing files (stdout only):
              python3 -m compass.orchestrator.run setup-product --no-write \\
                  --context "..."

              # Multi-host: Reviewer step dispatches to OpenAI (if OPENAI_API_KEY set):
              export ANTHROPIC_API_KEY=sk-ant-...
              export OPENAI_API_KEY=sk-...
              python3 -m compass.orchestrator.run build --step 5
        """),
    )
    parser.add_argument("workflow", help="Workflow name (e.g., setup-product)")
    parser.add_argument(
        "--project-dir",
        default=".",
        metavar="PATH",
        help="Root of the project repo (default: current directory)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the dispatch graph without executing any steps",
    )
    parser.add_argument(
        "--step",
        type=int,
        default=None,
        metavar="N",
        help="Execute only step N (1-indexed)",
    )
    parser.add_argument(
        "--from-step",
        type=int,
        default=None,
        metavar="N",
        dest="from_step",
        help="Resume from step N, loading steps 1..N-1 from prior artifact files",
    )
    parser.add_argument(
        "--context",
        default="",
        metavar="TEXT",
        help="Inline context for the first agent step (skips interactive prompt)",
    )
    parser.add_argument(
        "--model",
        default=None,
        help="Model ID override for whichever host is selected (default: per-host default)",
    )
    parser.add_argument(
        "--no-write",
        action="store_true",
        help="Print output to stdout only; do not write artifact files",
    )
    args = parser.parse_args(argv)

    project_dir = Path(args.project_dir).resolve()
    compass_dir = project_dir / "compass"
    workflow_file = compass_dir / "workflows" / f"{args.workflow}.md"

    if not workflow_file.exists():
        print(
            f"Error: workflow file not found: {workflow_file}\n"
            f"  Make sure --project-dir points to a Compass repo root.",
            file=sys.stderr,
        )
        sys.exit(1)

    from .graph import load_workflow
    from .hitl import handle_hitl_gate
    from .hosts.router import select_host, dispatch_to_host

    steps = load_workflow(workflow_file)

    if not steps:
        print(
            f"Warning: no dispatch steps found in {workflow_file}.\n"
            f"  Is this workflow in dispatch-graph shape? "
            f"See compass/framework/canon.md [workflow-as-dispatch-graph].",
            file=sys.stderr,
        )
        sys.exit(1)

    # --- dry-run: print graph with host info ---
    if args.dry_run:
        print(f"\nDispatch graph: {args.workflow}")
        print(f"{'─' * 50}")
        for s in steps:
            if s.is_hitl:
                marker = "[HITL]"
                label = "human gate"
            elif s.agent and s.task:
                marker = f"[{s.agent}.{s.task}]"
                # Try to show preferred_hosts from agent file
                agent_file = None
                for subdir in ("agents", "roles"):
                    candidate = compass_dir / subdir / (s.agent_file or f"{s.agent}.md")
                    if candidate.exists():
                        agent_file = candidate
                        break
                if agent_file:
                    ph = _read_preferred_hosts(agent_file)
                    selected = select_host(ph)
                    host_label = f"→ {selected or 'NO HOST AVAILABLE'} (preferred: {ph})"
                else:
                    host_label = f"→ {compass_dir / 'agents' / (s.agent_file or '')}"
                label = host_label
            else:
                marker = "[workflow]"
                label = s.title
            print(f"  Step {s.number:2d}  {marker:40s}  {label}")
        print()
        return

    # --- execution mode ---
    first_step = True
    prior_outputs = []

    # --from-step N: load prior step outputs from disk, skip steps < N
    if args.from_step is not None:
        print(f"\nResuming from step {args.from_step} — loading prior step outputs from disk …")
        prior_outputs = _load_prior_outputs_from_disk(
            project_dir, args.workflow, steps, args.from_step
        )
        print(f"  {len(prior_outputs)} prior step(s) loaded.\n")

    # Track last artifact written so HITL gates can surface it
    last_artifact_path = None
    last_agent_output = ""

    for step in steps:
        # --step N: only this step
        if args.step is not None and step.number != args.step:
            continue
        # --from-step N: skip steps before N
        if args.from_step is not None and step.number < args.from_step:
            continue

        print(f"\n{'─' * 60}")
        print(f"Step {step.number}: {step.title}")
        print(f"{'─' * 60}")

        if step.is_hitl:
            result = handle_hitl_gate(
                step.number,
                step.title,
                last_artifact=last_artifact_path,
                last_output=last_agent_output,
            )
            if not result["approved"]:
                if not args.no_write and result["feedback"] is not None:
                    note_path = _write_rejection_note(
                        project_dir, args.workflow, step.number, result["feedback"]
                    )
                    print(f"[rejection note written → {note_path.relative_to(project_dir)}]")
                print(
                    f"\nWorkflow halted at HITL gate (step {step.number}).\n"
                    f"To rerun from this step after making changes:\n"
                    f"  python3 -m compass.orchestrator.run {args.workflow} "
                    f"--from-step {step.number - 1 if step.number > 1 else 1}"
                )
                sys.exit(0)
            continue

        if not step.agent or not step.task:
            print(f"  [workflow-level step — no agent dispatch; handle manually]")
            continue

        # Resolve agent file: prefer compass/agents/, fall back to compass/roles/
        agent_file = None
        for subdir in ("agents", "roles"):
            candidate = compass_dir / subdir / (step.agent_file or f"{step.agent}.md")
            if candidate.exists():
                agent_file = candidate
                break

        if agent_file is None:
            print(
                f"Warning: agent file for '{step.agent}' not found "
                f"in compass/agents/ or compass/roles/. Skipping step.",
                file=sys.stderr,
            )
            continue

        # Read preferred_hosts and select best available host
        preferred_hosts = _read_preferred_hosts(agent_file)
        host = select_host(preferred_hosts)

        if host is None:
            print(
                f"Warning: no host available for step {step.number} "
                f"({step.agent}.{step.task}).\n"
                f"  Agent preferred_hosts: {preferred_hosts}\n"
                f"  Set one of: ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY",
                file=sys.stderr,
            )
            continue

        print(f"Agent file : {agent_file.relative_to(project_dir)}")
        print(f"Task       : {step.task}")
        print(f"Host       : {host} (preferred_hosts: {preferred_hosts})")
        if args.model:
            print(f"Model      : {args.model} (override)")
        if prior_outputs:
            print(f"Context    : {len(prior_outputs)} prior step(s) passed as context")

        inline = args.context if (first_step and args.from_step is None) else ""
        first_step = False

        user_context = _collect_input(step.title, inline)
        user_message = _build_user_message(step.task, user_context, prior_outputs)

        print(f"\nDispatching to {host} …")
        try:
            result = dispatch_to_host(
                host,
                str(agent_file),
                step.task,
                user_message,
                model=args.model,
            )
        except (RuntimeError, ImportError) as exc:
            print(f"Error: {exc}", file=sys.stderr)
            sys.exit(1)

        print(f"\n{'=' * 60}")
        print(f"[Step {step.number} output — {step.agent}.{step.task} via {host}]")
        print(f"{'=' * 60}\n")
        print(result)
        print()

        if not args.no_write:
            artifact_path = _write_artifact(
                project_dir, args.workflow, step.number,
                step.agent, step.task, result,
            )
            print(f"[artifact written → {artifact_path.relative_to(project_dir)}]")
            last_artifact_path = artifact_path
        else:
            last_artifact_path = None

        last_agent_output = result

        prior_outputs.append({
            "step": step.number,
            "agent": step.agent,
            "task": step.task,
            "host": host,
            "output": result,
        })


if __name__ == "__main__":
    main()
