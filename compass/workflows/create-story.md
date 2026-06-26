---
name: create-story
status: active
owner: pm
auto_invokes: []
invoked_by: [manual]
version: 0.3.56
requires_approved: [docs/bets/<bet-id>/brief.md]
---

# Workflow: /create-story

## Framework grounding

- **Strategy / discovery:** [lean-mvp] (smallest valuable slices) · [shape-up] (shaped slices)
- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [cite-or-mark-na] (Standard Experience Checklist 6-category)
- **Verifies adherence to:** Principle #14 · Principle #15 (Standard Experience Checklist cite-or-n/a) · Principle #16

## Purpose

PM decomposes an approved bet into its **full set** of shippable stories in one pass — the complete backlog, sequenced by dependency/priority, so the bet's plan is visible end-to-end. Designer + UX Writer engage per UI story. (Changed v0.3.56 — was one-story-at-a-time; see migration note.) **Stories are still built one at a time via `/build`** — full-backlog *planning*, serial *building* (sibling stories that touch the same files still merge serially).

## Architectural shape (v0.3.42)

Thin dispatch graph per `[workflow-as-dispatch-graph]` (canon v0.3.24). Methodology lives in `compass/agents/pm.md` → Task `decompose-bet-to-story` (rewritten from a workflow-pointing stub to a self-sufficient gate/work/postcondition in v0.3.42) and `compass/templates/story.md` (story structure + the load-bearing Standard Experience Checklist). The agent task + template are the single source of truth.

## Preconditions (workflow-level GATE)

- **Brief approved** — `docs/bets/<bet-id>/brief.md` with an approved HITL record or `status: approved` (machine-checked via `requires_approved:`; orchestrator halts exit 3 if unmet). **On failure:** *"Brief not approved. Run `/create-brief <bet-id>` first."*
- **Bet architecture (conditional)** — if the brief's `architecture_required: true`, `docs/bets/<bet-id>/architecture.md` must be `status: approved`. This is conditional on a brief field, so it is enforced in the PM task's gate (not machine-checkable via the unconditional `requires_approved:` list). **On failure:** *"Architecture required by this brief but not approved. Run `/create-bet-architecture <bet-id>` first."*
- **Full-backlog decomposition** — once the bet (and architecture, if required) is approved, decompose the **whole story set** at once. No "prior story must ship first" gate (removed v0.3.56). Re-running on the same bet adds any newly-discovered slices without duplicating existing ones.

## Roles invoked (agents dispatched)

- `compass/agents/pm.md` — Task `decompose-bet-to-story` (enumerates the full slice set, drafts a story.md per slice, owns the Standard Experience Checklist gate)
- `compass/agents/designer.md` — Task `draft-design-spec` (per UI story in the set)
- `compass/agents/ux-writer.md` — Task `write-copy` (per UI story in the set; consumes the design spec's copy placeholders)
- `compass/agents/delivery-manager.md` — Task `update-status`

## Dispatch graph

### Step 1. `pm.decompose-bet-to-story` (PM agent owns)

**Dispatches:** PM agent
**Task definition:** `compass/agents/pm.md` → Task `decompose-bet-to-story`
**Input:** `docs/bets/<bet-id>/brief.md` · bet architecture (if any) · any stories already under the bet · `compass/templates/story.md`
**What it covers:** confirm gate (brief approved; arch approved if required) → **enumerate the full set of shippable slices** (each smallest valuable · independent · sequenced by dependency/priority) → generate a story ID per slice → flag each UI slice for the Designer + UX Writer steps → draft `docs/bets/<bet-id>/stories/<story-id>/story.md` **for each slice** per the template with the **Standard Experience Checklist** (6 categories, each AC-covered or `n/a — <reason>`) → mirror each to tracker.
**Output:** a `story.md` per slice — the bet's full backlog — each `status: ready` (or `needs-design` if a UI design isn't drafted yet)

### Step 2. `designer.draft-design-spec` (Designer agent owns) — per UI story in the set

**Dispatches:** Designer agent (once per story with a UI surface; skip non-UI stories)
**Task definition:** `compass/agents/designer.md` → Task `draft-design-spec`
**What it covers:** all flows (entry → steps → success + failure) · every screen's default/empty/loading/error/success states · design-system components by name · interactions · accessibility · copy placeholders for UX Writer · Figma links. Runs in parallel with Step 3.
**Output:** `docs/bets/<bet-id>/stories/<story-id>/design.md`

### Step 3. `ux-writer.write-copy` (UX Writer agent owns) — per UI story in the set

**Dispatches:** UX Writer agent (once per story with a UI surface; skip non-UI stories)
**Task definition:** `compass/agents/ux-writer.md` → Task `write-copy`
**What it covers:** fill every copy placeholder from the design spec — labels · buttons · errors (typed: network/validation/server/permissions/unknown) · empty states · helper text · notifications · confirmations. Coordinates with Designer on character limits. Runs in parallel with Step 2.
**Output:** `docs/bets/<bet-id>/stories/<story-id>/copy.md`

