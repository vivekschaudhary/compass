#!/usr/bin/env python3
"""
Compass orchestrator CLI — v0.4-alpha-0

Usage:
    python -m compass.orchestrator.run <workflow> [options]

    compass run <workflow> [options]          # if installed via pip

Options:
    --project-dir PATH   Root of the project repo (default: current directory)
    --dry-run            Print the dispatch graph without executing
    --step N             Execute only step N (1-indexed)
    --context TEXT       Inline context string for the first agent step
                         (skips the interactive input prompt for that step)
    --model ID           Claude model to use (default: claude-opus-4-8)
"""
import argparse
import sys
import textwrap
from pathlib import Path


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


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="compass run",
        description="Compass orchestrator v0.4-alpha-0",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Examples:
              # Print the dispatch graph for setup-product (no API calls):
              python -m compass.orchestrator.run setup-product --dry-run

              # Run only Step 1 with inline context:
              python -m compass.orchestrator.run setup-product --step 1 \\
                  --context "We are building a personal finance app for millennials."

              # Run the full workflow interactively:
              python -m compass.orchestrator.run setup-product
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
        "--context",
        default="",
        metavar="TEXT",
        help="Inline context for the first agent step (skips interactive prompt)",
    )
    parser.add_argument(
        "--model",
        default="claude-opus-4-8",
        help="Claude model ID (default: claude-opus-4-8)",
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
    from .hosts.claude import dispatch

    # Fail fast on missing API key (before any prompts)
    if not args.dry_run:
        import os
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print(
                "Error: ANTHROPIC_API_KEY is not set.\n"
                "  export ANTHROPIC_API_KEY=sk-ant-...",
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

    # --- dry-run: just print the graph ---
    if args.dry_run:
        print(f"\nDispatch graph: {args.workflow}")
        print(f"{'─' * 50}")
        for s in steps:
            if s.is_hitl:
                marker = "[HITL]"
                label = s.title
            elif s.agent and s.task:
                marker = f"[{s.agent}.{s.task}]"
                label = f"→ {compass_dir / 'agents' / s.agent_file}" if s.agent_file else ""
            else:
                marker = "[workflow]"
                label = s.title
            print(f"  Step {s.number:2d}  {marker:35s}  {label}")
        print()
        return

    # --- execution mode ---
    first_step = True
    for step in steps:
        if args.step is not None and step.number != args.step:
            continue

        print(f"\n{'─' * 60}")
        print(f"Step {step.number}: {step.title}")
        print(f"{'─' * 60}")

        if step.is_hitl:
            approved = handle_hitl_gate(step.number, step.title)
            if not approved:
                print("Workflow halted at HITL gate.")
                sys.exit(0)
            continue

        if not step.agent or not step.task:
            print(f"  [workflow-level step — no agent dispatch; handle manually]")
            continue

        # Resolve agent file: prefer compass/agents/, fall back to compass/roles/
        agent_file = None
        for subdir in ("agents", "roles"):
            candidate = compass_dir / subdir / step.agent_file
            if candidate.exists():
                agent_file = candidate
                break

        if agent_file is None:
            print(
                f"Warning: agent file '{step.agent_file}' not found "
                f"in compass/agents/ or compass/roles/. Skipping step.",
                file=sys.stderr,
            )
            continue

        print(f"Agent file : {agent_file.relative_to(project_dir)}")
        print(f"Task       : {step.task}")
        print(f"Model      : {args.model}")

        # Inline context only used for the first agent step
        inline = args.context if first_step else ""
        first_step = False

        user_context = _collect_input(step.title, inline)
        user_message = (
            f"Execute task: **{step.task}**\n\n{user_context}"
            if user_context
            else f"Execute task: **{step.task}**"
        )

        print(f"\nDispatching to Claude API …")
        try:
            result = dispatch(
                str(agent_file),
                step.task,
                user_message,
                model=args.model,
            )
        except (RuntimeError, ImportError) as exc:
            print(f"Error: {exc}", file=sys.stderr)
            sys.exit(1)

        print(f"\n{'=' * 60}")
        print(f"[Step {step.number} output — {step.agent}.{step.task}]")
        print(f"{'=' * 60}\n")
        print(result)
        print()


if __name__ == "__main__":
    main()
