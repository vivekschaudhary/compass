"""
Exec control-tower view — the live Work Breakdown Structure (#3).

Where the cockpit (cockpit.py) folds the event spine into per-RUN state, this builds
the **program → bet/epic → story** tree from the *artifact* frontmatter
(`docs/bets/*/brief.md` + `stories/*/story.md`), correlates it with spine run-state,
and surfaces **manage-by-exception** (what needs the exec's attention) + the
**SOW-conformance** dimension (from logger.build_audit). Ground-truth status: every
node reflects the actual artifacts + actual runs, not a self-report.
"""
import re
from pathlib import Path

from . import events as ev
from .cockpit import fold_runs

_SHIPPED = {"shipped", "won", "merged"}
# #171: a design/copy story sits here until a HUMAN delivers the Figma/strings and
# flips it to `ready`. A feature story that depends on one is BLOCKED until then.
_PENDING_HUMAN = {"needs-design", "needs-copy"}


def _frontmatter(path) -> dict:
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError:
        return {}
    m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return {}
    fm = {}
    for line in m.group(1).splitlines():
        km = re.match(r"^([\w-]+)\s*:\s*(.*)$", line)
        if km:
            fm[km.group(1)] = _strip_inline_comment(km.group(2)).strip()
    return fm


def _strip_inline_comment(val: str) -> str:
    """Strip a YAML inline comment from a scalar/flow value. Per YAML, a `#`
    begins a comment only when preceded by whitespace (or at string start) and
    not inside a quoted string. So `[A] # note` -> `[A]` and `bet-1 # why` ->
    `bet-1`, while `(#171)` and `"a#b"` are preserved (the `#` isn't after
    whitespace / is quoted). Without this, `depends_on: [A] # note` parses the
    comment into the dep id and the tower shows a phantom `(unknown)` blocker."""
    quote = None
    for i, ch in enumerate(val):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == "#" and (i == 0 or val[i - 1].isspace()):
            return val[:i].rstrip()
    return val


def _list(val) -> list:
    """Parse a frontmatter list value into a list of ids. Handles the inline-flow
    forms the brief template uses — `[A, B]`, `["A", 'B']`, `A, B` — stripping
    brackets and quotes. (Block-style YAML lists aren't supported by the single-line
    frontmatter reader; the template uses inline flow.)"""
    if not val:
        return []
    return [x.strip().strip("\"'") for x in val.strip().strip("[]").split(",")
            if x.strip().strip("\"'")]


def _title(path, fallback) -> str:
    try:
        m = re.search(r"^#\s+(.+)$", Path(path).read_text(encoding="utf-8"), re.MULTILINE)
        return m.group(1).strip() if m else fallback
    except OSError:
        return fallback


def _rag(status: str, attention: list) -> str:
    """Red/amber/green: red = blocked/halted/conformance-gap; amber = awaiting/pending;
    green = shipped or progressing."""
    if any(a["level"] == "red" for a in attention):
        return "red"
    if status in _SHIPPED:
        return "green"
    if attention:
        return "amber"
    if status in ("proposed", "needs-design"):
        return "amber"
    return "green"


def _run_order(r) -> str:
    """Sort key for runs — most recent last. Uses last activity, then start, then
    run_id (which carries a trailing timestamp)."""
    return (r.get("last_ts") or "", r.get("started") or "", r.get("run_id") or "")


