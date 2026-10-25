<!-- TIMELINE — nested from a phase, and runnable on its own.

     draft -> accept. The author never accepts: an agent drafts in the delivery manager's name, so
     the delivery manager reviewing AND closing would be approving their own work. The product
     manager holds the gate. -->
---
name: timeline
title: Timeline & Milestones
owner: delivery-manager
scope: delivery
trigger: delivery-manager initiates it, or a phase nests it
creates: one task per row below
status: active
version: 1.0.0

requires: [sow]
produces: [timeline]
---

## Purpose

Say when the engagement delivers what: the milestones, their dates, and what each one hands over.

## Dispatch graph

`reads` is DERIVED from `depends-on`, so it is not a column here — printing it would author the same
edge twice.

| # | task | dispatch | owner | produces | output | depends-on |
|---|------|----------|-------|----------|--------|------------|
| 1 | Draft the timeline | `agent: delivery-manager.draft-timeline` | delivery-manager | `timeline` | — | — |
| 2 | Review and approve the timeline | `hitl` | product-manager | `—` | — | 1 |

## Why it is these rows

**IT WAS ROWS OF sprint-0, AND IT IS A WORKFLOW BECAUSE IT HAS A DELIVERABLE.** Drafting the
timeline, reviewing it and approving it were `sprint-0` steps 3, 4 and 5. A phase row that nests this
is gated on `timeline` being published and on the run closing, which is a stronger bar than loose
rows inside a phase — and the same rows run unchanged when a timeline has to be redone
mid-engagement, which is why `repeatable` is true.

**The SOW is the input, declared rather than assumed.** `requires: [sow]` is what gates the row that
nests this: a timeline drafted before the contract is filed is a guess with dates on it.

**One gate, and not the author's.** The delivery manager's own pass over their agent's draft was a
row here and is not any more. What remains is the row that means something: the product manager
accepting dates the engagement will be held to, with their name on the close.
