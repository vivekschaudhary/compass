---
name: setup-product
status: active
owner: pm
auto_invokes: []
invoked_by: []
version: 0.3.14
---

# Workflow: /setup-product

## Framework grounding

What this workflow operationalizes. Full entries in `compass/framework/canon.md`.

- **Strategy / discovery foundations:** [working-backwards] · [lean-mvp] · [continuous-discovery] · [jtbd]
- **Competitive position:** [porter-5-forces] · [helmer-7-powers] (Compass extends to 9-type) · [blue-ocean]
- **Bet-based commitment:** [shape-up] · [helmer-bet-portfolio]
- **Communication discipline:** [pyramid-principle] · [stripe-2-page] · [amazon-6-page]
- **Goal-setting:** [okrs] · [north-star]
- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14 — agent files own task content) · [cite-or-mark-na] (Researcher 6-category + moat 9-type) · [refuse-escalate] · [soft-spec-hardening] · [elicitation-with-options] (3-options + Other for auth posture / data sensitivity / regulatory regime)
- **Verifies adherence to:** Principle #14 (soft spec → AI rationalization) · Principle #15 (N-category cite-or-mark-n/a enforcement) · Principle #16 (refuse + escalate to upstream)

## Purpose

Creates the **foundational product bet** — the company / product mission as a measurable bet, captured in `docs/foundation/product.md`. Must run before `/setup-foundation-architecture`.

## Architectural shape (v0.3.14)

This workflow is a **thin dispatch graph** per `[agent-as-surface-independent-unit]` (canon v0.3.14). The heavy gate/work/postcondition content lives in the agent task definitions in `compass/agents/`. This file declares:

1. **Workflow-level preconditions** (cross-agent invariants)
2. **Dispatch graph** — ordered sequence of `<agent>.<task>` invocations + HITL gates
3. **Workflow-level verification** — cross-agent invariants the dispatch graph must satisfy

The per-step gate/work/postcondition detail is NOT in this file. Read the named task in the named agent file for that.

## Preconditions (workflow-level GATE — checked once at start)

- **No in-review foundation** — if `docs/foundation/product.md` exists with `status: proposed`, **refuse with:** "Existing product.md is in review (status: proposed). Approve or reject it before re-invoking `/setup-product`." (Amend of an `approved` foundation is allowed — handled inside `pm.setup-product-foundation`.)
- **Source material provided** — user must provide at least one source (Confluence link, GDrive doc, notes, free text). **On failure, refuse with:** "Provide at least a vision sentence or a source link to begin."
- **At least one agent dispatched per workflow phase has an available host.** If neither PM agent nor Researcher agent can be reached on any configured host, refuse and escalate.

## Roles invoked (agents dispatched)

- `compass/agents/pm.md` — primary agent across most of the workflow
- `compass/agents/researcher.md` — engaged for the cited-evidence task (no log-and-walk-away)
- `compass/agents/delivery-manager.md` — final status update step (migrated v0.3.15)

## Dispatch graph

The workflow walks this sequence. The runtime mechanism is one of:
- **Today (no orchestrator):** human dispatcher — opens the right agent's host (e.g., PM Custom GPT on ChatGPT for the PM tasks, Claude Code for filesystem steps), pastes the workflow command, agent runs its task, halts at the next handoff, human transitions to the next agent's host.
- **v0.4 (orchestrator):** orchestrator walks the graph, dispatches each step to its assigned agent on its assigned host automatically.

Either way, the GRAPH is the same.

### Step 1. `pm.setup-product-foundation` (PM agent owns)

**Dispatches:** PM agent
**Task definition:** `compass/agents/pm.md` → Task `setup-product-foundation`
**What it covers:** state check (handle amend mode) → load PM context → gather source material → draft `docs/foundation/product.md` (including the 3 mandatory Access & Data Posture elicitations) → seed DRI log → optional Confluence/Jira mirror → halt at HITL gate.
**Pause point inside task:** PM halts internally before drafting if Researcher findings (Step 2) are not yet present — the task gates on Researcher's output.

### Step 2. `researcher.cite-evidence-6-category-9-moat` (Researcher agent owns)

