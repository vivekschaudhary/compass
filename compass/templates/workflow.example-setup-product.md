<!-- WORKED EXAMPLE #4 — the live `compass/workflows/setup-product.md` (v0.3.14) re-cut into
     workflow.md. The HEAD of the lifecycle: the foundational product bet — a page in @docs (Confluence/Teams), NOT a repo file.
     Seeded from the SOW / recommendation (the source input). Illustrative only; not the active file. -->
---
name: setup-product
owner: pm
scope: foundation
trigger: "/setup-product <sow | recommendation | source>"
status: active
version: 0.4.0

requires:                                        # foundation head — the gate is "no in-review foundation" + a source
  - foundation.product_status != proposed        # else → approve/reject the in-review product bet first
  - source.present == true                        # the SOW · recommendation · link · notes  (else → provide a source)
  - host.available(pm, researcher)                # ≥1 reachable host per phase (else → refuse + escalate)
produces:
  - research@docs: published
  - product@docs: approved                        # the foundational product bet
  - status@docs: current
---

## Purpose
Turn the SOW / recommendation into the foundational product bet — mission · personas · positioning · north-star · OKRs · moat · Access & Data posture — as a measurable, human-approved wager. Runs before `/setup-foundation-architecture`.

## Dispatch graph
| # | role.task | host | reads | writes | gate |
|---|-----------|------|-------|--------|------|
| 1 | researcher.research | claude | sow@external · recommendation@external | research@docs | evidence.cited(user-pain · competitive · moat) && moat.9-evaluated && dri.decision >= 1 && dri.risk >= 1 |
| 2 | pm.setup-product-foundation | claude | sow@external · recommendation@external · research@docs | product@docs · dri@docs | product.sections-complete && access-data-posture.populated && ~primary-moat-named ⟨pm⟩ && !self-approved |
| 3 | human.approve-product | — | product@docs | approval@tickets · product.status@docs | approval == approved |
| 3m | orchestrator.promote-product | — | approval@tickets | product.status@docs | run.promoted (proposed → approved) |
| 4 | delivery-manager.update-status | claude | product@docs | status@docs | status.current |

## Grounding & methodology
Canon: [working-backwards] · [lean-mvp] · [jtbd] · [shape-up] · [porter-5-forces] · [helmer-7-powers] · [okrs] · [north-star] · [cite-or-mark-na] · [elicitation-with-options] · [refuse-escalate].
The *how* lives in the agent files: researcher → compass/agents/researcher.md#research · pm → compass/agents/pm.md#setup-product-foundation · delivery-manager → #update-status

## Notes
- **Seed input = the SOW / recommendation** (`sow@external` · `recommendation@external`) — the foundation is drafted *from* what was committed to the client/product leader, not re-invented. (Mirrors the app's intake: SOW → engagement.)
- **Access & Data Posture** — three mandatory elicitations (auth posture · data sensitivity · regulatory regime): each populated OR `n/a — <reason>`. Empty fails (the gate `access-data-posture.populated`).
- **Amend mode:** an existing `approved` product bet → the PM supersedes it as a new version (v2) and drafts against it.
- **Orchestrator promote** (mechanical): on approval, flips `product.status` proposed → approved.

<!-- ── NOTES — same authoring shape as create-brief, one tier up (foundation vs bet) ──
  ✓ Seed from SOW/recommendation → source-material is `@external` (SOW · GDrive · link · text). HELD.
  ✓ Doc-producing + judgment gates (~primary-moat-named ⟨pm⟩) + orchestrator promote → all validated shapes.
  · host.available(pm, researcher) — a `host.*` gate object (Part-1 refinement) at the WORKFLOW tier,
    not just the task tier. Same object, workflow-level. HELD.
  · The live file has PM halt mid-task for Researcher output; the template orders researcher → pm
    (research FEEDS the draft) — same dependency, expressed as a clean linear graph. Consistent with create-brief.
──────────────────────────────────────────────────────────────────────────────────── -->
