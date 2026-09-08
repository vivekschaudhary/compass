<!-- PLACEHOLDER. Seeded in workflows.csv and PARKED (`enabled=false`) until its rows exist. The
     dispatch graph below is empty on purpose; a workflow with no steps opens a run that creates no
     task, which is why it must not be startable yet. -->
---
name: job-aids
title: Job aids and enablement
owner: tech-writer
scope: product
trigger: tech-writer initiates it
creates: one task per row below
status: draft
version: 0.1.0

requires: []
produces: []
---

## Purpose

Produce the how-to material the people using this need.

## Rows — not written yet

The `## Dispatch graph` heading is deliberately absent until there are rows to put under it.
`validate.py` refuses a file that declares the section and then has no steps — correctly, since a
workflow that claims a graph and has none opens runs that create no tasks. The heading arrives with
the first row.
