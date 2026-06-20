---
id: RETRO-021
type: retro
status: archive
altitude: framework
period_start: 2026-06-20
period_end: 2026-06-20
improvement_count: 5
created: 2026-06-20
author: framework-Architect (Claude Opus 4.8)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #021 — framework — improvements #98 to #102

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 + `[fractal-retro]` (canon v0.3.17). **Status: archive.** The first batch driven almost entirely by **one live consumer run** — the home-app `/fix`.

## Source entries in scope

- **#98** — declared front-door `/triage` ITIL intake router (classify → HITL-confirm → route)
- **#99** — write-mode work lands on a branch, never main
- **#100** — tool-loop cap: wrap-up summary instead of abort; cap 25→50; `--max-tool-iterations`; `_slug` stopwords
- **#101** — declared: canary must verify a *testable* preview/staging, not just a green build
- **#102** — declared per-worker worktree isolation (concurrent writers need their own work dirs)

## Common patterns (positive)

| Pattern | Instances | What it means |
|---|---|---|
| **One real run → five improvements** | the home-app `/fix` drove #97 (prev batch) + #99, #100, #101, #102 | The first live write-mode consumer run was the most productive single event in framework history — it produced two shipped fixes (#99, #100) and three declared designs (#98 router from the routing dead-end, #101 testable-preview, #102 worktree isolation). Principle #19 at full force. |
| **Milestone: write-mode `/fix` worked end-to-end** | home-app login-message bug | The engineer agent wrote a regression test + fix, ran pnpm vitest/typecheck/lint/test/build (all green) + manifest check, on its own branch, user-confirmed correct. The capability the whole #87→#100 arc was built for, proven on a real bug. |
| **declared vs built, deliberately split** | #99/#100 built (small, clear); #98/#101/#102 declared (bigger, design-first) | The batch correctly shipped the small robustness fixes and *declared* the larger capabilities (intake router, testable-preview canary, worktree isolation) instead of half-building them. `[declare-not-implement]` holding. |
| **Mechanized audit stays clean** | Retro #021 audit found nothing (2nd straight) | #93's consistency-check + the test suite keep the counts/versions honest at commit time. The retro-time audit is now a confirmation, not a clean-up. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening | Convention-ready? |
|---|---|---|---|
| **My own prior fix over-corrected** | #100 fixed #97: raise-on-cap discarded *completed* work | #100: wrap-up turn instead of abort | A small lesson: a failure-halt (#97) must distinguish "no answer" from "thorough-but-capped." Note it; not yet a named pattern. |
| **Routing/triage decision can't reach its target** | #98 (triage classifies but can't route to fix/brief); home-app runs ×2 | declared the intake router (#98) | Yes — the bug-intake/front-door router is the most-evidenced unbuilt capability. |
| **Discipline assumed an environment that doesn't exist** | #101: `[per-surface-vertical-test]` needs a prod-like env; home-app preview can't do auth | declared canary-verifies-testable-preview | Yes — a discipline must verify its prerequisites exist. |

## Convention candidates

**`[failure-direction-inversion]`** — still codification-ready (#79/#80/#92/#97/#100). #100 adds nuance (a halt must distinguish no-answer from capped-but-complete). Codify next; user-gated.

**`[declared-design-from-live-run]`** — new observation: 3 of this batch's 5 (#98/#101/#102) are designs *declared* from a single consumer run's friction, not from introspection. Possibly the purest expression of `[consumer-as-primary-signal]` (Principle #19) — surface at #022 if it recurs.

**`[conditional-dispatch]`** — 1 built (#96), 1 declared cross-workflow (#98). Codify to canon when #98 builds.

## Drift signals

| Signal | Evidence | Investigation |
|---|---|---|
| **Declared backlog is growing** | #87 (surface 3), #95→#98 (intake router), #101 (testable preview), #102 (worktree isolation) all declared-not-built | Healthy (declare-not-implement working), but watch that declarations get built, not just accrue. Prioritize at #022. |
| **Consumer deploy pipeline is shaky** | home-app: preview can't auth, prod "only deploys to preview" | Consumer `/ops`, not framework — but it blocks real validation. The #101 canary work would catch this class at setup. |
| **Parallelism isolation unbuilt** | #102 — 2 concurrent writers collided | The VISION's parallel portfolio can't ship safely until worktree isolation exists. |

## Full-surface audit

**Method:** `consistency-check.py` (mechanized counts + version self-claims) + task double-ownership across agents + dispatch-graph count + full suite.

| Finding | Verified? | Disposition |
|---|---|---|
| consistency-check | CONSISTENT | clean (2nd straight retro with nothing to fix) |
| task double-ownership | none | clean |
| dispatch-graph count (9) vs AGENTS | match | clean |
| test suite | 107 pass | clean |

## Trigger-origin analysis

- **Consumer run (home-app `/fix`):** 5 of 5 — every item traces to that one live run (#99/#100 shipped fixes; #98/#101/#102 declared designs). The most consumer-concentrated batch ever; the opposite of the zero-consumer batches that worried Retro #016/#017.

## Watch-for list (next 5 improvements, #103–#107)

- **Build the front-door intake router (#98)** — the most-evidenced declared capability; codifies `[conditional-dispatch]` to canon.
- **Worktree isolation (#102)** — unblocks safe parallelism / the cockpit's "many in flight."
- **Codify `[failure-direction-inversion]`** — well past threshold.
- **The delivery/cockpit layer** — on the #97 event spine (VISION step 3).
- **Don't let the declared backlog accrue** — pick declared items to build, not just declare more.

## Meta-observations

**The live run paid for the whole batch.** One real home-app `/fix` produced the milestone (write-mode fix worked end-to-end) *and* five improvements. After three earlier batches that were largely framework-internal, this is Principle #19 vindicated — consumer friction is the richest improvement source by far. The lesson for sequencing: get the tool in front of real work early; the friction list writes itself.

**The framework is now ahead of its build capacity — by design.** Five capabilities are declared-not-built (#87 surface 3, #98, #101, #102, + the cockpit). That's `[declare-not-implement]` working (capture the shape, build on priority), but #022's watch-for is right: start converting declarations to builds.

**17th consecutive on-time retro.**

---

_Archived 2026-06-20. Not edited after this date. Next retro fires after improvement #107._
