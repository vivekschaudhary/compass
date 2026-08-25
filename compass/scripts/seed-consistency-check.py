#!/usr/bin/env python3
"""Reconcile the app's seed against the framework's dispatch graphs.

There are two catalogues of the same workflows and nothing compared them:

  compass/workflows/*.md        the dispatch graphs — the framework's source of truth
  compass/seed/*.csv            what the control-tower app imports into its database

The app executes the SEED. So a workflow whose dispatch graph says one thing and whose seed row
says another runs the seed's version, silently, and the .md file becomes documentation of
something that is not happening. That is how `plan-kickoff` and `staff-engagement` came to run a
live engagement without existing in the framework at all.

This does NOT generate one from the other, and deliberately so: the dispatch graphs carry no
`produces`, no `reads` and no criteria, so deriving the seed from them would delete the execution
contract. Until the .md format carries those, both files are authored and the honest thing is to
make their disagreement loud.

    python3 compass/scripts/seed-consistency-check.py            # report
    python3 compass/scripts/seed-consistency-check.py --check    # exit 1 on drift (CI, hooks)

Drift classes, in the order they bite:

  missing-graph   seeded and runnable, but the framework never declared it
  unseeded        declared by the framework, but the app cannot run it
  step-count      both sides know it, and disagree on how many steps it has
  step-shape      a step's kind, role or task differs between the two
"""
import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / "compass" / "workflows"
SEED = ROOT / "compass" / "seed"

# `### Step 3. `engineer.implement-story` (Engineer agent owns) — …`
# `### Step 6. **HITL gate — human approves merge** (human)`
STEP = re.compile(r"^#{2,4}\s*Step\s+(\d+)\.\s*(.+?)\s*$", re.M)
AGENT_TASK = re.compile(r"`([a-z0-9-]+)\.([a-z0-9-]+)`")


# The dispatch-graph TABLE — the format the four phase files use, and the one everything
# should move to. One row per step:
#
#   | # | task | dispatch | owner | reads | produces | depends-on |
#   | 2 | Shape the kickoff backlog | `agent: delivery-manager.propose-kickoff-backlog` | ... |
#
# `dispatch` is the whole vocabulary: `agent: <role>.<task>`, `workflow: <code>`, or an em-dash for
# a row nothing dispatches.
TABLE_ROW = re.compile(r"^\|\s*(\d+)\s*\|(.+)\|\s*$", re.M)
DISPATCH_AGENT = re.compile(r"`agent:\s*([a-z0-9-]+)\.([a-z0-9-]+)`")
DISPATCH_NESTS = re.compile(r"`workflow:\s*([a-z0-9-]+)`")


def table_steps(text: str) -> list[dict]:
    """Steps from a `## Dispatch graph` table. Empty when the file has no such table."""
    if "## Dispatch graph" not in text:
        return []
    body = text.split("## Dispatch graph", 1)[1].split("\n## ", 1)[0]

    out = []
    for ord_, rest in TABLE_ROW.findall(body):
        cells = [c.strip() for c in rest.split("|")]
        joined = " ".join(cells)
        m_agent = DISPATCH_AGENT.search(joined)
        m_nests = DISPATCH_NESTS.search(joined)
        # The owner column carries the role for a nesting row — the agent form carries its own.
        owner = next((c for c in cells if re.fullmatch(r"[a-z][a-z0-9-]+", c)), "")
        if m_agent:
            out.append({"ord": int(ord_), "kind": "agent", "role": m_agent.group(1), "task": m_agent.group(2)})
        elif m_nests:
            out.append({"ord": int(ord_), "kind": "workflow", "role": owner, "task": "", "nests": m_nests.group(1)})
        else:
            # Nothing dispatches. The seed calls this `machine` and holds no role for it.
            out.append({"ord": int(ord_), "kind": "machine", "role": "", "task": ""})
    return sorted(out, key=lambda s: s["ord"])


def graph_steps(path: Path) -> list[dict]:
    """The steps a dispatch graph declares, in order — table format first, then the old headings."""
    table = table_steps(path.read_text(encoding="utf-8"))
    if table:
        return table
    out = []
    for ord_, heading in STEP.findall(path.read_text(encoding="utf-8")):
        m = AGENT_TASK.search(heading)
        # A step with no `agent.task` is a gate or a mechanical step; the graph names those in
        # prose, so `kind` is what the heading says rather than what a code span says.
        lower = heading.lower()
        # `\bCI\b`, not `"ci" in heading` — that substring lives inside "specification",
        # "decision" and "efficiency", and it reported four steps as mechanical that are agent
        # steps. A checker that cries wolf gets muted.
        kind = ("hitl" if "hitl" in lower or "human" in lower
                else "code" if re.search(r"\bCI\b", heading) or "merge constraints" in lower
                else "agent")
        out.append({
            "ord": int(ord_),
            "kind": kind,
            "role": m.group(1) if m else "",
            "task": m.group(2) if m else "",
        })
    return sorted(out, key=lambda s: s["ord"])


def seed_steps() -> dict[str, list[dict]]:
    rows = list(csv.DictReader((SEED / "workflow-steps.csv").open()))
    by: dict[str, list[dict]] = {}
    for r in rows:
        by.setdefault(r["workflow"], []).append({
            "ord": int(r["ord"]), "kind": r["kind"], "role": r["role"], "task": r["task"],
            "nests": r.get("nests", ""),
        })
    for v in by.values():
        v.sort(key=lambda s: s["ord"])
    return by


