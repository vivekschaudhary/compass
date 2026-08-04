---
name: create-product-brief
description: Create the engagement's product brief (PM + Researcher) as a page in the docs system, gated by two Jira approval tickets. Head of the lifecycle — run before the MVP plan and any epic.
---

Execute the workflow at `compass/workflows/create-product-brief.md`.

Read that workflow file now and follow it step by step. Load the agent file named by each step (`compass/agents/researcher.md`, `compass/agents/pm.md`, `compass/agents/delivery-manager.md`) when entering it.

**This workflow is docs-primary.** The research page and the product brief live in the engagement's docs system (`connectors.docs`), under a per-engagement parent page. **Nothing is written to the project repo** — no file, no stub, no cache. If the docs system or Jira cannot be reached, REFUSE; never fall back to a local file.

**Two human gates, two tickets.** Step 2 gates on the research-review ticket; step 4 gates on the product-brief-approval ticket. Approval means the ticket reaches Jira's `done` status category. Never self-approve.

**Elicit, don't infer.** On any material unknown — always including auth posture, data sensitivity, and regulatory regime — stop and ask with 3 concrete options plus "Other (specify)", and record the answer verbatim.

Log decisions, risks, and issues to artifact DRI sections per `compass/templates/dri-log-section.md`.

$ARGUMENTS
