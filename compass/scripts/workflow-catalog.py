#!/usr/bin/env python3
"""Flatten every workflow's dispatch graph into one reviewable table.

Writes `compass/reference/workflow-catalog.csv` — one row per step, across every workflow. Two
jobs: reviewing the catalogue as a whole (which is hard to do across twenty markdown files), and
authoring — the columns are the shape a workflow step actually has, so a spreadsheet round-trip is
a plausible way for a practice to draft or amend one.

REGENERATE IT, DON'T EDIT IT. The CSV is derived. A hand-edited copy is stale the moment a
workflow file changes, and this repo has `consistency-check.py` because that lesson has already
been learned once.

    python3 compass/scripts/workflow-catalog.py            # write the CSV
    python3 compass/scripts/workflow-catalog.py --check     # fail if it is out of date (CI)
    python3 compass/scripts/workflow-catalog.py --stdout    # print instead of writing

Step lines are parsed from the dispatch graph headings, e.g.

    ### Step 1. `engineer.implement-story` (Engineer agent owns) — covers Phase 2 + Phase 4
    ### Step 6. **HITL gate — human approves merge** (human)
    ### Step 7. **Mechanical merge constraints** (CI + branch protection)
    ### Step 5. `engineer.triage-and-fix` (Engineer agent owns) — [needs-fix branch]

`kind` is the useful column and it is not decoration:

    agent    real work, with an owner who can hold it
    hitl     a human approval gate
    machine  a mechanical check — CI, branch protection. NOT work: nobody holds it, so it belongs
             on a gate as a criterion rather than in anyone's queue
    other    a step that names no agent and is not a gate — usually a note that wants rewriting
    refresh  a workflow with no dispatch graph at all: one agent, recurring, no second role

A workflow that reports `refresh` but is genuinely multi-role has steps written in some other
format — that is a finding about the file, not about the workflow, and the row is how you notice.
"""

from __future__ import annotations

import argparse
import csv
import io
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / "compass" / "workflows"
OUT = ROOT / "compass" / "reference" / "workflow-catalog.csv"

COLUMNS = ["workflow", "step", "kind", "agent", "practice", "task", "conditional", "detail"]

# Which practice owns each agent. A PROPOSAL for review, not a decision the framework records
# anywhere yet — the workstream model is what will own this once it exists in the app.
PRACTICE = {
    "pm": "Product", "product-owner": "Product", "researcher": "Product", "tech-writer": "Product",
    "designer": "Design", "ux-writer": "Design",
    "engineer": "Engineering", "architect": "Engineering", "enterprise-architect": "Engineering",
    "automation": "QA", "reviewer": "QA",
    "security-reviewer": "Security", "scanner": "Security",
    "gtm": "GTM", "sre": "SRE",
    "delivery-manager": "Delivery", "support": "Support",
}

STEP_HEADING = re.compile(r"^#+\s*Step\s+(\d+)\.\s*(.*)$")
AGENT_TASK = re.compile(r"`([a-z-]+)\.([a-z0-9-]+)`")
BRANCH_TAG = re.compile(r"\[([^\]]+)\]")
AGENT_FILE = re.compile(r"compass/agents/([a-z-]+)\.md")


def classify(rest: str) -> tuple[str, str, str]:
    """(kind, agent, task) for one step heading's text."""
    m = AGENT_TASK.search(rest)
    if m:
        return "agent", m.group(1), m.group(2)
    if re.search(r"HITL", rest, re.I):
        return "hitl", "human", "approve"
    if re.search(r"mechanical|CI \+|branch protection", rest, re.I):
        return "machine", "", "mechanical check"
    return "other", "", re.sub(r"[`*]", "", rest.split("—")[0]).strip()


def rows_for(path: Path) -> list[dict[str, object]]:
    workflow = path.stem
    body = path.read_text(encoding="utf-8")
    rows: list[dict[str, object]] = []

    for line in body.splitlines():
        m = STEP_HEADING.match(line)
        if not m:
            continue
        ord_, rest = int(m.group(1)), m.group(2)
        kind, agent, task = classify(rest)
        branch = BRANCH_TAG.search(rest)
        rows.append({
            "workflow": workflow, "step": ord_, "kind": kind, "agent": agent,
            "practice": PRACTICE.get(agent, ""), "task": task,
            "conditional": branch.group(1) if branch else "",
            "detail": re.sub(r"\s+", " ", re.sub(r"[`*]", "", rest)).strip(),
        })

    if rows:
        return rows

    # No dispatch graph. Report it as one row rather than dropping the workflow silently — a
    # missing row reads as "no such workflow", which is the wrong thing to conclude.
    m = AGENT_FILE.search(body)
    agent = m.group(1) if m else ""
    return [{
        "workflow": workflow, "step": 1, "kind": "refresh", "agent": agent,
        "practice": PRACTICE.get(agent, ""), "task": "refresh", "conditional": "",
        "detail": "No dispatch graph — one agent, recurring" if agent
                  else "No dispatch graph and no agent named — needs review",
    }]


def build() -> str:
    rows: list[dict[str, object]] = []
    for path in sorted(WORKFLOWS.glob("*.md")):
        rows += rows_for(path)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buf.getvalue()


def summarise(csv_text: str) -> str:
    rows = list(csv.DictReader(io.StringIO(csv_text)))
    kinds = Counter(r["kind"] for r in rows)
    unowned = sorted({r["workflow"] for r in rows if r["kind"] == "refresh" and not r["agent"]})
    lines = [
        f"{len(rows)} steps across {len({r['workflow'] for r in rows})} workflows",
        "  " + " · ".join(f"{k}: {n}" for k, n in sorted(kinds.items())),
    ]
    if unowned:
        lines.append("  needs review (no dispatch graph, no agent named): " + ", ".join(unowned))
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true", help="fail if the CSV is out of date")
    ap.add_argument("--stdout", action="store_true", help="print instead of writing")
    args = ap.parse_args()

    generated = build()

    if args.stdout:
        sys.stdout.write(generated)
        return 0

    if args.check:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current != generated:
            print(f"STALE — {OUT.relative_to(ROOT)} does not match the workflow files.")
            print("Regenerate with: python3 compass/scripts/workflow-catalog.py")
            return 1
        print(f"CURRENT — {OUT.relative_to(ROOT)} matches the workflow files.")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(generated, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(summarise(generated))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
