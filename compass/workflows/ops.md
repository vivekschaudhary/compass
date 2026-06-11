# Workflow: /ops

Non-code change. Infrastructure, dependency upgrades, config, secret rotation, CI/CD pipeline changes. **All ops treated equally** — full review discipline regardless of perceived risk. Can be bet-linked or hygiene.

## Trigger

`/ops <description>` or `/ops <ticket-link>`

## Process

### Phase 1 — classify

1. **Load Enterprise/Solution Architect agent context** (`compass/agents/enterprise-architect.md`, migrated v0.3.36 — has the `lead-ops-change` task) — leads
2. **Determine link:**
   - Bet-related (infra needed for a specific brief / story) → linked
   - Standalone hygiene (dep bump, CI fix, secret rotation, cert renewal) → standalone with `hygiene: true`
3. **Assess blast radius:**
   - Low: config tweak (lint rules, formatter)
   - Medium: dependency upgrade
   - High: secret rotation, IAM change, network change, infrastructure replacement
   - All treated equally — discipline holds regardless

### Phase 2 — plan

4. **Draft ops change** using `compass/templates/ops-change.md`:
   - Location:
     - Bet-linked: `docs/bets/<bet-id>/ops/<ops-id>.md`
     - Standalone: `docs/ops/<ops-id>.md`
   - Domain tag: `domain:database | domain:ci-cd | domain:secrets | domain:infra | ...`
   - Hygiene flag: `hygiene: true|false`
   - Blast radius assessment
   - Affected systems
   - **Rollback procedure (MANDATORY — explicit, testable, time-bounded)**
   - DRI Log
5. **HITL gate** — human reviews and approves plan

### Phase 3 — execute

6. **Engineer executes** the change (per Enterprise Architect's plan)
7. **Engineer opens PR** if change involves committed files (IaC, CI configs, package.json, etc.)
8. **CI runs**

### Phase 4 — review

9. **Codex reviews** every ops PR — full review (no shortcuts)
10. **Architect compliance check** for cross-system implications
11. **Security Reviewer (Codex)** auto-engages if change touches: secrets, IAM, network, auth, certs
12. **Engineer addresses findings**

### Phase 5 — merge & deploy

13. **HITL gate** — human approves merge
14. **Squash merge** + CI/CD runs deployment
15. **Verify rollback works** — test the rollback procedure (in non-prod first when possible)

### Phase 6 — post

16. **Status:** `shipped` on success, `deploy-failed` + alert on failure
17. **Tech Writer changelog** entry if user-impacting (e.g., dependency upgrade with API changes)
18. **DRI log** updated with execution outcome

## Cross-bet pull-out

Ops items get `domain:*` tags. `/metrics` can pull out a domain-focused view across all bets:
- "Show all `domain:database` ops in the last quarter"
- "Show all `domain:secrets` rotations"

This is the centralized-but-decentralized pattern you wanted.

## DRI logging

- **Decisions:** which ops change, why now, rollback strategy — rationale + reversibility
- **Risks:** outage, data loss, security exposure, vendor change — likelihood + impact + mitigation
- **Issues:** unclear blast radius, missing test environment, no rollback path — severity + owner

## Hygiene cron

Recurring hygiene (Renovate dep bumps, secret rotation, cert renewal) is owned by Enterprise/Solution Architect. Each run still goes through this workflow — no auto-merge even for "trivial" bumps.

## Discipline always

Full Codex review on every ops change. Full Security Reviewer engagement when applicable. Rollback plan mandatory. No fast path.
