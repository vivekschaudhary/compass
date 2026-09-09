<!-- DESIGN LIBRARY — nested from a phase, and runnable on its own.

     research -> approve -> derive -> review -> approve. The author never accepts: an agent drafts in
     a role's name, so a role that also closes the gate has approved its own work. -->
---
name: design-library
title: Design library
owner: designer
scope: design
trigger: designer initiates it, or a phase nests it
creates: one task per row below
status: active
version: 1.0.0

requires: []
produces: []
---

## Purpose

The design system a team builds screens against — researched, derived, and pointing at the real artifact.

## Dispatch graph

`reads` is DERIVED from `depends-on`, so it is not a column here — printing it would author the same
edge twice.

| # | task | dispatch | owner | produces | depends-on |
|---|------|----------|-------|----------|------------|
| 1 | Research the design ground | `agent: designer.research-design` | designer | `design-research` | — |
| 2 | Accept the research | `hitl` | product-manager | `—` | 1 |
| 3 | The design library | `agent: designer.derive-library` | designer | `design-library` | 2 |
| 4 | Review the library | `agent: reviewer.review-library` | reviewer | `design-review` | 3 |
| 5 | Accept the library | `hitl` | product-manager | `—` | 4 |

## Why it is these rows

**The page LINKS the library, it does not describe it.** The real artifact is a Figma file or a
component library; a page restating it is a copy that goes stale. The gate says so.

**Design has no oversight role of its own** — `designer` and `ux-writer` are both practitioner —
so the product manager accepts. The reviewer supplies the independent judgement in between.
