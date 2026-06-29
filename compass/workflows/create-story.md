---
name: create-story
status: active
owner: pm
auto_invokes: []
invoked_by: [manual]
version: 0.3.57
requires_approved: [docs/bets/<bet-id>/brief.md]
---

# Workflow: /create-story

## Framework grounding

- **Strategy / discovery:** [lean-mvp] (smallest valuable slices) · [shape-up] (shaped slices)
- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [cite-or-mark-na] (Standard Experience Checklist 6-category)
- **Verifies adherence to:** Principle #14 · Principle #15 (Standard Experience Checklist cite-or-n/a) · Principle #16

## Purpose

PM decomposes an approved bet into its **full set** of shippable stories in one pass — the complete backlog, sequenced by dependency/priority, so the bet's plan is visible end-to-end. **A UI slice becomes a trio (#171): a `design` story + a `copy` story (both `owner: human`) + the `feature` story that depends on them.** Designer + UX Writer **spec the requirements into** the design/copy stories — they do NOT produce the Figma or the final copy (humans do); there are no `design.md`/`copy.md` sidecars. (Changed v0.3.57; see migration note.) Feature stories **build independently** via `/build <story-id>` (#172 scopes a build to one story — a bet's stories can develop in parallel on their own branches), but a UI feature stays blocked until its design + copy stories are human-delivered (`status: ready`).

## Architectural shape (v0.3.42)

Thin dispatch graph per `[workflow-as-dispatch-graph]` (canon v0.3.24). Methodology lives in `compass/agents/pm.md` → Task `decompose-bet-to-story` (rewritten from a workflow-pointing stub to a self-sufficient gate/work/postcondition in v0.3.42) and `compass/templates/story.md` (story structure + the load-bearing Standard Experience Checklist). The agent task + template are the single source of truth.

## Preconditions (workflow-level GATE)

- **Brief approved** — `docs/bets/<bet-id>/brief.md` with an approved HITL record or `status: approved` (machine-checked via `requires_approved:`; orchestrator halts exit 3 if unmet). **On failure:** *"Brief not approved. Run `/create-brief <bet-id>` first."*
- **Bet architecture (conditional)** — if the brief's `architecture_required: true`, `docs/bets/<bet-id>/architecture.md` must be `status: approved`. This is conditional on a brief field, so it is enforced in the PM task's gate (not machine-checkable via the unconditional `requires_approved:` list). **On failure:** *"Architecture required by this brief but not approved. Run `/create-bet-architecture <bet-id>` first."*
- **Full-backlog decomposition** — once the bet (and architecture, if required) is approved, decompose the **whole story set** at once. No "prior story must ship first" gate (removed v0.3.56). Re-running on the same bet adds any newly-discovered slices without duplicating existing ones.

## Roles invoked (agents dispatched)

- `compass/agents/pm.md` — Task `decompose-bet-to-story` (enumerates the full slice set; for a UI slice drafts the design + copy + feature trio; owns the Standard Experience Checklist gate)
- `compass/agents/designer.md` — Task `draft-design-spec` (per UI slice — specs design **requirements** INTO the `design` story; human produces the Figma)
- `compass/agents/ux-writer.md` — Task `write-copy` (per UI slice — specs the **copy-slot inventory** INTO the `copy` story; human writes the strings)
- `compass/agents/delivery-manager.md` — Task `update-status`

## Dispatch graph

### Step 1. `pm.decompose-bet-to-story` (PM agent owns)

**Dispatches:** PM agent
**Task definition:** `compass/agents/pm.md` → Task `decompose-bet-to-story`
**Input:** `docs/bets/<bet-id>/brief.md` · bet architecture (if any) · any stories already under the bet · `compass/templates/story.md`
**What it covers:** confirm gate (brief approved; arch approved if required) → **enumerate the full set of shippable slices** (each smallest valuable · independent · sequenced by dependency/priority) → generate a story ID per slice → **for each UI slice, create the design + copy + feature trio** (design + copy = `owner: human`, `status: needs-design`/`needs-copy`; the feature story's `dependencies:` name them, `status: needs-design` until they're delivered); non-UI slice → a single feature story (`type: story`, `status: ready`) → draft each `docs/bets/<bet-id>/stories/<story-id>/story.md` per the template with the **Standard Experience Checklist** (6 categories, each AC-covered or `n/a — <reason>`) → mirror each to tracker.
**Output:** the bet's full backlog — a feature `story.md` per slice (UI slices also get a `design` + `copy` story), each with the correct `type`/`owner`/`status`

