<!-- WORKED EXAMPLE — the live `compass/workflows/build.md` (v0.3.40, ~275 lines of prose)
     re-cut into the workflow.md template. Illustrative only; not the active workflow file.
     Compare the two to see what the template removes (methodology → agent files) and what it
     structures (gate → predicates, dispatch graph → table). ~35 lines, same behavior. -->

---

name: build
owner: engineer
scope: story
trigger: "/build <story-id>"
status: active
version: 0.4.0

requires: # entry gate = predicates (was: prose Preconditions + requires_approved file paths)

- epic.research_status == approved # else → /create-brief
- epic.arch_status == approved # else → /create-bet-architecture
- story.ready == true # else → /create-story
- story.tech_ready == true # else → /tech-design
  produces:
- pr@scm: merged
- story@tickets: done

---

## Purpose

Engineer implements ONE tech-ready story end-to-end; a separate reviewer agent with no implementation history checks it; a human approves the merge.

## Dispatch graph

| #   | role.task                            | host   | reads                                                                        | writes                             | gate                            |
| --- | ------------------------------------ | ------ | ---------------------------------------------------------------------------- | ---------------------------------- | ------------------------------- |
| 1   | engineer.implement-story             | claude | story.acceptance@db · tech-note@docs · bet-arch@docs · code@file | code@file→scm · pr@scm       | pr.opened && ci.green && runtime-artifact.verified           |
| 2   | reviewer.review-pr                   | codex  | pr@scm                                                                    | findings@scm                    | verdict.posted && blockers == 0 |
| 2s  | security-reviewer.review-pr-security | codex  | ⟨auth/PII/secrets⟩ pr@scm                                                 | findings@scm                    | criticals == 0                  |
| 3   | engineer.respond-to-review           | claude | findings@scm                                                              | fixes@file→scm                  | blockers == 0                   |
| 4   | pm.arbitrate-dispute                 | claude | ⟨if raised⟩ dispute@scm                                                   | resolution@scm                  | resolved                        |
| 5   | human.approve-merge                  | —      | pr@scm · findings@scm                                                  | approval@tickets                      | ci.green && blockers == 0 && criticals == 0 && disputes == 0 && verdict != request-changes && approval == approved |
| 6   | tech-writer.accumulate-changelog     | claude | pr@scm                                                                    | changelog@docs · status@tickets | status in {merged, shipped}     |

> The `gate` column above = each task's **postcondition** (done ∧ good). Task-internal **preconditions** — freshness, wait-for-CI — are load-bearing too, but live in the agent task file as a structured `gates.pre:`, NOT here. E.g. `reviewer.review-pr.pre = ci.green && (today − last_verified) <= freshness_window`. The workflow inherits them; see `compass/agents/<role>.md#<task>`.

## Grounding & methodology

Canon: [role-boundary] · [mechanical-output-verification] · [freshness-check] · [refuse-escalate] · cross-host independence (engineer ≠ reviewer model).
The _how_ lives in the agent files — never here:
engineer → compass/agents/engineer.md#implement-story,#respond-to-review · reviewer → compass/agents/reviewer.md#review-pr · security-reviewer → #review-pr-security · pm → compass/agents/pm.md#arbitrate-dispute · tech-writer → compass/agents/tech-writer.md#accumulate-changelog

## Notes

- Story → multiple PRs: each PR runs the full graph (steps 1–6). No shortcuts.
- Post-merge bug: reopen the story; do NOT create a separate fix story.
- Scanner at phase boundaries: /scan <bet-id> on Build → Production-Ready (all stories shipped).

<!-- ── WHAT MOVED, vs the live 275-line build.md ──────────────────────────────
  Preconditions (prose bullets)          → requires:  (4 predicates)
  requires_approved: [file paths]        → requires:  (DB predicates — the file→DB shift)
  per-step "What it covers" (¶ each)     → the agent task files (it was duplicating them)
  Roles invoked (list)                   → read off the table's role.task column
  Verification checklist (13 items)      → each step's `gate` + the agent postconditions
  Output contract / DRI / Discipline /   → canon + agent files (cross-cutting conventions,
    Anti-patterns / Migration notes         not per-workflow)
  COMPASS_ROLE_BOUNDARY html markers     → the role.task column already attributes each step
  Everything DERIVES from this file: read/write map (reads/writes × @system) · gates
  (requires + step gates) · role-task board (steps) · dashboard (produces + gates).
───────────────────────────────────────────────────────────────────────────── -->
