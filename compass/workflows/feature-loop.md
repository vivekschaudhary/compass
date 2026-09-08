<!-- FEATURE-LOOP — the phase a bet goes round. Unlike the delivery phases, it is scoped to ONE
     feature and repeats per turn of the loop: build what was bet on, measure whether it worked,
     decide what that means.

     PARKED. `enabled=false` in compass/seed/workflows.csv, deliberately. The rows are the process
     written down in the form that executes, and they import cleanly — but the engine cannot yet run
     them: `open_phase_run` takes no feature, so every loop would belong to the engagement rather
     than to a bet; the guard on an already-open run is per (engagement, workflow), so only one
     feature could ever be in flight; and `{feature}` in a produced path is resolved by nothing, so
     two features would file successive versions of one page instead of a page each. Flipping
     `enabled` before that lands would put a phase on the board that cannot do what it says.

     The parked state is not drift and `seed-consistency-check.py` knows it: a workflow whose seed
     says enabled=false is excluded from step-shape comparison, the same treatment `pre-sprint-0`
     had. This file still has to exist, because a seeded workflow with no dispatch graph is
     `missing-graph` whether it is parked or not — the framework must declare what it seeded. -->
---
name: feature-loop
title: Feature loop
owner: product-manager
scope: product
trigger: product-manager opens the loop on one feature
creates: the three rows below, for the feature the run names
status: active
version: 1.0.0

# ── ENTRY GATE ────────────────────────────────────────────────────────────
requires:
  - 02-scope/features/{feature}@docs == published   # a bet nobody framed has nothing to measure

# ── PRODUCES ──────────────────────────────────────────────────────────────
produces:
  - 02-scope/features/{feature}/build@docs: published
  - 02-scope/features/{feature}/measurement@docs: published
  - 02-scope/features/{feature}/decision@docs: published
---

## Purpose

Take one bet round the loop: ship it, find out whether it worked, and decide what to do about the
answer. The feature is the unit — a page in the doc store, with its epics on the board beneath it
and this loop's evidence accumulating on it.

## Dispatch graph

| # | task | dispatch | owner | reads | produces | depends-on |
|---|------|----------|-------|-------|----------|------------|
| 1 | Ship the feature | `machine` | — | — | `02-scope/features/{feature}/build` | — |
| 2 | Measure the bet | `agent: researcher.measure-feature` | researcher | `02-scope/features/{feature}/build` | `02-scope/features/{feature}/measurement` | 1 |
| 3 | Persevere / pivot / kill | `agent: product-manager.learn-from-feature` | product-manager | `02-scope/features/{feature}/measurement` | `02-scope/features/{feature}/decision` | 2 |

## Why the rows are these rows

**Row 1 is a machine check, not a piece of work.** Whether a feature's epics shipped is a fact about
the client's board, not something an agent drafts — the same reasoning that makes `setup` row 1 a
machine check. It holds no role: a machine check is nobody's to perform, and the importer refuses a
`machine` step that names one. Its accountable owner falls back to the workflow's, so the row lands
in the product manager's queue rather than in nobody's.

**Row 2 belongs to the Researcher** because the roster already says so: the role's title in
`compass/seed/roles.csv` is *"Evidence for the bet"*. Measuring is gathering evidence, and the
gates say what makes that evidence honest — every target has at least one reading, and a metric that
could not be measured says so rather than being quietly left out. A bet judged on the metrics that
happened to be available is not judged at all.

**Row 3 is the verdict, and it is the Product Manager's.** The reasoning is a document like every
other deliverable; the verdict is a row, so that "how many bets did we kill this quarter" is
arithmetic rather than four people reading four pages. `inconclusive` is one of the four answers on
purpose — a measurement that could not decide must not be recorded as `persevere`, which is how a
bet survives on the absence of evidence.

## What repeats, and what does not

The loop repeats; the feature does not. Each turn opens a new run against the same feature and adds
a new decision beneath it, so a feature that persevered twice and then pivoted has three verdicts
and the history is readable. That is why the verdict is one row per RUN rather than a column on the
feature — a column could only ever remember the last answer, and the sequence is the whole point of
running a loop at all.

**Targets are set when the feature is framed, not here.** A loop that had to invent its own success
criteria on the way past would move the goalposts to wherever the result landed. So the entry gate
asks for the feature's own page, published — framing the bet is what setting its targets means, and
a feature with no page has not been framed.

The gate is mechanical on purpose, and that is not a detail. `unmetEntryGate` treats anything it
cannot check as unmet, so a ready gate phrased as a judgment — "the targets are set" — is one no
human can ever satisfy and no run can ever pass. Every ready gate in the seed is a question the
engine can answer; the judgment lives in the Done gates, where a person records a verdict.
