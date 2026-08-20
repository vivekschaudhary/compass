<!-- SETUP — the phase that proves an engagement can hold work. One row, and it is a probe.

     THIS TABLE IS THE PHASE. Add a row and the engagement gains one; change a gate and the bar
     moves. None of it is encoded in code — a practice amends its own setup without a release.

     BOOTSTRAP: this is the phase that proves the tracker, so there is nowhere to put its own ticket
     while it runs. The row back-fills its epic and story, already Done, once the tracker answers. A
     setup epic showing a closed story with a real timestamp is a better first impression than an
     empty board. -->
---
name: setup
title: Setup engagement
owner: delivery-manager
scope: foundation
trigger: delivery-manager initiates it   # intake provisions; it does not start anything
creates: one task per row below
status: active
version: 1.0.0

# ── ENTRY GATE ────────────────────────────────────────────────────────────
# None. This is the first phase; an engagement row existing is all it requires.
requires: []

# ── PRODUCES ──────────────────────────────────────────────────────────────
# No document. The deliverable is a wired, exercised connector.
produces:
  - docs.wired: true
  - tickets.wired: true
---

## Purpose

Prove that the engagement's systems of record answer, before anything downstream is derived from
them. Ends when pre-sprint 0 can start.

## Dispatch graph

| # | task | dispatch | owner | reads | produces | depends-on |
|---|------|----------|-------|-------|----------|------------|
| 1 | Validate the connections | `machine` | — | — | — | — |

**Configuration itself is intake's job, not a row here.** Intake takes the delivery manager's name,
canonicalises the Confluence space and the Jira project, and stores the credentials. Provisioning is
a form: someone types values into fields, and no agent drafts a credential.

What provisioning cannot do is prove any of it works. That is this phase, and it is the whole of it.

## Gates

Three states, never two: **satisfied**, **not satisfied**, **not yet measurable**. A gate that could
not be checked must never read as one that passed.

### 1. Validate the connections

    check: docs.wired == true
    check: tickets.wired == true

Both are probes, not settings lookups — `evaluateConnector` writes a page to the space and reads the
board's status vocabulary back. **Config that was never exercised is not config.**

It is a `machine` row: no owner and no reviewer, because the probe IS the evidence and there is
nothing for a person to judge. It is also the only row across the four phases carrying hand-written
machine criteria; everywhere else what a row produces and who accepts it is the criterion.

## Notes

**A machine row is evaluated when the phase opens.** Nothing re-checks it afterwards, so a phase
initiated against an engagement whose credentials are not yet in place leaves this row open with no
route to close it — the fix is to complete intake and initiate the phase again, not to wait.

That is a real limit rather than a preference, and it is why this phase is one probe rather than the
four rows it began as: rows 1–3 configured things, configuration happens during a phase, and a
machine row whose criteria only become true later can never close.

An earlier draft had `name the delivery manager`, `configure document storage` and `configure the
tracker` as agent rows. They produce no document, and the agent runner files a document or errors —
so they would have failed on the first click. Making the phase honest about what intake already does
removed the problem rather than working around it.
