---
name: setup-foundation-architecture
status: active
owner: enterprise-architect
auto_invokes: []
invoked_by: []
version: 0.3.41
requires_approved: [docs/foundation/product.md]
---

# Workflow: /setup-foundation-architecture

## Framework grounding

- **Architecture frameworks:** [well-architected] (6-pillar scoring) · [evolutionary-architecture] (fitness functions before stack choices)
- **Strategy / discovery (inherited from product bet):** [working-backwards] · [lean-mvp]
- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [elicitation-with-options] (first instance, v0.3.2) · [cite-or-mark-na] · [refuse-escalate] · [soft-spec-hardening]
- **Verifies adherence to:** Principle #14 (elicitation closes the "smart defaults" surface) · Principle #15 (research + signal consultation cite-or-n/a) · Principle #16 (HITL hard stops; nothing scaffolds without approval)

## Purpose

Creates the **foundational architecture bet** — the platform's load-bearing technical decisions captured as a measurable wager in `docs/foundation/architecture.md` and scaffolded into the repo. Three EA tasks with HITL gates between them: research → gate → derivation (data model + elicited stack + draft) → gate → scaffold (files + config + per-target canaries). **Nothing in the repo changes until the architecture is human-approved.**

## Architectural shape (v0.3.41)

Thin dispatch graph per `[workflow-as-dispatch-graph]` (canon v0.3.24). Methodology lives in `compass/agents/enterprise-architect.md` tasks `research-architecture` / `derive-architecture` / `scaffold-foundation` — the v0.3.2 embedded methodology (fitness functions, 6-category research, 5-category signal consultation, anchor + 4 cascading elicitations, constraints, canary gate) was reconciled INTO those tasks, not dropped. The agent file is the single source of truth.

## Preconditions (workflow-level GATE)

- **Foundational product approved** — `docs/foundation/product.md` with an approved HITL record or `status: approved` (machine-checked via `requires_approved:` frontmatter; orchestrator halts exit 3 if unmet). **On failure:** *"Run `/setup-product` and get the product bet approved first."*
- **No in-review architecture** — `docs/foundation/architecture.md` with `status: proposed` → refuse: *"Existing architecture.md is in review. Approve, reject, or amend before re-invoking."*
- **Amend mode** — an existing `status: approved` architecture is allowed: EA confirms intent, renames it `architecture-v<N>.md` with `status: superseded`; the new version runs all three steps again and its ADR/Amendments section must cite the triggering source.
- **State routing** — approved architecture + scaffold already done → no-op (or amend creates v2). Scaffold-done detected via boundary folders + populated `compass/config.yaml` stack decisions.

## Roles invoked (agents dispatched)

- `compass/agents/enterprise-architect.md` — tasks `research-architecture`, `derive-architecture`, `scaffold-foundation` (split from the single two-phase task in v0.3.41)
- `compass/agents/delivery-manager.md` — status update after completion

## Dispatch graph

### Step 1. `enterprise-architect.research-architecture` (Enterprise Architect agent owns)

**Dispatches:** Enterprise Architect agent
**Task definition:** `compass/agents/enterprise-architect.md` → Task `research-architecture`
**Input:** `docs/foundation/product.md` (esp. Access & Data Posture) · prior `docs/foundation/` files · amend context if v2+
**What it covers:** fitness functions FIRST (≥1 per Well-Architected pillar, numeric, per [evolutionary-architecture]) → 6-category research framework → 5-category signal consultation (cite or `n/a — <reason>` per category) → findings to `docs/foundation/architecture-phase-a-research.md` with explicit unknowns.
**Output:** research doc, `status: proposed`

### Step 2. **HITL gate — research approved** (human)

**Dispatches:** HUMAN (not an agent)
**Artifact target:** `docs/foundation/architecture-phase-a-research.md`
**What it covers:** human reviews the research findings (fitness functions numeric per pillar; all 11 categories cited or justified n/a; unknowns honest). Approve → orchestrator promotes to the Artifact target with `status: approved`; interactive sessions flip the frontmatter (or `--approve` CLI). Reject → re-dispatch Step 1 with feedback. **Per Principle #16:** EA must NOT self-approve.

### Step 3. `enterprise-architect.derive-architecture` (Enterprise Architect agent owns)

**Dispatches:** Enterprise Architect agent
**Task definition:** `compass/agents/enterprise-architect.md` → Task `derive-architecture`
**Input:** approved research doc · `docs/foundation/product.md` · `compass/templates/foundation-architecture.md`
**What it covers:** data model BEFORE stack picks (9 axes + conventions + Mermaid ERD; entities trace to product.md) → stack elicitation per [elicitation-with-options] (anchor + 4 cascading layers; auth derives from Access & Data Posture; DB cites data model; ops targets map to canary kinds) → constraints → Well-Architected 6-pillar scoring → ADRs → compose `docs/foundation/architecture.md` (`status: proposed`) → DRI seed (≥1 Decision + ≥1 Risk) → mirror or DRI-logged skip.
**Orchestrator-mode note:** on text-only API dispatch, elicitations degrade to option-sets + recommendation in the output; the Step 4 gate is where the human confirms or overrides picks (rejection feedback re-dispatches this step).
**Output:** `docs/foundation/architecture.md`, `status: proposed`