### Step 4. **HITL gate** (human — only when `hitl_level: every_phase`)

**Dispatches:** HUMAN (not an agent)
**Artifact target:** docs/bets/<bet-id>/stories/<story-id>/story.md
**What it covers:** under `every_phase`, human reviews the **backlog** (each story's AC complete; Standard Experience Checklist has no empty category; design + copy present for UI stories; slice sequencing/dependencies sane). Approve → stories promote to `status: ready` (frontmatter flip / `--approve` CLI; the orchestrator's single-artifact promotion targets the path above — **batch-promoting the whole set on one approval is a known follow-up**, see migration note). Under lighter `hitl_level`, stories auto-advance to `ready` once the checklist gate passes — no human stop. **Per Principle #16:** PM must NOT self-approve when the gate applies.

### Step 5. `delivery-manager.update-status` (Delivery Manager agent owns)

**Dispatches:** Delivery Manager agent
**Task definition:** `compass/agents/delivery-manager.md` → Task `update-status`
**What it covers:** record the new stories (the bet's backlog) in `docs/status.md`; surface next recommended command (`/build <story-id>` for the first slice by dependency order).

## Workflow-level verification (final GATE)

- [ ] (Step 1) **every slice** has a `docs/bets/<bet-id>/stories/<story-id>/story.md`; frontmatter id · bet · type · status
- [ ] (Step 1) Acceptance criteria present in each story
- [ ] (Step 1) **Standard Experience Checklist: no empty category** in each story — each of the 6 (Navigation · States · Feedback · Accessibility · Edge cases · Cross-surface consistency) covered by ≥1 AC OR `n/a — <reason>` (Principle #15; empty category blocks `status: ready`)
- [ ] (Steps 2-3) For each UI story: `design.md` + `copy.md` exist alongside it; story links the design
- [ ] (Step 1) ≥1 DRI Decision · each story mirrored or skip-logged · sibling dependencies/ordering noted
- [ ] No duplicate slices (re-run adds only newly-discovered stories)
- [ ] Principle #16: not self-approved when `every_phase` gate applies

## Output summary contract

**TL;DR** (3 lines) · **Files created** (story.md, +design.md/copy.md if UI) · **Next recommended command** (`/build <story-id>`) · **Open questions/risks**.

## Notes

**Anti-patterns:** a story that reaches `ready` with an empty Standard Experience Checklist category (the aura-app missing-back-button class of failure) · paraphrasing UX Writer copy · skipping Designer/UX Writer on a UI story · duplicating a slice already drafted under the bet · drafting overlapping slices with no dependency ordering (sets up sibling merge conflicts at build — note ordering instead). *(Removed v0.3.56: "decomposing the whole backlog upfront" — that's now the intended behavior.)*

**Edge cases:** non-UI stories → Steps 2-3 skipped for those (straight to `ready`) · `hitl_level` lighter than `every_phase` → Step 4 auto-advances · re-run on a bet that already has stories → add only newly-discovered slices, don't duplicate · the backlog is planned all at once, but **built one story at a time** via `/build` (sibling stories touching the same files merge serially).

### Migration (v0.3.42 → v0.3.56) — one-story-at-a-time → full-backlog decomposition

- **What changed:** `/create-story` now decomposes an approved bet into its **complete story set** in one pass, instead of one slice per run gated on "the prior story must have shipped." The "one at a time / no upfront backlog" gate is removed (DRI decision — the full backlog is wanted up front for end-to-end planning + delivery transparency).
- **What did NOT change:** `/build` still builds **one story at a time** (each `/build` run = one story → PR → review → merge). Full-backlog *planning* ≠ parallel *building*. Sibling stories that touch the same files still merge serially — building them concurrently re-introduces the sibling merge-conflict class (the durable merge-coherence fix is still pending), so the PM notes dependency ordering between slices.
- **Reverses:** the shape-up "one shaped piece at a time / no upfront backlog" stance for stories. (Bets remain one-at-a-time via `/create-brief`; `create-bet-portfolio` already batches bets at bootstrap.)

### Migration (pre-v0.3.42 → v0.3.42)

- **Before:** fat 10-step process workflow; `compass/agents/pm.md` → `decompose-bet-to-story` was a 2-line stub pointing BACK at this workflow (inverse of the `embedded-methodology` anti-pattern — the agent task delegated to the workflow, breaking orchestrator dispatch since the agent only gets its own file as system prompt).
- **v0.3.42:** thin dispatch graph (6th workflow in dispatch-graph shape). Methodology moved INTO `pm.md`'s `decompose-bet-to-story` task (now a full gate/work/postcondition) + `compass/templates/story.md` (story structure + Standard Experience Checklist). To fit a self-sufficient task, `chatgpt` was dropped from pm.md's `preferred_hosts` (lifting the 8000-char cap) — resolving the pm half of `[host-preference-validation]` (consumer-signal evidence + the cap blocking orchestration = 2 independent drivers). No methodology dropped; agent task + template are the single source of truth.
