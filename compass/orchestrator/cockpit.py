"""
Compass cockpit (#104, delivery layer slice 1) — the first consumer of the
event spine (events.py). A read-only, portfolio-wide view answering, at any
moment: what's awaiting my decision, what's in flight, what's done.

It reads the user-local spine ($COMPASS_HOME/orchestrator/events.jsonl) and folds
the event stream into per-run state, then renders three sections in VISION order:

  ⏸ AWAITING YOUR DECISION  — open gates across every project (the actionable
                              queue), each with the ready-to-run approve/reject
                              command (copy-paste; inline-approve is a later slice)
  ▶ IN FLIGHT               — runs started but not ended, with their current step
  ✓ DONE / HALTED           — recently ended runs

Usage:
  python3 -m compass.orchestrator.cockpit
  python3 -m compass.orchestrator.cockpit --project home-app --limit 5
  COMPASS_HOME=/tmp/ch python3 -m compass.orchestrator.cockpit
"""
import argparse
import sys

from . import events as ev


def fold_runs(events: list) -> dict:
    """
    Fold the flat event stream into per-run state, keyed by run_id.

    Each run: {run_id, project, workflow, bet_id, started, ended, status,
               reason, current_step, current_task, open_gate}. `open_gate` is the
               last gate_open with no following gate_decision / run_end (None if
               none) — that's the "awaiting your decision" signal.
    """
    runs = {}
    for e in events:
        rid = e.get("run_id")
        if not rid:
            continue
        r = runs.setdefault(rid, {
            "run_id": rid,
            "project": e.get("project"),
            "workflow": e.get("workflow"),
            "bet_id": e.get("bet_id"),
            "started": None, "ended": False, "status": None, "reason": None,
            "current_step": None, "current_task": None, "open_gate": None,
            "last_ts": None,
            # cost rollup (#106): summed token usage from `usage` events.
            "usage": {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0},
            "model": None,
            # step-level status (#111): {step_num: {status, title, agent, task}}
            "steps": {},
            "project_dir": None,   # full path (#119) — lets the cockpit resume any run
        })
        # keep identity fields fresh (first non-null wins, but tolerate updates)
        for k in ("project", "workflow", "bet_id"):
            if e.get(k) is not None:
                r[k] = e[k]
        r["last_ts"] = e.get("ts") or r["last_ts"]

        t = e.get("type")
        if t == ev.RUN_START:
            r["started"] = e.get("ts")
            if e.get("project_dir"):
                r["project_dir"] = e["project_dir"]
        elif t == ev.STEP_START:
            r["current_step"] = e.get("step")
            r["current_task"] = (
                f"{e.get('agent')}.{e.get('task')}"
                if e.get("agent") and e.get("task") else None
            )
            r["steps"][e.get("step")] = {
                "status": "running", "title": e.get("title"),
                "agent": e.get("agent"), "task": e.get("task"),
            }
        elif t == ev.STEP_END:
            st = r["steps"].setdefault(e.get("step"), {})
            st["status"] = "done"
        elif t == ev.GATE_OPEN:
            r["open_gate"] = {"step": e.get("step"), "kind": e.get("kind"),
                              "title": e.get("title")}
            st = r["steps"].setdefault(e.get("step"), {})
            st["status"] = "awaiting"
            st.setdefault("title", e.get("title"))
        elif t == ev.GATE_DECISION:
            r["open_gate"] = None
            st = r["steps"].setdefault(e.get("step"), {})
            st["status"] = "done"
        elif t == ev.HANDOFF:
            r["open_gate"] = None
        elif t == ev.RUN_END:
            r["ended"] = True
            r["status"] = e.get("status")
            r["reason"] = e.get("reason")
            r["open_gate"] = None
        elif t == ev.USAGE:
            u = r["usage"]
            u["input"] += e.get("input_tokens", 0) or 0
            u["output"] += e.get("output_tokens", 0) or 0
            u["cache_read"] += e.get("cache_read_input_tokens", 0) or 0
            u["cache_creation"] += e.get("cache_creation_input_tokens", 0) or 0
            if e.get("model"):
                r["model"] = e["model"]
    return runs


# ── step-level view (#111) ───────────────────────────────────────────────────
import os
from pathlib import Path

_STATUS_GLYPH = {"done": "✓", "running": "▶", "awaiting": "⏸", "pending": "·"}


