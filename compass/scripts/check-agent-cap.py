#!/usr/bin/env python3
"""
Compass — check-agent-cap.py

Per [agent-file-compression] (compass/framework/canon.md, v0.3.22).

Walks compass/agents/*.md; checks each file against the OpenAI Custom GPT
Instructions ~8000-char cap; reports overages; exits non-zero when any
chatgpt-targeted agent exceeds the cap. Stdlib only (Python 3.9+).

Why this exists
---------------
The OpenAI Custom GPT Instructions field caps system prompts at ~8000
characters. Agent files in `compass/agents/` are designed to drop into
that slot as-is (per [agent-as-surface-independent-unit], canon v0.3.14).
When a file grows past the cap, it silently truncates on paste — load-
bearing tasks at the bottom (postconditions, refusal rules, host-cap
degradation) get cut, and the agent operates with partial discipline
without anyone noticing.

Before v0.3.22 this was a manual check (`wc -c compass/agents/*.md`)
that lapsed for 3 releases (v0.3.15 → v0.3.17 → v0.3.18) while three
agent files compounded to 158% / 151% / 273% of cap. The script is the
mechanical defense Retro #007 named under the drift signal "Custom GPT
cap compounding without structural defense."

Host-aware enforcement
----------------------
The cap is OpenAI-specific. Agents whose `preferred_hosts:` excludes
`chatgpt` (e.g., reviewer.md targets codex/gemini only) can technically
exceed the cap and still function on their declared hosts. The script:

- HARD-FAILS (exit 1) when a chatgpt-targeted agent exceeds the cap
- WARNS (exit 0, marked in report) when a non-chatgpt agent exceeds the cap
- REPORTS all agents with their size + headroom regardless

This matches the [user-as-load-bearing-oversight] aspirational refinement
in v0.3.20: catch mechanizable cases at the orchestrator level so user
attention shrinks to architectural-only residual.

Exit codes
----------
- 0: every chatgpt-targeted agent fits the cap (non-chatgpt warnings ok)
- 1: at least one chatgpt-targeted agent exceeds the cap
- 2: usage error (e.g., bad --root path)
"""

import argparse
import re
import sys
from pathlib import Path

CAP_DEFAULT = 8000  # OpenAI Custom GPT Instructions cap (~8000 chars)
FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
HOSTS_RE = re.compile(r"^preferred_hosts:\s*\[([^\]]*)\]\s*$", re.MULTILINE)


def parse_preferred_hosts(content):
    """Extract preferred_hosts list from frontmatter. Returns list of host names."""
    fm_match = FRONTMATTER_RE.match(content)
    if not fm_match:
        return []
    fm = fm_match.group(1)
    hosts_match = HOSTS_RE.search(fm)
    if not hosts_match:
        return []
    return [h.strip() for h in hosts_match.group(1).split(",") if h.strip()]


def check_agent_file(path, cap):
    """Return dict with size, overage, hosts, status for a single agent file."""
    content = path.read_text(encoding="utf-8")
    size = len(content.encode("utf-8"))
    hosts = parse_preferred_hosts(content)
    targets_chatgpt = "chatgpt" in hosts
    overage = max(0, size - cap)
    headroom = max(0, cap - size)
    if overage == 0:
        status = "OK"
    elif targets_chatgpt:
        status = "FAIL"
    else:
        status = "WARN"
    return {
        "path": path,
        "size": size,
        "overage": overage,
        "headroom": headroom,
        "hosts": hosts,
        "targets_chatgpt": targets_chatgpt,
        "status": status,
    }


def render_report(results, cap):
    """Render a markdown report of all agent files + their cap status."""
    lines = []
    lines.append(f"# Agent cap check (cap = {cap} chars)")
    lines.append("")
    lines.append(f"Checked {len(results)} agent file(s) in `compass/agents/`.")
    lines.append("")
    lines.append("| Status | File | Size | Overage / Headroom | Targets ChatGPT? |")
    lines.append("|---|---|---|---|---|")
    for r in sorted(results, key=lambda x: (x["status"] != "FAIL", x["status"] != "WARN", x["path"].name)):
        rel = f"compass/agents/{r['path'].name}"
        if r["overage"] > 0:
            margin = f"+{r['overage']} over"
        else:
            margin = f"{r['headroom']} headroom"
        chatgpt_mark = "yes" if r["targets_chatgpt"] else "no"
        lines.append(f"| {r['status']} | `{rel}` | {r['size']} | {margin} | {chatgpt_mark} |")
    lines.append("")

    fails = [r for r in results if r["status"] == "FAIL"]
    warns = [r for r in results if r["status"] == "WARN"]
    oks = [r for r in results if r["status"] == "OK"]

    if fails:
        lines.append(f"## FAIL ({len(fails)})")
        lines.append("")
        lines.append("These chatgpt-targeted agents exceed the OpenAI Custom GPT Instructions ~8000-char cap. They will silently truncate on paste into the Custom GPT Instructions field, losing load-bearing tail content (postconditions, refusal rules, host-cap degradation).")
        lines.append("")
        for r in fails:
            lines.append(f"- **`compass/agents/{r['path'].name}`** — {r['size']} chars ({r['overage']} over cap). Targets: `{', '.join(r['hosts'])}`.")
        lines.append("")
        lines.append("**Action:** apply the [agent-file-compression] playbook (see canon.md). Reference example: `compass/agents/delivery-manager.md` (v0.3.18 trim: 21,714 → 7,960 chars).")
        lines.append("")

    if warns:
        lines.append(f"## WARN ({len(warns)})")
        lines.append("")
        lines.append("These agents exceed the cap BUT their `preferred_hosts:` excludes chatgpt — so the cap doesn't strictly apply. Address if/when a future migration adds chatgpt support; otherwise no action needed.")
        lines.append("")
        for r in warns:
            lines.append(f"- `compass/agents/{r['path'].name}` — {r['size']} chars ({r['overage']} over cap). Targets: `{', '.join(r['hosts']) or '<none declared>'}`.")
        lines.append("")

    if oks:
        lines.append(f"## OK ({len(oks)})")
        lines.append("")
        for r in oks:
            chatgpt_note = "" if r["targets_chatgpt"] else "  *(chatgpt not targeted; cap N/A)*"
            lines.append(f"- `compass/agents/{r['path'].name}` — {r['size']} chars ({r['headroom']} headroom).{chatgpt_note}")
        lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Check compass/agents/*.md against OpenAI Custom GPT Instructions ~8000-char cap.",
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Repo root containing compass/agents/ (default: current dir).",
    )
    parser.add_argument(
        "--cap",
        type=int,
        default=CAP_DEFAULT,
        help=f"Character cap (default: {CAP_DEFAULT} — OpenAI Custom GPT Instructions limit).",
    )
    parser.add_argument(
        "--out",
        help="Write report to this file in addition to stdout.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress stdout report (still writes --out + still returns exit code).",
    )
    args = parser.parse_args()

    agents_dir = Path(args.root) / "compass" / "agents"
    if not agents_dir.is_dir():
        sys.stderr.write(f"error: {agents_dir} is not a directory\n")
        sys.exit(2)

    agent_files = sorted(agents_dir.glob("*.md"))
    if not agent_files:
        sys.stderr.write(f"error: no .md files found in {agents_dir}\n")
        sys.exit(2)

    results = [check_agent_file(p, args.cap) for p in agent_files]
    report = render_report(results, args.cap)

    if not args.quiet:
        print(report)

    if args.out:
        Path(args.out).write_text(report, encoding="utf-8")

    fails = [r for r in results if r["status"] == "FAIL"]
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
