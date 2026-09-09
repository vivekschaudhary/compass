<!-- FEATURE-ARCHITECTURE — nested from feature, once the feature is accepted.

     draft -> review -> approve. The author never accepts: an agent drafts in the staff engineer's
     name, so a staff engineer closing this gate would approve its own architecture. The principal
     engineer holds the close, which is foundation-architecture's pairing and tech-design's.

     THIS FILE WAS `/create-epic-architecture` AND IS NOT ANY MORE. It described a bet-level
     artifact at `docs/epics/<epic-id>/architecture.md`, a repo-file `requires_approved` gate, and
     an `approve` row held by the author. None of that ran: the workflow was disabled, ungated, and
     its first task was named `draft-epic-architecture` — one tier off its own workflow. -->
---
name: feature-architecture
title: Feature architecture
owner: staff-engineer
scope: feature
trigger: feature nests it, once the feature is accepted
creates: one task per row below
status: active
version: 2.0.0

requires: []
produces: []
---

## Purpose

Decide **how an accepted feature will be built**, within the foundation architecture — boundaries,
data model, contract shape, dependencies and risks.

## Where it sits

Second of three architecture tiers:

| tier | scope | workflow |
|------|-------|----------|
| foundation architecture | the whole product | `foundation-architecture` |
| **feature architecture** | **one feature** | **this** |
| epic technical design | one epic | `tech-design` |

Below those, `build` implements a story. This workflow decides shape, not implementation: it writes
no code and picks no foundational stack tool. A feature needing something outside the foundation
architecture escalates there rather than widening the stack quietly.

## Dispatch graph

`reads` is DERIVED from `depends-on`, so it is not a column here — printing it would author the same
edge twice.

| # | task | dispatch | owner | produces | depends-on |
|---|------|----------|-------|----------|------------|
| 1 | Feature architecture | `agent: staff-engineer.draft-feature-architecture` | staff-engineer | `03-architecture/features` | — |
| 2 | Review the feature architecture | `agent: reviewer.review-feature-architecture` | reviewer | `03-architecture/features-review` | 1 |
| 3 | Accept the feature architecture | `hitl` | principal-engineer | `—` | 2 |

## Why it is these rows

**One document, not one per feature — and this is settled, not pending.** The tier below it
(`tech-design`) files a page per epic, because an epic is a `backlog_item` row the fan-out can
iterate. A feature is not a row and is not going to be: **a feature is a page.**

That is a decision about what a feature IS, not a gap. Epics are rows because epics become Jira
issues, and a heading cannot be reliably turned into one — the reasoning in migration 047. A feature
never reaches the tracker: the hierarchy is Feature → Epic → Story against Jira's Epic → Story →
Sub-task, so there is no issue for it to become, and the argument that forced 047 does not apply.
Migration 059 dropped the `feature` tables that were built on the assumption it did.

So a per-feature fan-out is not deferred, it is off. Re-opening it would mean deciding a feature is
a row after all, and that is a bigger change than adding a `{feature}` path.

**The author does not accept it.** It used to: row 2 was `hitl` held by the same `staff-engineer`
who drafted row 1. A reviewer judges it against the foundation architecture rather than against
preference, and the principal engineer accepts.

**Departures are named.** The foundation architecture is the bar. An option not considered is not a
decision, and a stack widening that nobody wrote down is the one that surfaces at build.
