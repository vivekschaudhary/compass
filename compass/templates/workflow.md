---
name: <workflow>                 # slug — matches the /command and this file's name
owner: <role>                    # the role that owns the workflow (see role.task vocab)
scope: foundation | epic | story | ticket
trigger: "/<workflow> <arg>"
status: active
version: 0.1.0

# ── ENTRY GATE ────────────────────────────────────────────────────────────
# Every predicate must hold or the workflow REFUSES. Nothing here is prose.
# Grammar:  <object>.<field> <op> <value>  ·  exists  ·  count == 0  ·  <x> == approved
#   object ∈ {epic, story, bet, pr, ci, host, run}    op ∈ {==, !=, >=, <=, >, <}
# Each line MAY carry `# else → /<workflow>` — the ONE next action that unblocks it.
requires:
  - <object>.<field> == <value>          # else → /<workflow>

# ── PRODUCES ──────────────────────────────────────────────────────────────
# End-state deliverables.  Format:  <artifact>@<system>: <end-state>
produces:
  - <artifact>@<system>: <end-state>
---

## Purpose
<1–2 lines: who does what, end to end. No methodology.>

## Dispatch graph
<!-- One row per role task, in order. THIS TABLE IS THE WORKFLOW — the read/write map
     and the gates are DERIVED from it. Fill every cell from the vocabulary at the bottom.
     · reads / writes  = `·`-separated `<artifact>@<system>` tokens  (a 2nd slot: code@file→scm)
     · ⟨…⟩             = a conditional step / read
     · gate            = a predicate (never prose) -->
| # | role.task | host | reads | writes | gate |
|---|-----------|------|-------|--------|------|
| 1 | <role>.<task> | <host> | <artifact>@<system> · … | <artifact>@<system> · … | <predicate> |
| N | human.<gate> | — | <artifact>@<system> | approval@tickets | approval == approved |

## Grounding & methodology
Canon: <[pattern] · [pattern]>  (full entries: the canon (removed — the rule is inlined here))
The *how* lives in the agent files — never here:
<role> → compass/agents/<role>.md#<task> · …

## Notes
<workflow-specific cross-agent patterns / edge cases ONLY. Anything reusable → canon.>

<!-- ════════════════════════════════════════════════════════════════════════
CONTROLLED VOCABULARY — the only values that may appear in the table + gates.
Author a workflow by filling `requires:` + the table from these sets. Nothing else changes.

@system  (the ADAPTER SLOT — a capability, NOT a product. Each slot resolves to a per-engagement
          configured provider; a workflow NEVER names the vendor. This IS the read/write-map tag.):
  file        framework canon + code (repo / worktree)
  db          the control-tower's own store                  (Supabase)
  docs        the docs adapter          → confluence | teams-sharepoint | notion
  tickets     the tickets adapter       → jira | linear | azure-boards
  scm         the source-control host   → github | gitlab | bitbucket
  ci          the CI adapter            → github-actions | gitlab-ci | …
  external    out-of-system input (SOW · GDrive · link · web · free text) — read-only source
  (a write landing in a 2nd slot uses →   e.g.  code@file→scm)

artifacts:
  research · brief · bet-arch · foundation-arch · design · copy ·
  story · tech-note · code · tests · pr · findings · dispute ·
  resolution · approval · status · dri · changelog

role.task  (the role's core primitive task — the atom of work):
  researcher.research
  enterprise-architect.foundation-architecture
  architect.bet-architecture · architect.tech-design
  pm.decompose · pm.draft-brief · pm.arbitrate-dispute
  product-owner.refine
  designer.design-spec · ux-writer.copy
  engineer.implement-story · engineer.respond-to-review · engineer.triage-and-fix · engineer.apply-ops-change
  automation.write-e2e-tests
  reviewer.review-pr · security-reviewer.review-pr-security · scanner.scan
  tech-writer.accumulate-changelog · tech-writer.update-docs
  gtm.launch-plan · sre.execute-change · support.classify-intake · support.triage-incident
  delivery-manager.update-status
  human.<gate>                    (HITL — a human decision; gate = approval == approved)
  orchestrator.<action>           (MECHANICAL — run-level, NOT a role task: open-pr · project-fix-record · run-checks; host = —)
  ci                              (external CI status, as a gate object)

host:  claude · codex · gemini · —(human/mechanical)
       reviewer + security-reviewer MUST be a non-implementer model (codex | gemini).

gate grammar:  <object>.<field> <op> <value>  ·  exists  ·  count == 0  ·  <x> == approved
  object ∈ {epic, story, bet, pr, ci, host, run}   e.g. host.tool_capable · run.pr_opened · run.fix_record_projected
  compose with &&   ·   prefix a conditional step/read with ⟨condition⟩

  MECHANICAL vs JUDGMENT predicate (the two-kinds-of-gate split):
    mechanical — directly computable: ci.green · count == 0 · == approved · run.pr_opened. The parser auto-checks it.
    judgment   — a role EVALUATES + records the verdict. Write it `~`-prefixed with the evaluator in ⟨⟩:
                 ~fix.proportional ⟨reviewer⟩ · ~regression-test.reproduces-symptom ⟨reviewer⟩ · ~copy.verbatim ⟨reviewer⟩
                 Resolves to a RECORDED decision, not an auto-check — the human/reviewer's job is to emit it.

TWO RULES:
  1. No cell is prose. Every read/write is <artifact>@<system>; every gate is a predicate.
  2. Methodology never appears here — it lives in the agent task named in the `role.task` cell.
════════════════════════════════════════════════════════════════════════ -->