def compass_dir(override=None) -> Path:
    """Resolve the framework dir holding workflows/ — --compass-dir, else
    $COMPASS_FW/compass, else ./compass. Used to load workflow graphs so the
    step view can show *pending* (not-yet-started) steps."""
    if override:
        return Path(override)
    fw = os.environ.get("COMPASS_FW")
    if fw:
        return Path(fw) / "compass"
    return Path("compass")


def load_graph_steps(workflow: str, cdir) -> list:
    """[(n, agent, task, is_hitl, title)] for a workflow, or [] if unavailable
    (no graph → step view falls back to spine-seen steps only)."""
    try:
        from .graph import load_workflow
        wf = Path(cdir) / "workflows" / f"{workflow}.md"
        if not wf.exists():
            return []
        return [(s.number, s.agent, s.task, s.is_hitl, s.title) for s in load_workflow(wf)]
    except Exception:
        return []


def _step_label(agent, task, title) -> str:
    if agent and task:
        return f"{agent}.{task}"
    return title or "(step)"


def _run_step_rows(run: dict, graph_steps: list):
    """Shared by the text + HTML step views (#111/#113) so they never drift.
    Returns ([(n, status, label)], graph_available: bool)."""
    seen = run.get("steps", {})
    ended = run.get("ended")
    rows = []
    if graph_steps:
        for n, agent, task, is_hitl, title in graph_steps:
            st = seen.get(n)
            if st:
                status = st.get("status", "running")
                label = _step_label(st.get("agent") or agent, st.get("task") or task, st.get("title") or title)
            elif ended:
                continue  # an ended run didn't run this step — not "pending"
            else:
                status, label = "pending", _step_label(agent, task, title)
            rows.append((n, status, label))
        return rows, True
    # spine-only fallback (no graph): just the steps we saw
    for n in sorted(seen):
        st = seen[n]
        rows.append((n, st.get("status", "running"), _step_label(st.get("agent"), st.get("task"), st.get("title"))))
    return rows, False


def _run_status_line(run: dict, rows) -> str:
    if run.get("ended"):
        return f"{run.get('status')} — {run.get('reason') or ''}"
    if any(s == "awaiting" for _, s, _ in rows):
        return "awaiting your decision"
    return "in flight"


def render_run(run: dict, graph_steps: list) -> str:
    """Full annotated step plan for one run: ✓done · ▶running · ⏸awaiting · ·pending."""
    loc = " ".join(x for x in [run.get("project"), run.get("workflow"), run.get("bet_id")] if x)
    out = [f"RUN  {loc}  ({run.get('run_id')})", "=" * 60]
    rows, has_graph = _run_step_rows(run, graph_steps)
    if not has_graph:
        out.append("  (workflow graph unavailable — showing observed steps only; pass --compass-dir for pending steps)")
    for n, status, label in rows:
        glyph = _STATUS_GLYPH.get(status, "·")
        tail = "   ← awaiting your decision" if status == "awaiting" else ""
        out.append(f"  {glyph} {n:>2}  {label}{tail}")
    out.append(f"\n  status: {_run_status_line(run, rows)}")
    return "\n".join(out)


# ── cost rollup (#106) ───────────────────────────────────────────────────────
# Pricing moved to events.py (#116) so the cockpit rollup and the run-time budget
# cap share one source. Re-exported here for back-compat.
from .events import cost_usd, _price_for, _full_input_cost  # noqa: E402,F401


def _has_usage(usage: dict) -> bool:
    return any(usage.get(k) for k in ("input", "output", "cache_read", "cache_creation"))


def _approve_cmd(run: dict) -> str:
    """The copy-paste command to act on an open gate (v1 actionable surface)."""
    gate = run["open_gate"]
    parts = [
        "python3 -m compass.orchestrator.run", run.get("workflow") or "<workflow>",
        f"--project-dir <{run.get('project') or 'project'}-dir>",
    ]
    if run.get("bet_id"):
        parts.append(f"--bet {run['bet_id']}")
    if gate and gate.get("step"):
        parts.append(f"--from-step {gate['step']}")
    base = " ".join(parts)
    return f"{base} --approve   (or --reject)"


