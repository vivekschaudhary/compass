"""
Compass orchestrator step logger — v0.1

Parses structured sections from agent output and appends a record to
docs/orchestrator-runs/runs.jsonl for cross-run analysis.

Schema (one JSON object per line):
  run_id        str   — workflow + bet + timestamp slug
  ts            str   — ISO-8601 UTC
  workflow      str   — workflow name (e.g. create-bet-architecture)
  bet_id        str   — bet ID if --bet was passed (e.g. CB-4), else null
  step          int   — step number within the workflow
  agent         str   — agent name (e.g. architect)
  task          str   — task name (e.g. draft-bet-architecture)
  host          str   — host that dispatched (claude / openai / gemini)
  model         str   — model override if set, else null
  gate_result   str   — pass | exit | hitl_approved | hitl_rejected | unknown
  tldr          str   — first 300 chars of TL;DR from Output summary
  dri_decisions list  — list of DRI Decision text blocks extracted
  files_created list  — file paths from "Files created" in Output summary
  files_modified list — file paths from "Files modified" in Output summary
  next_command  str   — next recommended command, or null
  risks         list  — risk bullet texts from Output summary
  output_chars  int   — raw character count of full agent output
  artifact_path str   — path of the written artifact file, or null
"""
import json
import re
from datetime import datetime, timezone
from pathlib import Path


# ─────────────────────────────────────────────────────────────────────────────
# Parser — extract structured sections from agent markdown output
# ─────────────────────────────────────────────────────────────────────────────

def _extract_section(text: str, heading: str) -> str:
    """Return the body of a ## heading section (up to the next ## heading)."""
    pattern = rf'^##\s+{re.escape(heading)}\s*$'
    match = re.search(pattern, text, re.MULTILINE | re.IGNORECASE)
    if not match:
        return ""
    start = match.end()
    next_h2 = re.search(r'^##\s', text[start:], re.MULTILINE)
    end = start + next_h2.start() if next_h2 else len(text)
    return text[start:end].strip()


