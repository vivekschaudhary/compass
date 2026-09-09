<!-- SPRINT PLAN — nested from a phase, and runnable on its own.

     research -> approve -> derive -> review -> approve. The author never accepts: an agent drafts in
     a role's name, so a role that also closes the gate has approved its own work. -->
---
name: sprint-plan
title: Sprint plan
owner: product-owner
scope: delivery
trigger: product-owner initiates it, or a phase nests it
creates: one task per row below
status: active
version: 1.0.0

requires: []
produces: []
---

## Purpose

Commit a sprint: what the team takes on, against capacity somebody accepted first.

## Dispatch graph

`reads` is DERIVED from `depends-on`, so it is not a column here — printing it would author the same
edge twice.

| # | task | dispatch | owner | produces | output | depends-on |
|---|------|----------|-------|----------|--------|------------|
| 1 | What the team can take on | `agent: product-owner.research-capacity` | product-owner | `capacity-research` | — | — |
| 2 | Accept the capacity picture | `hitl` | product-manager | `—` | — | 1 |
| 3 | The sprint plan | `agent: product-owner.draft-sprint-plan` | product-owner | `sprint-plans` | sprint | 2 |
| 4 | Review the plan | `agent: reviewer.review-plan` | reviewer | `sprint-plan-review` | — | 3 |
| 5 | Accept the plan | `hitl` | product-manager | `—` | — | 4 |

## Why it is these rows

**ONE DEFINITION, NESTED BY BOTH PHASES.** `sprint-0` ends with sprint 1 planned and every sprint
after plans itself. Those were two rows written twice and held equal by machinery — first a
shared produced path, then a shared `output` when the path proved renameable. Now both nest this,
so they cannot differ.

**`output: sprint` rides on row 3**, the row that drafts. That is what gives it the sprint tool
and the materialiser that puts commitments on the board; a plan filed as prose commits nothing.

**Capacity is accepted before the plan is written.** Row 2 is a gate rather than a formality — a
plan drafted against capacity nobody agreed is a plan that gets renegotiated in the review.
