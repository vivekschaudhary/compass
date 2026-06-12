---
name: create-bet-architecture
status: active
owner: architect
auto_invokes: []
invoked_by: [create-brief, manual]
version: 0.3.26
requires_approved: [docs/foundation/product.md, docs/foundation/architecture.md, docs/bets/<bet-id>/brief.md]
---

# Workflow: /create-bet-architecture

## Framework grounding

- **Architecture frameworks:** [well-architected] · [evolutionary-architecture]
- **Bet-based commitment:** [shape-up] (architecture as artifact, not gate)
- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [refuse-escalate] (foundational-stack deviation gate) · [soft-spec-hardening] · [cite-or-mark-na]
- **Verifies adherence to:** Principle #14 (soft spec → AI rationalization) · Principle #16 (refuse + escalate to upstream)

## Purpose

Creates the **bet-level architecture artifact** (`docs/bets/<bet-id>/architecture.md`) — how this bet will be built within the constraints of the approved foundational stack. Must run after the bet's brief is `approved`. Engineer can start as soon as architecture is approved (no waiting for "perfect").

## Architectural shape (v0.3.26)

This workflow is a **thin dispatch graph** per `[workflow-as-dispatch-graph]` (canon v0.3.24). The gate/work/postcondition content lives in the agent task definitions in `compass/agents/`. This file declares:

1. **Workflow-level preconditions** (cross-agent invariants)
2. **Dispatch graph** — ordered sequence of `<agent>.<task>` invocations + HITL gate
3. **Workflow-level verification** — cross-agent invariants the dispatch graph must satisfy

## Preconditions (workflow-level GATE — checked once at start)

- **Brief approved** — `docs/bets/<bet-id>/brief.md` must exist with `status: approved`. **On failure, refuse:** *"Brief for `<bet-id>` is not approved. Run `/create-brief` and obtain approval before creating the bet architecture."*
- **Foundation docs present** — `docs/foundation/product.md` and `docs/foundation/architecture.md` must exist with `status: approved`. **On failure, refuse:** *"Foundation docs missing or unapproved. Run `/setup-product` and `/setup-foundation-architecture` first."*
- **Not already approved** — if `docs/bets/<bet-id>/architecture.md` exists with `status: approved`, refuse unless the user explicitly requests amend mode.

## Roles invoked (agents dispatched)

- `compass/agents/architect.md` — primary agent; drafts bet architecture + runs deviation gate
- `compass/agents/delivery-manager.md` — final status update step

## Dispatch graph

Either runtime is valid:
- **Today (no orchestrator):** human opens Architect agent on a CLI host (Claude Code, Codex), pastes workflow context, agent runs task, halts at HITL.
- **v0.4 (orchestrator):** `python3 -m compass.orchestrator.run create-bet-architecture --context "bet-id: <bet-id>"`.

### Step 1. `architect.draft-bet-architecture` (Architect agent owns)

**Dispatches:** Architect agent
**Task definition:** `compass/agents/architect.md` → Task `draft-bet-architecture`
**Input:** bet-id · brief · `docs/foundation/architecture.md` Stack table · `docs/foundation/product.md` · existing code (read-only) · prior bet architectures (if any)
**What it covers:** state check (architecture_required: false → exit with DRI) → load context → foundational-stack deviation gate (STOP + escalate if new tools detected) → draft 12-section `docs/bets/<bet-id>/architecture.md` → set `status: proposed` → halt at HITL gate.
**Output:** `docs/bets/<bet-id>/architecture.md` with `status: proposed`

### Step 2. **HITL gate** (human)

**Dispatches:** HUMAN (not an agent)
**Artifact target:** `docs/bets/<bet-id>/architecture.md`
**What it covers:** human reviews `docs/bets/<bet-id>/architecture.md` against the Verification checklist below. If all items pass, human approves — orchestrator runs promote to the Artifact target with `status: approved` automatically; interactive sessions flip `status: proposed` → `status: approved` (or `--approve` CLI) and set `architecture_status: approved` in brief frontmatter + commit. If any item fails, reject and re-dispatch Architect. **Per Principle #16:** Architect must NOT self-approve; HITL is a hard stop.

### Step 3. `delivery-manager.update-status` (Delivery Manager agent owns)

**Dispatches:** Delivery Manager agent
**Task definition:** `compass/agents/delivery-manager.md` → Task `update-status`
**What it covers:** confirm architecture approved · update bet status · surface next recommended workflow (`/create-story` or `/build` if story already exists).
**Output:** bet status current in delivery tracking

## Workflow-level verification (final GATE)

Before marking this workflow complete, verify:

- [ ] `docs/bets/<bet-id>/architecture.md` exists with `status: approved`
- [ ] Brief frontmatter has `architecture_status: approved`
- [ ] All 12 architecture sections populated (Decision · Context · Approach · Data model · API/contracts · Dependencies · Cross-system implications · Alternatives · Consequences · Test strategy · Rollout · DRI Log)
- [ ] Foundational-stack assertion explicit: either "no deviation — uses `<stack entries>`" OR "deviation escalated — awaiting ADR-NNN"
- [ ] ≥1 real alternative documented (not strawman)
- [ ] Consequences has both positive AND negative + reversibility rating
- [ ] ≥1 DRI Decision logged
- [ ] If deviation gate fired: DRI Issue logged (severity High, owner Enterprise Architect) + escalation path named
- [ ] Principle #16 satisfied: no silent stack widening inside the bet doc

## Output summary contract

**TL;DR** (3 bullets max) · **Files created/modified** (paths + change types) · **Next recommended command** (typically `/create-story <bet-id>`) · **Open questions/risks** if applicable.

## Notes

**ADR-not-gate:** architecture is an artifact, not a hard gate. Small bets can skip via `architecture_required: false` in brief DRI (Architect logs rationale and exits at Step 1 — no architecture.md produced). Engineer can start as soon as architecture is `approved`; no waiting for "perfect."

**Enterprise/Solution Architect:** the legacy workflow always engaged Enterprise Architect alongside Architect. In the dispatch-graph shape, cross-system implications live in the architecture.md "Cross-system implications" section (Step 1, section 7). If Enterprise Architect review is required for a specific bet, run it as a separate `/ops` task or inline in the HITL review — do not silently skip it. Enterprise Architect agent migration deferred (non-MVP per `compass/framework/mvp.md`).

**Anti-patterns:**
- `silent-stack-introduction` — introducing tools not in the foundational stack inside a bet doc. Deviation gate hard-stops this; never rationalize past it.
- `exploration-shaped-architecture` — architecture doc that reads like research rather than decision. Symptom: no clear "we will" statement in Decision section.
- `strawman-alternatives` — listing one alternative that clearly doesn't work to justify your first choice. ≥1 real alternative means an alternative that a reasonable engineer would actually consider.
- `vague-consequences` — "might cause performance issues" without a reversibility rating or measurement. Every consequence needs: positive/negative label + reversibility (easy / hard / irreversible).
