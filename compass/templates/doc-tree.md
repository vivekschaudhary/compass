<!-- DOC-TREE — the workspace document structure of an engagement. This file is the SOURCE OF TRUTH
     for which document paths exist: add a row to declare a new one.

     What the app does with it today: the seed importer (app/app/lib/import/store.ts) treats every
     non-folder row as a DECLARED document path, so a workflow step may produce or read a path listed
     here before any document exists at it. That is what lets a new document and the step that reads
     it land in one commit.

     What it no longer does: v1's intake seeded a per-engagement copy of this table into
     `doc_tree_spec`, let the user refine and approve it, and scaffolded the approved copy into
     Confluence or SharePoint. That path was deleted with v1; nothing seeds, refines or scaffolds from
     this file now. Vocab (kind · provider slots): compass/templates/workflow.md. -->
---
name: doc-tree
title: Workspace document structure
trigger: read by the seed importer as the catalogue of declared document paths
creates: nothing on its own — declares the paths workflow steps may produce and read
---

# Workspace doc tree — default

The folder/page structure of an engagement's workspace. `kind`:
- **folder** — a container (SharePoint folder; on Confluence, a parent page — Confluence has no folders).
- **doc** — a content page/file.
- **template** — a reusable page/file template (e.g. the sprint-review form).

`parent` is another row's `path`, or `—` for a top-level node. Keep rows in `#` order so a parent
always precedes its children.

## Nodes
| # | path | title | kind | parent |
|---|------|-------|------|--------|
| 1 | 00-overview | 00 · Overview | doc | — |
| 2 | 01-foundation | 01 · Foundation | folder | — |
| 3 | 01-foundation/product-brief | Product brief | doc | 01-foundation |
| 4 | 01-foundation/foundational-architecture | Foundational architecture | doc | 01-foundation |
| 5 | 01-foundation/ways-of-working | Ways of working | doc | 01-foundation |
| 6 | 02-scope | 02 · Scope & SOW | folder | — |
| 7 | 02-scope/sow | SOW (source) | doc | 02-scope |
| 8 | 02-scope/deliverables | Deliverables (guardrails) | doc | 02-scope |
| 9 | 03-delivery | 03 · Delivery | folder | — |
| 10 | 03-delivery/briefs | Briefs | folder | 03-delivery |
| 11 | 03-delivery/architecture | Architecture | folder | 03-delivery |
| 12 | 04-governance | 04 · Governance | folder | — |
| 13 | 04-governance/decisions | Decisions (DRI log) | doc | 04-governance |
| 14 | 04-governance/change-requests | Change requests | doc | 04-governance |
| 15 | 04-governance/status | Status & checkpoints | doc | 04-governance |
| 16 | 05-cadence | 05 · Cadence & ceremonies | folder | — |
| 17 | 05-cadence/sprint-reviews | Sprint reviews / demos | folder | 05-cadence |
| 18 | 05-cadence/sprint-reviews/template | Sprint review — template | template | 05-cadence/sprint-reviews |
| 19 | 05-cadence/retros | Retros | folder | 05-cadence |
| 20 | 05-cadence/standups | Standup notes | folder | 05-cadence |
| 21 | 01-foundation/team | Engagement roster | doc | 01-foundation |
| 22 | 03-delivery/plan | Delivery plan | doc | 03-delivery |
| 23 | 02-scope/timeline | Timeline & milestones | doc | 02-scope |
| 24 | 01-foundation/raci | Roles & responsibilities | doc | 01-foundation |
| 25 | 05-cadence/sprint-plans | Sprint plans | folder | 05-cadence |
| 26 | 01-foundation/design-library | Design library | doc | 01-foundation |
| 27 | 05-cadence/kickoff | Kickoff | doc | 05-cadence |
| 28 | 02-scope/business-requirements | Business requirements (as supplied) | doc | 02-scope |
| 29 | 02-scope/features | Features (the bets) | folder | 02-scope |

## Notes
- **Load-bearing.** Every non-folder row is a declared document path: the seed importer accepts a
  workflow step that produces or reads it. Removing a row that a step still references makes the
  import refuse that step.
- **Not scaffolded.** Nothing creates these folders or pages from this table today. v1's intake did,
  through a refinable per-engagement copy in `doc_tree_spec`; that went with v1.
- **Provider-agnostic.** Paths are the same whether the engagement's docs live in Confluence or
  SharePoint; the wired docs adapter maps them.
