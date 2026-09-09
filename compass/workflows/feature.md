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

**A feature without a target is not a bet.** This used to point at `feature_metric.target` being
NOT NULL. That table is gone (migration 059) — **a feature is a page, not a row** — so the rule is
carried by Done criteria on row 1 instead. The reason is unchanged: a loop that reaches its learn
step with nothing to compare against fails nowhere.

**The page carries Metric, Measurement and Decision as sections.** These are the three things the
dropped tables were for, and they are gated here because there is nowhere else to gate them.
Metric is filled at authoring time — what is measured, the target, where the number comes from.

**Measurement and Decision are reserved empty, not omitted.** They cannot be satisfied at draft
time: both are post-launch, and requiring content would block row 1 forever. But letting them be
absent is worse — a section that appears months later is one nobody reviewed or approved, and its
absence at approval reads identically to a feature that was never going to be measured. So the bar
is that they EXIST and say they are not yet due. Same rule the review row already carries: a review
that found nothing says so explicitly rather than being an empty document.

`measure` and `learn` (both parked, no rows) write into those sections when they are built.

**Row 4 is the architecture tier below this one.** A feature that has been accepted gets its
technical shape decided before any epic under it is designed — foundation architecture (the
product) → **feature architecture** → epic technical design → build. It cannot run before row 3,
because deciding how to build a feature nobody has accepted is work done twice.
