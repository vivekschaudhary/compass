<!-- WORKED EXAMPLE #3 (the shape test) — pm.draft-brief, derived from the live create-brief.md
     Step 2 spec (pm.md predates the task-block format). A DOC-AUTHORING task: writes a Confluence
     doc + a Jira epic, no code/PR. Shows the gates block holds when the deliverable is a document. -->
### Task: draft-brief
```gates
role:   pm
host:   claude
reads:  [research@docs, source-material@external, product@docs, ⟨promote-stub⟩ portfolio@docs]
writes: [brief@docs, epic@tickets, dri@docs]
pre:    foundation.product == approved && foundation.arch == approved && source.present
post:   brief.sections-complete && hypothesis.falsifiable && ~every-claim-cited ⟨pm⟩ && dri.count >= 1 && !self-approved
```
**Work** (the *how* — the brief-authoring methodology):
1. **Mode detection** — fresh (new bet from source) vs promote-stub (a `/create-bet-portfolio` stub).
2. Gather the source → draft the brief: problem · user · why-this-matters · hypothesis · primary metric · guardrails · measurement window · scope · architecture-required.
3. **Promote-stub:** keep the stub's frontmatter + hypothesis (do NOT re-derive), clear `portfolio_stub`, update the portfolio.
4. **Seed DRI** — ≥1 Decision.
5. Mirror to Jira (epic) / Confluence.
6. **HITL halt** — do NOT self-approve (Principle #16).

**Handoffs:** upstream `researcher.research` · downstream `human.approve-brief` → `delivery-manager.update-status`

## Refusal rules
- Do NOT self-approve the brief (a human approves).
- Do NOT draft without cited evidence (`skipped-researcher` — violates cite-or-mark-na).
- Do NOT mint a new bet for a slice of an existing one (`~request.new-capability` fails → `/create-story`).

<!-- ── SHAPE-TEST NOTES — a doc-authoring task in the same gates block ───────────
  · writes are @docs + @tickets (a doc + an epic), not code/PR. The block is identical to
    reviewer/triage-and-fix — only the artifacts + @systems differ. HELD.
  · post mixes MECHANICAL (brief.sections-complete · dri.count >= 1) with a checkable-spec predicate
    (hypothesis.falsifiable = has metric + threshold + window) and a JUDGMENT one (~every-claim-cited
    ⟨pm⟩). The three predicate classes coexist in one `post`.
  · !self-approved is a maker≠checker invariant expressed as a predicate — same shape as build/fix.
──────────────────────────────────────────────────────────────────────────────── -->
