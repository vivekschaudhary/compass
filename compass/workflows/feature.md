<!-- FEATURE — nested from sprint-0, and runnable on its own.

     Author -> independent review -> approval by a different role. The rows below are the seed's;
     `compass/seed/workflow-steps.csv` is what executes and this is what declares it. -->
---
name: feature
title: Feature
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

Frame one feature — the bet: the outcome it is betting on, and how it will be judged.

## Dispatch graph

`reads` is DERIVED from `depends-on`, so it is not a column here — printing it would author the same
edge twice. See `deriveReads` in `app/app/lib/import/plan.ts`.

| # | task | dispatch | owner | produces | depends-on |
|---|------|----------|-------|----------|------------|
| 1 | The feature and its targets | `agent: product-owner.draft-feature` | product-owner | `features` | — |
| 2 | Review the feature | `agent: reviewer.review-feature` | reviewer | `feature-review` | 1 |
| 3 | Accept the feature | `hitl` | product-manager | `—` | 2 |
| 4 | Feature architecture | `workflow: feature-architecture` | staff-engineer | `—` | 3 |

## Why it is these rows

**The author does not accept it.** The product owner writes; a reviewer judges whether the targets
could actually be measured, not whether they sound right; the product manager accepts. An agent
drafts in the product owner's name, so a product owner closing this gate would be approving its
own work.

**A feature without a target is not a bet.** `feature_metric.target` is NOT NULL for the same
reason the gate is here: a loop that reaches its learn step with nothing to compare against fails
nowhere.

**Row 4 is the architecture tier below this one.** A feature that has been accepted gets its
technical shape decided before any epic under it is designed — foundation architecture (the
product) → **feature architecture** → epic technical design → build. It cannot run before row 3,
because deciding how to build a feature nobody has accepted is work done twice.
