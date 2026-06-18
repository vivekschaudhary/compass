---
id: <STORY-ID>          # e.g., PROJ-43 (sub-ticket of bet)
bet: <BET-ID>           # parent bet
type: story
status: ready           # needs-design | ready | in-build | in-review | merged | shipped | deploy-failed | re-opened
priority: P1
created: YYYY-MM-DD
author: PM
design_link: <Figma URL or docs/bets/<bet-id>/stories/<story-id>/design.md>
area_tags: []
dependencies:
  - <other story id>
---

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