**Dispatches:** Researcher agent
**Task definition:** `compass/agents/researcher.md` → Task `cite-evidence-6-category-9-moat`
**What it covers:** identify open questions → gather cited evidence across User pain · Competitive · Moat (mandatory) + Technical · Quantitative · Trends (cited or `n/a — <reason>`) → evaluate all 9 moat types with verdict + rationale → name primary moat(s) → synthesize patterns → acknowledge limitations → output findings (appended to draft product.md OR standalone `docs/foundation/research.md`) → seed Researcher DRI (≥1 Decision AND ≥1 Risk).
**When it runs:** invoked by PM mid-task (PM Step 5 conceptual draft requires Researcher output). On hosts that can run multiple agents in one session, Researcher work happens within the PM session. On cross-host setups, PM halts, Researcher dispatched, PM resumes with findings.

### Step 3. **HITL gate** (human)

**Dispatches:** HUMAN (not an agent)
**Artifact target:** `docs/foundation/product.md`
**What it covers:** human reviews `docs/foundation/product.md` against the workflow-level Verification checklist below. If all items pass, human approves — orchestrator runs promote the draft to the Artifact target with `status: approved` automatically (v0.4-alpha, per improvement #70); interactive sessions flip frontmatter `status: proposed` → `status: approved` (or run `python3 -m compass.orchestrator.run --approve docs/foundation/product.md`) and commit. If any item fails, human rejects and either re-dispatches PM/Researcher or aborts. **Per Principle #16:** PM agent must NOT self-approve; HITL is a hard stop.

### Step 4. `delivery-manager.update-status` (Delivery Manager agent owns)

**Dispatches:** Delivery Manager agent (renamed from Project Manager in v0.3.15)
**Task definition:** `compass/agents/delivery-manager.md` → Task `update-status`
**What it covers:** append note to `docs/status.md` recording that the foundational product bet exists and is approved (with date); In-flight row added; Awaiting-approval row removed if the bet was in that section pre-approval. Per Delivery Manager's `[no-padded-status]` + `[derive-from-state]` principles.
**Migration status:** migrated + renamed v0.3.15 — dispatch graph reference moved from `project-manager.update-status` → `delivery-manager.update-status` (rename), and the lookup target moved from `compass/roles/project-manager.md` → `compass/agents/delivery-manager.md`. Dispatch graph **shape** (workflow ↔ agent task contract) unchanged.

## Workflow-level verification (final GATE — workflow cannot complete until all checked)

Mirrors per-task postconditions + cross-agent invariants.

- [ ] (Step 1 — pm.setup-product-foundation) State handled — no existing product.md, OR existing approved version renamed `product-v<N>.md` with `status: superseded`
- [ ] (Step 2 — researcher) **Per Principle #14:** cited evidence produced (not log-and-walk-away) in **User pain**, **Competitive**, **Moat** — each citation a real source (no "TBD" / "see R-N")
- [ ] (Step 2 — researcher) **Per Principle #15** (6-category framework): the remaining 3 categories (Technical, Quantitative, Trends) either cited OR explicit `n/a — <reason>`
- [ ] (Step 2 — researcher) **Per Principle #15** (9-moat sub-framework): all 9 classic moat types evaluated — each row has verdict (yes / no / partial) AND rationale; empty rows fail; "not applicable" requires rationale
- [ ] (Step 2 — researcher) Researcher DRI: **≥1 Decision AND ≥1 Risk** (Issues-only does not satisfy)
- [ ] (Step 1 — pm) `docs/foundation/product.md` exists with all required sections (Vision · Personas · Positioning · North-star · OKRs · Out-of-scope · Hypothesis · Defensibility/Moat · Measurement window · Cadence)
- [ ] (Step 1 — pm) **Primary moat(s) being bet on are explicitly named** in the Defensibility / Moat section
- [ ] (Step 1 — pm) **Access & Data Posture section populated** — all 3 fields (auth posture, data sensitivity, regulatory regime) have a value OR explicit `n/a — <reason>`. Empty values fail. Unjustified `n/a` fails. **Per Principle #15** + **Principle #14** (auth gap that drove v0.3.1).
- [ ] (Step 1 — pm) Frontmatter: `type: foundational-product`, `status: proposed` (before HITL); `status: approved` (after HITL)
- [ ] (Step 1 — pm) PM DRI: ≥1 Decision entry
- [ ] (Step 1 — pm) Mirroring step completed (epic linked) OR skip logged as DRI Decision (per "no silent skips")
- [ ] (Step 3 — HITL) **Per Principle #16:** if any item above is unchecked, HITL gate cannot pass — refuse to proceed; tell user which item needs work. Human flipped `status: approved`.
- [ ] (Step 4 — delivery-manager) `docs/status.md` mentions foundation product bet with approval date

Workflow is NOT complete until every item is checked.

## Output summary contract (mandatory to user)

After completion (or refusal), report in this exact shape:

- **TL;DR** — 3 lines max: product.md drafted / current status / HITL pending or approved
- **Files created / modified** — table with path + change type
- **Next recommended command** — once approved: `/setup-foundation-architecture` (for new projects)
- **Open questions or risks** — surfaced during research / drafting (only if applicable)
- **Per-step agent dispatch** — which agent ran on which host (informs Finance / Time tracking when v0.4 orchestrator ships)

## Notes

### What changed in v0.3.14

- **Heavy step content moved out of this file** into `compass/agents/pm.md` (task `setup-product-foundation`) and `compass/agents/researcher.md` (task `cite-evidence-6-category-9-moat`). This file became a thin **dispatch graph** per `[agent-as-surface-independent-unit]` (canon v0.3.14).
- **No behavior change.** Every gate/work/postcondition that existed in v0.3.0-alpha shape is preserved, now inside the agent task definitions. Verification items unchanged.
- **Cross-host orchestration enabled.** Same workflow file works whether PM runs on ChatGPT and Engineer runs on Claude Code (today, with human dispatcher) or whether v0.4 orchestrator dispatches across hosts (later). The graph is the contract.
- **Project Manager → Delivery Manager migration + rename, v0.3.15.** Step 4 now dispatches to `compass/agents/delivery-manager.md` → Task `update-status`. The dispatch graph reference itself moved (`project-manager.update-status` → `delivery-manager.update-status`) **because we're renaming the agent**, but the dispatch graph **shape** (the workflow ↔ agent-task contract) stayed stable. This is an honest stretch of the v0.3.14 promise — the simple-migration test would have kept the same reference; the rename test moves the reference but preserves the contract. Both surface the same downstream invariant: workflows don't need to know about agent-file internals.

### Anti-patterns

- **Reading the workflow file alone and trying to execute it.** This file does NOT contain the step-by-step work — that lives in agent task definitions. Always load the named agent file for each step.
- **Cross-agent step bleed.** PM agent must not execute Researcher's task even on a host where both could run; the Researcher's task has its own gates and DRI requirements. Single-session multi-agent dispatch is allowed (one LLM session wearing two agent hats serially) but must respect each task's boundaries.
- **Researcher log-and-walk-away** — filing missing research as DRI Issues instead of producing it. Closed inside `researcher.cite-evidence-6-category-9-moat` postconditions.
- **Empty moat verdicts** — leaving any of the 9 moat types unevaluated. "Not applicable" valid only with rationale. Closed inside researcher task postconditions.

### Edge cases

- **Amend mode** — existing `status: approved` product.md → user can amend (creates v2). Handled inside `pm.setup-product-foundation` Step 1.
- **Mirroring disabled** — if `compass/config.yaml` connectors don't include docs/ticketing, mirror step is skipped and logged as DRI Decision (per "no silent skips"). Handled inside `pm.setup-product-foundation`.
- **Single-host run (e.g., all on Claude Code)** — works the same. Same Claude Code session sequentially loads PM agent then Researcher agent then PM agent again. Dispatch graph stays valid; only the runtime differs (single-host vs cross-host).
- **Custom GPT-only run (e.g., PM Custom GPT on ChatGPT)** — Researcher's Step 2 dispatched to a Researcher Custom GPT on the same ChatGPT account, or PM Custom GPT temporarily wears the Researcher hat by loading the Researcher agent file. Either way, Researcher task's postconditions must be met.

### Migration (v0.3.0-alpha → v0.3.14)

- **v0.3.0-alpha:** gate/work/postcondition step content lived in this workflow file (9 steps, 169 lines).
- **v0.3.14:** content moved to `compass/agents/pm.md` and `compass/agents/researcher.md` as task definitions. This file became a dispatch graph. **No behavior change.** Per Principle #16, every refusal case + verification gate preserved.
- **Why:** `[agent-as-surface-independent-unit]` — agents are now self-sufficient, surface-independent units; tasks live in agents; workflows sequence tasks. Enables cross-host orchestration (PM on ChatGPT + Engineer on Claude Code today; full orchestrator dispatch in v0.4).
- **What still works the same:** workflow-level preconditions, verification checklist, HITL gates, output summary contract, named anti-patterns, edge cases. Read inside the agent task files for the gate/work/postcondition shape — it's all there.

---

_Workflow refactored 2026-06-04 (v0.3.14) per `[agent-as-surface-independent-unit]` (canon v0.3.14). First workflow refactored to thin dispatch graph shape; other 13 workflows migrate as their owning agents migrate (v0.3.15+)._
