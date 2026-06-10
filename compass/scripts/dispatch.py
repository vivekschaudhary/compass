#!/usr/bin/env python3
"""
Compass single-agent dispatch — v0.2

LLM-agnostic dispatcher for CI/CD and script contexts.
The LLM is determined by preferred_hosts: in the agent file frontmatter,
routed through the same router.py the orchestrator uses. No LLM is hardcoded here.

Usage:
    python3 compass/scripts/dispatch.py \\
      --agent-file compass/agents/reviewer.md \\
      --task review-pr \\
      --input-file pr.diff \\
      --output review.md \\
      [--context-files PROJECT.md docs/bets/CB-4/brief.md]  # optional context injection
      [--model gpt-4o]            # optional override
      [--compass-root PATH]       # if compass/ is not at repo root

Environment (set whichever matches the agent's preferred_hosts):
    ANTHROPIC_API_KEY   — for claude / claude-code hosts
    OPENAI_API_KEY      — for codex / chatgpt / openai hosts
    GEMINI_API_KEY      — for gemini hosts

The script selects the first host with a valid API key, in preferred_hosts order.
If none are set, it exits 1 with a clear error naming the missing keys.
"""
import argparse
import os
import re
import sys
from pathlib import Path


def _read_preferred_hosts(agent_file: Path) -> list:
    text = agent_file.read_text(encoding="utf-8")
    fm = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
    if not fm:
        return ["claude"]
    ph = re.search(r'^preferred_hosts:\s*\[([^\]]+)\]', fm.group(1), re.MULTILINE)
    if not ph:
        return ["claude"]
    return [h.strip() for h in ph.group(1).split(",")]


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Compass single-agent dispatch — LLM chosen from agent preferred_hosts",
    )
    parser.add_argument("--agent-file", required=True, metavar="PATH",
                        help="Agent .md file (e.g. compass/agents/reviewer.md)")
    parser.add_argument("--task", required=True, metavar="NAME",
                        help="Task name defined in the agent file (e.g. review-pr)")
    parser.add_argument("--input-file", required=True, metavar="PATH",
                        help="Input file whose content becomes the user message (e.g. pr.diff)")
    parser.add_argument("--output", required=True, metavar="PATH",
                        help="Output file for the agent response")
    parser.add_argument("--context-files", nargs="*", default=[], metavar="PATH",
                        help="Additional files injected as context before the input file "
                             "(e.g. PROJECT.md docs/bets/CB-4/brief.md). "
                             "Each file is prepended as a labeled block so the agent sees "
                             "project/bet context alongside the primary input.")
    parser.add_argument("--model", default=None, metavar="ID",
                        help="Optional model override (applied to whichever host is selected)")
    parser.add_argument("--compass-root", default=None, metavar="PATH",
                        help="Path to the repo root containing compass/ (default: auto-detect)")
    args = parser.parse_args(argv)

    # ── resolve compass package path ─────────────────────────────────────────
    if args.compass_root:
        compass_root = Path(args.compass_root).resolve()
    else:
        # Walk up from this script's location to find the repo root
        here = Path(__file__).resolve().parent
        compass_root = here.parent.parent  # scripts/ → compass/ → repo root
    sys.path.insert(0, str(compass_root))

    try:
        from compass.orchestrator.hosts.router import select_host, dispatch_to_host
    except ImportError as exc:
        print(
            f"Error: could not import compass.orchestrator.hosts.router — {exc}\n"
            f"  Make sure compass/ is at: {compass_root}/compass/\n"
            f"  Or set --compass-root to the repo root.",
            file=sys.stderr,
        )
        sys.exit(1)

    # ── resolve agent file ───────────────────────────────────────────────────
    agent_file = Path(args.agent_file).resolve()
    if not agent_file.exists():
        print(f"Error: agent file not found: {agent_file}", file=sys.stderr)
        sys.exit(1)

    # ── read preferred_hosts from agent frontmatter ──────────────────────────
    preferred_hosts = _read_preferred_hosts(agent_file)
    host = select_host(preferred_hosts)

    if host is None:
        needed = ", ".join(
            {"claude": "ANTHROPIC_API_KEY", "codex": "OPENAI_API_KEY",
             "chatgpt": "OPENAI_API_KEY", "openai": "OPENAI_API_KEY",
             "gemini": "GEMINI_API_KEY"}.get(h, f"{h.upper()}_API_KEY")
            for h in preferred_hosts
        )
        print(
            f"Error: no host available for {agent_file.name}.\n"
            f"  preferred_hosts: {preferred_hosts}\n"
            f"  Set one of: {needed}",
            file=sys.stderr,
        )
        sys.exit(1)

    # ── read input ───────────────────────────────────────────────────────────
    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    input_content = input_path.read_text(encoding="utf-8")
    if not input_content.strip():
        print("[dispatch] input file is empty — nothing to dispatch.", file=sys.stderr)
        Path(args.output).write_text("", encoding="utf-8")
        sys.exit(0)

    # ── assemble context preamble ────────────────────────────────────────────
    context_preamble = ""
    if args.context_files:
        blocks = []
        for cf_path in args.context_files:
            cf = Path(cf_path)
            if not cf.exists():
                print(f"[dispatch] warning: context file not found, skipping: {cf}", file=sys.stderr)
                continue
            content = cf.read_text(encoding="utf-8").strip()
            if content:
                blocks.append(f"### {cf}\n\n{content}")
        if blocks:
            context_preamble = "## Context\n\n" + "\n\n---\n\n".join(blocks) + "\n\n---\n\n"
            print(f"[dispatch] context: {len(blocks)} file(s) injected")

    user_message = f"{context_preamble}Execute task: **{args.task}**\n\n{input_content}"

    # ── dispatch ─────────────────────────────────────────────────────────────
    print(
        f"[dispatch] {agent_file.name} → {host}  "
        f"(preferred: {preferred_hosts}, task: {args.task})"
    )
    if args.model:
        print(f"[dispatch] model override: {args.model}")

    try:
        result = dispatch_to_host(
            host, str(agent_file), args.task, user_message, model=args.model,
        )
    except (RuntimeError, ImportError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)

    Path(args.output).write_text(result, encoding="utf-8")
    print(f"[dispatch] wrote {len(result)} chars → {args.output}")


if __name__ == "__main__":
    main()
