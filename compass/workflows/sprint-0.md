<!-- SPRINT 0 — the phase that makes the team able to start. The DM initiates it once the roster is
     published. Every row below becomes one task in that run.

     Row 2 is a REVIEW, and it is an ordinary row: it reads the deliverable, produces findings, and
     depends on the row that made it. Nothing generates it and nothing needs to know it "is a
     review" — it is a row whose human can send back to what it depended on. -->
---
name: sprint-0
title: Sprint 0
owner: delivery-manager
scope: foundation
trigger: delivery-manager initiates it
creates: one task per row below, in dependency order
status: active
version: 1.0.0

# ── ENTRY GATE ────────────────────────────────────────────────────────────
# Staffing, not merely "pre-sprint 0 finished". Acceptance cannot be routed to a role nobody fills.
requires:
  - 01-foundation/team@docs == published        # else → /pre-sprint-0
  - 02-scope/deliverables@docs == published     # else → /pre-sprint-0

# ── PRODUCES ──────────────────────────────────────────────────────────────
produces:
  - 01-foundation/foundational-architecture@docs: published
  - 01-foundation/ways-of-working@docs: published
  - 03-delivery/plan@docs: published
---

## Purpose

Everything a team needs before it can pick up a story: an architecture, a design system, an agreed
way of working, and a plan for the first three sprints.

Ends when sprint 1 can open.

## Dispatch graph

| # | task | dispatch | owner | reads | produces | depends-on |
|---|------|----------|-------|-------|----------|------------|
| 1 | Foundation architecture | `agent: enterprise-architect.draft-foundation-architecture` | enterprise-architect | `01-foundation/product-brief` · `02-scope/deliverables` | `01-foundation/foundational-architecture` | — |
| 2 | Review the foundation architecture | `agent: architect.review-foundation-architecture` | architect | `01-foundation/foundational-architecture` | `04-governance/decisions` | 1 |
| 3 | Design library | `agent: designer.build-design-library` | designer | `01-foundation/product-brief` | — | — |
| 4 | Team working agreement | `agent: delivery-manager.draft-ways-of-working` | delivery-manager | `01-foundation/team` · `01-foundation/raci` | `01-foundation/ways-of-working` | — |
| 5 | Sprint plan for sprints 1-3 | `agent: pm.draft-sprint-plan` | pm | `02-scope/deliverables` · `01-foundation/team` | `03-delivery/plan` | 2 |
| 6 | Kickoff | `agent: delivery-manager.run-kickoff` | delivery-manager | `03-delivery/plan` · `01-foundation/ways-of-working` | — | 4, 5 |

**Row 2 is a review, and reviews are ordinary rows.** The reviewer's agent drafts findings against
the architecture; the reviewer accepts or corrects them — the same leverage the author got, rather
than reading twenty pages cold. Sending back reopens row 1 and everything downstream of it, because
the dependency edges already name that set.

If this engagement has no enterprise architect, the DM does not write row 2 and the architect owns
row 1. The plan is authored against actual staffing.

**Row 3 produces no page.** A design library is a Figma file or a component library; a page
describing it would be a copy that goes stale. The deliverable is a link to the real artifact.

**Row 6 produces nothing.** Kickoff is a meeting. It closes on the delivery manager confirming it
happened, with their name on the close — which is a fact you can go and look at, and the honest bar
for an event.

## Gates

### 2. Review the foundation architecture

    check:    the review findings are recorded
    judgment: the Enterprise Architect's draft was read by someone who did not write it

Maker is not checker. The agent drafted, a different named person judged.

### 5. Sprint plan for sprints 1-3

    check:    the sprint plan is published
    judgment: every story in sprints 1-3 belongs to an epic
    judgment: the plan fits the roster's capacity, or says where it does not

A plan that does not fit and says so is useful. A plan that does not fit and does not say so is how
a fixed-price engagement bleeds.

## Notes

Rows 1, 3 and 4 have no dependencies and can run in parallel. Row 5 waits on the review rather than
the draft — planning against an architecture nobody has read is planning against a guess.
