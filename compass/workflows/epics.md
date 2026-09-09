<!-- EPICS — nested from sprint-0, and runnable on its own.

     research -> approve -> derive -> review -> approve. The author never accepts: an agent drafts in
     the product owner's name, so a product owner closing this gate would approve its own work. -->
---
name: epics
title: Epics
owner: product-owner
scope: product
trigger: product-owner initiates it, or sprint-0 nests it
creates: one task per row below
status: active
version: 1.0.0

requires: []
produces: []
---

## Purpose

Turn approved features and milestones into the epics that go on the client's board.

## Dispatch graph

`reads` is DERIVED from `depends-on`, so it is not a column here — printing it would author the same
edge twice.

| # | task | dispatch | owner | produces | output | depends-on |
|---|------|----------|-------|----------|--------|------------|
| 1 | What the epics must cover | `agent: product-owner.research-epics` | product-owner | `epic-research` | — | — |
| 2 | Accept the coverage | `hitl` | product-manager | `—` | — | 1 |
| 3 | The epics | `agent: product-owner.draft-epics` | product-owner | `deliverables@tickets` | backlog | 2 |
| 4 | Review the epics | `agent: reviewer.review-epics` | reviewer | `epic-review` | — | 3 |
| 5 | Accept the epics | `hitl` | product-manager | `—` | — | 4 |
| 6 | Technical design per epic | `workflow: tech-design` | staff-engineer | `—` | — | 5 |

## Why it is these rows

**`output: backlog` rides on row 3**, the row that drafts. That is what gives it the `backlog` tool
and the materialiser that creates the issues on approval; a backlog filed as prose creates nothing.
Had it stayed on sprint-0's nesting row it would have been silently inert — exactly the failure the
`output` column was added to prevent.

**Coverage is accepted before the epics are written.** Row 2 is a gate rather than a formality: an
epic set drafted against a coverage nobody agreed gets renegotiated at review, after the work.

**The review judges estimability, not taste.** An epic that reads well and cannot be estimated is
the one that breaks a sprint plan two rows later.

**Row 6 fans out.** It is one row and it opens one `tech-design` run PER approved epic, because a
technical design is authored per epic and each is reviewed and approved on its own. Every other
nesting row in the seed opens exactly one child; this is the first that does not, and what makes the
difference is that `tech-design` produces a per-epic path (`03-architecture/epic/{epic}`) rather
than a fixed one. The row cannot run before row 5, which is the point — designing against epics
nobody has accepted is work done twice.
