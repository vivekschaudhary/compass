<!-- PLACEHOLDER. Seeded in workflows.csv; its rows are not written yet. The dispatch graph below is
     empty on purpose — filling it in is what makes this workflow do anything. -->
---
name: feature
title: Feature
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

Frame one feature — the bet: what outcome it is betting on, and how it will be judged.

## Rows — not written yet

The `## Dispatch graph` heading is deliberately absent until there are rows to put under it.
`validate.py` refuses a file that declares the section and then has no steps — correctly, since a
workflow that claims a graph and has none opens runs that create no tasks. The heading arrives with
the first row.