def render(runs: dict, project_filter: str = None, limit: int = 10, cdir=None) -> str:
    vals = list(runs.values())
    if project_filter:
        vals = [r for r in vals if r.get("project") == project_filter]
    # #111: total step count per workflow (for the in-flight "step N/M"), cached.
    _totals = {}
    def _total_steps(workflow):
        if workflow not in _totals:
            gs = load_graph_steps(workflow, cdir) if (cdir and workflow) else []
            _totals[workflow] = len(gs)
        return _totals[workflow]

    awaiting = [r for r in vals if r.get("open_gate")]
    in_flight = [r for r in vals if not r.get("ended") and not r.get("open_gate")]
    done = [r for r in vals if r.get("ended")]
    # most-recent first by last event timestamp
    done.sort(key=lambda r: r.get("last_ts") or "", reverse=True)

    out = []
    out.append("COMPASS COCKPIT — portfolio" + (f"  [project: {project_filter}]" if project_filter else ""))
    out.append("=" * 60)

    out.append(f"\n⏸ AWAITING YOUR DECISION ({len(awaiting)})")
    if not awaiting:
        out.append("  (nothing waiting on you)")
    for r in awaiting:
        g = r["open_gate"]
        loc = " ".join(x for x in [r.get("project"), r.get("workflow"), r.get("bet_id")] if x)
        out.append(f"  • {loc}  step {g.get('step')} — {g.get('title') or g.get('kind')}")
        out.append(f"      {_approve_cmd(r)}")

    out.append(f"\n▶ IN FLIGHT ({len(in_flight)})")
    if not in_flight:
        out.append("  (no runs in progress)")
    for r in in_flight:
        loc = " ".join(x for x in [r.get("project"), r.get("workflow"), r.get("bet_id")] if x)
        total = _total_steps(r.get("workflow"))
        if r.get("current_step"):
            where = f"step {r['current_step']}" + (f"/{total}" if total else "")
        else:
            where = "starting"
        task = f" {r['current_task']}" if r.get("current_task") else ""
        out.append(f"  • {loc}  → {where}{task}")

    shown = done[:limit]
    out.append(f"\n✓ DONE / HALTED ({len(done)}" + (f", showing {len(shown)}" if len(done) > len(shown) else "") + ")")
    if not done:
        out.append("  (none yet)")
    for r in shown:
        loc = " ".join(x for x in [r.get("project"), r.get("workflow"), r.get("bet_id")] if x)
        mark = "✓" if r.get("status") == "completed" else "■"
        out.append(f"  {mark} {loc}  {r.get('status')}: {r.get('reason') or ''}")

    out.append(_render_spend(vals))
    return "\n".join(out)


def spend_summary(runs: list):
    """Aggregate spend for the text + HTML views (#106/#113), so they never drift.
    Returns None when no usage, else {per_project: [(name, cost, in, out, cached, hit%)],
    total_cost, saved, saved_pct}."""
    priced = [r for r in runs if _has_usage(r.get("usage", {}))]
    if not priced:
        return None
    by_project = {}
    for r in priced:
        p = r.get("project") or "?"
        agg = by_project.setdefault(p, {
            "usage": {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0},
            "cost": 0.0, "full_in": 0.0,
        })
        for k in agg["usage"]:
            agg["usage"][k] += r["usage"].get(k, 0)
        agg["cost"] += cost_usd(r["usage"], r.get("model"))
        agg["full_in"] += _full_input_cost(r["usage"], r.get("model"))
    per_project, tot_cost, tot_full = [], 0.0, 0.0
    for p, agg in sorted(by_project.items()):
        u = agg["usage"]
        cached = u["cache_read"]
        prompt_in = u["input"] + cached + u["cache_creation"]
        hit = (cached / prompt_in * 100) if prompt_in else 0.0
        per_project.append((p, agg["cost"], u["input"], u["output"], cached, hit))
        tot_cost += agg["cost"]
        tot_full += agg["full_in"]
    actual_input_cost = sum(
        cost_usd({**r["usage"], "output": 0}, r.get("model")) for r in priced
    )
    saved = max(0.0, tot_full - actual_input_cost)
    pct = (saved / tot_full * 100) if tot_full else 0.0
    return {"per_project": per_project, "total_cost": tot_cost, "saved": saved, "saved_pct": pct}


# ── HTML cockpit (#113) ──────────────────────────────────────────────────────
import html as _htmllib

