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

from .events import state_dir  # #118: run telemetry lives user-local, not in the repo


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

def runs_root(project_dir: Path) -> Path:
    """#118: the user-local home for this project's run telemetry (runs.jsonl, hitl.jsonl,
    per-run step-*.md artifacts) — $COMPASS_HOME/state/<project>/orchestrator-runs/. Was
    docs/orchestrator-runs/ in the repo (#175 self-ignored it); now it lives OUT of the
    repo entirely so the consumer tree holds only committed deliverables."""
    return state_dir(project_dir) / "orchestrator-runs"


def ensure_runs_dir(project_dir: Path) -> Path:
    """Create (idempotently) the user-local run-telemetry dir and return it. No in-repo
    .gitignore needed anymore — the dir isn't in the repo (#118, supersedes the #175
    self-ignore)."""
    runs_dir = runs_root(project_dir)
    runs_dir.mkdir(parents=True, exist_ok=True)
    return runs_dir


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

    log_path = ensure_runs_dir(project_dir) / "runs.jsonl"

    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    return record


# ─────────────────────────────────────────────────────────────────────────────
# Analysis helpers — read and summarise the log
# ─────────────────────────────────────────────────────────────────────────────

def load_runs(project_dir: Path) -> list:
    """Load all run records from runs.jsonl."""
    log_path = runs_root(project_dir) / "runs.jsonl"
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
# Actor identity + governance audit (the SOW-conformance wedge — provenance half)
# ─────────────────────────────────────────────────────────────────────────────

# Map an agent name → its delivery ROLE, so the audit can assert review
# independence (maker ≠ checker: a reviewer role distinct from the implementer).
# Unknown agents fall back to their own name.
_ROLE_BY_AGENT = {
    "engineer": "implementer",
    "reviewer": "reviewer",
    "security-reviewer": "security-reviewer",
    "automation": "automation",
    "architect": "architect",
    "enterprise-architect": "architect",
    "pm": "pm",
    "delivery-manager": "delivery-manager",
}


def _role_for(agent: str) -> str:
    return _ROLE_BY_AGENT.get((agent or "").lower(), (agent or "unknown"))


def default_actor(project_dir: Path = None) -> str:
    """The human operating Compass, for the audit trail (who ran / who approved).
    `$COMPASS_ACTOR` overrides; else `git config user.email`; else 'unknown'. Never
    raises — identity is best-effort; the audit records whatever it can resolve."""
    import os
    import subprocess
    actor = os.environ.get("COMPASS_ACTOR")
    if actor and actor.strip():
        return actor.strip()
    try:
        cwd = str(project_dir) if project_dir else None
        r = subprocess.run(["git", "config", "user.email"],
                           capture_output=True, text=True, timeout=5, cwd=cwd)
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except Exception:
        pass
    return "unknown"


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
  actor         str   — WHO decided (git user.email / $COMPASS_ACTOR / "unknown") —
                        the audit-trail identity for the approval
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
    actor: str = None,
) -> dict:
    """Append a HITL gate decision to hitl.jsonl. `actor` is the human identity of
    the decider (the audit trail's who-approved); defaults to `default_actor()`."""
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
        "actor": actor or default_actor(project_dir),
        "connector": connector,
        "canonical_path": canonical_path,
    }

    log_path = ensure_runs_dir(project_dir) / "hitl.jsonl"

    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

    return record


def load_hitl_log(project_dir: Path) -> list:
    """Load all HITL records from hitl.jsonl."""
    log_path = runs_root(project_dir) / "hitl.jsonl"
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


# ─────────────────────────────────────────────────────────────────────────────
# Governance audit — the exportable who-did-what lineage (#2a)
# ─────────────────────────────────────────────────────────────────────────────

