---
name: triage
description: Front-door intake router. Classify ANY incoming item (incident · bug · enhancement · problem · change · service request · not-an-issue) and route it — incidents handled inline, everything else hands off to /fix, /create-brief, or /ops. Human confirms the route.
---

Execute the workflow at `compass/workflows/triage.md`.

**This is the front door for ALL intake, not just incidents.** Step 1 (`support.classify-intake`) classifies the item into its ITIL category by observed impact/urgency — do NOT assume it is an incident or wait for incident details. Most items are bugs / enhancements / changes that route elsewhere; the incident branch is only one of several routes.

Read that workflow file now and follow it step by step. Load the role context files it references when entering each phase. Respect HITL gates per `compass/config.yaml`. Log decisions, risks, and issues to artifact DRI sections per `compass/templates/dri-log-section.md`.

$ARGUMENTS
