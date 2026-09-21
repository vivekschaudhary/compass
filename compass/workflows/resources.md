<!-- RESOURCES — nested from a phase, and runnable on its own.

     propose -> accept. The author never accepts: an agent drafts in the delivery manager's name, so
     the delivery manager reviewing AND closing would be approving their own work. The product
     manager holds the gate, because accepting a roster commits named people. -->
---
name: resources
title: Resources
owner: delivery-manager
scope: delivery
trigger: delivery-manager initiates it, or a phase nests it
creates: one task per row below
status: active
version: 1.0.0

requires: [sow, requirements]
produces: [resource- plan]
---

## Purpose

Say who does the work: the roles the engagement needs, who holds each one, and when they start.

## Dispatch graph

`reads` is DERIVED from `depends-on`, so it is not a column here — printing it would author the same
edge twice.

| # | task | dispatch | owner | produces | output | depends-on |
|---|------|----------|-------|----------|--------|------------|
| 1 | Staffing plan and resources | `agent: delivery-manager.propose-resource-plan` | delivery-manager | `resource- plan` | roster | — |
| 2 | Review and approve the staffing plan | `hitl` | product-manager | `—` | — | 1 |

## Why it is these rows

**`output: roster` RIDES ON ROW 1**, the row that drafts. That is what makes this more than a page:
the materialiser reads the approved table and writes `member` rows, so the roster the plan describes
becomes the roster the app staffs work from. A staffing plan filed as prose staffs nobody.

**It reads the timeline as well as the contract.** Capacity is a question about dates — who is needed
by when — so this runs after the timeline rather than beside it. The phase row that nests this
depends on the timeline row for exactly that reason.

**Approval commits real people.** Row 2 is the product manager confirming that every named holder is
a person who has agreed to the role, which is why the gate is theirs rather than the delivery
manager's. The roster is the one deliverable here whose approval changes who is on the engagement.