_HTML_GLYPH_CLASS = {"done": "done", "running": "running", "awaiting": "awaiting", "pending": "pending"}
_HTML_CSS = """
  body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0f1115;color:#e6e6e6}
  .wrap{max-width:900px;margin:0 auto;padding:24px}
  h1{font-size:18px;margin:0 0 2px} .ts{color:#8a8f98;font-size:12px;margin-bottom:20px}
  h2{font-size:14px;border-bottom:1px solid #2a2e37;padding-bottom:6px;margin:24px 0 10px}
  .run{margin:6px 0 12px;padding:10px 12px;background:#161a22;border-radius:8px}
  .loc{font-weight:600} .muted{color:#8a8f98}
  code{display:block;background:#0b0d11;border:1px solid #2a2e37;border-radius:6px;padding:6px 8px;margin-top:6px;color:#b8c0cc;white-space:pre-wrap;font-size:12px}
  .steps{margin:6px 0 0;list-style:none;padding:0}
  .steps li{padding:1px 0} .g{display:inline-block;width:1.4em}
  .done .g{color:#3fb950} .running .g{color:#58a6ff} .awaiting .g{color:#d29922} .pending .g{color:#6e7681}
  .pending{color:#8a8f98}
  .spend{color:#b8c0cc} .empty{color:#8a8f98}
  form.act{display:inline}
  button,input,select,textarea{font:inherit}
  button{background:#238636;color:#fff;border:0;border-radius:6px;padding:4px 10px;margin:4px 6px 0 0;cursor:pointer}
  button.rej{background:#6e2630}
  input,select,textarea{background:#0b0d11;border:1px solid #2a2e37;border-radius:6px;color:#e6e6e6;padding:4px 6px}
  .launch{background:#161a22;border-radius:8px;padding:12px;margin:10px 0}
  textarea{width:100%;min-height:48px;margin:4px 0}
  label{display:block;margin:6px 0 2px;color:#8a8f98}
"""


def _hidden(**kv) -> str:
    return "".join(f"<input type='hidden' name='{_esc(k)}' value='{_esc(v)}'>" for k, v in kv.items() if v not in (None, ""))


def _esc(s) -> str:
    return _htmllib.escape(str(s)) if s is not None else ""


def _gate_routes(workflow, step, cdir) -> list:
    """Route labels for a routing gate (#119) — so the cockpit can render one
    button per branch. [] if the graph is unavailable or the step isn't routing."""
    try:
        from .graph import load_workflow
        wf = Path(cdir) / "workflows" / f"{workflow}.md"
        if not wf.exists():
            return []
        for s in load_workflow(wf):
            if s.number == step and s.routes:
                return [lbl for lbl, _ in s.routes]
    except Exception:
        pass
    return []


def _decide_forms(r: dict, cdir) -> str:
    """Approve/reject buttons (HITL gate) or one button per route (routing gate),
    each a tiny POST /decide form (#119). Relays only — run.py still decides."""
    g = r["open_gate"]
    loc = r.get("workflow") or "run"
    hid = _hidden(run_id=r.get("run_id"), workflow=r.get("workflow"),
                  project_dir=r.get("project_dir"), step=g.get("step"))
    out = []

    def form(decide, label, cls="", confirm=""):
        # #122: confirm() before acting + `_act` disables ALL buttons on submit,
        # so a gate can't be double-fired into duplicate resumes while the page
        # waits to refresh.
        c = f" class='{cls}'" if cls else ""
        return (f"<form class='act' method='POST' action='/decide' "
                f"onsubmit=\"return _act(this,'{_esc(confirm)}')\">{hid}"
                f"<input type='hidden' name='decide' value='{_esc(decide)}'>"
                f"<button{c}>{_esc(label)}</button></form>")

    if g.get("kind") == "routing":
        routes = _gate_routes(r.get("workflow"), g.get("step"), cdir)
        for lbl in routes:
            out.append(form(lbl, f"{lbl} →",
                            confirm=f"Route {loc} to ‘{lbl}’? This resumes the run."))
        if not routes:  # graph unavailable — let the operator type the route
            out.append("<form class='act' method='POST' action='/decide' "
                       "onsubmit=\"return _act(this,'Resume this run with the typed route?')\">"
                       + hid +
                       "<input name='decide' placeholder='route label'>"
                       "<button>route →</button></form>")
    else:
        out.append(form("approve", "approve",
                        confirm=f"Approve {loc} and continue?"))
        out.append(form("reject", "reject", cls="rej",
                        confirm=f"Reject {loc}? This halts the run."))
    return "".join(out)


