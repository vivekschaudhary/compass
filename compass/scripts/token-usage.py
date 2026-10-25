#!/usr/bin/env python3
"""
Compass — token usage parser (per-role rollup).

Per the [role-boundary] Compass-original pattern (canon.md, v0.3.4). Reads a
Claude Code session log + a Compass workflow markdown file; attributes tokens
per role using the workflow's COMPASS_ROLE_BOUNDARY markers as anchors;
produces a markdown report with per-workflow cost / per-role rollup /
per-step breakdown.

Stdlib only. Python 3.9+.

Usage:
    python compass/scripts/token-usage.py <session-log.jsonl>
    python compass/scripts/token-usage.py <session-log.jsonl> --workflow compass/archive/workflows/build.md
    python compass/scripts/token-usage.py <session-log.jsonl> --out docs/usage/build-2026-05-27.md
    python compass/scripts/token-usage.py <session-log.jsonl> --price-in 3.0 --price-out 15.0

ACCURACY HONESTY:
    This is a ROUGH ESTIMATOR, not exact attribution. It assumes Claude executes
    workflow steps in linear order, that messages map to steps by ordinal
    position, and that tool calls within a step belong to that step's role.
    User interruptions, parallel tool calls, multi-message steps, and out-of-
    order execution all reduce accuracy. The report's Confidence footer names
    the heuristics used. Round 2+ of accuracy lands when AI-tool integration
    matures (Claude Code feature request territory).
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path


# Default pricing in $ per million tokens (Anthropic Sonnet 4.x family as of 2026-05).
# Adjust via --price-in / --price-out flags if model or pricing differs.
DEFAULT_PRICE_INPUT = 3.0
DEFAULT_PRICE_OUTPUT = 15.0

ROLE_BOUNDARY_RE = re.compile(
    r"<!--\s*COMPASS_ROLE_BOUNDARY:\s*"
    r"(?P<direction>enter|exit)\s*\|\s*"
    r"role=(?P<role>[a-z0-9-]+)\s*\|\s*"
    r"workflow=(?P<workflow>[a-z0-9-]+)\s*\|\s*"
    r"step=(?P<step>[0-9]+[a-z]?)\s*-->",
    re.IGNORECASE,
)

WORKFLOW_TRIGGER_RE = re.compile(r"^/([a-z][a-z0-9-]+)\b", re.IGNORECASE)


def parse_workflow_markers(workflow_path: Path):
    """
    Parse a Compass workflow markdown file for COMPASS_ROLE_BOUNDARY markers.
    Returns a list of (step_num, role, direction) tuples in source order.
    """
    if not workflow_path.exists():
        return []
    text = workflow_path.read_text(encoding="utf-8")
    markers = []
    for m in ROLE_BOUNDARY_RE.finditer(text):
        markers.append(
            {
                "direction": m.group("direction").lower(),
                "role": m.group("role").lower(),
                "step": m.group("step"),
                "workflow": m.group("workflow").lower(),
            }
        )
    return markers


def build_step_role_map(markers):
    """
    Walk enter/exit markers in order; produce a mapping of step (as string)
    -> role active during that step. If no markers, returns empty dict.
    """
    step_to_role = {}
    active_role = None
    for m in markers:
        if m["direction"] == "enter":
            active_role = m["role"]
            step_to_role[m["step"]] = active_role
        elif m["direction"] == "exit":
            # role remains assigned to the step it ended at; transitions happen at next enter
            step_to_role.setdefault(m["step"], active_role)
    return step_to_role


def detect_workflow_from_log(messages):
    """
    Walk the session messages; find the first user message that looks like a
    slash-command invocation; return the workflow name (e.g., 'build' from
    '/build STORY-1'). Returns None if not detected.
    """
    for msg in messages:
        if msg.get("role") != "user":
            continue
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            )
        first_line = content.strip().split("\n", 1)[0].strip()
        m = WORKFLOW_TRIGGER_RE.match(first_line)
        if m:
            return m.group(1).lower()
    return None


def load_session(log_path: Path):
    """
    Load a Claude Code session log. Supports both JSON (single object) and
    JSONL (one message per line) formats. Returns a list of message dicts
    each containing at minimum: role, content, usage (with input_tokens /
    output_tokens when available).
    """
    if not log_path.exists():
        print(f"ERROR: session log not found: {log_path}", file=sys.stderr)
        sys.exit(2)
    text = log_path.read_text(encoding="utf-8").strip()
    if not text:
        return []
    # Try JSONL first (most common Claude Code export shape)
    messages = []
    if "\n" in text and text.lstrip().startswith("{"):
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                # Sessions may wrap messages under "message" key or be flat
                if "message" in obj and isinstance(obj["message"], dict):
                    messages.append(obj["message"])
                else:
                    messages.append(obj)
            except json.JSONDecodeError:
                continue
        if messages:
            return messages
    # Fall back to single JSON document
    try:
        obj = json.loads(text)
        if isinstance(obj, list):
            return obj
        if isinstance(obj, dict):
            if "messages" in obj and isinstance(obj["messages"], list):
                return obj["messages"]
            return [obj]
    except json.JSONDecodeError:
        print("ERROR: could not parse session log as JSON or JSONL", file=sys.stderr)
        sys.exit(2)
    return messages


def extract_usage(msg):
    """
    Extract input/output token counts from a message. Returns (input, output).
    Claude API messages typically carry usage on assistant messages.
    """
    usage = msg.get("usage") or {}
    if not isinstance(usage, dict):
        return 0, 0
    input_tokens = (
        usage.get("input_tokens", 0)
        + usage.get("cache_creation_input_tokens", 0)
        + usage.get("cache_read_input_tokens", 0)
    )
    output_tokens = usage.get("output_tokens", 0)
    return int(input_tokens or 0), int(output_tokens or 0)


def attribute_messages_to_steps(messages, step_role_map):
    """
    Walk assistant messages in order; assign each to a workflow step by
    ordinal position. If there are N marker-bearing steps and M assistant
    messages, distribute messages evenly across steps (rough linear
    assumption). Returns a list of (step, role, input_tokens, output_tokens).
    """
    assistant_messages = [m for m in messages if m.get("role") == "assistant"]
    if not assistant_messages:
        return []
    steps_in_order = list(step_role_map.keys())
    if not steps_in_order:
        # No workflow markers — attribute everything to "(workflow)"
        ins, outs = 0, 0
        for m in assistant_messages:
            i, o = extract_usage(m)
            ins += i
            outs += o
        return [("-", "(unattributed)", ins, outs)]

    # Linear assumption: divide message count by step count; assign in order.
    n_msgs = len(assistant_messages)
    n_steps = len(steps_in_order)
    per_step = max(1, n_msgs // n_steps)

    attributed = []
    idx = 0
    for step in steps_in_order:
        role = step_role_map[step]
        chunk = (
            assistant_messages[idx : idx + per_step]
            if step != steps_in_order[-1]
            else assistant_messages[idx:]
        )
        idx += per_step
        ins = sum(extract_usage(m)[0] for m in chunk)
        outs = sum(extract_usage(m)[1] for m in chunk)
        attributed.append((step, role, ins, outs))
    return attributed


def render_report(
    session_path, workflow_path, workflow_name, step_role_map, attributed,
    price_in, price_out,
):
    """Render the markdown report."""
    lines = []
    lines.append(f"# Compass Token Usage Report")
    lines.append("")
    lines.append(f"**Session log:** `{session_path}`")
    lines.append(
        f"**Workflow:** `{workflow_name or 'unknown'}` (markers from `{workflow_path}`)"
        if workflow_path
        else f"**Workflow:** `{workflow_name or 'unknown'}` (no marker file matched)"
    )
    lines.append(f"**Generated:** {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}")
    lines.append("")

    # Totals
    total_in = sum(row[2] for row in attributed)
    total_out = sum(row[3] for row in attributed)
    total = total_in + total_out
    cost_in = (total_in / 1_000_000) * price_in
    cost_out = (total_out / 1_000_000) * price_out
    cost_total = cost_in + cost_out

    lines.append(f"## Per-workflow cost")
    lines.append("")
    lines.append(f"| Metric | Value |")
    lines.append(f"|---|---|")
    lines.append(f"| Input tokens | {total_in:,} |")
    lines.append(f"| Output tokens | {total_out:,} |")
    lines.append(f"| Total tokens | {total:,} |")
    lines.append(f"| $ estimate (in @ ${price_in}/M, out @ ${price_out}/M) | ${cost_total:.4f} |")
    lines.append("")

    # Per-role rollup
    role_totals = defaultdict(lambda: {"in": 0, "out": 0})
    for _step, role, ins, outs in attributed:
        role_totals[role]["in"] += ins
        role_totals[role]["out"] += outs
    lines.append(f"## Per-role rollup")
    lines.append("")
    lines.append(f"| Role | Input tokens | Output tokens | Total | $ estimate |")
    lines.append(f"|---|---:|---:|---:|---:|")
    for role, t in sorted(role_totals.items(), key=lambda kv: -(kv[1]["in"] + kv[1]["out"])):
        rt_in, rt_out = t["in"], t["out"]
        rt_total = rt_in + rt_out
        rt_cost = (rt_in / 1_000_000) * price_in + (rt_out / 1_000_000) * price_out
        lines.append(
            f"| {role} | {rt_in:,} | {rt_out:,} | {rt_total:,} | ${rt_cost:.4f} |"
        )
    lines.append("")

    # Per-step breakdown
    lines.append(f"## Per-step breakdown")
    lines.append("")
    lines.append(f"| Step | Role | Input | Output | Total | Cumulative % |")
    lines.append(f"|---|---|---:|---:|---:|---:|")
    cum = 0
    for step, role, ins, outs in attributed:
        st_total = ins + outs
        cum += st_total
        cum_pct = (cum / total * 100) if total else 0
        lines.append(
            f"| {step} | {role} | {ins:,} | {outs:,} | {st_total:,} | {cum_pct:.1f}% |"
        )
    lines.append("")

    # Honesty
    lines.append(f"## Confidence")
    lines.append("")
    lines.append(f"Rough estimator, not exact attribution. Heuristics used:")
    lines.append("")
    lines.append(
        f"- **Linear step assumption** — messages mapped to workflow steps by ordinal position. "
        f"If Claude executed steps out of order or skipped steps, attribution will be off."
    )
    lines.append(
        f"- **Multi-message-per-step approximation** — `{len(attributed)}` steps × "
        f"~`{(total // max(1, len(attributed))):,}` tokens/step on average. Steps with much "
        f"more or less work than average will be over/under-attributed."
    )
    lines.append(
        f"- **User-interrupt sensitivity** — user messages mid-session shift the ordinal "
        f"mapping; the report does not separate user-driven vs. agent-driven tokens."
    )
    lines.append(
        f"- **Tool-call attribution** — tokens attributed per step, not per Bash/Read/Edit "
        f"call within a step. Tool-heavy steps (e.g., `/build` Phase 5 review) may carry "
        f"hidden read/write costs not visible in this rollup."
    )
    lines.append(
        f"- **Pricing assumption** — `${price_in}/M in, ${price_out}/M out`. "
        f"Update via `--price-in` / `--price-out` if your model or rates differ."
    )
    lines.append("")
    lines.append(
        f"For exact attribution, AI-tool integration is required (Claude Code feature "
        f"request territory). This script is the reference round-1 implementation per "
        f"the `[role-boundary]` Compass-original (canon.md, v0.3.4)."
    )
    lines.append("")

    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("session_log", help="Path to Claude Code session log (JSON or JSONL)")
    ap.add_argument(
        "--workflow",
        default=None,
        help="Path to Compass workflow markdown (default: auto-detect from session)",
    )
    ap.add_argument(
        "--workflows-dir",
        default="compass/archive/workflows",
        help="Workflows directory for auto-detection (default: compass/archive/workflows)",
    )
    ap.add_argument("--out", default=None, help="Output path for the report (default: stdout)")
    ap.add_argument(
        "--price-in",
        type=float,
        default=DEFAULT_PRICE_INPUT,
        help=f"Input token price $/M (default: {DEFAULT_PRICE_INPUT})",
    )
    ap.add_argument(
        "--price-out",
        type=float,
        default=DEFAULT_PRICE_OUTPUT,
        help=f"Output token price $/M (default: {DEFAULT_PRICE_OUTPUT})",
    )
    args = ap.parse_args()

    session_path = Path(args.session_log)
    messages = load_session(session_path)
    if not messages:
        print("ERROR: session log contained no messages", file=sys.stderr)
        sys.exit(2)

    workflow_name = detect_workflow_from_log(messages)
    if args.workflow:
        workflow_path = Path(args.workflow)
    elif workflow_name:
        workflow_path = Path(args.workflows_dir) / f"{workflow_name}.md"
    else:
        workflow_path = None

    markers = parse_workflow_markers(workflow_path) if workflow_path else []
    step_role_map = build_step_role_map(markers)
    attributed = attribute_messages_to_steps(messages, step_role_map)

    report = render_report(
        session_path,
        workflow_path,
        workflow_name,
        step_role_map,
        attributed,
        args.price_in,
        args.price_out,
    )

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report, encoding="utf-8")
        print(f"Wrote report to {out_path}")
    else:
        print(report)


if __name__ == "__main__":
    main()
