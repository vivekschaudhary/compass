<!-- TECH-DESIGN — nested from epics, once per approved epic.

     draft -> approve. The author never accepts: an agent drafts in the staff engineer's name, so a
     staff engineer closing this gate would approve its own design. The principal engineer holds
     the close, which is the same pairing foundation-architecture uses.

     THIS FILE WAS STORY-SCOPED AND IS NOT ANY MORE. It described one run per Ready story, a
     `## Technical approach` spliced onto the Story description, and a `tech-ready` label that
     `/build` refused to proceed without. None of that ran in the app — the workflow was a single
     ungated row that nothing opened. The tier is the epic, between feature architecture above and
     the story build below. -->
---
name: tech-design
title: Technical design
owner: staff-engineer
scope: epic
trigger: epics nests it, once per approved epic
creates: one task per row below
status: active
version: 2.0.0

requires: []
produces: []
---

## Purpose

Author the **technical solution for one epic** — the *how*, grounded in the code that exists — as
its own page, linked to that epic's ticket.

## Where it sits

Third of three architecture tiers, and the narrowest:

| tier | scope | workflow |
|------|-------|----------|
| foundation architecture | the whole product | `foundation-architecture` |
| feature architecture | one feature | `feature-architecture` |
| **epic technical design** | **one epic** | **this** |

Below it, `build` implements a story. This workflow does not write code and does not build; it
decides how the epic will be built, bounded by the two tiers above it.

## Dispatch graph

`reads` is DERIVED from `depends-on`, so it is not a column here — printing it would author the same
edge twice.

| # | task | dispatch | owner | produces | output | depends-on |
|---|------|----------|-------|----------|--------|------------|
| 1 | Survey the code | `agent: staff-engineer.survey-epic-code` | staff-engineer | `03-architecture/epic/{epic}/code-survey` | survey | — |
| 2 | Epic technical design | `agent: staff-engineer.draft-epic-tech-design` | staff-engineer | `03-architecture/epic/{epic}` | — | 1 |
| 3 | Accept the technical design | `hitl` | principal-engineer | `—` | — | 2 |

## Why it is these rows

**`{epic}` is the subject, and it is what makes this workflow per-epic.** `document` is unique on
(engagement, path), so a fixed path would put every epic's design at the same address — each run
overwriting the last, with all of their gates passing. The token is filled from the run's subject,
and a run with no subject **halts rather than filing at the literal path**: that failure would
produce real-looking documents and a green gate, which is worse than a crash because nothing about
it looks wrong.

**One row became two.** It was a single `staff-engineer` row, which meant the author held the close
and approved their own design — the arrangement commit 75524da9 removed from every other workflow
in the seed. The principal engineer accepts.

**The design is grounded in the code, and that is gated — by a row, not by a promise.** The app's
agent has no tool that opens a file, so it cannot read the repository itself. Row 1 hands the
reading to the Python orchestrator, the way `scaffold-repo` hands boilerplate to the generator: the
agent says what the design depends on, `handoff survey` reads every registered checkout read-only
(`Read`, `Glob`, `Grep` — named, so nothing can be edited), and the findings are filed as
`code-survey` with a file behind every claim. Each cited path is looked up in the checkout and a
path that does not exist fails the survey, so a module name the reader invented never reaches row 2.
Row 2 designs from that page. A design written from what the code is assumed to look like is the
one that survives review and fails at build.

**A survey needs a checkout.** A repo that exists only on GitHub (the scaffold writes through the
API) has no local path, and the survey is refused with the place to set one rather than run on
nothing.

**Departures are named, not taken quietly.** The two tiers above are the bar. An epic that needs
something outside them is a decision for the foundation or the feature architecture, not something
this page settles on its own.