def render_html(runs: dict, project_filter=None, limit=10, cdir=None,
                refresh=5, snapshot_ts="", actions=False, default_project_dir="") -> str:
    """Self-contained HTML cockpit (#113) — same data as the text view, browser layout.
    `snapshot_ts` is passed in (no Date.now); `refresh` drives the meta auto-reload.
    `actions` (#119) turns on the Launch form + per-gate approve/reject/route buttons
    (POST /run, /decide); off → the page stays read-only."""
    vals = list(runs.values())
    if project_filter:
        vals = [r for r in vals if r.get("project") == project_filter]
    awaiting = [r for r in vals if r.get("open_gate")]
    in_flight = [r for r in vals if not r.get("ended") and not r.get("open_gate")]
    done = sorted([r for r in vals if r.get("ended")],
                  key=lambda r: r.get("last_ts") or "", reverse=True)[:limit]

    p = []
    p.append("<!doctype html><html><head><meta charset='utf-8'>")
    p.append(f"<meta http-equiv='refresh' content='{int(refresh)}'>")
    p.append("<title>Compass Cockpit</title>")
    p.append(f"<style>{_HTML_CSS}</style></head><body><div class='wrap'>")
    title = "Compass Cockpit — portfolio" + (f" · {_esc(project_filter)}" if project_filter else "")
    p.append(f"<h1>{title}</h1>")
    mode = "actions enabled — launch & approve below" if actions else "read-only (start with --allow-actions to launch/approve)"
    p.append(f"<div class='ts'>snapshot {_esc(snapshot_ts)} · auto-refresh {int(refresh)}s · {mode}</div>")

    # 🚀 Launch (only with --allow-actions) — relays to compass-run; gates + cap still fire
    if actions:
        opts = "".join(f"<option>{_esc(w)}</option>" for w in _known_workflows(cdir))
        p.append("<div class='launch'><h2>🚀 Launch a workflow</h2>"
                 "<form class='act' method='POST' action='/run' "
                 "onsubmit=\"return _act(this,'Launch this workflow? It runs through its gates and the cost cap.')\">"
                 f"<label>workflow</label><select name='workflow'>{opts}</select>"
                 f"<label>project dir</label><input name='project_dir' size='52' value='{_esc(default_project_dir)}'>"
                 "<label>context (optional)</label><textarea name='context'></textarea>"
                 "<label>bet id (optional)</label><input name='bet'>"
                 "<label><input type='checkbox' name='allow_write' value='1'> allow writes (--allow-write)</label>"
                 "<div><button type='submit'>Launch →</button></div>"
                 "</form></div>")

    # ⏸ Awaiting
    p.append(f"<h2>⏸ Awaiting your decision ({len(awaiting)})</h2>")
    if not awaiting:
        p.append("<div class='empty'>nothing waiting on you</div>")
    for r in awaiting:
        g = r["open_gate"]
        loc = " · ".join(_esc(x) for x in [r.get("project"), r.get("workflow"), r.get("bet_id")] if x)
        act = _decide_forms(r, cdir) if actions else f"<code>{_esc(_approve_cmd(r))}</code>"
        p.append(f"<div class='run'><span class='loc'>{loc}</span> "
                 f"<span class='muted'>step {_esc(g.get('step'))} — {_esc(g.get('title') or g.get('kind'))}</span>"
                 f"{act}</div>")

    # ▶ In flight (+ step plan)
    p.append(f"<h2>▶ In flight ({len(in_flight)})</h2>")
    if not in_flight:
        p.append("<div class='empty'>no runs in progress</div>")
    for r in in_flight:
        loc = " · ".join(_esc(x) for x in [r.get("project"), r.get("workflow"), r.get("bet_id")] if x)
        rows, _hg = _run_step_rows(r, load_graph_steps(r.get("workflow"), cdir))
        total = len(rows) if rows else 0
        cur = r.get("current_step")
        head = f"<span class='loc'>{loc}</span>" + (f" <span class='muted'>step {cur}/{total}</span>" if cur and total else "")
        p.append(f"<div class='run'>{head}<ul class='steps'>")
        for n, status, label in rows:
            cls = _HTML_GLYPH_CLASS.get(status, "pending")
            glyph = _STATUS_GLYPH.get(status, "·")
            tail = " <span class='muted'>← awaiting you</span>" if status == "awaiting" else ""
            p.append(f"<li class='{cls}'><span class='g'>{glyph}</span>{n} {_esc(label)}{tail}</li>")
        p.append("</ul></div>")

    # ✓ Done / halted
    p.append(f"<h2>✓ Done / halted ({len(done)})</h2>")
    if not done:
        p.append("<div class='empty'>none yet</div>")
    for r in done:
        loc = " · ".join(_esc(x) for x in [r.get("project"), r.get("workflow"), r.get("bet_id")] if x)
        mark = "✓" if r.get("status") == "completed" else "■"
        p.append(f"<div class='run'>{mark} <span class='loc'>{loc}</span> "
                 f"<span class='muted'>{_esc(r.get('status'))}: {_esc(r.get('reason'))}</span></div>")

    # 💰 Spend
    s = spend_summary(vals)
    if s:
        p.append("<h2>💰 Spend (estimated)</h2><div class='spend'>")
        for name, cost, inp, out, cached, hit in s["per_project"]:
            p.append(f"<div>• {_esc(name)}: ~${cost:.2f} "
                     f"<span class='muted'>(in {inp:,} · out {out:,} · cache read {cached:,} → {hit:.0f}% cached)</span></div>")
        p.append(f"<div>└ portfolio: ~${s['total_cost']:.2f} total · "
                 f"caching saved ~${s['saved']:.2f} ({s['saved_pct']:.0f}% of input cost)</div>")
        p.append("</div>")

    if actions:
        # #122: confirm before acting, then disable every action button so a
        # gate/launch can't be double-fired into duplicate runs while the page
        # waits on the redirect + meta-refresh.
        p.append(
            "<script>function _act(f,m){if(m&&!confirm(m))return false;"
            "var b=document.querySelectorAll('button');"
            "for(var i=0;i<b.length;i++){b[i].disabled=true;}"
            "var s=document.createElement('div');s.className='ts';"
            "s.textContent='submitting… the page will refresh.';"
            "document.querySelector('.wrap').appendChild(s);return true;}</script>"
        )
    p.append("</div></body></html>")
    return "".join(p)


