<!-- SETUP — the phase that makes an engagement workable. It configures the systems of record and
     then PROVES them. Every row below becomes one task in that run.

     THIS TABLE IS THE PHASE. Add a row and the engagement gains one; change a gate and the bar
     moves. None of it is encoded in code — a practice amends its own setup without a release.

     BOOTSTRAP: this is the phase that configures the tracker, so there is nowhere to put its own
     tickets while it runs. Row 4 back-fills the epic and its stories, already Done, once the
     tracker answers. A setup epic showing four closed stories with real timestamps is a better
     first impression than an empty board. -->
---
name: setup
title: Setup engagement
owner: delivery-manager
scope: foundation
trigger: delivery-manager initiates it   # intake provisions; it does not start anything
creates: one task per row below, in dependency order
status: active
version: 1.0.0

# ── ENTRY GATE ────────────────────────────────────────────────────────────
# None. This is the first phase; an engagement row existing is all it requires.
requires: []

# ── PRODUCES ──────────────────────────────────────────────────────────────
# No documents. The deliverable is a wired, exercised connector.
produces:
  - docs.wired: true
  - tickets.wired: true
---

## Purpose

Turn a provisioned engagement into one that can hold work: a named delivery manager, a document
store, a tracker — and proof that the last two answer.

Ends when pre-sprint 0 can start.

## Dispatch graph

| # | task | dispatch | owner | reads | produces | depends-on |
|---|------|----------|-------|-------|----------|------------|
| 1 | Name the delivery manager | `agent: delivery-manager.name-delivery-manager` | delivery-manager | — | — | — |
| 2 | Configure document storage | `agent: delivery-manager.configure-doc-store` | delivery-manager | — | — | 1 |
| 3 | Configure the tracker | `agent: delivery-manager.configure-tracker` | delivery-manager | — | — | 1 |
| 4 | Validate the connections | `machine` | — | — | — | 2, 3 |

Row 1 comes first because every other row is owned by the person it names.

Rows 2 and 3 are not "the agent enters a credential". The agent prepares the configuration — derives
the space and project keys, canonicalises them, checks what already exists — and the human supplies
the secret and accepts.

## Gates

Three states, never two: **satisfied**, **not satisfied**, **not yet measurable**. A gate that could
not be checked must never read as one that passed.

### 4. Validate the connections

    check: docs.wired == true
    check: tickets.wired == true

This is the row that earns the phase: write a probe page, create and delete a probe issue, read the
board's status vocabulary. **Config that was never exercised is not config.**

It is a `machine` row — no owner, no reviewer, because the probe IS the evidence. It is also the
only row in the four phases with hand-written criteria; everywhere else what a row produces and who
accepts it is the criterion.

## Notes

Failing row 4 sends work back to rows 2 or 3 with the findings, and the probe runs again. A
connector that silently stops answering should reopen this, which is why it is a row rather than a
one-time assumption.
