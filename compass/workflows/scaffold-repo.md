<!-- SCAFFOLD-REPO — nested from foundation-architecture, once per registered repo.

     execute -> accept. The author never accepts: the staff engineer's agent writes the scaffold and
     the principal engineer accepts the pull request it opened.

     THIS FILE IS V1'S DISPATCH GRAPH FOR ONE STEP. The app runs the row through its `code` tool, which
     spawns the orchestrator with `--step 1`; the orchestrator loads this file by name to learn what step 1
     is. It is one of two workflows that still depend on that (the other is build), and it is the reason
     `requires_approved` is empty: the app's own gates on foundation-architecture rows 6 and 7 are what
     enforce approval, and the orchestrator's check looks in the target repo's filesystem for documents
     that live in the engagement's doc store instead. -->
---
name: scaffold-repo
title: Scaffold one repo
owner: staff-engineer
scope: repo
trigger: foundation-architecture nests it, once per registered repo
creates: one task per row below
status: active
version: 1.0.0

requires_approved: []
produces: []
---

## Purpose

Carry out the accepted scaffold plan **for one repo**: write its initial structure and its
`compass/config.yaml`, verify it with that config's own `checks:`, and open a pull request only if
they pass.

## Dispatch graph

| # | task | dispatch | owner | produces | output | depends-on |
|---|------|----------|-------|----------|--------|------------|
| 1 | Scaffold the repo | `agent: staff-engineer.execute-scaffold` | staff-engineer | `scaffold/{repo}@scm` | code | — |
| 2 | Accept the repo scaffold | `hitl` | principal-engineer | `—` | — | 1 |

## Why it is these rows

**`{repo}` is the subject.** Each run targets one registered repo, chosen by its key, so a scaffold
never lands in "whichever repo is first". A run whose subject is not a registered repo with a checkout
on disk refuses before spawning anything.

**No story.** A scaffold has no ticket, so the run carries no Jira key and the orchestrator is started
without `--story`. Its branch is named from the summary alone (`chore/<slug>`).

**The pull request is the deliverable.** Row 1 files no document; it opens a branch and a PR on green
checks, and row 2 is a person accepting that PR.