def build_page(events: list, project_filter=None, limit=10, cdir=None,
               refresh=5, snapshot_ts="", actions=False, default_project_dir="") -> bytes:
    """events → HTML bytes (what the --serve handler returns per request, #113)."""
    runs = fold_runs(events)
    return render_html(runs, project_filter, limit, cdir, refresh, snapshot_ts,
                       actions=actions, default_project_dir=default_project_dir).encode("utf-8")


# ── action endpoints (#119): the cockpit relays launches/decisions to compass-run ──
import re as _re

_WORKFLOW_RE = _re.compile(r"^[a-z][a-z0-9-]+$")
_RUN_ID_RE = _re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]+$")


def _known_workflows(cdir) -> list:
    """Sorted workflow names from compass/workflows/*.md — the launch allow-list.
    Excludes the deprecated `advance` shim (prints a migration table, not runnable)."""
    try:
        d = Path(cdir) / "workflows"
        names = sorted(p.stem for p in d.glob("*.md") if _WORKFLOW_RE.match(p.stem))
        return [n for n in names if n != "advance"]
    except Exception:
        return []


def _build_run_argv(action, params, defaults):
    """Pure arg-builder for POST /run and /decide (#119) — returns a compass-run
    argv list, or ('error', msg). Spawned runs ALWAYS carry --non-interactive and
    the server's --max-cost, so the mechanical gate floor + budget cap still fire;
    the dashboard only relays, it can't bypass control. Pure → unit-tested."""
    wf = (params.get("workflow") or "").strip()
    if not _WORKFLOW_RE.match(wf) or wf not in defaults.get("known", []):
        return ("error", f"unknown workflow: {wf!r}")
    pdir = (params.get("project_dir") or defaults.get("project_dir") or "").strip()
    if not pdir or not Path(pdir).is_dir():
        return ("error", f"project dir not found: {pdir!r}")

    argv = [sys.executable, "-m", "compass.orchestrator.run", wf,
            "--project-dir", pdir, "--non-interactive"]
    max_cost = defaults.get("max_cost")
    if max_cost is not None:
        argv += ["--max-cost", str(max_cost)]
    cdir = defaults.get("compass_dir")
    if cdir:
        argv += ["--compass-dir", str(cdir)]

    if action == "run":
        if params.get("bet"):
            argv += ["--bet", params["bet"].strip()]
        if params.get("context"):
            argv += ["--context", params["context"]]
        if params.get("allow_write"):
            argv += ["--allow-write"]
    elif action == "decide":
        step = (params.get("step") or "").strip()
        if not step.isdigit():
            return ("error", f"bad step: {step!r}")
        decide = (params.get("decide") or "").strip()
        if not decide:
            return ("error", "missing decision")
        argv += ["--from-step", step, "--decide", decide]
        # #121: continue the SAME run so the gate clears from ⏸ awaiting (else the
        # resume forks a new run_id and the paused run lingers as a duplicate).
        rid = (params.get("run_id") or "").strip()
        if rid and _RUN_ID_RE.match(rid):
            argv += ["--run-id", rid]
    else:
        return ("error", f"unknown action: {action!r}")
    return argv


