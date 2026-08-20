<!-- DOC-TREE — the workspace document structure Compass scaffolds for an engagement (Confluence
     space or Teams/SharePoint library). This file is the DEFAULT, and the SOURCE OF TRUTH for it:
     edit the rows to change the structure every NEW engagement starts with.

     Per-engagement refinement: at kickoff (Sprint 0, ticket "Connect systems of record") the intake
     seeds a COPY of this table into the engagement's own `doc_tree_spec`. The user refines that copy
     (add / remove / rename nodes) and approves it; the APPROVED copy is what gets created. So the
     default here flows to new engagements, while existing engagements keep their refined structure
     (`[sprint-0-materializes-refinable-defaults]`, canon). Vocab (kind · provider slots):
     compass/templates/workflow.md. -->
---
name: doc-tree
title: Workspace document structure
trigger: engagement created (intake) → seeded per-engagement, refined, then scaffolded on approve
creates: one node per row below, into the wired docs provider (confluence | teams-sharepoint)
---

# Workspace doc tree — default

The folder/page structure every engagement's workspace starts with. `kind`:
- **folder** — a container (SharePoint folder; on Confluence, a parent page — Confluence has no folders).
- **doc** — a content page/file, body seeded by Compass.
- **template** — a reusable page/file template (e.g. the sprint-review form).

`parent` is another row's `path`, or `—` for a top-level node. Rows are created in `#` order so a
parent always precedes its children.

## Nodes  (seeded per-engagement at kickoff)
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

## Notes
- **This table is the default — and load-bearing.** The intake creates whatever rows are here
  (data-driven; no code change to add a node). Editing a row changes what NEW engagements start with.
- **Refinable per engagement.** The seeded copy lives in `doc_tree_spec` and is edited/approved before
  folders are created — so an engagement can diverge from this default without changing it.
- **Provider-agnostic.** The same tree renders as Confluence pages or SharePoint folders/files via the
  wired docs adapter. `template` nodes carry a reusable body (e.g. the sprint-review form).
- **Body content** for `doc`/`template` nodes is generated at scaffold time (per-node). Richer,
  spec-defined bodies (incl. landing the full SOW in `02-scope/sow`) are a planned follow-up.
