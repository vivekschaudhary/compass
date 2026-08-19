<!-- GROUNDWORK — the foundation an engagement lays before it delivers anything. (Was "Sprint 0".)
     The DM initiates it once basecamp is approved. Every row below becomes ONE TASK in that run.

     Rows here mostly nest a WORKFLOW rather than naming a single agent task, because laying a
     foundation is multi-step work with its own gates. That is a property of these rows, not a rule
     about phases: workflows nest, and a phase may mix tasks and nested workflows freely.

     THIS TABLE IS THE PHASE. Add a row and the engagement gains foundation work; delete one and it
     stops being expected. A practice amends its own groundwork without a release. -->
---
name: groundwork
title: Groundwork
owner: delivery-manager
scope: foundation
trigger: delivery-manager initiates it   # NOT automatic — basecamp being done is permission, not instruction
creates: one task per row below, in dependency order
status: active
version: 1.0.0

# ── ENTRY GATE ────────────────────────────────────────────────────────────
# Basecamp is the permission to start. Without an approved backlog there is nothing to lay
# foundations FOR, and without a roster there is nobody to lay them.
requires:
  - 01-foundation/kickoff-backlog@docs == approved    # else → initiate basecamp
  - 01-foundation/team@docs == approved               # else → initiate basecamp

# ── PRODUCES ──────────────────────────────────────────────────────────────
produces:
  - docs/foundation/product.md@docs: approved
  - docs/foundation/architecture.md@docs: approved
  - docs/epics/portfolio.md@docs: approved
---

## Purpose

Establish what the engagement is building and how it will be built, so that delivery can start from
a shared foundation rather than from each person's reading of the SOW.

Ends when the first epic can be planned. It does not plan epics — that is delivery.

## Dispatch graph

Same row format as basecamp — see that file for the `dispatch` vocabulary. These rows mostly nest a
workflow, because laying a foundation is multi-step work with its own gates, but a row here may be a
single agent task where that is genuinely all it is.

| # | task | dispatch | owner | reads | produces | depends-on |
|---|------|----------|-------|-------|----------|------------|
| 1 | Define the product foundation | `workflow: create-product-brief` | researcher | `02-scope/sow` · `01-foundation/kickoff-backlog` | `docs/foundation/product.md` | — |
| 2 | Establish the foundation architecture | `workflow: setup-foundation-architecture` | enterprise-architect | `docs/foundation/product.md` | `docs/foundation/architecture.md` | 1 |
| 3 | Agree the epics | `workflow: create-epics` | pm | `docs/foundation/product.md` | `docs/epics/portfolio.md` | 1 |
| 4 | Plan the first milestone | `workflow: plan` | delivery-manager | `docs/epics/portfolio.md` | `docs/plan.md` | 3 |
| 5 | Start the rolling status | `workflow: status` | delivery-manager | `docs/plan.md` | `docs/status.md` | 4 |

## Gates

Three states, never two: **satisfied**, **not satisfied**, **not yet measurable**. `check:` is
machine-evaluated; `judgment:` is measured by a person and recorded against their name.

### 1. Define the product foundation

    check:    docs/foundation/product.md is published
    judgment: every feature the SOW commits to is defined at scope level, or named as out of scope
    judgment: the Product Manager approved it

### 2. Establish the foundation architecture

    check:    docs/foundation/architecture.md is published
    judgment: every scope-level feature has a named home in the architecture
    judgment: the Enterprise Architect approved it

### 3. Agree the epics

    check:    docs/epics/portfolio.md is published
    judgment: every epic traces to a commitment in the SOW
    judgment: the Product Manager approved it

### 4. Plan the first milestone

    check:    docs/plan.md has a row per approved epic
    check:    every row carries an estimate or an explicit `tbd — <reason>`
    judgment: the Delivery Manager approved the plan

### 5. Start the rolling status

    check:    docs/status.md is published
    check:    every in-flight row names a specific awaiting condition

## Not runnable yet

Rows 3, 4 and 5 name workflows that exist in the catalogue with **zero steps** — no dispatch graph
has been written for `create-epics`, `plan` or `status`. Initiating groundwork today opens
their tasks and no agent can pick them up.

They are listed rather than omitted because the phase genuinely requires them, and a backlog that
hides its own gaps is the thing this product exists to replace. Their graphs are the next authoring
work; see `compass/seed/known-drift.txt`.

## Grounding & methodology

The *how* lives in each workflow's own file and its agents' task definitions, never here.

## Notes

`scan` (baseline security) was removed from the catalogue deliberately and is therefore not a row.
Restore it here if and when the workflow is authored — a security baseline belongs in groundwork,
not in delivery, because it constrains what delivery is allowed to do.