### Step 4. **HITL gate — architecture approved** (human)

**Dispatches:** HUMAN (not an agent)
**Artifact target:** `docs/foundation/architecture.md`
**What it covers:** human reviews architecture.md against the Verification checklist below. Approve → promotion to the Artifact target with `status: approved` (orchestrator) or frontmatter flip / `--approve` CLI (interactive). Reject → amend or abort. **No scaffolding has been written yet; nothing runs on a rejected or pending architecture** (Principle #16).

### Step 5. `enterprise-architect.scaffold-foundation` (Enterprise Architect agent owns)

**Dispatches:** Enterprise Architect agent
**Task definition:** `compass/agents/enterprise-architect.md` → Task `scaffold-foundation`
**What it covers:** file plan presented → explicit user confirmation → scaffold boundary folders + CI/CD + base configs from locked picks → populate `compass/config.yaml` → **deploy canaries, one per target** (`ci_cd.canary_artifacts[]`; any failing target = architecture blocker → ADR + loop, partial coverage fails) → written-files + canary summary.
**Host note:** requires a filesystem-capable host. On text-only API dispatch the task degrades per its Host-capability rule: file plan + full contents as text, canaries marked "pending human verification" — never claimed green.

### Step 6. `delivery-manager.update-status` (Delivery Manager agent owns)

**Dispatches:** Delivery Manager agent
**Task definition:** `compass/agents/delivery-manager.md` → Task `update-status`
**What it covers:** record the foundational architecture bet approved + scaffolded in `docs/status.md`; surface next recommended workflow — `/create-bet-portfolio` (new projects) or `/create-brief` (mid-project bet).

## Workflow-level verification (final GATE)

- [ ] (Step 1) Research doc: fitness functions ≥1 per pillar, numeric · 6 research + 5 signal categories each cited or `n/a — <reason>` (Principle #15) · unknowns explicit
- [ ] (Step 3) Data model: 9 axes + conventions decided, no TBDs · Mermaid ERD with cardinality · every entity traces to product.md
- [ ] (Step 3) Stack picks ELICITED (anchor + 4 layers, cascade rationale + per-pillar implication each) — not smart defaults (Principle #14 / [elicitation-with-options])
- [ ] (Step 3) Auth model aligns with product Access & Data Posture (divergence = DRI Risk, not silent) · DB pick cites the data model · ops targets map to canary kinds
- [ ] (Step 3) Alternatives evaluated against fitness functions (no strawmen) · DRI ≥1 Decision AND ≥1 Risk · mirror done or skip DRI-logged
- [ ] (Step 5) File plan confirmed BEFORE writes · no files beyond plan · config.yaml populated · **every deploy target has a green canary entry with `verified_at` — partial coverage fails**
- [ ] If amend (v2+): superseded file renamed with `status: superseded` · ADR/Amendments has ≥1 new entry citing the trigger
- [ ] Principle #16: neither gate self-approved; nothing scaffolded before Step 4 approval

## Output summary contract

**TL;DR** (3 lines: phase reached / status / pending) · **Files created/modified** table · **Next recommended command** (`/create-bet-portfolio` or `/create-brief`) · **Open questions/risks**.

## Notes

**Anti-patterns** (full definitions in the EA agent file): `smart-defaults-instead-of-elicitation` · `cascade-less elicitation` · `auth-divergence-from-posture` · `db-pick-ignores-data-model` · `scaffold-before-approval` · `single-target-canary-on-multi-target-stack`.

**Edge cases:** Anchor = Other → downstream cascades fall back to static option sets (don't infer) · mirroring unconfigured → skip DRI-logged · no mobile target → canary list covers only picked targets · amend flow → full three-task chain re-runs.

### Migration (v0.3.2 → v0.3.41)

- **v0.3.2:** 21 embedded gate/work/postcondition steps (Phase A 16 + Phase B 5) with one HITL gate between phases.
- **v0.3.41:** thin dispatch graph (5th workflow in dispatch-graph shape). Methodology moved INTO `compass/agents/enterprise-architect.md` as three tasks — the C7 content reconciliation: fitness functions, signal consultation, anchor + 4 cascading elicitations, constraints, config population, and the per-target canary gate were merged into the agent tasks (which previously had only the 6-category research + 9-axis data model + Well-Architected scoring). **No methodology dropped**; the agent file is now the single source of truth, closing the dual-source-of-truth drift (independent review finding C7).
- **Gate count: 1 → 2.** The v0.3.36 agent file had already introduced a research-approval gate; the graph makes both gates explicit nodes with Artifact targets (machine promotion per improvement #84).
