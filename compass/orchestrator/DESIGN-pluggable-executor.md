# Design: Pluggable graph executor — LLM-as-orchestrator over a mechanical gate floor

> **Status: DECLARED, not implemented** (improvement #87, 2026-06-14) per `[declare-not-implement]` (canon v0.3.9). This file is the design sketch; build when a concrete need pulls it from declared → built (see Triggers). Working pattern name: `[pluggable-graph-executor]`.

## The realization

The dispatch-graph + agent-file substrate already separates the **plan** (`compass/workflows/<wf>.md`, machine-readable steps) from the **executor** (the thing that walks it). Today the executor is a deterministic Python loop (`run.py`). Because of `[workflow-as-dispatch-graph]` (v0.3.24) + `[agent-as-surface-independent-unit]` (v0.3.14), the executor is **swappable** — the substrate doesn't care whether `for step in steps` or an LLM drives it.

Three execution surfaces over one substrate:

1. **Deterministic orchestrator** — `run.py`. Plain control flow; no LLM in the driver's seat. Shipped (v0.4-alpha-6).
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
