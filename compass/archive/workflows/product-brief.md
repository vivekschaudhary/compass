<!-- PRODUCT BRIEF — nested from sprint-0, and runnable on its own.

     Author -> approval by a different role, twice: the evidence is accepted before the brief is
     written on it. The rows below are the seed's; `compass/seed/workflow-steps.csv` is what
     executes and this is what declares it. -->
---
name: product-brief
title: Product brief
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

What this engagement is for, what it is betting on, and what the client already told us.

## Dispatch graph

`reads` is DERIVED from `depends-on`, so it is not a column here — printing it would author the same
edge twice. See `deriveReads` in `app/app/lib/import/plan.ts`.

| # | task | dispatch | owner | produces | depends-on |
|---|------|----------|-------|----------|------------|
| 1 | Evidence for the brief | `agent: researcher.gather-evidence` | researcher | `brief-evidence` | — |
| 2 | Review and approve the evidence | `hitl` | product-owner | `—` | 1 |
| 3 | Product brief | `agent: product-owner.draft-brief` | product-owner | `product-brief` | 2 |
| 4 | Review and approve the brief | `hitl` | product-manager | `—` | 3 |

## Why it is these rows

**Evidence first, and separately.** The researcher gathers before the owner writes, so the brief
cites something rather than being checked against nothing afterwards. What could not be found out
is listed — an absence the brief quietly fills is the failure this ordering prevents.

**The evidence is accepted before the brief is written on it.** Row 2 is the product owner reading
what they are about to build on, which is the one moment a thin search costs nothing to redo. A
brief drafted on unread evidence inherits its gaps and states them as findings.

**The author does not accept it.** The product owner writes, the product manager approves. This
workflow previously had the researcher approving the product manager's draft, which is both
backwards and self-approval one step removed.
