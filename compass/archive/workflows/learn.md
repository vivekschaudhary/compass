<!-- PLACEHOLDER. Seeded in workflows.csv and PARKED (`enabled=false`) until its rows exist.

     `learn` is the other half of `measure`. It was going to be one `feature-loop` workflow running
     build -> measure -> learn; it is not, because those three happen on their own cadences and by
     different people. Building is `build`. Measuring is `measure`, which runs whenever there is
     something to read. Deciding what the readings mean is this — and it happens when somebody is
     ready to decide, not when a loop's third step comes round. -->
---
name: learn
title: Learn
owner: product-manager
scope: product
trigger: product-manager initiates it
creates: one task per row below
status: draft
version: 0.1.0

requires: []
produces: []
---

## Purpose

Rule on what a feature's measurements mean: persevere, pivot, kill — or inconclusive, which is a
real answer and must never be recorded as persevere.

## Rows — not written yet

The `## Dispatch graph` heading is deliberately absent until there are rows to put under it.
A file that declared the section and then had no steps would claim a graph and have none — and a
workflow like that opens runs that create no tasks. The heading arrives with the first row.
