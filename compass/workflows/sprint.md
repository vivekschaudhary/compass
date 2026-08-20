<!-- SPRINT — the phase that repeats. Unlike the three before it, its rows are PART AUTHORED and
     PART DERIVED: the ceremonies are the same every sprint and are written below; the work rows are
     generated from the sprint plan when the sprint opens.

     Same execution model, same ticket mapping. Only the row generator differs, which is what stops
     implementation being a separate engine. -->
---
name: sprint
title: Sprint
owner: delivery-manager
scope: delivery
trigger: delivery-manager opens the sprint
creates: the ceremony rows below, plus one row per story the sprint plan commits to
status: active
version: 1.0.0

# ── ENTRY GATE ────────────────────────────────────────────────────────────
requires:
  - 03-delivery/plan@docs == published          # else → /sprint-0

# ── PRODUCES ──────────────────────────────────────────────────────────────
produces:
  - 05-cadence/sprint-plans@docs: published
  - 05-cadence/sprint-reviews@docs: published
  - 05-cadence/retros@docs: published
---

## Purpose

Run one sprint: commit to work, do it, show it, and amend the plan for the next one.

## Dispatch graph

### Ceremony rows — authored, the same every sprint

| # | task | dispatch | owner | reads | produces | depends-on |
|---|------|----------|-------|-------|----------|------------|
| 1 | Sprint planning | `agent: product-manager.sprint-planning` | product-manager | `03-delivery/plan` · `02-scope/deliverables` | `05-cadence/sprint-plans` | — |
| 2 | Sprint review | `agent: delivery-manager.sprint-review` | delivery-manager | `05-cadence/sprint-plans` | `05-cadence/sprint-reviews` | 1 |
| 3 | Retro | `agent: delivery-manager.sprint-retro` | delivery-manager | `05-cadence/sprint-reviews` | `05-cadence/retros` | 2 |

### Work rows — derived when the sprint opens

One row per story the sprint plan commits to, owned by the role the story names. A work row's
`produces` is a PR rather than a document, and its reviewers are code and security review — a
declaration, not a different process.

**Row 1 re-reads the delivery plan rather than using it as authored in sprint 0**, because sprint 1
changes what sprint 2 should contain. The plan is a living document amended between sprints, which
is why planning is a ceremony row and not a one-time setup step.

## Gates

### 1. Sprint planning

    check:    this sprint's plan is published
    judgment: every committed story is on the board and assigned
    judgment: work taken on that was not in the plan is recorded as unplanned

**Unplanned work is first-class.** Real sprints absorb work nobody planned, and it eats the capacity
the projection assumed. A row that cannot be added mid-sprint is a row people route around, and a
tower people route around stops being ground truth in week one.

### 2. Sprint review

    check:    the review is published
    judgment: every story that did not land says why

### 3. Retro

    check:    the retro is published
    judgment: actions have a named owner, or are recorded as not taken

## Notes

The ceremony IS the gate. Sprint planning accepts the plan, the review accepts the work, the retro
accepts the amendments — the meetings a delivery team already runs, rather than an approval screen
someone must remember to open.
