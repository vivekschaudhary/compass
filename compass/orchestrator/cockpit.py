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
        })
        # keep identity fields fresh (first non-null wins, but tolerate updates)
        for k in ("project", "workflow", "bet_id"):
            if e.get(k) is not None:
                r[k] = e[k]
        r["last_ts"] = e.get("ts") or r["last_ts"]

        t = e.get("type")
        if t == ev.RUN_START:
            r["started"] = e.get("ts")
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
# Approximate Claude list prices (USD per million tokens), keyed by model-family
# substring. Cache reads bill at 0.1× input, cache writes at 1.25× input (the
# Anthropic prompt-cache multipliers). Prices drift — these are a labeled
# estimate for at-a-glance spend, not billing truth. Override via $COMPASS_PRICES
# (JSON: {"opus": [in, out], ...}) when exactness matters.
_PRICES = {"opus": (15.0, 75.0), "sonnet": (3.0, 15.0), "haiku": (0.80, 4.0)}
_CACHE_READ_MULT = 0.1
_CACHE_WRITE_MULT = 1.25


def _prices():
    import json
    import os
    raw = os.environ.get("COMPASS_PRICES")
    if raw:
        try:
            return {**_PRICES, **{k: tuple(v) for k, v in json.loads(raw).items()}}
        except (ValueError, TypeError):
            pass
    return _PRICES


def _price_for(model: str):
    table = _prices()
    m = (model or "").lower()
    for fam, price in table.items():
        if fam in m:
            return price
    return table["opus"]  # default to the priciest — never under-report


def cost_usd(usage: dict, model: str) -> float:
    """Estimated USD for one run's summed usage, accounting for cache pricing."""
    in_price, out_price = _price_for(model)
    return (
        usage["input"] / 1e6 * in_price
        + usage["cache_read"] / 1e6 * in_price * _CACHE_READ_MULT
        + usage["cache_creation"] / 1e6 * in_price * _CACHE_WRITE_MULT
        + usage["output"] / 1e6 * out_price
    )


def _full_input_cost(usage: dict, model: str) -> float:
    """What the input would have cost with NO caching (all prompt tokens at full
    input price) — the baseline the cache savings is measured against."""
    in_price, _ = _price_for(model)
    total_in = usage["input"] + usage["cache_read"] + usage["cache_creation"]
    return total_in / 1e6 * in_price


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
"""


def _esc(s) -> str:
    return _htmllib.escape(str(s)) if s is not None else ""


def render_html(runs: dict, project_filter=None, limit=10, cdir=None,
                refresh=5, snapshot_ts="") -> str:
    """Self-contained HTML cockpit (#113) — same data as the text view, browser layout.
    `snapshot_ts` is passed in (no Date.now); `refresh` drives the meta auto-reload."""
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
    p.append(f"<div class='ts'>snapshot {_esc(snapshot_ts)} · auto-refresh {int(refresh)}s · read-only</div>")

    # ⏸ Awaiting
    p.append(f"<h2>⏸ Awaiting your decision ({len(awaiting)})</h2>")
    if not awaiting:
        p.append("<div class='empty'>nothing waiting on you</div>")
    for r in awaiting:
        g = r["open_gate"]
        loc = " · ".join(_esc(x) for x in [r.get("project"), r.get("workflow"), r.get("bet_id")] if x)
        p.append(f"<div class='run'><span class='loc'>{loc}</span> "
                 f"<span class='muted'>step {_esc(g.get('step'))} — {_esc(g.get('title') or g.get('kind'))}</span>"
                 f"<code>{_esc(_approve_cmd(r))}</code></div>")

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

    p.append("</div></body></html>")
    return "".join(p)


def build_page(events: list, project_filter=None, limit=10, cdir=None,
               refresh=5, snapshot_ts="") -> bytes:
    """events → HTML bytes (what the --serve handler returns per request, #113)."""
    runs = fold_runs(events)
    return render_html(runs, project_filter, limit, cdir, refresh, snapshot_ts).encode("utf-8")


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
    args = parser.parse_args(argv)

    path = args.home if args.home else None
    cdir = compass_dir(args.compass_dir)

    # ── --serve: live read-only localhost feed (re-reads the spine per request) ──
    if args.serve:
        _serve(path, cdir, args.project, args.limit, args.port)
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


def _serve(events_path, cdir, project_filter, limit, port):
    """Read-only localhost HTTP server (#113) — the live cockpit feed. Each GET /
    re-reads the spine and renders fresh HTML; the page meta-refreshes. 127.0.0.1
    only, GET only, no writes, no file traversal."""
    from datetime import datetime, timezone
    from http.server import BaseHTTPRequestHandler, HTTPServer

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path not in ("/", "/index.html"):
                self.send_error(404)
                return
            events = ev.load_events(events_path)
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            body = build_page(events, project_filter=project_filter, limit=limit,
                              cdir=cdir, snapshot_ts=ts)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):  # quiet
            pass

    httpd = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Compass cockpit live → http://127.0.0.1:{port}   (Ctrl-C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")
        httpd.server_close()


if __name__ == "__main__":
    main()
