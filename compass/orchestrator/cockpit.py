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
        elif t == ev.GATE_OPEN:
            r["open_gate"] = {"step": e.get("step"), "kind": e.get("kind"),
                              "title": e.get("title")}
        elif t in (ev.GATE_DECISION, ev.HANDOFF):
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


def render(runs: dict, project_filter: str = None, limit: int = 10) -> str:
    vals = list(runs.values())
    if project_filter:
        vals = [r for r in vals if r.get("project") == project_filter]

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
        where = f"step {r.get('current_step')}" if r.get("current_step") else "starting"
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


def _render_spend(runs: list) -> str:
    """💰 SPEND — estimated cost + cache savings, per project + portfolio total
    (#106). Aggregates the `usage` events #105 emits. Omitted when no usage."""
    priced = [r for r in runs if _has_usage(r.get("usage", {}))]
    if not priced:
        return ""

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

    lines = ["\n💰 SPEND (estimated — list prices; cache read 0.1× / write 1.25×)"]
    tot_cost = tot_full = 0.0
    tot_u = {"input": 0, "output": 0, "cache_read": 0, "cache_creation": 0}
    for p, agg in sorted(by_project.items()):
        u = agg["usage"]
        cached = u["cache_read"]
        prompt_in = u["input"] + cached + u["cache_creation"]
        hit = (cached / prompt_in * 100) if prompt_in else 0.0
        lines.append(
            f"  • {p}: ~${agg['cost']:.2f}  "
            f"(in {u['input']:,} · out {u['output']:,} · cache read {cached:,} "
            f"→ {hit:.0f}% of prompt cached)"
        )
        tot_cost += agg["cost"]
        tot_full += agg["full_in"]
        for k in tot_u:
            tot_u[k] += u[k]

    # Caching savings = full-price input baseline − actual input cost
    # (output excluded from both, so it's purely the cache effect on prompt tokens).
    actual_input_cost = sum(
        cost_usd({**r["usage"], "output": 0}, r.get("model")) for r in priced
    )
    saved = max(0.0, tot_full - actual_input_cost)
    pct = (saved / tot_full * 100) if tot_full else 0.0
    lines.append(
        f"  └ portfolio: ~${tot_cost:.2f} total · "
        f"prompt caching saved ~${saved:.2f} ({pct:.0f}% of input cost)"
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
    args = parser.parse_args(argv)

    path = args.home if args.home else None
    events = ev.load_events(path)
    if not events:
        loc = path or ev.events_path()
        print(f"No events yet ({loc}). Run a workflow to populate the cockpit.")
        return

    runs = fold_runs(events)
    print(render(runs, project_filter=args.project, limit=args.limit))


if __name__ == "__main__":
    main()