def build_audit(project_dir: Path, bet_id: str = None, run_id: str = None,
                controls_path: str = None) -> dict:
    """Assemble the governance audit for a bet (or a single run): the who-did-what
    lineage the SOW-conformance wedge needs — per-step agent/role/host/model, gate
    decisions + approver identity, and the **review-independence verdict**
    (reviewer-role model(s) disjoint from the implementer's). Reads runs.jsonl +
    hitl.jsonl (per-project) + the user-local event spine (the run launcher's
    identity). The control→evidence mapping is layered on in #2b."""
    from . import events as ev

    def _match(rec):
        if run_id and rec.get("run_id") != run_id:
            return False
        if bet_id and rec.get("bet_id") != bet_id:
            return False
        return True

    steps = [r for r in load_runs(project_dir) if _match(r)]
    gates = [h for h in load_hitl_log(project_dir) if _match(h)]

    launchers = {}
    for e in ev.load_events():
        if e.get("type") != ev.RUN_START:
            continue
        if run_id and e.get("run_id") != run_id:
            continue
        if bet_id and e.get("bet_id") != bet_id:
            continue
        launchers[e.get("run_id")] = e.get("actor")

    def _hm(r):  # a step's (host, model) identity; model falls back to host when unset
        return (r.get("host"), r.get("model") or r.get("host"))

    impl = {_hm(r) for r in steps if _role_for(r.get("agent")) == "implementer"}
    review = {_hm(r) for r in steps
              if _role_for(r.get("agent")) in ("reviewer", "security-reviewer")}
    independent = bool(impl) and bool(review) and impl.isdisjoint(review)

    result = {
        "bet_id": bet_id,
        "run_id": run_id,
        "runs": sorted({r.get("run_id") for r in steps if r.get("run_id")}),
        "launchers": launchers,
        "steps": [{
            "run_id": r.get("run_id"), "step": r.get("step"),
            "agent": r.get("agent"), "role": _role_for(r.get("agent")),
            "task": r.get("task"), "host": r.get("host"), "model": r.get("model"),
            "gate_result": r.get("gate_result"), "artifact_path": r.get("artifact_path"),
        } for r in steps],
        "gates": [{
            "run_id": h.get("run_id"), "step": h.get("step"),
            "decision": h.get("decision"), "actor": h.get("actor"),
            "ts": h.get("ts"), "artifact_path": h.get("artifact_path"),
            "feedback": h.get("feedback"),
        } for h in gates],
        "cross_model_independence": {
            "implementer": sorted(list(x) for x in impl),
            "reviewer": sorted(list(x) for x in review),
            "independent": independent,
        },
        "dri_decisions": [
            {"run_id": r.get("run_id"), "agent": r.get("agent"), "decision": d}
            for r in steps for d in (r.get("dri_decisions") or [])
        ],
    }

    # SOW-conformance (#2b): map controls → evidence. Auto-discover the framework if
    # not given — docs/bets/<bet>/controls.md, else docs/controls.md.
    cpath = Path(controls_path) if controls_path else None
    if cpath is None:
        candidates = ([project_dir / "docs" / "bets" / bet_id / "controls.md"]
                      if bet_id else []) + [project_dir / "docs" / "controls.md"]
        cpath = next((c for c in candidates if c.exists()), None)
    if cpath and Path(cpath).exists():
        result["conformance"] = evaluate_conformance(result, parse_controls(cpath))
        result["controls_source"] = str(cpath)
    return result


def format_audit_markdown(audit: dict) -> str:
    """Render build_audit() as a human / Confluence-projectable governance audit doc."""
    scope = audit.get("bet_id") or audit.get("run_id") or "(all runs)"
    lines = [f"# Governance audit — {scope}", ""]

    conf = audit.get("conformance")
    if conf:
        head = "✅ conformant" if conf.get("conformant") else "⚠ gaps"
        summ = " · ".join(f"{k}: {v}" for k, v in (conf.get("summary") or {}).items())
        lines += ["## SOW-conformance", f"- **{head}** — {summ}", "",
                  "| control | category | status | evidence |",
                  "|---|---|---|---|"]
        for c in conf.get("controls", []):
            lines.append(f"| {c.get('id')} {c.get('title')} | {c.get('category') or '—'} | "
                         f"{c.get('status')} | {c.get('evidence') or '—'} |")
        lines.append("")

    # #156: independence is maker ≠ checker — a separate review agent on a FRESH
    # context (the orchestrator withholds prior step outputs from review steps), whose
    # findings gate the merge. Model disjointness is reported as evidence, not asserted
    # as the control: the cross-model requirement was dropped for lack of supporting
    # research, so a same-model run is conformant, not a breach.
    ind = audit.get("cross_model_independence", {})
    roles = [s.get("role") for s in audit.get("steps", [])]
    reviewed = "reviewer" in roles or "security-reviewer" in roles
    verdict = "✅ independent (maker ≠ checker)" if reviewed else "⚠ no review step recorded"
    lines += [
        "## Review independence",
        f"- **Verdict:** {verdict} — the reviewer is a separate agent, dispatched with "
        f"no implementation history, whose findings gate the merge",
        f"- Implementer model(s): {ind.get('implementer') or '—'}",
        f"- Reviewer model(s): {ind.get('reviewer') or '—'}",
        f"- Models disjoint: {'yes' if ind.get('independent') else 'no'} "
        f"(recorded as evidence; not required — see #156)",
        "",
        "## Runs",
    ]
    for rid in audit.get("runs", []):
        who = (audit.get("launchers") or {}).get(rid) or "unknown"
        lines.append(f"- `{rid}` — launched by {who}")
    lines += ["", "## Steps (who did what)", "",
              "| run | step | role | agent.task | host | model | gate |",
              "|---|---|---|---|---|---|---|"]
    for s in audit.get("steps", []):
        lines.append(
            f"| {s.get('run_id','')} | {s.get('step','')} | {s.get('role','')} | "
            f"{s.get('agent','')}.{s.get('task','')} | {s.get('host','')} | "
            f"{s.get('model') or '(default)'} | {s.get('gate_result','')} |")
    lines += ["", "## Gate decisions (approvals)", "",
              "| step | decision | approver | when | artifact |",
              "|---|---|---|---|---|"]
    for g in audit.get("gates", []):
        lines.append(
            f"| {g.get('step','')} | {g.get('decision','')} | {g.get('actor') or '—'} | "
            f"{(g.get('ts') or '')[:19]} | {g.get('artifact_path') or '—'} |")
    dri = audit.get("dri_decisions", [])
    if dri:
        lines += ["", f"## DRI decisions ({len(dri)})", ""]
        for d in dri:
            lines.append(f"- [{d.get('agent','')}] {str(d.get('decision',''))[:300]}")
    lines.append("")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# SOW-conformance — hand-authored control framework + controls→evidence map (#2b)
