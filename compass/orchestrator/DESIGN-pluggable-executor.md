# Design: Pluggable graph executor — LLM-as-orchestrator over a mechanical gate floor

> **Status: PARTIALLY BUILT.** Declared #87 (2026-06-14). **Tool-using executor slices SHIPPED:** slice 1 read-only tools (#91, v0.4.0-alpha-7), slice 2 write+verify under `--allow-write` (#92, v0.4.0-alpha-8) — `hosts/tools.py` + `claude.py:dispatch_with_tools`. **Still declared, not built:** surface 3 below (Claude-as-autonomous-orchestrator / LLM-as-driver) and the openai/gemini tool-use adapters. Working pattern name: `[pluggable-graph-executor]`.
>
> **Serves:** [`VISION.md`](VISION.md) — the orchestrator's product north star (conductor over the full lifecycle, portfolio parallelism, the cockpit). This design is roadmap step 1 (tool-using roles) toward that vision.

## The realization

The dispatch-graph + agent-file substrate already separates the **plan** (`compass/workflows/<wf>.md`, machine-readable steps) from the **executor** (the thing that walks it). Today the executor is a deterministic Python loop (`run.py`). Because of `[workflow-as-dispatch-graph]` (v0.3.24) + `[agent-as-surface-independent-unit]` (v0.3.14), the executor is **swappable** — the substrate doesn't care whether `for step in steps` or an LLM drives it.

Three execution surfaces over one substrate:

1. **Deterministic orchestrator** — `run.py`. Plain control flow; no LLM in the driver's seat. Shipped (v0.4-alpha). Its Claude implementer steps now run a **tool loop** (read + opt-in write/bash) per #91/#92 — still a deterministic driver, but the steps are agentic.
2. **Claude Code interactive** — Claude reads the workflow + agent files, executes tasks, halts at gates; a human drives cadence + approvals. Shipped (the `/setup-product` etc. skills).
3. **Claude as autonomous orchestrator** — Claude (Agent SDK / Task-style subagents) walks the graph and spawns one subagent per step with `compass/agents/<agent>.md` as system prompt, collecting outputs and advancing. **This design.**

## The load-bearing constraint: the mechanical gate floor

