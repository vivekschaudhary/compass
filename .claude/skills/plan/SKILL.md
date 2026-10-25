---
name: plan
description: Refresh the living project plan (docs/foundation/plan.md) — derived from current per-bet artifacts. Run manually after brief/architecture approval or build PR merge, or via cron per compass/config.yaml. Project Manager owns it. Requires portfolio approved.
---

Execute the workflow at `compass/archive/workflows/plan.md`.

Read that workflow file now and follow it step by step. Load the role context files it references when entering each phase. Respect HITL gates per `compass/config.yaml` (note: `/plan` itself has no HITL gate; it reflects upstream decisions). Log decisions, risks, and issues to artifact DRI sections per `compass/templates/dri-log-section.md`.

$ARGUMENTS
