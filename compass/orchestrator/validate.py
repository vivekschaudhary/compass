"""
Report what the orchestrator's parsers ACTUALLY extract from a spec file, as JSON.

This exists because Compass's markdown is about to become editable by humans who do not read
Python. Some of these files are prose, but the load-bearing parts are scraped by regex, and when
that scraping goes wrong it goes wrong SILENTLY.

`graph.py`'s own comment warns that writing `Dispatches: **HUMAN**` instead of
`**Dispatches:** HUMAN` would delete a human approval gate. That specific hazard is already
handled — the detection regex was deliberately made formatting-tolerant, and several variants are
pinned in test_validate.py so it stays that way.

The live hazard is different and worse. Damage a `### Step N.` heading — demote it, drop the
period — and that step's body merges into the previous one. Measured on
`create-product-brief.md`: step 1 stops dispatching the researcher and becomes a human gate, the
researcher disappears from the workflow entirely, a step vanishes... **and the HITL count is
unchanged**. Every total still looks right. So an editor cannot gate on counts; it has to show the
author the parsed STRUCTURE and compare it to what was there before. That is what this prints.

So: run the REAL parsers and print the result. Reusing `graph.load_workflow` and run.py's
frontmatter readers is the whole point — a second implementation of those regexes (in TypeScript,
say) would drift from the thing it imitates, which is precisely the bug class being prevented.
`compass/orchestrator/tests/test_validate.py` pins that coupling so a rename in run.py fails CI
instead of quietly breaking the editor.

Usage:
    python -m compass.orchestrator.validate --kind workflow --file compass/workflows/build.md
    cat draft.md | python -m compass.orchestrator.validate --kind workflow --file -
    ... --kind agent --file -
    ... --kind table --section Tickets --columns ticket,workflow,owner,gate --file -

Exit codes: 0 = parsed and usable · 1 = would not work if saved · 2 = usage error.
The caller still reads the JSON; the exit code is so this is usable in CI on its own.
"""
import argparse
import json
import re
import sys
import tempfile
from pathlib import Path

from . import graph
from . import run as runmod


