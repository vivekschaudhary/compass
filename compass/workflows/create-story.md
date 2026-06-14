---
name: create-story
status: active
owner: pm
auto_invokes: []
invoked_by: [manual]
version: 0.3.42
requires_approved: [docs/bets/<bet-id>/brief.md]
---

# Workflow: /create-story

## Framework grounding

- **Strategy / discovery:** [lean-mvp] (smallest valuable slice) · [shape-up] (one shaped piece at a time)
- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [cite-or-mark-na] (Standard Experience Checklist 6-category)
- **Verifies adherence to:** Principle #14 · Principle #15 (Standard Experience Checklist cite-or-n/a) · Principle #16

## Purpose

PM decomposes an approved bet into **ONE** shippable story at a time. After a story ships, run again for the next slice. Designer + UX Writer engage in parallel if the story has a UI surface.

## Architectural shape (v0.3.42)

Thin dispatch graph per `[workflow-as-dispatch-graph]` (canon v0.3.24). Methodology lives in `compass/agents/pm.md` → Task `decompose-bet-to-story` (rewritten from a workflow-pointing stub to a self-sufficient gate/work/postcondition in v0.3.42) and `compass/templates/story.md` (story structure + the load-bearing Standard Experience Checklist). The agent task + template are the single source of truth.

## Preconditions (workflow-level GATE)

- **Brief approved** — `docs/bets/<bet-id>/brief.md` with an approved HITL record or `status: approved` (machine-checked via `requires_approved:`; orchestrator halts exit 3 if unmet). **On failure:** *"Brief not approved. Run `/create-brief <bet-id>` first."*
- **Bet architecture (conditional)** — if the brief's `architecture_required: true`, `docs/bets/<bet-id>/architecture.md` must be `status: approved`. This is conditional on a brief field, so it is enforced in the PM task's gate (not machine-checkable via the unconditional `requires_approved:` list). **On failure:** *"Architecture required by this brief but not approved. Run `/create-bet-architecture <bet-id>` first."*
- **One at a time** — the prior story under this bet must have shipped (PM task gate). No upfront backlog decomposition.

## Roles invoked (agents dispatched)

