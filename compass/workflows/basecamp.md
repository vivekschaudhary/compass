<!-- BASECAMP — what an engagement does before it can plan anything. (Was "Pre-Sprint 0".)
     The DM initiates it once the admin has created the project entry. Every row below becomes
     ONE TASK in that run, with the owner and the gate the row declares.

     THIS TABLE IS THE WORKFLOW. Add a row and the engagement gains a task; change a gate and the
     bar moves. Do not encode any of this in code — the point is that a practice can amend its own
     mobilisation without a release.

     Rows were previously two separate workflows (`plan-kickoff`, `staff-engagement`), which is why
     an engagement ended up with nine workflow runs and six tasks. A task is not a workflow. -->
---
name: basecamp
title: Basecamp
owner: delivery-manager
scope: foundation
trigger: delivery-manager initiates it   # NOT automatic — a person decides the engagement is ready to start
creates: one task per row below, in dependency order
status: active
version: 1.0.0

# ── ENTRY GATE ────────────────────────────────────────────────────────────
# Every predicate must hold or initiating REFUSES. The admin's project entry is what satisfies
# these — provisioning stores credentials, it does not prove they work, so these are probes.
requires:
  - docs.wired == true              # else → /setup (connect the doc store)
  - tickets.wired == true           # else → /setup (connect the tracker)
  - sow@docs == filed               # else → the SOW is what everything downstream is derived from

# ── PRODUCES ──────────────────────────────────────────────────────────────
produces:
  - 01-foundation/team@docs: approved
---

## Purpose

Turn a provisioned project entry into an engagement that can be worked: proven systems of record,
and a named person against every role that groundwork assigns work to.

There is deliberately no backlog row. The engagement's epics are written in groundwork, FROM the
product brief — an SOW commits to outcomes and money, and epics derived from it alone are invented
scope, which is how a fixed-price engagement bleeds.

Ends when groundwork can start. It does not plan groundwork — `groundwork.md` does that, and the
DM initiates that too.

## Dispatch graph

A row is a unit of work. HOW it gets done is the `dispatch` column, and there are three answers:

    agent: <role>.<task>     one agent task, defined in that agent's file
    workflow: <code>         a nested workflow run — the row is done when that run closes
    —                        nothing dispatches; the gate is satisfied elsewhere

A phase may mix all three, and a nested workflow's own rows may nest again. Nothing here assumes a
phase is only tasks or only workflows — that was a distinction the format imposed, not one the work
has.

| # | task | dispatch | owner | reads | produces | depends-on |
|---|------|----------|-------|-------|----------|------------|
| 1 | Connect systems of record | — | delivery-manager | — | — | — |
| 2 | Staff the engagement | `agent: delivery-manager.propose-staffing` | delivery-manager | `02-scope/sow` | `01-foundation/team` | 1 |

## Gates

Three states, never two: **satisfied**, **not satisfied**, **not yet measurable**. A gate that could
not be checked must never read as one that passed.

`check:` is machine-evaluated and needs no person. `judgment:` is measured by a human, recorded
against their name — those are the ones a reviewer signs, and the only ones they should be asked to.

### 1. Connect systems of record

    check: docs.wired == true
    check: tickets.wired == true

Satisfied by the admin's project entry and the probes above, so this task closes on creation. It is
a row rather than an assumption because an engagement whose tracker silently stopped answering
should reopen it.

### 2. Staff the engagement

    check:    every role Groundwork assigns work to has a named holder
    judgment: roles left deliberately unstaffed are recorded with a reason
    judgment: the Delivery Manager approved the roster

A vacancy is only a vacancy where there is work. The catalogue ships seventeen roles; an engagement
uses the ones its backlog assigns work to, and the rest are not staffing gaps — they are roles this
engagement does not use.

## Grounding & methodology

The *how* lives in the agent file, never here:
`delivery-manager` → `compass/agents/delivery-manager.md#propose-kickoff-backlog`, `#propose-staffing`

## Notes

Row 1 dispatches nothing and that is deliberate: not everything an engagement must satisfy is
something an agent does. The row exists so the gate is visible and re-checkable, not so someone is
assigned to it.
