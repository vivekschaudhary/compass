"""
Event spine for the Compass orchestrator (#104, delivery layer slice 1).

#97 added an `on_event` sink to the tool loop (tool_use/tool_result/note). This
module completes that into a full **event spine**: run/step/gate lifecycle events
emitted through one `on_event` path, fanned to swappable sinks, and persisted to a
**user-local, portfolio-wide** store so any surface (the text cockpit today; an
HTML dashboard / Slack later) can read what's moving across every project.

Where the spine lives:
  $COMPASS_HOME/orchestrator/events.jsonl   (default ~/.compass/orchestrator/)

Deliberately NOT in the project repo. The in-repo runs.jsonl / hitl.jsonl
(docs/orchestrator-runs/, logger.py) remain the auditable per-project decision
journal; this is live telemetry that spans projects and shouldn't churn git or
collide between concurrent worktrees (cf. #102).

events.jsonl schema (one JSON object per line):
  ts        str  — ISO-8601 UTC of the event
  type      str  — one of the TYPE constants below
  project   str  — project label (basename of --project-dir), groups the portfolio
  run_id    str  — matches the run (workflow--bet--timestamp), ties events together
  workflow  str  — workflow name
  bet_id    str  — bet id or null
  + type-specific fields:
    run_start     : allow_write (bool), branch (str|null), actor (str — who launched)
    step_start    : step (int), title, agent, task
    gate_open     : step (int), kind ("hitl"|"routing"), title  ← cockpit's "awaiting you"
    gate_decision : step (int), decision (str), actor (str — who decided)  ← closes the open gate
    handoff       : step (int), target (str — "/workflow" or "close")
    step_end      : step (int), gate_result (str), output_chars (int)
    run_end       : status ("completed"|"halted"), reason (str)
    tool_use      : name, input            (from #97)
    tool_result   : name, is_error, summary
    note          : text
    usage         : model, input_tokens, output_tokens,            (#105)
                    cache_read_input_tokens, cache_creation_input_tokens
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# ── event types ────────────────────────────────────────────────────────────
RUN_START = "run_start"
STEP_START = "step_start"
GATE_OPEN = "gate_open"
GATE_DECISION = "gate_decision"
HANDOFF = "handoff"
STEP_END = "step_end"
RUN_END = "run_end"
# tool-loop events (re-homed from #97)
TOOL_USE = "tool_use"
TOOL_RESULT = "tool_result"
NOTE = "note"
# cost telemetry (#105) — token usage per API call, incl. prompt-cache hits
USAGE = "usage"


def compass_home() -> Path:
    """User-local Compass home — $COMPASS_HOME or ~/.compass."""
    return Path(os.environ.get("COMPASS_HOME") or (Path.home() / ".compass"))


def events_path() -> Path:
    """The user-local, portfolio-wide event spine file."""
    return compass_home() / "orchestrator" / "events.jsonl"


def make_event(type: str, **fields) -> dict:
    """Build an event dict with a UTC timestamp. Fields are merged as-is."""
    return {"ts": datetime.now(timezone.utc).isoformat(), "type": type, **fields}


def project_label(project_dir) -> str:
    """Stable short label for a project — the dir basename — used to group runs."""
    try:
        name = Path(project_dir).resolve().name
    except (OSError, ValueError):
        name = str(project_dir)
    return name or str(project_dir)


# ── sinks ────────────────────────────────────────────────────────────────
def terminal_sink(event: dict) -> None:
    """
    Render any event to stdout. Generalizes #97's `_default_tool_event`: tool
    events keep their compact format; lifecycle events get a one-line render.
    """
    t = event.get("type")
    if t == TOOL_USE:
        inp = event.get("input") or {}
        arg = inp.get("path") or inp.get("pattern") or inp.get("command") or ""
        print(f"  → {event.get('name')}({str(arg)[:80]})")
    elif t == TOOL_RESULT:
        mark = "✗" if event.get("is_error") else "✓"
        print(f"    {mark} {str(event.get('summary', ''))[:100]}")
    elif t == NOTE:
        print(f"  · {event.get('text', '')}")
    elif t == USAGE:
        print(
            f"  $ usage: in={event.get('input_tokens', 0)} "
            f"out={event.get('output_tokens', 0)} "
            f"(cache read={event.get('cache_read_input_tokens', 0)} "
            f"new={event.get('cache_creation_input_tokens', 0)})"
        )
    elif t == GATE_OPEN:
        print(f"  ⏸ gate open (step {event.get('step')}): {event.get('title', '')}")
    elif t == GATE_DECISION:
        print(f"  ✓ gate decided (step {event.get('step')}): {event.get('decision', '')}")
    elif t == RUN_END:
        print(f"  ■ run {event.get('status', '')}: {event.get('reason', '')}")
    # run_start / step_start / step_end / handoff: run.py already prints rich
    # headers for these; the terminal sink stays quiet to avoid double noise.


def jsonl_sink(path=None):
    """Return a sink that appends each event as a JSON line to `path`
    (default: the user-local events_path()). The path is resolved per-call so
    tests can point $COMPASS_HOME elsewhere."""
    def _sink(event: dict) -> None:
        p = Path(path) if path else events_path()
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    return _sink


def multi_sink(*sinks):
    """Fan an event out to several sinks. One failing sink must not kill the run
    (telemetry is best-effort) — failures are reported to stderr and swallowed."""
    def _sink(event: dict) -> None:
        for s in sinks:
            try:
                s(event)
            except Exception as exc:  # best-effort telemetry
                print(f"[events: sink error: {exc}]", file=sys.stderr)
    return _sink


def load_events(path=None) -> list:
    """Read all events from the spine (default user-local). Skips blank/bad lines."""
    p = Path(path) if path else events_path()
    if not p.exists():
        return []
    out = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


# ── pricing (#106/#116) ──────────────────────────────────────────────────────
# Approximate Claude list prices (USD per million tokens), keyed by model-family
# substring. Cache reads bill at 0.1× input, cache writes at 1.25× input. Prices
# drift — a labeled estimate for at-a-glance spend + the budget cap, not billing
# truth. Override via $COMPASS_PRICES (JSON: {"opus": [in, out], ...}). Single
# source for the cockpit rollup (#106) and the run-time budget cap (#116).
_PRICES = {"opus": (15.0, 75.0), "sonnet": (3.0, 15.0), "haiku": (0.80, 4.0)}
_CACHE_READ_MULT = 0.1
_CACHE_WRITE_MULT = 1.25


def _prices():
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
    """Estimated USD for summed usage {input, output, cache_read, cache_creation}."""
    in_price, out_price = _price_for(model)
    return (
        usage.get("input", 0) / 1e6 * in_price
        + usage.get("cache_read", 0) / 1e6 * in_price * _CACHE_READ_MULT
        + usage.get("cache_creation", 0) / 1e6 * in_price * _CACHE_WRITE_MULT
        + usage.get("output", 0) / 1e6 * out_price
    )


def _full_input_cost(usage: dict, model: str) -> float:
    """What the input would cost with NO caching (the cache-savings baseline)."""
    in_price, _ = _price_for(model)
    total_in = usage.get("input", 0) + usage.get("cache_read", 0) + usage.get("cache_creation", 0)
    return total_in / 1e6 * in_price


def cost_of_usage_event(event: dict) -> float:
    """USD for one raw `usage` event (#116 budget cap) — maps the event's token
    fields to the canonical usage shape and prices it."""
    return cost_usd({
        "input": event.get("input_tokens", 0) or 0,
        "output": event.get("output_tokens", 0) or 0,
        "cache_read": event.get("cache_read_input_tokens", 0) or 0,
        "cache_creation": event.get("cache_creation_input_tokens", 0) or 0,
    }, event.get("model"))