- `compass/agents/pm.md` — Task `decompose-bet-to-story` (identifies slice, drafts story.md, owns the Standard Experience Checklist gate)
- `compass/agents/designer.md` — Task `draft-design-spec` (conditional: UI surface only)
- `compass/agents/ux-writer.md` — Task `write-copy` (conditional: UI surface only; consumes the design spec's copy placeholders)
- `compass/agents/delivery-manager.md` — Task `update-status`

## Dispatch graph

### Step 1. `pm.decompose-bet-to-story` (PM agent owns)

**Dispatches:** PM agent
**Task definition:** `compass/agents/pm.md` → Task `decompose-bet-to-story`
**Input:** `docs/bets/<bet-id>/brief.md` · bet architecture (if any) · prior stories under the bet · `compass/templates/story.md`
**What it covers:** confirm gate (brief approved; arch approved if required; prior story shipped — one at a time) → pick the next shippable slice (smallest valuable · independent · adaptive) → generate story ID → if UI surface, flag for the Designer + UX Writer steps → draft `docs/bets/<bet-id>/stories/<story-id>/story.md` per the template with the **Standard Experience Checklist** (6 categories, each AC-covered or `n/a — <reason>`) → mirror to tracker.
**Output:** `story.md` with `status: ready` (or `needs-design` if UI design not yet drafted)

### Step 2. `designer.draft-design-spec` (Designer agent owns) — conditional: UI surface only

**Dispatches:** Designer agent (skip if the story has no UI surface)
**Task definition:** `compass/agents/designer.md` → Task `draft-design-spec`
**What it covers:** all flows (entry → steps → success + failure) · every screen's default/empty/loading/error/success states · design-system components by name · interactions · accessibility · copy placeholders for UX Writer · Figma links. Runs in parallel with Step 3.
**Output:** `docs/bets/<bet-id>/stories/<story-id>/design.md`

### Step 3. `ux-writer.write-copy` (UX Writer agent owns) — conditional: UI surface only

**Dispatches:** UX Writer agent (skip if no UI surface)
**Task definition:** `compass/agents/ux-writer.md` → Task `write-copy`
**What it covers:** fill every copy placeholder from the design spec — labels · buttons · errors (typed: network/validation/server/permissions/unknown) · empty states · helper text · notifications · confirmations. Coordinates with Designer on character limits. Runs in parallel with Step 2.
**Output:** `docs/bets/<bet-id>/stories/<story-id>/copy.md`

### Step 4. **HITL gate** (human — only when `hitl_level: every_phase`)

**Dispatches:** HUMAN (not an agent)
**Artifact target:** `docs/bets/<bet-id>/stories/<story-id>/story.md`
**What it covers:** under `every_phase`, human reviews the story (AC complete; Standard Experience Checklist has no empty category; design + copy present if UI). Approve → promotion to the Artifact target with `status: ready` (orchestrator) or frontmatter flip / `--approve` CLI (interactive). Under lighter `hitl_level`, the story auto-advances to `ready` once the checklist gate passes — no human stop. **Per Principle #16:** PM must NOT self-approve when the gate applies.

### Step 5. `delivery-manager.update-status` (Delivery Manager agent owns)

**Dispatches:** Delivery Manager agent
**Task definition:** `compass/agents/delivery-manager.md` → Task `update-status`
**What it covers:** record the new story in `docs/status.md`; surface next recommended command (`/build <story-id>`).

## Workflow-level verification (final GATE)

- [ ] (Step 1) `docs/bets/<bet-id>/stories/<story-id>/story.md` exists; frontmatter id · bet · type · status
- [ ] (Step 1) Acceptance criteria present
- [ ] (Step 1) **Standard Experience Checklist: no empty category** — each of the 6 (Navigation · States · Feedback · Accessibility · Edge cases · Cross-surface consistency) covered by ≥1 AC OR `n/a — <reason>` (Principle #15; empty category blocks `status: ready`)
- [ ] (Steps 2-3) If UI surface: `design.md` + `copy.md` exist alongside the story; story links the design
- [ ] (Step 1) ≥1 DRI Decision · mirrored or skip-logged
- [ ] One-at-a-time honored — no other story under this bet still in build
- [ ] Principle #16: not self-approved when `every_phase` gate applies

## Output summary contract

**TL;DR** (3 lines) · **Files created** (story.md, +design.md/copy.md if UI) · **Next recommended command** (`/build <story-id>`) · **Open questions/risks**.

## Notes

**Anti-patterns:** decomposing the whole backlog upfront (one story at a time) · a story that reaches `ready` with an empty Standard Experience Checklist category (the aura-app missing-back-button class of failure) · paraphrasing UX Writer copy · skipping Designer/UX Writer on a UI story.

**Edge cases:** no UI surface → Steps 2-3 skipped (story goes straight to `ready`) · `hitl_level` lighter than `every_phase` → Step 4 auto-advances · prior story still in build → refuse (one at a time).

### Migration (pre-v0.3.42 → v0.3.42)

- **Before:** fat 10-step process workflow; `compass/agents/pm.md` → `decompose-bet-to-story` was a 2-line stub pointing BACK at this workflow (inverse of the `embedded-methodology` anti-pattern — the agent task delegated to the workflow, breaking orchestrator dispatch since the agent only gets its own file as system prompt).
- **v0.3.42:** thin dispatch graph (6th workflow in dispatch-graph shape). Methodology moved INTO `pm.md`'s `decompose-bet-to-story` task (now a full gate/work/postcondition) + `compass/templates/story.md` (story structure + Standard Experience Checklist). To fit a self-sufficient task, `chatgpt` was dropped from pm.md's `preferred_hosts` (lifting the 8000-char cap) — resolving the pm half of `[host-preference-validation]` (consumer-signal evidence + the cap blocking orchestration = 2 independent drivers). No methodology dropped; agent task + template are the single source of truth.
