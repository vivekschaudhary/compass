<!-- WORKED EXAMPLE #3 (the shape test) — the live `compass/workflows/create-brief.md` (v0.3.51)
     re-cut into workflow.md. An AUTHORING workflow: produces DOCS + an approval, no code / PR / GitHub.
     Confirms the template holds for doc-producing flows. Illustrative only; not the active file. -->
---
name: create-brief
owner: pm
scope: epic
trigger: "/create-brief <source | stub-bet-id>"
status: active
version: 0.4.0

requires:                                        # authoring — the gate is prior-doc approval + a source
  - foundation.product == approved               # else → /setup-product
  - foundation.arch == approved                  # else → /setup-foundation-architecture
  - source.present == true                        # a link · free text · portfolio stub  (else → provide a source)
  - epic.brief_status != drafted                 # else → /create-story or /create-bet-architecture (already drafted)
  - ~request.new-capability ⟨pm⟩                 # JUDGMENT: genuinely a new bet, not a slice → else /create-story <id>
produces:
  - research@docs: published
  - brief@docs: approved
  - epic@tickets: created
---

## Purpose
Researcher gathers cited evidence for a new bet; the PM shapes it into a brief; a human approves it. The shaped bet before any architecture or engineering.

## Dispatch graph
| # | role.task | host | reads | writes | gate |
|---|-----------|------|-------|--------|------|
| 1 | researcher.research | claude | source-material@external · product@docs | research@docs | evidence.cited(user-pain · competitive · moat) && dri.count >= 2 |
| 2 | pm.draft-brief | claude | research@docs · source-material@external · product@docs · ⟨promote-stub⟩ portfolio@docs | brief@docs · epic@tickets · dri@docs | brief.sections-complete && hypothesis.falsifiable && ~every-claim-cited ⟨pm⟩ |
| 3 | human.approve-brief | — | brief@docs | approval@tickets · brief.status@docs | approval == approved |
| 3m | orchestrator.promote-brief | — | approval@tickets | brief.status@docs | run.promoted (proposed → approved) |
| 4 | delivery-manager.update-status | claude | brief@docs | status@tickets | status.current && next-workflow.surfaced |

## Grounding & methodology
Canon: [working-backwards] · [lean-mvp] · [jtbd] · [shape-up] · [cite-or-mark-na] · [refuse-escalate] · [right-size-the-path-to-the-work].
The *how* lives in the agent files: researcher → compass/agents/researcher.md#research · pm → compass/agents/pm.md#draft-brief · delivery-manager → #update-status

## Notes
- **Two modes:** fresh (new bet from source) · promote-stub (fill a `/create-bet-portfolio` stub — keep the hypothesis, don't re-derive).
- **Not-a-slice gate** (`~request.new-capability`): a slice of an already-approved bet → `/create-story <id>`, NOT a new brief. This is a PM judgment, recorded.
- **Orchestrator promote** (mechanical): on approval, flips `brief.status` proposed → approved.

<!-- ── SHAPE-TEST NOTES — what an AUTHORING flow exercised, and whether the template held ──
  ✓ No code / PR / GitHub    → reads/writes are @docs · @external · @tickets only. The @system tags
                              cover a doc-producing flow with zero changes. HELD.
  ✓ Judgment-heavy gates     → ~request.new-capability ⟨pm⟩ (entry) · ~every-claim-cited ⟨pm⟩ (step) —
                              the Part-1 `~judgment ⟨evaluator⟩` convention carried them. VALIDATED.
  ✓ External source input    → source-material@external (SOW/GDrive/link/text). The Part-2 `@external`
                              addition covers it (same class as reviewer's primary-docs@web). VALIDATED.
  ✓ Orchestrator mechanical  → orchestrator.promote-brief step (host —), gate run.promoted. The Part-1
                              `orchestrator.<action>` + `run.*` object carried it. VALIDATED.
  So all three Part-1 refinements + the Part-2 @external addition were each exercised by this one flow.
──────────────────────────────────────────────────────────────────────────────────────────────── -->
