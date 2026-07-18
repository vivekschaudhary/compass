<!-- WORKED EXAMPLE #2 (the stress test) — the live `compass/workflows/fix.md` (v0.3.55) re-cut
     into workflow.md. A REACTIVE workflow: no approval gate, regression-test-first, orchestrator-owned
     Jira projection. Illustrative only; not the active workflow file. See the stress-test notes at the end. -->
---
name: fix
owner: engineer
scope: ticket
trigger: "/fix <ticket | free-text>"
status: active
version: 0.4.0

requires:                                    # REACTIVE — no approval gate; just a trigger
  - trigger.present == true                  # /fix <ticket> | <free-text> | triage route
  - ⟨jira-key mode⟩ tickets.configured == true  # else → refuse (external source_of_truth needs Jira)
produces:
  - pr@scm: merged
  - fix-record@tickets: bug | story             # orchestrator-projected at run completion (#71): defect→Bug, enhancement→Story
  - ticket@tickets: done
---

## Purpose
One tool-capable engineer reproduces, diagnoses, and fixes a defect from the code; the regression test lands before the fix; a different-model reviewer always checks it. Full review discipline — no hotfix carve-out.

## Dispatch graph
| # | role.task | host | reads | writes | gate |
|---|-----------|------|-------|--------|------|
| 1 | engineer.triage-and-fix | claude | ticket@tickets · code@file · ⟨bet-linked⟩ brief@docs · bet-arch@docs | regression-test@file→scm · fix@file→scm · triage-summary@scm · pr@scm | reproduced && regression-test.reproduces-symptom && fix.proportional && ci.green |
| 2 | automation.write-e2e-tests | claude | ⟨user-flow regression⟩ code@file | tests@file→scm | tests.pass ⟨else skip logged⟩ |
| 3 | reviewer.review-pr | codex | pr@scm | findings@scm | verdict.posted && blockers == 0 |
| 3s | security-reviewer.review-pr-security | codex | ⟨auth/PII/secrets⟩ pr@scm | findings@scm | criticals == 0 |
| 4 | engineer.respond-to-review | claude | findings@scm | fixes@file→scm | blockers == 0 |
| 5 | human.approve-merge | — | pr@scm · triage-summary@scm · findings@scm | approval@tickets | ci.green && blockers == 0 && criticals == 0 && verdict != request-changes && approval == approved |
| 6 | tech-writer.accumulate-changelog | claude | pr@scm | changelog@docs · status@tickets | ⟨user-visible⟩ changelog.updated && reporter.informed |

## Grounding & methodology
Canon: [role-boundary] · [refuse-escalate] · [per-surface-vertical-test] · [mechanical-output-verification] · [ai-collapses-org-tiering] · maker≠checker · no-hotfix-exception.
The *how* lives in the agent files: engineer → compass/agents/engineer.md#triage-and-fix,#respond-to-review · automation → #write-e2e-tests · reviewer → compass/agents/reviewer.md#review-pr · tech-writer → compass/agents/tech-writer.md#accumulate-changelog

## Notes
- **Reactive:** no approved-brief gate; bet-linkage is decided *during* triage (no bet → `hygiene: true`).
- **No hotfix exception:** full review holds at every severity; the fixer never reviews its own diff.
- **Orchestrator-owned writes** (mechanical, not agent steps): opens the PR on green after step 1; projects the fix record → Jira Bug/Story at run completion (#71) — **fails loud** if Jira is configured but nothing was created.
- **Post-merge recurrence:** reopen the fix, don't open a new one.

<!-- ── STRESS-TEST NOTES — what `fix` exercised that `build` didn't, and whether the template held ──
  ✓ NO approval gate        → requires: is just `trigger.present` (+ a conditional tickets.configured). HELD.
  ✓ Reactive / conditional  → ⟨…⟩ prefix on reads + steps. HELD.
  ✓ Regression-test-first   → a write (regression-test@file→scm) whose ORDER-before-fix is a task-internal
                              rule in engineer.triage-and-fix Work; the workflow gate asserts the OUTCOME
                              (regression-test.reproduces-symptom). Right split. HELD.
  ~ Orchestrator mechanical writes (open-PR · project-fix-record) → captured in produces: + Notes.
    CANDIDATE REFINEMENT: a first-class `mechanical:` step type — these aren't role tasks.
  ~ Judgment postconditions (regression-test.reproduces-symptom · fix.proportional) → expressible as
    predicates, but a human/reviewer EVALUATES them (recorded-judgment), unlike mechanical ci.green.
    CANDIDATE REFINEMENT: mark judgment vs mechanical predicates (ties to the two-kinds-of-gate model).
──────────────────────────────────────────────────────────────────────────────────────────────── -->