### Step 2. `designer.draft-design-spec` (Designer agent owns) — per UI slice (into the `design` story)

**Dispatches:** Designer agent (once per UI slice; skip non-UI slices)
**Task definition:** `compass/agents/designer.md` → Task `draft-design-spec`
**What it covers:** writes the design **requirements** INTO the slice's `design` story (`type: design`) — all flows (entry → steps → success + failure) · every screen's default/empty/loading/error/success states · design-system components by name · interactions · accessibility · copy placeholders for the copy story · the Standard Experience Checklist. Leaves `## Design deliverable (human)` as a `<TBD>` Figma placeholder and `status: needs-design` — a **human designer** produces the Figma. Runs in parallel with Step 3. **No `design.md` sidecar.**
**Output:** the `design` story's `story.md` carries full design requirements + an unfilled `## Design deliverable (human)` section

### Step 3. `ux-writer.write-copy` (UX Writer agent owns) — per UI slice (into the `copy` story)

**Dispatches:** UX Writer agent (once per UI slice; skip non-UI slices)
**Task definition:** `compass/agents/ux-writer.md` → Task `write-copy`
**What it covers:** writes the **copy-slot inventory** INTO the slice's `copy` story (`type: copy`) — every slot (labels · buttons · errors that must be typed: network/validation/server/permissions/unknown · empty states needing why + next-action · helper text · notifications · confirmations) with its context/constraint, leaving each **Final copy (human)** cell `<TBD>` for a **human writer**. Keeps `status: needs-copy`. Runs in parallel with Step 2. **No `copy.md` sidecar.**
**Output:** the `copy` story's `story.md` carries the full copy-slot inventory in `## Copy deliverable (human)` with strings left `<TBD>`

### Step 4. **HITL gate** (human — only when `hitl_level: every_phase`)

**Dispatches:** HUMAN (not an agent)
**Artifact target:** docs/bets/<bet-id>/stories/<story-id>/story.md
**What it covers:** under `every_phase`, human reviews the **backlog** (each story's AC complete; Standard Experience Checklist has no empty category; each UI slice has its design + copy + feature trio with the feature's `dependencies:` wired; slice sequencing/dependencies sane). Approve → **feature** stories promote to `status: ready` (frontmatter flip / `--approve` CLI; single-artifact promotion targets the path above — **batch-promoting the set is a known follow-up**, see migration note). **Design + copy stories stay `needs-design`/`needs-copy`** — a human designer/writer delivers the Figma/strings and flips them to `ready`, which unblocks the dependent feature. Under lighter `hitl_level`, feature stories auto-advance once the checklist gate passes. **Per Principle #16:** PM must NOT self-approve when the gate applies.

### Step 5. `delivery-manager.update-status` (Delivery Manager agent owns)