Compass exists to fight soft-spec rationalization (Principle #14). A deterministic loop **cannot** skip a HITL gate or let Claude review its own code. An LLM orchestrator **can** rationalize past both ("this looks approved, I'll continue"; "I'll just review it myself") — reintroducing the exact failure surface the framework hardens against. Therefore an LLM executor is valid ONLY if the gates, routing, and promotion stay **mechanical tools it MUST call**, not judgments it makes.

The LLM orchestrator MAY NOT:
1. **Decide a requirement gate passed** — must call `run.py:_requirement_met()`; unmet → halt with the same exit-3 semantics.
2. **Self-approve a HITL gate** — must stop for the human (or configured HITL handler) and write the decision via `logger.log_hitl()`.
3. **Review code it dispatched** — reviewer steps route through `hosts/router.py:select_host()` to a non-Claude host (`reviewer.md` `preferred_hosts: [codex, gemini]`); the orchestrator cannot absorb the reviewer role.
4. **Skip a step silently** — same no-silent-skip rule as `run.py` (#79); a skip is an explicit logged DRI decision.

**The pattern is hybrid, not a handoff:** Claude orchestrates the judgment-heavy parts; the gates/routing/promotion remain mechanical. The mechanical floor is Principle #14 applied to the orchestrator itself.

## What the LLM executor ADDS (the reason to build it)

Over the deterministic loop's blunt behavior:
- **Context composition** — decide which prior artifacts/sections each step actually needs, vs `run.py`'s "prior outputs truncated to 3000 chars."
- **Ambiguity handling** — when a step output is malformed or a gate is borderline, reason or ask instead of crashing.
- **Dynamic dispatch** — conditional steps (e.g., create-story's Designer/UX-Writer "if UI surface") decided by reading the artifact, rather than always-dispatch.
- **Recovery** — retry a failed step with adjusted context instead of a hard exit.

## Reuse (do NOT rebuild)

| Need | Existing component |
|---|---|
| Parse graph + `requires_approved` | `graph.py:load_workflow()` / `load_workflow_meta()` |
| Requirement gate check | `run.py:_requirement_met()` |
| Reviewer routing / host exclusion | `hosts/router.py:select_host()` |
| Artifact extract + promote on approval | `connector.py` (`extract_artifact_body`, `set_frontmatter_status`, `push_artifact`) |
| Audit trail | `logger.py:log_step()` / `log_hitl()` (same `runs.jsonl` / `hitl.jsonl`) |
| HITL prompt | `hitl.py:handle_hitl_gate()` |

The new module is thin: it replaces only the *driver*, reusing every mechanical guarantee.

## Implementation surfaces (pick one when building)

- **(a) Claude Code skill `/run <workflow>`** — uses the Agent/Task tool to spawn one subagent per step with the agent file as system prompt. Lives in interactive Claude Code; human-present for gates.
- **(b) Claude Agent SDK script `agent_run.py`** — headless; the orchestrator is a Claude agent whose tools are `{dispatch_step, check_gate, promote_artifact, log_decision}`, each wrapping the mechanical components above. Closer to `run.py`'s headless nature; slots in as a third executor entry alongside it.

## Relationship to existing patterns

- Extends `[workflow-as-dispatch-graph]` (v0.3.24) — names the executor as a swappable role; the graph was always the executor's interface contract.
- Extends `[agent-as-surface-independent-unit]` (v0.3.14) — agent files as system prompts work for subagent dispatch too.
- Guarded by Principle #14 (soft-spec-hardening) + #16 (refuse-escalate) — the mechanical floor is the structural countermeasure.
- Would be the **4th architecture-discipline class member** when codified (joining agent-as-surface-independent-unit · fractal-retro · workflow-as-dispatch-graph).

## Triggers (declared → built)

Build when one of:
- Real orchestrator runs hit context-composition friction (the kindtree validation run is the likely first evidence — `run.py`'s 3000-char truncation losing needed context).
- A consumer asks for autonomous multi-agent runs (no human babysitting each step).
- v0.4-beta multi-agent coordination scope opens (the MVP doc already gestures at this).

Codify as a canon pattern after a 2nd instance OR once built and validated. Until then: declared.

## Related capability: conditional dispatch (`[conditional-dispatch]`, declared #95)

Today's dispatch graphs are **linear** — every step runs in order; the only control flow is "HITL reject → halt." That can't express a step whose *outcome chooses the next step*. The motivating case: **triage as a router** — intake should decide and route (fix / `create-brief` for deeper work / close as duplicate·L1·won't-fix·not-repro / incident), with `/fix` being one *branch*, not the presumed entry. Conditional dispatch is the graph-control-flow sibling of this executor work (an LLM-as-driver naturally does dynamic routing; a declarative branch could also be deterministic). See improvement #95. **Built (#96):** within-graph HITL routing on `/triage`'s fix-forward branch — first instance.

### Front-door `/triage` intake router — ITIL-grounded (declared #98)

**`/triage` becomes the front door** (no separate `/intake`), matching the ITIL service-desk model and the VISION's Triage role: it classifies *any* incoming item and routes it to the right workflow, HITL-confirming the category. Evidence: two live home-app runs where triage correctly classified (feature-not-bug; bug-not-incident) but the linear flow had nowhere to route.

ITIL category → Compass route: **incident** → incident-response branch (today's `/triage` flow, now one route) · **bug/defect** → `/fix` · **enhancement / problem (root-cause)** → `/create-brief` · **change (config/infra)** → `/ops` · **service request** → `/ops` or answer+close · **not-an-issue / duplicate / L1** → close (logged).

**Two entry points for work, both feeding PM:** *reactive* — the front-door `/triage` classifies incoming items and routes (bugs→fix, enhancements→brief, …); *proactive* — planned features enter directly via `/create-brief`. PM's inputs = triage-routed work + proactively-planned briefs.

Shape: a classifier step (generalize `support.triage-incident` or add `support.classify-intake`) proposes the ITIL category + rationale → the #96 routing gate offers the full route set → HITL confirms/overrides → dispatch. **v1 = cross-workflow hand-off** (record the route + emit the recommended command with the triage note as the input artifact; only the *incident* route continues inline). **v2 = auto-chain** (the orchestrator runs the target workflow directly — needs cross-workflow dispatch, related to `--pipeline`). This is the 2nd `[conditional-dispatch]` instance → codify it to canon when built.

**BUILT (#103, v1):** `support.classify-intake` + the intake routing gate ship; route targets generalized to `int | str` so a route can hand off cross-workflow (`/fix`, `/create-brief`, `/ops`) or `close`. `[conditional-dispatch]` codified to canon v0.3.49. v2 auto-chain still pending (needs the LLM-driver / nested-run).

## Delivery layer + cockpit (VISION step 3, building on #97's event spine)

The orchestrator's terminal output is a *dev* surface; real users live in a dashboard / Slack / WhatsApp. The bridge is the **event spine** — structured, routable events the loop emits without knowing who consumes them.

- **#97 laid the first stone:** `dispatch_with_tools` emits `tool_use`/`tool_result`/`note` through an `on_event` sink.
- **#104 completed the spine + shipped slice 1:** lifecycle events (`run_start · step_start · gate_open · gate_decision · handoff · step_end · run_end`) emitted through one `emit` in `run.py`, threaded through `dispatch_to_host`, fanned via `multi_sink` to the terminal + a **user-local** store `~/.compass/orchestrator/events.jsonl` (`events.py`; `$COMPASS_HOME` override). First consumer: `cockpit.py` (`python3 -m compass.orchestrator.cockpit`) — a portfolio-wide text view (⏸ awaiting you · ▶ in flight · ✓ done).

**Why user-local, not in-repo:** the spine is live telemetry that must span *every* project for a portfolio cockpit, and it must not churn project git or collide between concurrent worktrees (#102). The in-repo `runs.jsonl` / `hitl.jsonl` (`logger.py`) stay the auditable per-project decision journal — different purpose, both persist. *(Convention candidate `[telemetry-user-local-not-in-repo]`, 1 instance — codify on the 2nd.)*

**Slice roadmap:** (1) ✅ spine + user-local store + text cockpit (#104). (2) feed the HTML `/dashboard` live tab from `events.jsonl`. (3) Slack/WhatsApp delivery sinks (add a sink to `multi_sink`). (4) make the cockpit's queue actionable inline (approve *from* the cockpit — the mechanical gate floor stays in `run.py`). (5) `--watch` live re-render. Each slice is additive: a new sink or a new reader over the same spine; the loop never changes.
