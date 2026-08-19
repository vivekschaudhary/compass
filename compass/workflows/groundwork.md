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
  - 01-foundation/team@docs == approved               # else → initiate basecamp

# ── PRODUCES ──────────────────────────────────────────────────────────────
produces:
  - 01-foundation/product-brief@docs: approved
  - 02-scope/deliverables@docs: approved
  - 01-foundation/foundational-architecture@docs: approved
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
| 1 | Define the product foundation | `workflow: create-product-brief` | researcher | `02-scope/sow` | `01-foundation/product-brief` | — |
| 2 | Draft the high-level epics | `agent: pm.draft-epics` | pm | `01-foundation/product-brief` · `02-scope/sow` | `02-scope/deliverables` | 1 |
| 3 | Establish the foundation architecture | `workflow: setup-foundation-architecture` | enterprise-architect | `01-foundation/product-brief` · `02-scope/deliverables` | `01-foundation/foundational-architecture` | 2 |

Row 2 is a TASK, not a nested workflow, and the difference is the point of the `dispatch` column:
drafting epics from an approved brief is one agent's work ending at a human gate. As a workflow it
needed a dispatch graph nobody had written, so the row opened a task no agent could pick up.

Row 1's input is `01-foundation/product-brief` whether Compass wrote it or the client supplied their
BRD at intake — one path, either provenance.

## Gates

Three states, never two: **satisfied**, **not satisfied**, **not yet measurable**. `check:` is
machine-evaluated; `judgment:` is measured by a person and recorded against their name.

### 1. Define the product foundation

    check:    01-foundation/product-brief is published
    judgment: every feature the SOW commits to is defined at scope level, or named as out of scope
    judgment: the Product Manager approved it

### 2. Draft the high-level epics

    check:    02-scope/deliverables is published
    judgment: every epic traces to something the brief or the SOW commits to
    judgment: every epic has a description and a milestone
    judgment: what the brief leaves unclear is recorded as an open question, not a guessed epic
    judgment: the Product Manager approved the epics

An epic nobody can write yet is an open question. Naming it anyway produces a plausible-sounding
scope item that nobody committed to, which on a fixed price is how the engagement bleeds.

### 3. Establish the foundation architecture

    check:    01-foundation/foundational-architecture is published
    judgment: every scope-level feature has a named home in the architecture
    judgment: the Enterprise Architect approved it

## Grounding & methodology

The *how* lives in each workflow's own file and its agents' task definitions, never here.

## Notes

`scan` (baseline security) was removed from the catalogue deliberately and is therefore not a row.
Restore it here if and when the workflow is authored — a security baseline belongs in groundwork,
not in delivery, because it constrains what delivery is allowed to do.
