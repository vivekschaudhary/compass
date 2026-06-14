# Workflow: /fix

Bug fix flow. Lighter than `/build` but full review discipline holds. Can be hygiene (no bet required) or bet-linked.

## Trigger

`/fix <ticket-id-or-link>` (pulls bug from Jira/Linear via MCP)
OR
`/fix <free text>` (text description of the bug)

## Process

### Phase 1 — triage (Support)

1. **Load Support agent context** (`compass/agents/support.md`, migrated v0.3.31)
2. **Reproduce** the bug. If not reproducible → ask reporter for more info.
3. **Classify severity** P0 / P1 / P2 / P3
4. **Check for duplicates** in ticketing system
5. **Identify affected bet(s):**
   - If bug is in code from a known bet → link to that bet
   - If cross-bet bug → link to multiple bets (counted in each bet's defect metrics)
   - If genuine hygiene (e.g., dep-induced bug with no product origin) → tag `hygiene: true`
6. **Decide:** L1 resolution (close with answer) OR escalate to Engineer
7. **Draft triage note** using `compass/templates/triage-note.md`:
   - If linked to a bet: `docs/bets/<bet-id>/stories/<story-id>/fixes/<fix-id>.md` (best — under the affected story)
   - If linked to a bet but unclear story: `docs/bets/<bet-id>/fixes/<fix-id>.md`
   - If hygiene/standalone: `docs/fixes/<fix-id>.md` with `hygiene: true`
8. **Acknowledge reporter** via configured channel
9. **HITL gate:** human confirms triage classification before escalation (in `milestones` mode)

### Phase 2 — fix (Engineer)

10. **Load Engineer agent context** (`compass/agents/engineer.md`, migrated v0.3.14 — has the `fix-bug` task)
11. **Engineer reads triage note + bet context** (brief, architecture, affected story)
12. **Write failing regression test FIRST** (first commit: `test: reproduce <bug>`)
13. **Implement fix** (subsequent commits: `fix: <description>`)
14. **Tag test cases:**
    - `regression: true`
    - `e2e: true|false`
15. **Run all checks locally**

### Phase 3 — Automation E2E + review

16. **Automation extends E2E coverage** (`automation.write-e2e-tests`) if user-flow regression — incl. the per-surface auth→authz(RLS)→render vertical test (`[per-surface-vertical-test]`) for any data surface the fix touches
17. **Engineer opens PR** linking triage note + affected bet(s)
18. **CI green → Codex reviews** — full review (no shortcuts even for tiny fixes)
19. **Architect compliance check** — bet architecture still respected after fix
20. **Security review** — auto if applicable
21. **Engineer addresses findings**

### Phase 4 — merge & comms

22. **HITL approves merge**
23. **Squash merge → CI/CD deploys**
24. **If deploy succeeds:** fix status → `shipped`
25. **Tech Writer adds changelog entry** under `### Fixed` (if user-visible)
26. **Support communicates resolution** to original reporter
27. **Cross-bet attribution:** if fix touched multiple bets, each bet's defect counter increments
28. **If post-merge bug recurs:** reopen, don't create new fix (it wasn't fixed right)

## Promotion to deeper work

If Engineer or Architect discovers the bug is symptomatic of a deeper architectural issue:
- Ship the symptom fix (this PR)
- Run `/create-brief` for root-cause work as a tech-debt bet
- Link the symptom fix to the new bet in DRI log
- Architect review prevents accumulated symptom fixes from becoming silent tech debt

## DRI logging

- **Decisions:** severity classification, scope of fix, whether to escalate to deeper work — rationale
- **Risks:** of regression in other areas, of incomplete fix — likelihood + impact
- **Issues:** unclear root cause, missing reproduction — severity + owner

## Discipline always

Same as `/build`: full review, full Architect compliance, full security review if applicable. No hotfix exceptions.