def build_wbs(project_dir, with_conformance: bool = False,
              show_halt_history: bool = False) -> dict:
    """Build the program→bet→story WBS with ground-truth status + manage-by-exception.
    `with_conformance` folds the SOW-conformance verdict per bet (slower — reads the
    audit). `show_halt_history` keeps every halted run in the exception list; by
    default terminal/superseded halts are collapsed (see below). Returns
    {program, bets, summary, attention}."""
    project_dir = Path(project_dir)
    bets_dir = project_dir / "docs" / "bets"
    from datetime import datetime, timezone
    now, threshold = datetime.now(timezone.utc), ev.stale_timeout()

    runs_by_bet = {}
    for r in fold_runs(ev.load_events()).values():
        runs_by_bet.setdefault(r.get("bet_id"), []).append(r)

    raw = []
    for brief in (sorted(bets_dir.glob("*/brief.md")) if bets_dir.exists() else []):
        bdir = brief.parent
        fm = _frontmatter(brief)
        declared = fm.get("status") or "unknown"
        # #57: read stories now so bet status can DERIVE from them. Ground truth wins
        # over stale hand-set frontmatter — a bet whose every story shipped IS shipped;
        # frontmatter is a cache, not the source. Doing this in the FIRST pass means the
        # dependency map below sees effective (not declared) status, so a bet blocked by
        # a dep whose stories all shipped is no longer falsely red.
        sdir = bdir / "stories"
        story_nodes = []
        for sf in sorted(sdir.glob("*/story.md")) if sdir.exists() else []:
            sfm = _frontmatter(sf)
            story_nodes.append({
                "id": sfm.get("id") or sf.parent.name,
                "status": sfm.get("status") or "unknown",
                "type": sfm.get("type"),
                "owner": sfm.get("owner"),
                "dependencies": _list(sfm.get("dependencies")),
                "jira_key": sfm.get("jira_key"),
            })
        stories_all_shipped = bool(story_nodes) and all(s["status"] in _SHIPPED for s in story_nodes)
        effective = "shipped" if stories_all_shipped else declared
        raw.append({
            "id": fm.get("id") or bdir.name,
            "status": effective,                       # ground-truth-derived (#57)
            "declared_status": declared,               # what the frontmatter says
            "status_derived": effective != declared,
            "stories_all_shipped": stories_all_shipped,
            "story_nodes": story_nodes,
            "type": fm.get("type"),
            "priority": fm.get("priority"),
            "depends_on": _list(fm.get("depends_on")),
            "title": _title(brief, fm.get("id") or bdir.name),
            "dir": bdir,
        })
    status_map = {b["id"]: b["status"] for b in raw}   # EFFECTIVE status (#57)

    bets, attention = [], []
    for b in raw:
        runs = runs_by_bet.get(b["id"], [])
        open_gates = [r for r in runs if r.get("open_gate")]
        halted = [r for r in runs if r.get("status") == "halted"]
        in_flight = [r for r in runs if r.get("started") and not r.get("ended")]

        # Collapse halted-run noise (#67). A shipped/merged bet has moved past any
        # failed attempts — pure history. For a live bet only the LATEST halt is the
        # current actionable state; older attempts are superseded. Nothing is lost:
        # the full history stays in the spine and shows with show_halt_history=True
        # (--wbs-verbose). [fail-loud-not-silent] — the surviving line carries the
        # hidden count, so the board still can't lie.
        hidden_halts = 0
        if halted and not show_halt_history:
            if b["status"] in _SHIPPED:
                hidden_halts, halted = len(halted), []
            else:
                hidden_halts, halted = len(halted) - 1, [max(halted, key=_run_order)]

        node_attn = []
        for r in open_gates:
            node_attn.append({"level": "amber", "reason": f"awaiting gate at step {r['open_gate'].get('step')}",
                              "run_id": r["run_id"]})
        for r in halted:
            extra = (f" (+{hidden_halts} earlier attempt{'' if hidden_halts == 1 else 's'} hidden)"
                     if hidden_halts else "")
            node_attn.append({"level": "red",
                              "reason": f"run halted: {r.get('reason') or ''}{extra}".strip(),
                              "run_id": r["run_id"]})
        for r in in_flight:
            if ev.is_stale(r, now, threshold):
                node_attn.append({"level": "red", "run_id": r["run_id"],
                                  "reason": f"run stalled — no activity for "
                                            f"~{int(ev.run_age_seconds(r, now))}s"})
        for dep in b["depends_on"]:
            if status_map.get(dep) not in _SHIPPED:
                node_attn.append({"level": "red",
                                  "reason": f"blocked by {dep} ({status_map.get(dep, 'unknown')})"})
        if b["status"] == "proposed" and not runs:
            node_attn.append({"level": "amber", "reason": "not started"})
        # #57 false-shipped guard: frontmatter claims shipped/won/merged but the
        # stories say otherwise — status theater in the other direction. Flag it RED
        # so a bet that only *claims* to be done can't render green.
        if b["declared_status"] in _SHIPPED and b["story_nodes"] and not b["stories_all_shipped"]:
            n_open = sum(1 for s in b["story_nodes"] if s["status"] not in _SHIPPED)
            node_attn.append({"level": "red",
                              "reason": f"declared {b['declared_status']} but {n_open} of "
                                        f"{len(b['story_nodes'])} stories not shipped"})

        # stories — resolve cross-story dependencies (#171: a feature story blocked by
        # an un-delivered design/copy story; design/copy stories awaiting human
        # delivery) so the tower surfaces them under manage-by-exception. Nodes were
        # read in the first pass (#57) — reuse them here.
        story_nodes = b["story_nodes"]
        story_status = {s["id"]: s["status"] for s in story_nodes}

        stories = []
        for s in story_nodes:
            # blocked = a dependency that's a design/copy story still awaiting a human
            blockers = [d for d in s["dependencies"]
                        if story_status.get(d, "unknown") in _PENDING_HUMAN]
            if blockers:
                reason = (f"story {s['id']} blocked by "
                          + ", ".join(f"{d} ({story_status.get(d, 'unknown')})" for d in blockers))
                node_attn.append({"level": "red", "reason": reason})
            elif s["owner"] == "human" and s["status"] in _PENDING_HUMAN:
                node_attn.append({"level": "amber",
                                  "reason": f"{s.get('type') or 'design/copy'} story {s['id']} "
                                            f"awaiting human delivery ({s['status']})"})
            stories.append({**s, "blocked_by": blockers})

        conformance = None
        if with_conformance:
            from .logger import build_audit
            conf = build_audit(project_dir, bet_id=b["id"]).get("conformance")
            if conf:
                conformance = {"conformant": conf.get("conformant"), "summary": conf.get("summary")}
                if not conf.get("conformant"):
                    node_attn.append({"level": "red", "reason": "SOW-conformance gaps"})

        for a in node_attn:
            attention.append({**a, "bet": b["id"]})

        bets.append({
            "id": b["id"], "title": b["title"], "status": b["status"],
            "type": b["type"], "priority": b["priority"], "depends_on": b["depends_on"],
            "rag": _rag(b["status"], node_attn),
            "stories": stories, "story_count": len(stories),
            "in_flight": len(in_flight), "open_gates": len(open_gates),
            "conformance": conformance, "attention": node_attn,
            "hidden_halts": hidden_halts,
            "declared_status": b["declared_status"], "status_derived": b["status_derived"],
        })

    summary = {"bets": len(bets), "needs_attention": sum(1 for b in bets if b["attention"]),
               "in_flight": sum(b["in_flight"] for b in bets),
               "awaiting_gates": sum(b["open_gates"] for b in bets)}
    return {"program": project_dir.name, "bets": bets, "summary": summary,
            "attention": attention}


