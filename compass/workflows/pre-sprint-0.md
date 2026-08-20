<!-- PRE-SPRINT 0 — what are we doing, with whom, by when. The DM initiates it once setup's probes
     pass. Every row below becomes one task in that run.

     THIS TABLE IS THE PHASE. Row 4 is the hinge: staffing gates every later phase's ticket
     creation, because acceptance cannot be routed to a role nobody fills. -->
---
name: pre-sprint-0
title: Pre-sprint 0
owner: delivery-manager
scope: foundation
trigger: delivery-manager initiates it   # setup passing is permission, not instruction
creates: one task per row below, in dependency order
status: active
version: 1.0.0

# ── ENTRY GATE ────────────────────────────────────────────────────────────
requires:
  - docs.wired == true              # else → /setup
  - tickets.wired == true           # else → /setup

# ── PRODUCES ──────────────────────────────────────────────────────────────
produces:
  - 02-scope/sow@docs: published
  - 01-foundation/product-brief@docs: published
  - 02-scope/timeline@docs: published
  - 01-foundation/team@docs: published
  - 01-foundation/raci@docs: published
  - 02-scope/deliverables@docs: published
  - 03-delivery/plan@docs: published
---

## Purpose

Establish what the engagement is building, who is building it, and by when — so sprint 0 starts from
a shared basis rather than from each person's reading of the SOW.

Ends when the team can start. It does not design anything; that is sprint 0.

## Dispatch graph

| # | task | dispatch | owner | reads | produces | depends-on |
|---|------|----------|-------|-------|----------|------------|
| 1 | File the SOW | `agent: delivery-manager.file-sow` | delivery-manager | — | `02-scope/sow` | — |
| 2 | Product brief | `agent: product-manager.draft-product-brief` | product-manager | `02-scope/sow` | `01-foundation/product-brief` | 1 |
| 3 | Timeline and milestones | `agent: delivery-manager.draft-timeline` | delivery-manager | `02-scope/sow` · `01-foundation/product-brief` | `02-scope/timeline` | 2 |
| 4 | Staffing plan and resources | `agent: delivery-manager.propose-staffing` | delivery-manager | `02-scope/sow` · `02-scope/timeline` | `01-foundation/team` | 3 |
| 5 | Roles and responsibilities | `agent: delivery-manager.draft-raci` | delivery-manager | `01-foundation/team` | `01-foundation/raci` | 4 |
| 6 | Epics from milestones | `agent: product-manager.draft-epics` | product-manager | `01-foundation/product-brief` · `02-scope/timeline` | `02-scope/deliverables` | 3 |
| 7 | Tailor the delivery plan | `agent: delivery-manager.tailor-delivery-plan` | delivery-manager | `01-foundation/team` · `02-scope/deliverables` | `03-delivery/plan` | 5, 6 |

Every row is owned by the delivery manager or the PM, because those are the only people known before
row 4 names anyone else.

**Row 2 always runs.** Intake may have filed a supplied BRD or brief; the row still produces the
product brief, derived from whatever was filed. One path, either provenance — a supplied brief is a
basis, not a substitute.

**Row 7 is where the org's phase tables become this engagement's.** The tables are a starting point;
the DM adapts them now that staffing is known, and that adaptation is a tracked, accepted deliverable
like any other.

## Gates

### 4. Staffing plan and resources

    check:    the roster is published
    judgment: every role a later phase assigns work to has a named holder
    judgment: roles left deliberately unstaffed are recorded with a reason

A vacancy is only a vacancy where there is work. The catalogue ships seventeen roles; an engagement
uses the ones its plan assigns work to, and the rest are not gaps.

### 7. Tailor the delivery plan

    check:    the delivery plan is published
    judgment: every role the plan names is staffed on the roster

**The plan is authored against actual staffing.** No fallback for unstaffed or double-hatted roles:
if the engagement has no enterprise architect, the DM does not write an EA review row. Adding or not
adding a row IS the governance dial.

## Notes

The remaining rows carry a published check and the judgments that only a person can make. What a row
produces and who accepts it is the criterion — there is no parallel list to maintain.