def main() -> int:
    check = "--check" in sys.argv

    seeded = {r["code"]: r for r in csv.DictReader((SEED / "workflows.csv").open())}
    graphs = {p.stem: p for p in WORKFLOWS.glob("*.md")}
    steps_seed = seed_steps()

    # A PARKED workflow is not drift. `enabled=false` means the app will not open a run for it, so
    # its seed carries no steps by design and holding its dispatch graph to that emptiness reports a
    # disagreement between a document and something that does not execute.
    #
    # `pre-sprint-0` is the case this exists for: its rows moved into `sprint-0`, the phase was
    # disabled rather than deleted because the BRD still describes it, and the check then demanded
    # its .md shrink to zero steps to match a seed nothing runs.
    #
    # Deliberately narrow. Parked workflows are still listed below, so this hides nothing — it
    # stops a parked phase FAILING the build. Re-enabling one puts it straight back under the
    # comparison, which is when the graph has to be true again.
    parked = {code for code, r in seeded.items()
              if (r.get("enabled") or "").strip().lower() != "true"}

    problems: list[str] = []

    for code in sorted(set(seeded) - set(graphs)):
        problems.append(
            f"missing-graph  {code}: seeded and runnable by the app, but compass/workflows/{code}.md "
            f"does not exist — the framework never declared it")

    for code in sorted(set(graphs) - set(seeded)):
        problems.append(
            f"unseeded       {code}: compass/workflows/{code}.md declares it, but no seed row — "
            f"the app cannot run it")

    for code in sorted((set(seeded) & set(graphs)) - parked):
        g = graph_steps(graphs[code])
        s = steps_seed.get(code, [])
        if not g:
            # Distinct from unseeded, and much more common: the workflow file exists and is prose.
            # These are the ones the kickoff backlog labels "STEPS UNSPECIFIED" — the app opens a
            # run for them and no task is ever created.
            problems.append(
                f"no-graph-steps {code}: compass/workflows/{code}.md has no `### Step N.` headings, "
                f"so the seed's {len(s)} step(s) are unreviewed against any dispatch graph")
            continue
        if len(g) != len(s):
            problems.append(
                f"step-count     {code}: dispatch graph has {len(g)} step(s), seed has {len(s)}")
            continue
        for a, b in zip(g, s):
            for field in ("kind", "role", "task", "nests"):
                # An empty side is silence, not disagreement — the graph does not name a role for a
                # gate step, and saying so every time would drown the real drift.
                av, bv = a.get(field, ""), b.get(field, "")
                if av and bv and av != bv:
                    problems.append(
                        f"step-shape     {code} step {a['ord']}: {field} is "
                        f"'{av}' in the graph, '{bv}' in the seed")

    # The known-drift baseline. Thirteen discrepancies existed the day this check was written, and
    # a check that fails on every commit from birth is a check everyone learns to skip. So it fails
    # on NEW drift and reports the old as debt — with the list in git, where it can be argued about.
    baseline_file = SEED / "known-drift.txt"
    baseline = set()
    if baseline_file.exists():
        baseline = {l.strip() for l in baseline_file.read_text().splitlines()
                    if l.strip() and not l.startswith("#")}

    keys = {p.split(":")[0].strip() for p in problems}
    new_drift = sorted(k for k in keys if k not in baseline)
    resolved = sorted(b for b in baseline if b not in keys)

    # Writing the baseline is the script's job, not a shell pipeline's. Parsing its own printed
    # output left the "NEW" marker inside every key, so the baseline matched nothing.
    if "--write-baseline" in sys.argv:
        header = (
            "# Known seed <-> dispatch-graph drift.\n"
            "# Written by: python3 compass/scripts/seed-consistency-check.py --write-baseline\n"
            "# This is DEBT, not permission. The check fails on anything NOT listed here.\n"
            "# Fix an entry, then delete its line — the check tells you when one is resolved.\n"
            "#\n"
            "# The no-graph-steps entries are why open_workflow_run opens runs that create no task:\n"
            "# the .md is prose and the seed has zero steps, so nothing is ever dispatched.\n")
        baseline_file.write_text(header + "\n".join(sorted(keys)) + "\n")
        print(f"Baseline written: {len(keys)} known discrepancy(ies) → {baseline_file}")
        return 0

    if problems:
        print(f"{len(problems)} discrepancy(ies) between the seed and the dispatch graphs:\n")
        for p in problems:
            mark = "NEW " if p.split(":")[0].strip() in new_drift else "    "
            print(f"  {mark}{p}")

    if resolved:
        print(f"\nRESOLVED — {len(resolved)} baselined item(s) no longer drift. Remove from "
              f"compass/seed/known-drift.txt:")
        for r in resolved:
            print(f"    {r}")

    # Said out loud, every run. A skipped comparison that nothing reports is how a check quietly
    # stops checking — the parked list is exactly where drift would hide if a phase were disabled
    # to silence it rather than because it was parked.
    if parked:
        print(f"\nPARKED — {len(parked)} workflow(s) are enabled=false in seed/workflows.csv and "
              f"were NOT compared against their dispatch graph. Re-enabling one re-enters it:")
        for p in sorted(parked):
            has_graph = "graph present" if p in graphs else "no graph"
            print(f"    {p} ({len(steps_seed.get(p, []))} seed step(s), {has_graph})")

    if not new_drift:
        print(f"\nNo NEW drift. {len(problems)} known discrepancy(ies) remain as recorded debt.")
        return 0

    print(f"\nNEW DRIFT — {len(new_drift)} item(s) not in the baseline. The app executes the SEED, "
          f"so where these disagree the .md file documents something that is not happening.")
    return 1 if check else 0


if __name__ == "__main__":
    sys.exit(main())
