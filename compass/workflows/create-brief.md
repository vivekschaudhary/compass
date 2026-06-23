---
name: create-brief
status: active
owner: pm
auto_invokes: []
invoked_by: [create-bet-portfolio, manual]
version: 0.3.51
requires_approved: [docs/foundation/product.md, docs/foundation/architecture.md]
---

# Workflow: /create-brief

## Framework grounding

- **Strategy / discovery foundations:** [working-backwards] · [lean-mvp] · [jtbd]
- **Bet-based commitment:** [shape-up] (brief as the shaped bet before commitment)
- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [cite-or-mark-na] · [refuse-escalate] · [soft-spec-hardening]
- **Verifies adherence to:** Principle #14 · Principle #15 (cite-or-mark-na) · Principle #16

## Purpose

Creates a **bet-level brief** (`docs/bets/<bet-id>/brief.md`) — the shaped bet before architecture or engineering begins. **`/create-brief` is for a NEW bet / capability, not an addition to an existing one** (`[right-size-the-path-to-the-work]`) — if the work is a slice of a bet that already exists, it belongs in `/create-story --bet <id>`, not a fresh bet. Two modes: **fresh** (new bet from source material) and **promote-stub** (fill content for a portfolio stub from `/create-bet-portfolio`).

## Architectural shape (v0.3.27)

Thin dispatch graph per `[workflow-as-dispatch-graph]` (canon v0.3.24). Methodology lives in agent task files.

## Preconditions (workflow-level GATE)

- **Foundation approved** — `docs/foundation/product.md` AND `docs/foundation/architecture.md` both `status: approved`. **On failure:** *"Foundation not approved. Run `/setup-product` and `/setup-foundation-architecture` first."*
- **Source or stub present** — user provides ≥1 source (link, free text, or existing stub bet-id with `portfolio_stub: true`). **On failure:** *"Provide a source link, description, or stub bet-id to begin."*
- **Brief not already drafted** — if `docs/bets/<bet-id>/brief.md` exists with `portfolio_stub: false`, refuse: *"Brief already drafted. Use `/create-story <bet-id>` or `/create-bet-architecture <bet-id>` next."*
- **Not a slice of an existing bet** (`[right-size-the-path-to-the-work]`, v0.3.51) — if the request is really a slice/addition to an already-approved bet (check the existing bets under `docs/bets/`), **refuse** and right-size: *"This looks like a slice of bet `<id>`. Run `/create-story <id>` instead of minting a new bet."* Only genuinely new capabilities/hypotheses get a fresh brief. (Enforced in the PM task gate, per `[refuse-escalate]` spirit — don't silently create a redundant bet.)

## Roles invoked (agents dispatched)

- `compass/agents/researcher.md` — cited evidence for this bet (User pain · Competitive · Moat)
- `compass/agents/pm.md` — drafts brief; runs mode detection; seeds DRI; HITL halt
- `compass/agents/delivery-manager.md` — status update after approval

## Dispatch graph

### Step 1. `researcher.cite-evidence-6-category-9-moat` (Researcher agent owns)

**Dispatches:** Researcher agent
**Task definition:** `compass/agents/researcher.md` → Task `cite-evidence-6-category-9-moat`
**Input:** source material (link / free text / stub context) · bet-id (if known) · `docs/foundation/product.md` for context
**What it covers:** identify open questions for this bet → gather cited evidence (User pain · Competitive · Moat MANDATORY; Technical · Quantitative · Trends if relevant or `n/a`) → for foundational bets evaluate all 9 moat types → synthesize → output findings to `docs/bets/<bet-id>/research.md` or appended to brief stub → seed DRI ≥1 Decision AND ≥1 Risk.
**Output:** cited research findings ready for PM to draft from

### Step 2. `pm.draft-brief` (PM agent owns)

**Dispatches:** PM agent
**Task definition:** `compass/agents/pm.md` → Task `draft-brief`
**Input:** Researcher findings from Step 1 · source material · bet-id · mode (fresh vs promote-stub)
**What it covers:** mode detection → gather source → draft `docs/bets/<bet-id>/brief.md` (problem · user · hypothesis · metrics · guardrails · scope · architecture-required · DRI log) → promote-stub: keep frontmatter, clear `portfolio_stub: false`, update portfolio.md → seed DRI → mirror to Jira/Confluence if MCP → HITL halt.
**Output:** `docs/bets/<bet-id>/brief.md` with `status: proposed`

### Step 3. **HITL gate** (human)

**Dispatches:** HUMAN (not an agent)
**Artifact target:** `docs/bets/<bet-id>/brief.md`
**What it covers:** human reviews `docs/bets/<bet-id>/brief.md` against Verification checklist. Pass → approve: orchestrator runs promote to the Artifact target with `status: approved` automatically; interactive sessions flip `status: proposed` → `status: approved` (or `--approve` CLI) + commit. Fail → reject and re-dispatch PM. **Principle #16:** PM must NOT self-approve.

### Step 4. `delivery-manager.update-status` (Delivery Manager agent owns)

**Dispatches:** Delivery Manager agent
**Task definition:** `compass/agents/delivery-manager.md` → Task `update-status`
**What it covers:** confirm brief approved · update bet tracking · surface next recommended workflow (`/create-bet-architecture <bet-id>` if `architecture_required: true/auto`, else `/create-story <bet-id>`).
**Output:** bet status current in delivery tracking

## Workflow-level verification (final GATE)

- [ ] `docs/bets/<bet-id>/brief.md` exists with `status: approved`
- [ ] All sections populated (problem · user · why-this-matters · hypothesis · primary metric · guardrails · measurement window · scope · architecture-required)
- [ ] Every claim cited OR `n/a — <reason>` (Principle #15)
- [ ] Hypothesis is falsifiable (metric + threshold + window)
- [ ] Researcher findings consumed (User pain + Competitive + Moat cited or `n/a`)
- [ ] ≥1 DRI Decision logged
- [ ] If promote-stub: `portfolio_stub: false` set + portfolio.md Promotion log updated
- [ ] Mirror completed OR skip logged as DRI Decision
- [ ] Principle #16 satisfied: not self-approved

## Output summary contract

**TL;DR** (3 bullets) · **Files created/modified** · **Next recommended command** (`/create-bet-architecture <bet-id>` or `/create-story <bet-id>`) · **Open questions/risks**.

## Notes

**Promote-stub mode:** when `/create-bet-portfolio` ran first, it creates stubs with `portfolio_stub: true`. Promoting fills the full brief content while preserving the bet's portfolio context (parent trace, wedge position, hypothesis lineage). Do NOT re-derive the hypothesis — keep it from the stub.

**Anti-patterns:**
- `brief-without-real-user` — hypothesis that doesn't name who benefits and why
- `vanity-metric` — primary metric that doesn't measure user value (pageviews, signups without activation)
- `solution-shaped-problem` — brief that describes the feature instead of the problem
- `skipped-researcher` — brief drafted without any cited evidence (violates Principle #15)
