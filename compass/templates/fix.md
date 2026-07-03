---
id: <FIX-ID>                # e.g. FIX-2026-07-03-<slug> or the ticket id
type: bug                   # bug (a defect) | enhancement — drives the Jira issue type (Bug | Story)
bet: <BET-ID or null>       # bet-linked → projects under the bet's Epic; null → standalone (hygiene)
hygiene: false              # true = no bet (a standalone fix)
status: in_review           # ready | in_review | merged | shipped — DERIVED from the PR (#57), not hand-set
severity: P2                # P0 (prod down/data loss/security) | P1 (major broken) | P2 (degraded) | P3 (minor)
pr: <PR-URL or null>        # the fix PR — the delivery record the Jira item links
jira_key:                   # set by the projection (idempotent re-push pointer); leave blank
author: Engineer
created: YYYY-MM-DD
area_tags: []
---

# Fix: <short, symptom-first title>

## Classification (drives the Jira type)

- **type:** `bug` (something is broken) **→ Jira Bug** · or `enhancement` (new/changed behaviour) **→ Jira Story**
- **severity:** P0–P3 — <why>
- **placement:** bet `<BET-ID>` (projects under its Epic) · or `hygiene` (standalone in the backlog)

## Symptom & reproduction

<What the user observes. For a wrong-value bug: the **observed value**, the **source-of-truth value**, and the **delta** — from a real reproduction (`[reproduce-before-diagnose]`).>

## Root cause (vs symptom)

<The actual cause, not the surface symptom. Which candidate cause (stale-over-time / wrong-field / wrong-calculation) survived evidence.>

## The fix

<The minimum change. Link the failing regression test (`test: reproduce <bug>`, landed first) and the `fix: …` commit(s). Proportional to the symptom.>

## DRI log

<!-- Decisions / Risks / Issues per compass/templates/dri-log-section.md -->
