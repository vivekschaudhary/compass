<!-- PLACEHOLDER. Seeded in workflows.csv and PARKED (`enabled=false`) until its rows exist. The
     dispatch graph below is empty on purpose; a workflow with no steps opens a run that creates no
     task, which is why it must not be startable yet. -->
---
name: release-comms
title: Release comms
owner: gtm
scope: gtm
trigger: gtm initiates it
creates: one task per row below
status: draft
version: 0.1.0

requires: []
produces: []
---

## Purpose

Draft the release notes, the announcement and the positioning copy.

## Rows — not written yet

The `## Dispatch graph` heading is deliberately absent until there are rows to put under it.
A file that declared the section and then had no steps would claim a graph and have none — and a
workflow like that opens runs that create no tasks. The heading arrives with the first row.