# ─────────────────────────────────────────────────────────────────────────────

def parse_controls(path) -> list:
    """Parse a hand-authored control framework (controls.md). Each control is a
    `## <ID> — <title>` heading followed by `- key: value` fields (category,
    requirement, check, attest). Returns a list of control dicts; [] if absent."""
    path = Path(path)
    if not path.exists():
        return []
    controls = []
    for block in re.split(r'^##\s+', path.read_text(encoding="utf-8"), flags=re.MULTILINE)[1:]:
        lines = block.splitlines()
        head = lines[0].strip()
        m = re.match(r'(\S+)\s*[—–:-]\s*(.+)', head)
        ctrl = {"id": (m.group(1) if m else head.split()[0]).strip(),
                "title": (m.group(2).strip() if m else head),
                "category": None, "requirement": None,
                "check": "manual", "attest": None}
        for ln in lines[1:]:
            fm = re.match(r'\s*[-*]\s*(\w+)\s*:\s*(.+)', ln)
            if fm and fm.group(1).lower() in ctrl:
                ctrl[fm.group(1).lower()] = fm.group(2).strip()
        controls.append(ctrl)
    return controls


def evaluate_conformance(audit: dict, controls: list) -> dict:
    """Map each control → the delivery evidence that satisfies it (from build_audit's
    lineage) → status. The SOW-conformance proof: 'every control is met, with
    evidence.' Statuses: met · exceeded · unmet · at-risk · unknown."""
    steps = audit.get("steps", [])
    gates = audit.get("gates", [])
    ind = audit.get("cross_model_independence", {})
    roles = [s.get("role") for s in steps]

    def _eval(ctrl):
        check = (ctrl.get("check") or "manual").lower()
        # #156: `cross-model-review` is the LEGACY name — consumer `docs/controls.md`
        # files in the wild still carry it, so it stays accepted as an alias. What it
        # asserts changed: independence is maker ≠ checker (a separate review agent, on
        # a fresh context, whose findings gate the merge), NOT a different model. The
        # cross-model requirement was dropped because research did not support it;
        # evaluating it as a pass condition would now fail every Claude-only run and
        # report a permanent breach on a client-facing compliance artifact.
        if check in ("independent-review", "cross-model-review"):
            if "reviewer" not in roles and "security-reviewer" not in roles:
                return "unmet", "no independent review step recorded"
            if "implementer" in roles and roles.count("implementer") and (
                    "reviewer" in roles or "security-reviewer" in roles):
                note = "reviewer ran as a separate agent on a fresh context (maker ≠ checker)"
                if ind.get("independent"):
                    note += f"; models also disjoint — reviewer {ind.get('reviewer')} ≠ implementer {ind.get('implementer')}"
                return "met", note
            return "met", "independent review step recorded (maker ≠ checker)"
        if check == "human-approval":
            if not gates:
                return "at-risk", "no gate decision recorded yet"
            approved = [g for g in gates if g.get("decision") == "approved"]
            if approved:
                g = approved[-1]
                return "met", f"approved by {g.get('actor') or 'unknown'} at {(g.get('ts') or '')[:19]}"
            if any(g.get("decision") == "rejected" for g in gates):
                return "unmet", "gate rejected, not yet re-approved"
            return "at-risk", "gate pending"
        if check == "security-review":
            return ("met", "security-reviewer step present") if "security-reviewer" in roles \
                else ("unmet", "no security-review step recorded")
        if check == "tests-present":
            if "automation" in roles or any("test" in (s.get("task") or "") for s in steps):
                return "met", "test/automation step present"
            return "at-risk", "no test/automation step recorded"
        if check == "manual":
            attest = (ctrl.get("attest") or "pending").lower()
            if attest == "exceeded":
                return "exceeded", "human-attested: exceeded"
            if attest in ("met", "yes", "done"):
                return "met", f"human-attested: {attest}"
            return "at-risk", f"manual control — attest: {attest}"
        return "unknown", f"unrecognized check '{check}'"

    results = []
    for c in controls:
        status, evidence = _eval(c)
        results.append({"id": c["id"], "title": c["title"], "category": c.get("category"),
                        "check": c.get("check"), "status": status, "evidence": evidence})
    summary = {}
    for r in results:
        summary[r["status"]] = summary.get(r["status"], 0) + 1
    return {
        "controls": results,
        "summary": summary,
        "total": len(results),
        "conformant": bool(results) and all(r["status"] in ("met", "exceeded") for r in results),
    }