def _gate_already_actioned(events: list, run_id: str) -> bool:
    """#122: True if the run exists and its gate is no longer open (already
    decided / handed off / ended). Lets /decide tell the user "already actioned"
    instead of spawning a second resume from a stale page. Unknown run → False
    (let it through; the run.py gates still hold)."""
    if not run_id:
        return False
    run = fold_runs(events).get(run_id)
    if run is None:
        return False
    return not run.get("open_gate")


def _render_spend(runs: list) -> str:
    """💰 SPEND text rollup — per project + portfolio total (#106). "" when no usage."""
    s = spend_summary(runs)
    if not s:
        return ""
    lines = ["\n💰 SPEND (estimated — list prices; cache read 0.1× / write 1.25×)"]
    for name, cost, inp, out, cached, hit in s["per_project"]:
        lines.append(
            f"  • {name}: ~${cost:.2f}  (in {inp:,} · out {out:,} · cache read {cached:,} "
            f"→ {hit:.0f}% of prompt cached)"
        )
    lines.append(
        f"  └ portfolio: ~${s['total_cost']:.2f} total · "
        f"prompt caching saved ~${s['saved']:.2f} ({s['saved_pct']:.0f}% of input cost)"
    )
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="compass cockpit",
        description="Portfolio cockpit — what's awaiting you, in flight, and done (reads the event spine).",
    )
    parser.add_argument("--project", default=None, help="Filter to one project label (dir basename).")
    parser.add_argument("--home", default=None, help="Override the events.jsonl path (else $COMPASS_HOME/orchestrator/events.jsonl).")
    parser.add_argument("--limit", type=int, default=10, help="Max done/halted runs to show.")
    parser.add_argument("--run", default=None, help="Show the full step-level plan for one run id (#111).")
    parser.add_argument("--compass-dir", default=None, dest="compass_dir",
                        help="Framework dir holding workflows/ (for pending steps). Else $COMPASS_FW/compass, else ./compass.")
    parser.add_argument("--html", nargs="?", const="", default=None, dest="html",
                        help="Write a self-contained HTML snapshot (#113). Optional path; "
                             "default $COMPASS_HOME/orchestrator/cockpit.html. Open via file://.")
    parser.add_argument("--serve", action="store_true",
                        help="Run a read-only localhost server (the live feed, #113) — re-reads the spine per request.")
    parser.add_argument("--port", type=int, default=8765, help="Port for --serve (default 8765).")
    parser.add_argument("--allow-actions", action="store_true", dest="allow_actions",
                        help="Enable POST /run + /decide so you can launch & approve from the browser (#119). "
                             "Off by default (plain --serve is read-only). Spawned runs still carry "
                             "--non-interactive + --max-cost, so the gate floor + budget cap fire.")
    parser.add_argument("--project-dir", default=None, dest="project_dir",
                        help="Default project dir for browser launches (#119); also prefilled in the launch form.")
    parser.add_argument("--max-cost", type=float, default=None, dest="max_cost",
                        help="USD cap applied to every browser-launched run (#119) — the server-level budget guard.")
    args = parser.parse_args(argv)

    path = args.home if args.home else None
    cdir = compass_dir(args.compass_dir)

    # ── --serve: live localhost feed (read-only, or actionable with --allow-actions) ──
    if args.serve:
        _serve(path, cdir, args.project, args.limit, args.port,
               allow_actions=args.allow_actions, max_cost=args.max_cost,
               default_project_dir=args.project_dir)
        return

    # ── --html: write a self-contained snapshot ──
    if args.html is not None:
        from datetime import datetime, timezone
        events = ev.load_events(path)
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        out_path = Path(args.html) if args.html else (ev.compass_home() / "orchestrator" / "cockpit.html")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        html_doc = render_html(fold_runs(events), project_filter=args.project,
                               limit=args.limit, cdir=cdir, snapshot_ts=ts)
        out_path.write_text(html_doc, encoding="utf-8")
        print(f"Wrote cockpit snapshot → {out_path}\n  open: file://{out_path}")
        print("  (snapshot is point-in-time; re-run, or use --serve for a live feed)")
        return

    events = ev.load_events(path)
    if not events:
        loc = path or ev.events_path()
        print(f"No events yet ({loc}). Run a workflow to populate the cockpit.")
        return

    runs = fold_runs(events)

    if args.run:
        run = runs.get(args.run)
        if not run:
            print(f"No run '{args.run}'. Recent run ids:")
            recent = sorted(runs.values(), key=lambda r: r.get("last_ts") or "", reverse=True)
            for r in recent[: args.limit]:
                print(f"  {r['run_id']}")
            return
        print(render_run(run, load_graph_steps(run.get("workflow"), cdir)))
        return

    print(render(runs, project_filter=args.project, limit=args.limit, cdir=cdir))