**Dispatches:** Delivery Manager agent
**Task definition:** `compass/agents/delivery-manager.md` → Task `update-status`
**What it covers:** record the new stories (the bet's backlog) in `docs/status.md`; surface next recommended command (`/build <feature-story-id>` for the first slice by dependency order — note that a UI feature is blocked until its design + copy stories are human-delivered).

## Workflow-level verification (final GATE)

- [ ] (Step 1) **every slice** has its story(ies); frontmatter id · bet · **type** (`story`/`design`/`copy`) · **owner** (`agent`/`human`) · status
- [ ] (Step 1) **each UI slice has the design + copy + feature trio** — the feature story's `dependencies:` name its design + copy story ids; design/copy carry `owner: human`
- [ ] (Step 1) Acceptance criteria present in each feature story
- [ ] (Step 1) **Standard Experience Checklist: no empty category** in each story — each of the 6 (Navigation · States · Feedback · Accessibility · Edge cases · Cross-surface consistency) covered by ≥1 AC OR `n/a — <reason>` (Principle #15; empty category blocks `status: ready`)
- [ ] (Step 2) each `design` story carries full design **requirements** + an unfilled `## Design deliverable (human)` (`<TBD>` Figma), `status: needs-design` — **no `design.md` sidecar**
- [ ] (Step 3) each `copy` story carries the **copy-slot inventory** in `## Copy deliverable (human)` with strings `<TBD>`, `status: needs-copy` — **no `copy.md` sidecar**
- [ ] (Step 1) ≥1 DRI Decision · each story mirrored or skip-logged · sibling dependencies/ordering noted
- [ ] No duplicate slices (re-run adds only newly-discovered stories)
- [ ] Principle #16: not self-approved when `every_phase` gate applies

## Output summary contract

**TL;DR** (3 lines) · **Files created** (a `story.md` per story — feature, plus a `design` + `copy` story for each UI slice) · **Next recommended command** (`/build <feature-story-id>`) · **Open questions/risks** (incl. which UI features are blocked awaiting human design/copy delivery).

## Notes

**Anti-patterns:** a story that reaches `ready` with an empty Standard Experience Checklist category (the aura-app missing-back-button class of failure) · **AI filling a design/copy deliverable** (fabricating a Figma link, or writing the `Final copy (human)` strings — those are human WORK; AI specs the requirements only, #171) · **a `design.md`/`copy.md` sidecar** instead of a tracked design/copy story · a UI feature story missing `dependencies:` on its design + copy stories · skipping Designer/UX Writer on a UI slice · duplicating a slice already drafted under the bet · drafting overlapping slices with no dependency ordering (sets up sibling merge conflicts at build — note ordering instead).

**Edge cases:** non-UI slice → Steps 2-3 skipped, single feature story straight to `ready` · `hitl_level` lighter than `every_phase` → Step 4 auto-advances feature stories (design/copy still wait on human delivery) · re-run on a bet that already has stories → add only newly-discovered slices, don't duplicate · feature stories **build independently** via `/build <story-id>` (#172), but a UI feature is blocked until its design + copy stories are human-delivered (`status: ready`); sibling stories touching the same files still merge serially.

### Migration (v0.3.56 → v0.3.57) — design & copy become human-owned stories, not sidecar files

- **What changed:** a UI slice now decomposes into a **trio** — a `design` story + a `copy` story (both `owner: human`) + the `feature` story that `depends_on` them — instead of a single story with `design.md` + `copy.md` sidecars. Designer/UX Writer now **spec the requirements INTO** the design/copy stories (design: flows·screens·states·a11y + the Standard Experience Checklist; copy: the slot inventory + constraints); a **human** produces the Figma / writes the strings into the story's `## … deliverable (human)` section and flips `needs-design`/`needs-copy` → `ready`.
- **Why (DRI):** if it's work, it belongs on the board — a tracked story (→ Jira ticket → WBS → conformance → audit), not a loose file the control tower can't see. And AI can't yet produce enterprise design/copy: it decomposes + specs; humans deliver.
- **What did NOT change:** the Standard Experience Checklist gate; the connector still routes every `story.md` to ticketing (design/copy/feature all become tickets, no connector change). Feature stories build via `/build` (now story-scoped, #172).
- **Forward-only:** in-flight bets decomposed under v0.3.56 used the sidecar model; re-running `/create-story` after this lands produces the trio shape. The rejected alternative ("AI generates the design/copy") stays rejected — humans own those deliverables.

### Migration (v0.3.42 → v0.3.56) — one-story-at-a-time → full-backlog decomposition

- **What changed:** `/create-story` now decomposes an approved bet into its **complete story set** in one pass, instead of one slice per run gated on "the prior story must have shipped." The "one at a time / no upfront backlog" gate is removed (DRI decision — the full backlog is wanted up front for end-to-end planning + delivery transparency).
- **What did NOT change:** `/build` still builds **one story at a time** (each `/build` run = one story → PR → review → merge). Full-backlog *planning* ≠ parallel *building*. Sibling stories that touch the same files still merge serially — building them concurrently re-introduces the sibling merge-conflict class (the durable merge-coherence fix is still pending), so the PM notes dependency ordering between slices.
- **Reverses:** the shape-up "one shaped piece at a time / no upfront backlog" stance for stories. (Bets remain one-at-a-time via `/create-brief`; `create-bet-portfolio` already batches bets at bootstrap.)

### Migration (pre-v0.3.42 → v0.3.42)

- **Before:** fat 10-step process workflow; `compass/agents/pm.md` → `decompose-bet-to-story` was a 2-line stub pointing BACK at this workflow (inverse of the `embedded-methodology` anti-pattern — the agent task delegated to the workflow, breaking orchestrator dispatch since the agent only gets its own file as system prompt).
- **v0.3.42:** thin dispatch graph (6th workflow in dispatch-graph shape). Methodology moved INTO `pm.md`'s `decompose-bet-to-story` task (now a full gate/work/postcondition) + `compass/templates/story.md` (story structure + Standard Experience Checklist). To fit a self-sufficient task, `chatgpt` was dropped from pm.md's `preferred_hosts` (lifting the 8000-char cap) — resolving the pm half of `[host-preference-validation]` (consumer-signal evidence + the cap blocking orchestration = 2 independent drivers). No methodology dropped; agent task + template are the single source of truth.