_GLYPH = {"red": "🔴", "amber": "🟡", "green": "🟢"}


def render_wbs(wbs: dict) -> str:
    """Render the WBS as the text control-tower view: needs-attention first
    (manage-by-exception), then the program→bet→story tree with ground-truth status."""
    s = wbs.get("summary", {})
    lines = [f"━━ Control tower — {wbs.get('program','')} ━━",
             f"{s.get('bets',0)} bets · {s.get('needs_attention',0)} need attention · "
             f"{s.get('in_flight',0)} in flight · {s.get('awaiting_gates',0)} awaiting a gate", ""]

    att = wbs.get("attention", [])
    if att:
        lines.append("⚠ NEEDS ATTENTION (manage by exception)")
        for a in att:
            lines.append(f"  {_GLYPH.get(a['level'],'•')} {a['bet']}: {a['reason']}")
        lines.append("")

    lines.append("WBS (program → bet → story)")
    for b in wbs.get("bets", []):
        conf = ""
        if b.get("conformance"):
            conf = "  · conformance " + ("✅" if b["conformance"]["conformant"] else "⚠ gaps")
        # a shipped bet's failed attempts are hidden from the exception list but
        # noted here so the history stays discoverable (--wbs-verbose to expand).
        hist = (f"  · {b['hidden_halts']} halted run(s) in history"
                if b.get("hidden_halts") and not b.get("attention") else "")
        # #57: show when the status was DERIVED from stories (frontmatter is stale) —
        # transparent, so the override of the hand-set value is visible, not silent.
        st = (f"{b['status']} ⟵ {b['declared_status']}" if b.get("status_derived")
              else b['status'])
        lines.append(f"  {_GLYPH.get(b['rag'],'•')} {b['id']} [{st}] {b.get('title','')}"
                     f"  ({b['story_count']} stories){conf}{hist}")
        for st in b.get("stories", []):
            ptr = f" → {st['jira_key']}" if st.get("jira_key") else ""
            tag = f" ({st['type']}, human)" if st.get("owner") == "human" else (
                f" ({st['type']})" if st.get("type") and st.get("type") != "story" else "")
            blocked = f"  ⛔ blocked by {', '.join(st['blocked_by'])}" if st.get("blocked_by") else ""
            lines.append(f"      - {st['id']} [{st['status']}]{tag}{ptr}{blocked}")
    lines.append("")
    return "\n".join(lines)
