---
id: <STORY-ID>          # e.g., PROJ-43 (sub-ticket of bet)
bet: <BET-ID>           # parent bet
type: story             # story (AI-built feature) | design (human Figma) | copy (human strings) — #171
owner: agent            # agent (AI builds it) | human (design/copy stories — a person produces the deliverable)
status: ready           # needs-design | needs-copy | ready | in-build | in-review | merged | shipped | deploy-failed | re-opened
priority: P1
created: YYYY-MM-DD
author: PM
design_link: <Figma URL, or the design story id (e.g. <bet-id>-2) this feature depends on>
area_tags: []
dependencies:           # feature story: list its design + copy story ids — blocks build until they're human-delivered (status: ready)
  - <other story id>
---

<!--
TYPE & OWNER (#171): design and copy are WORK → tracked stories, not sidecar files
the control tower can't see. AI can't produce enterprise design (Figma) or final
copy yet, so it DECOMPOSES + SPECS the requirements; a human produces the deliverable.

- type: story   → owner: agent  → the engineer builds it; may depend on a design + copy story.
- type: design  → owner: human  → AI fills the requirements (flows · screens · every
                                   state · a11y · the Standard Experience Checklist below);
                                   a human designer pastes the Figma into "Design deliverable (human)".
                                   status: needs-design until delivered, then → ready.
- type: copy    → owner: human  → AI fills the copy-slot inventory (labels · buttons ·
                                   typed errors · empty states · helper · notifications);
                                   a human writes the strings into "Copy deliverable (human)".
                                   status: needs-copy until delivered, then → ready.

A feature story's `dependencies:` list its design + copy story ids; the engineer
refuses to build until those are human-delivered (status: ready). Keep ONLY the
deliverable section that matches this story's type (delete the other one + this note).
-->

# <Story Title>

## Description

<One paragraph: what this story delivers, from the user's perspective.>

## Acceptance Criteria

- [ ] AC 1: <specific, testable>
- [ ] AC 2:
- [ ] AC 3:

## Standard Experience Checklist

PM fills this when writing the story. Each category is either covered by **≥1 AC item above** OR explicitly marked **`n/a — <reason>`**. Empty cells (no AC reference AND no `n/a`) fail the `/create-story` gate. This is the bridge between Designer's "every state per screen" completeness and the Engineer's implementation contract — what the Designer drew but the AC doesn't say will ship missing.

- [ ] **Navigation** — back / exit / cancel / dismiss path defined for every navigable surface: `<covered by AC-N | n/a — reason>`
- [ ] **States** — loading / empty / error / success / disabled each has an AC line: `<list AC numbers | n/a — reason>`
- [ ] **Feedback** — error messages discriminate type (network / validation / server / permissions / unknown); success acknowledgments where action is taken; destructive actions confirm before executing: `<covered by AC-N | n/a — reason>`
- [ ] **Accessibility** — focus management on mount + state change; keyboard navigation (tab order, Enter/Esc); screen reader labels for non-text controls: `<covered by AC-N | n/a — reason>`
- [ ] **Edge cases** — offline behavior, slow network (skeleton vs spinner threshold), permissions-denied, missing-data: `<covered by AC-N | n/a — reason>`
- [ ] **Cross-surface consistency** (if multi-target stack: web + mobile + native) — behavior matches across surfaces or divergence explicitly justified: `<covered by AC-N | n/a — reason>`

## Design deliverable (human)

_`type: design` stories only (delete otherwise). AI fills the **requirements** above — flows · screens · every state · accessibility · the Standard Experience Checklist. A human **designer** produces the artifact and records it here, then flips `status: needs-design → ready` (which unblocks the dependent feature story)._

- **Figma:** `<TBD — paste the Figma frame/file URL>`
- **Designer notes / decisions:** `<deviations from the spec + why; anything the engineer must know>`

## Copy deliverable (human)

_`type: copy` stories only (delete otherwise). AI fills the **copy-slot inventory** above — every label · button · typed error · empty state · helper text · notification · confirmation, with each slot's context/constraint. A human **writer** fills the final strings, then flips `status: needs-copy → ready` (which unblocks the dependent feature story)._

| Slot (where it appears) | Context / constraint | Final copy (human) |
| --- | --- | --- |
| `<slot — AI lists>` | `<e.g. ≤24 chars, sentence case, no jargon>` | `<TBD — human writes>` |

## Tech notes

<Reference bet architecture for the load-bearing decisions. Capture story-specific implementation notes here.>

## PRs

_Auto-populated as PRs open. A story may have multiple PRs (implementation, tests, defect fixes)._

- PR #N — <description> — status

## Tests

_Engineer writes unit/API/component tests co-located with code._
_Automation writes E2E tests in top-level `e2e/`._

**Test-data cleanup (required AC for any data-mutating story):** any E2E that creates or mutates persistent records MUST clean them up after the run — **hard delete, or soft-delete** (mark rows deleted/inactive) when hard delete isn't possible (append-only / audit / RLS-restricted tables). Author it as an explicit AC, e.g. *"AC-N: E2E run leaves no residual test records — created rows are deleted or soft-deleted."* No orphaned test data in shared / prod-like environments. (`[per-surface-vertical-test]` companion; anti-pattern `orphaned-test-data`.)

Tags applied to test files:
- `regression: true|false`
- `e2e: true|false`

## Fixes (post-merge)

_If post-merge bugs are found, story is re-opened and fixes live under `fixes/`._

## DRI Log

### Decisions
- [YYYY-MM-DD] [Engineer | Designer | UX Writer] <decision> — rationale — area — alternatives

### Risks
- [YYYY-MM-DD] [role] <risk> — likelihood — impact — mitigation — area

### Issues
- [YYYY-MM-DD] [role] <issue> — severity — owner — status — area

---

_Story closed: <date>, brief link: docs/bets/<bet-id>/brief.md_