def _serve(events_path, cdir, project_filter, limit, port,
           allow_actions=False, max_cost=None, default_project_dir=None):
    """Localhost HTTP server (#113/#119) — the live cockpit feed. Each GET /
    re-reads the spine and renders fresh HTML; the page meta-refreshes. With
    --allow-actions, POST /run + /decide relay to compass-run (the server only
    spawns; run.py still gates + the --max-cost cap fires). 127.0.0.1 only;
    no shell (argv list); inputs validated against the workflow allow-list."""
    import os
    import subprocess
    import urllib.parse
    from datetime import datetime, timezone
    from http.server import BaseHTTPRequestHandler, HTTPServer

    defaults = {"known": _known_workflows(cdir), "project_dir": default_project_dir,
                "max_cost": max_cost, "compass_dir": str(cdir) if cdir else None}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path not in ("/", "/index.html"):
                self.send_error(404)
                return
            events = ev.load_events(events_path)
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            body = build_page(events, project_filter=project_filter, limit=limit,
                              cdir=cdir, snapshot_ts=ts, actions=allow_actions,
                              default_project_dir=default_project_dir or "")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if not allow_actions:
                self.send_error(403, "actions disabled (start with --allow-actions)")
                return
            action = {"/run": "run", "/decide": "decide"}.get(self.path)
            if not action:
                self.send_error(404)
                return
            n = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(n).decode("utf-8") if n else ""
            form = {k: v[0] for k, v in urllib.parse.parse_qs(raw).items()}
            # #122: don't fork a duplicate resume from a stale page — if this
            # run's gate was already decided, tell the user instead of spawning.
            if action == "decide" and _gate_already_actioned(
                    ev.load_events(events_path), form.get("run_id", "")):
                self.send_response(409)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    b"<h3>Already actioned</h3><p>This gate was already decided "
                    b"(you may have already routed it). <a href='/'>Back to the "
                    b"cockpit</a> \xe2\x80\x94 it will show under Done / handed off.</p>")
                return
            argv = _build_run_argv(action, form, defaults)
            if isinstance(argv, tuple) and argv[0] == "error":
                self.send_error(400, argv[1])
                return
            # detached spawn — don't block the request; the run streams to the spine
            subprocess.Popen(argv, env=os.environ.copy(),
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.send_response(303)
            self.send_header("Location", "/")
            self.end_headers()

        def log_message(self, *a):  # quiet
            pass

    httpd = HTTPServer(("127.0.0.1", port), Handler)
    mode = "actionable (launch/approve enabled)" if allow_actions else "read-only"
    print(f"Compass cockpit live → http://127.0.0.1:{port}   [{mode}]   (Ctrl-C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")
        httpd.server_close()


if __name__ == "__main__":
    main()