def _extract_bold_field(text: str, label: str) -> str:
    """Extract value after **Label** or **Label:** in a section body."""
    pattern = rf'\*\*{re.escape(label)}[:\*]*\*?\*?\s*(.+?)(?:\n|$)'
    match = re.search(pattern, text, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def _extract_list_items(text: str) -> list:
    """Extract bullet / dash list items from a text block."""
    items = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(("- ", "* ", "• ")):
            items.append(stripped[2:].strip())
        elif re.match(r'^\d+\.\s', stripped):
            items.append(re.sub(r'^\d+\.\s', '', stripped).strip())
    return [i for i in items if i]


def _gate_result(output: str) -> str:
    """Infer gate result from keywords in the output."""
    lower = output.lower()
    if any(kw in lower for kw in ["gate passes", "gate: pass", "state check\n\n✅", "gate check\n\n✅"]):
        return "pass"
    if any(kw in lower for kw in ["architecture_required: false", "no bet-level architecture", "log the dri decision rationale, announce exit"]):
        return "exit"
    if "gate fails" in lower or "gate: fail" in lower or "precondition not met" in lower:
        return "fail"
    return "unknown"


def _extract_dri_decisions(output: str) -> list:
    """Extract DRI Decision blocks — lines starting with [date] [Role]."""
    decisions = []
    # Match decision blocks inside code fences or plain text
    blocks = re.findall(
        r'- \[\d{4}-\d{2}-\d{2}\]\s+\[[^\]]+\]\s+\*\*.+?\*\*.*?(?=\n- \[|\Z)',
        output,
        re.DOTALL,
    )
    for b in blocks:
        decisions.append(b.strip())

    # Fallback: look for DRI Decision section body
    if not decisions:
        section = _extract_section(output, "DRI Decision logged") or _extract_section(output, "DRI Decisions logged")
        if section:
            decisions.append(section[:600])

    return decisions


def _extract_files(output: str, label: str) -> list:
    """Extract file paths listed under a Files created/modified label."""
    # Look for the label in the Output summary section
    summary = _extract_section(output, "Output summary")
    if not summary:
        return []
    pattern = rf'\*\*Files? {re.escape(label)}:?\*\*[:\s]*(.*?)(?=\n\*\*|\Z)'
    match = re.search(pattern, summary, re.DOTALL | re.IGNORECASE)
    if not match:
        return []
    block = match.group(1).strip()
    # Extract backtick paths or bare paths from bullets
    paths = re.findall(r'`([^`]+\.(?:md|ts|py|json|yaml|yml|sql|js|tsx|jsx))`', block)
    if not paths:
        paths = _extract_list_items(block)
    return paths[:10]  # cap to avoid runaway


def parse_step_output(output: str) -> dict:
    """
    Parse structured sections from an agent step output.
    Returns a dict with all extracted fields (nulls where not found).
    """
    summary_section = _extract_section(output, "Output summary")

    # TL;DR
    tldr_raw = _extract_bold_field(summary_section, "TL;DR") if summary_section else ""
    if not tldr_raw:
        # Try to grab the first substantive sentence
        for line in output.splitlines():
            stripped = line.strip()
            if len(stripped) > 40 and not stripped.startswith("#"):
                tldr_raw = stripped
                break
    tldr = tldr_raw[:300]

    # Next recommended command
    next_cmd = _extract_bold_field(summary_section, "Next recommended command") if summary_section else ""
    if not next_cmd:
        match = re.search(r'`(/[a-z][\w-]+[^`]*)`', output)
        next_cmd = match.group(1) if match else ""

    # Risks
    risks_section = _extract_bold_field(summary_section, "Open questions / risks") if summary_section else ""
    risks = _extract_list_items(risks_section) if risks_section else []

    return {
        "gate_result": _gate_result(output),
        "tldr": tldr,
        "dri_decisions": _extract_dri_decisions(output),
        "files_created": _extract_files(output, "created"),
        "files_modified": _extract_files(output, "modified"),
        "next_command": next_cmd or None,
        "risks": risks,
        "output_chars": len(output),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Logger — append a run record to runs.jsonl
# ─────────────────────────────────────────────────────────────────────────────

def log_step(
    project_dir: Path,
    run_id: str,
    workflow: str,
    bet_id: str,
    step: int,
    agent: str,
    task: str,
    host: str,
    model: str,
    output: str,
    artifact_path: str = None,
) -> dict:
    """
    Parse the step output and append a structured record to runs.jsonl.
    Returns the record dict.
    """
    parsed = parse_step_output(output)

    record = {
        "run_id": run_id,
        "ts": datetime.now(timezone.utc).isoformat(),
        "workflow": workflow,
        "bet_id": bet_id,
        "step": step,
        "agent": agent,
        "task": task,
        "host": host,
        "model": model,
        "artifact_path": artifact_path,
        **parsed,
    }

    log_path = project_dir / "docs" / "orchestrator-runs" / "runs.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    return record


# ─────────────────────────────────────────────────────────────────────────────
# Analysis helpers — read and summarise the log
# ─────────────────────────────────────────────────────────────────────────────

def load_runs(project_dir: Path) -> list:
    """Load all run records from runs.jsonl."""
    log_path = project_dir / "docs" / "orchestrator-runs" / "runs.jsonl"
    if not log_path.exists():
        return []
    records = []
    for line in log_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return records


def print_run_table(project_dir: Path) -> None:
    """Print a human-readable summary table of all logged steps."""
    records = load_runs(project_dir)
    if not records:
        print("No runs logged yet (docs/orchestrator-runs/runs.jsonl is empty).")
        return

    col_widths = [10, 24, 6, 18, 12, 10, 8, 30]
    headers = ["ts", "workflow", "step", "agent.task", "bet", "host", "gate", "tldr"]
    sep = "  ".join("─" * w for w in col_widths)

    def trunc(s, n):
        s = str(s or "")
        return s[:n] if len(s) <= n else s[: n - 1] + "…"

    print(sep)
    print("  ".join(h.ljust(w) for h, w in zip(headers, col_widths)))
    print(sep)
    for r in records:
        ts_short = (r.get("ts") or "")[:10]
        agent_task = f"{r.get('agent','')}.{r.get('task','')}"
        row = [
            ts_short,
            r.get("workflow", ""),
            str(r.get("step", "")),
            agent_task,
            r.get("bet_id") or "",
            r.get("host") or "",
            r.get("gate_result") or "",
            r.get("tldr") or "",
        ]
        print("  ".join(trunc(v, w).ljust(w) for v, w in zip(row, col_widths)))
    print(sep)
    print(f"\n{len(records)} step(s) logged.")


# ─────────────────────────────────────────────────────────────────────────────
# HITL journal — log every gate decision to hitl.jsonl
# ─────────────────────────────────────────────────────────────────────────────

HITL_SCHEMA = """
hitl.jsonl schema (one JSON object per line):
  run_id        str   — matches the step record in runs.jsonl
  ts            str   — ISO-8601 UTC of the gate decision
  workflow      str   — workflow name
  bet_id        str   — bet ID or null
  step          int   — step number of the HITL gate
  artifact_path str   — path of the artifact reviewed, or null
  decision      str   — "approved" | "rejected"
  feedback      str   — reviewer notes on rejection, or null
  reviewer      str   — "human" (all HITL gates today are human)
  connector     str   — backend the artifact was pushed through on approval
                        ("filesystem" | "filesystem fallback — <name> not
                        implemented"), or null when nothing was promoted
  canonical_path str  — canonical path the artifact was promoted to on
                        approval (the gate-requirement match key), or null
"""


def log_hitl(
    project_dir: Path,
    run_id: str,
    workflow: str,
    bet_id: str,
    step: int,
    artifact_path: str,
    decision: str,
    feedback: str = None,
    reviewer: str = "human",
    connector: str = None,
    canonical_path: str = None,
) -> dict:
    """Append a HITL gate decision to hitl.jsonl."""
    record = {
        "run_id": run_id,
        "ts": datetime.now(timezone.utc).isoformat(),
        "workflow": workflow,
        "bet_id": bet_id,
        "step": step,
        "artifact_path": artifact_path,
        "decision": decision,
        "feedback": feedback or None,
        "reviewer": reviewer,
        "connector": connector,
        "canonical_path": canonical_path,
    }

    log_path = project_dir / "docs" / "orchestrator-runs" / "hitl.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    return record


def load_hitl_log(project_dir: Path) -> list:
    """Load all HITL records from hitl.jsonl."""
    log_path = project_dir / "docs" / "orchestrator-runs" / "hitl.jsonl"
    if not log_path.exists():
        return []
    records = []
    for line in log_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return records


def print_hitl_table(project_dir: Path) -> None:
    """Print a human-readable summary table of all HITL gate decisions."""
    records = load_hitl_log(project_dir)
    if not records:
        print("No HITL decisions logged yet (docs/orchestrator-runs/hitl.jsonl is empty).")
        return

    col_widths = [10, 24, 6, 10, 8, 28]
    headers = ["ts", "workflow", "step", "bet", "decision", "feedback"]
    sep = "  ".join("─" * w for w in col_widths)

    def trunc(s, n):
        s = str(s or "")
        return s[:n] if len(s) <= n else s[: n - 1] + "…"

    print(sep)
    print("  ".join(h.ljust(w) for h, w in zip(headers, col_widths)))
    print(sep)
    for r in records:
        ts_short = (r.get("ts") or "")[:10]
        row = [
            ts_short,
            r.get("workflow", ""),
            str(r.get("step", "")),
            r.get("bet_id") or "",
            r.get("decision") or "",
            r.get("feedback") or "",
        ]
        print("  ".join(trunc(v, w).ljust(w) for v, w in zip(row, col_widths)))
    print(sep)
    print(f"\n{len(records)} HITL decision(s) logged.")


def dri_decisions_report(project_dir: Path) -> None:
    """Print all DRI decisions across all runs."""
    records = load_runs(project_dir)
    decisions = []
    for r in records:
        for d in (r.get("dri_decisions") or []):
            decisions.append({
                "ts": r.get("ts", "")[:10],
                "workflow": r.get("workflow", ""),
                "bet_id": r.get("bet_id") or "",
                "agent": r.get("agent", ""),
                "decision": d,
            })
    if not decisions:
        print("No DRI decisions logged yet.")
        return
    print(f"\n{'═' * 60}")
    print(f"DRI DECISIONS — {len(decisions)} total")
    print(f"{'═' * 60}")
    for d in decisions:
        print(f"\n[{d['ts']}] {d['bet_id']} | {d['agent']} via {d['workflow']}")
        print(d["decision"][:400])
    print()