def _read_source(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    return Path(path).read_text(encoding="utf-8")


def _with_temp_file(content: str, fn):
    """graph/run readers take a Path, so stdin content needs to land on disk briefly.

    Suffixed .md because some readers key off the extension, and deleted in `finally` so a parse
    that raises does not leave the draft sitting in the temp dir.
    """
    tmp = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
    try:
        tmp.write(content)
        tmp.close()
        return fn(Path(tmp.name))
    finally:
        Path(tmp.name).unlink(missing_ok=True)


def validate_workflow(content: str) -> dict:
    """Steps, HITL gates and routes, exactly as the orchestrator would see them."""
    steps = _with_temp_file(content, graph.load_workflow)
    meta = _with_temp_file(content, graph.load_workflow_meta)

    out = []
    for s in steps:
        out.append({
            "n": s.number,
            "title": s.title,
            "hitl": s.is_hitl,
            "agent": s.agent,
            "task": s.task,
            "agent_file": s.agent_file,
            "artifact_target": s.artifact_target,
            "routes": [[label, target] for label, target in (s.routes or [])] or None,
        })

    warnings = []
    numbers = [s["n"] for s in out]

    # Not every workflow is a dispatch graph. Of the 20 shipped, 11 declare `## Dispatch graph` and
    # produce steps; the other 9 (status, plan, metrics, scan, retro, …) are report-style workflows
    # with no ordered agent sequence at all — and the correlation is exact. So "no steps" is only a
    # failure for a file that CLAIMS to be a graph. Treating it as universally fatal would make
    # those 9 uneditable, which is the opposite of the point.
    has_graph = bool(re.search(r"^## Dispatch graph", content, re.MULTILINE))
    empty = not content.strip()

    if empty:
        # Whatever shape it claims, an empty workflow file is broken. Saving one would replace a
        # working default with nothing and the failure would only surface at dispatch.
        warnings.append("File is empty.")
    elif has_graph and not out:
        warnings.append("Declares '## Dispatch graph' but no steps were found. "
                        "Expected '### Step N. ...' headings.")
    elif not has_graph and not out:
        warnings.append("No '## Dispatch graph' section — treated as a report-style workflow "
                        "with no agent sequence.")

    if numbers != sorted(numbers):
        warnings.append(f"Steps are out of order: {numbers}.")
    if numbers and sorted(numbers) != list(range(1, len(numbers) + 1)):
        # A gap is usually a step someone deleted without renumbering — and route targets that
        # point at the missing number silently stop matching.
        warnings.append(f"Step numbers are not 1..{len(numbers)}: {sorted(numbers)}.")
    if len(set(numbers)) != len(numbers):
        warnings.append("Duplicate step numbers.")

    for s in out:
        if not s["hitl"] and not s["agent"]:
            # A non-HITL step with no `agent.task` dispatches nothing: the run walks past it.
            warnings.append(f"Step {s['n']} dispatches no agent — expected a `agent.task` in backticks in the title.")
        if s["routes"]:
            for label, target in s["routes"]:
                if isinstance(target, int) and target not in numbers:
                    warnings.append(f"Step {s['n']} route '{label}' points at Step {target}, which does not exist.")

    return {
        "kind": "workflow",
        # Usable as-is: a graph must have steps; a report-style workflow legitimately has none.
        "ok": bool(out) or (not has_graph and not empty),
        "has_dispatch_graph": has_graph,
        "steps": out,
        "hitl_count": sum(1 for s in out if s["hitl"]),
        "agents": sorted({s["agent"] for s in out if s["agent"]}),
        "requires_approved": meta.get("requires_approved", []),
        "warnings": warnings,
    }


def validate_agent(content: str) -> dict:
    """The frontmatter the orchestrator reads when it dispatches this agent."""
    hosts = _with_temp_file(content, runmod._read_preferred_hosts)
    tools = _with_temp_file(content, runmod._read_agent_tools)
    tier = _with_temp_file(content, runmod._read_model_tier)
    catalog = _with_temp_file(content, runmod._reads_bet_catalog)

    warnings = []
    has_fm = bool(re.match(r"^---\n.*?\n---", content, re.DOTALL))
    if not has_fm:
        # Not fatal — the readers default to ["claude"] — but it means every declaration in this
        # file is being ignored, which is rarely what the author intended.
        warnings.append("No YAML frontmatter found; host/tool/model declarations are being ignored (defaulting to claude).")
    if not content.strip():
        warnings.append("File is empty — the agent would receive no instructions.")

    return {
        "kind": "agent",
        "ok": bool(content.strip()),
        "preferred_hosts": hosts,
        "executor_tools": tools,
        "model_tier": tier or None,
        "loads_bet_catalog": catalog,
        "has_frontmatter": has_fm,
        "warnings": warnings,
    }


def validate_table(content: str, section: str, columns: list) -> dict:
    """A markdown table spec (sprint-0, doc-tree). Mirrors `parseSpecTable` in app/lib/specs.ts.

    Kept in step with that deliberately: the editor validates through here, so a table the app
    would parse one way and the orchestrator another is the drift worth catching.
    """
    block = ""
    for part in re.split(r"^##\s+", content, flags=re.MULTILINE):
        if re.match(section, part.strip(), re.IGNORECASE):
            block = part
            break

    rows, warnings = [], []
    if not block:
        return {"kind": "table", "ok": False, "rows": [],
                "warnings": [f'No "## {section}" section found.']}

    for line in block.split("\n"):
        t = line.strip()
        if not t.startswith("|"):
            continue
        cells = [c.strip() for c in t.split("|")[1:-1]]
        if not cells or not re.match(r"^\d+$", cells[0] or ""):
            continue                                    # header / separator / prose
        if len(cells) < len(columns) + 1:               # +1 for the leading index cell
            warnings.append(f"Row {cells[0]}: expected {len(columns)} columns, found {len(cells) - 1}.")
        row = {c: (cells[i + 1] if i + 1 < len(cells) else "") for i, c in enumerate(columns)}
        empty = [c for c in columns if not row[c]]
        if empty:
            warnings.append(f"Row {cells[0]}: empty {', '.join(empty)}.")
        rows.append(row)

    if not rows:
        warnings.append(f'No data rows in "## {section}".')

    return {"kind": "table", "ok": bool(rows), "rows": rows, "warnings": warnings}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="compass.orchestrator.validate", description=__doc__)
    p.add_argument("--kind", required=True, choices=["workflow", "agent", "table"])
    p.add_argument("--file", required=True, help="path, or '-' for stdin")
    p.add_argument("--section", help="table only — the '## <section>' to read")
    p.add_argument("--columns", help="table only — comma-separated column names in order")
    args = p.parse_args(argv)

    if args.kind == "table" and not (args.section and args.columns):
        p.error("--kind table requires --section and --columns")

    try:
        content = _read_source(args.file)
    except OSError as e:
        print(json.dumps({"ok": False, "warnings": [f"Could not read {args.file}: {e}"]}))
        return 2

    if args.kind == "workflow":
        result = validate_workflow(content)
    elif args.kind == "agent":
        result = validate_agent(content)
    else:
        result = validate_table(content, args.section, [c.strip() for c in args.columns.split(",") if c.strip()])

    print(json.dumps(result, indent=None))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
