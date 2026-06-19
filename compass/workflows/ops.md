---
name: ops
status: active
owner: enterprise-architect
auto_invokes: []
invoked_by: [manual, triage]
version: 0.3.45
requires_approved: []
---

# Workflow: /ops

## Framework grounding

- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [mechanical-output-verification] · [role-boundary] · [agent-handoff] · [refuse-escalate]
- **Verifies adherence to:** Principle #14 · Principle #16 · mandatory-rollback discipline (every ops change has an explicit, tested rollback) · all-ops-treated-equally (no risk-based fast path)

## Purpose

Non-code change — infrastructure, dependency upgrades, config, secret rotation, CI/CD pipeline changes. **All ops treated equally**: full review discipline regardless of perceived risk. Can be bet-linked or hygiene. **Rollback plan is mandatory.**

## Architectural shape (v0.3.45)

Thin dispatch graph per `[workflow-as-dispatch-graph]` (canon v0.3.24); 8th workflow in dispatch-graph shape. Methodology lives in the agent tasks (`enterprise-architect.lead-ops-change`, `engineer.apply-ops-change`, `reviewer.review-pr`, `engineer.respond-to-review`, `tech-writer.accumulate-changelog`).

## Preconditions (workflow-level GATE)

- **Trigger present** — `/ops <description>` or `/ops <ticket-link>`.
- **No `requires_approved` gate** — ops is reactive and may be standalone hygiene (dep bump, cert renewal); bet-linkage is determined during classification.

## Roles invoked (agents dispatched)

- `compass/agents/enterprise-architect.md` — `lead-ops-change` (classify, blast radius, plan, mandatory rollback) — leads
- `compass/agents/engineer.md` — `apply-ops-change` (execute per plan, test rollback) + `respond-to-review`
- `compass/agents/reviewer.md` — `review-pr` (+ `security-reviewer.review-pr-security` auto-engages on secrets/IAM/network/auth/certs)
- `compass/agents/tech-writer.md` — `accumulate-changelog` (if user-impacting)

## Dispatch graph

### Step 1. `enterprise-architect.lead-ops-change` (Enterprise Architect agent owns)

**Dispatches:** Enterprise Architect agent
**Task definition:** `compass/agents/enterprise-architect.md` → Task `lead-ops-change`
**Input:** ops description / ticket · `docs/foundation/architecture.md` · affected bet/system context
**What it covers:** classify the change (additive / amendment / emergency) → determine bet-link vs standalone hygiene → assess blast radius (`[cross-artifact-sweep-on-contract-shift]`) → draft the ops-change doc (`compass/templates/ops-change.md`) with domain tag, affected systems, and a **mandatory, explicit, testable, time-bounded rollback procedure** → DRI seed.
**Output:** ops-change doc (`docs/ops/<ops-id>.md` or `docs/bets/<bet-id>/ops/<ops-id>.md`), `status: proposed`

### Step 2. **HITL gate — plan approved** (human)

**Dispatches:** HUMAN (not an agent)
**What it covers:** human reviews the ops-change plan — blast radius, affected systems, and especially the **rollback procedure** — and approves before any execution. Reject → re-plan. **Per Principle #16:** nothing executes on an unapproved ops plan. _(No fixed artifact target: the ops-id path is dynamic; this gate approves the plan, it does not promote a fixed canonical artifact.)_

### Step 3. `engineer.apply-ops-change` (Engineer agent owns)

**Dispatches:** Engineer agent
**Task definition:** `compass/agents/engineer.md` → Task `apply-ops-change`
**What it covers:** apply the change exactly per the approved plan (no improvised scope) → open a PR if committed files change (IaC, CI configs, `package.json`, lockfiles) → **test the rollback procedure** (non-prod first when possible) → run CI/build + `[mechanical-output-verification]`. Halts for Reviewer; does NOT self-review.
**Output:** executed change + tested rollback; PR if committed files changed

### Step 4. `reviewer.review-pr` (Reviewer agent owns)

**Dispatches:** Reviewer agent (`preferred_hosts: [codex, gemini]` — excludes Claude)
**Task definition:** `compass/agents/reviewer.md` → Task `review-pr`
**What it covers:** full review of every ops PR, no shortcuts → cross-system / Architect-compliance implications → categorize findings.
**Auto-engagement (parallel):** Security Reviewer (`compass/agents/security-reviewer.md` → `review-pr-security`) if the change touches secrets / IAM / network / auth / certs.

### Step 5. `engineer.respond-to-review` (Engineer agent owns)

**Dispatches:** Engineer agent
**Task definition:** `compass/agents/engineer.md` → Task `respond-to-review`
**What it covers:** address findings OR `## Dispute` (PM arbitrates). Loop with Step 4 until clean.

### Step 6. **HITL gate — approve merge** (human)

**Dispatches:** HUMAN (not an agent)
**What it covers:** human approves merge after CI green + zero unresolved BLOCKERs/CRITICALs. Squash merge → CI/CD deploys → status `shipped` (or `deploy-failed` + alert). Rollback already verified in Step 3.

### Step 7. `tech-writer.accumulate-changelog` (Tech Writer agent owns)

**Dispatches:** Tech Writer agent
**Task definition:** `compass/agents/tech-writer.md` → Task `accumulate-changelog`
**What it covers:** changelog entry if user-impacting (e.g., dependency upgrade with API changes) → ops-change doc DRI updated with execution outcome.

## Workflow-level verification (final GATE)

- [ ] (Step 1) Ops-change doc exists with domain tag, blast radius, affected systems, and an explicit **rollback procedure**; DRI seeded
- [ ] (Step 2) HITL plan approval recorded (not self-approved); nothing executed before it
- [ ] (Step 3) Change applied per plan (no scope drift); **rollback tested** + result recorded; PR open if committed files changed
- [ ] (Step 4) Full Reviewer pass; Security Reviewer engaged if secrets/IAM/network/auth/certs; zero unresolved BLOCKERs/CRITICALs
- [ ] (Step 6) HITL merge approval
- [ ] (Step 7) Changelog if user-impacting; DRI updated with outcome
- [ ] **All-ops-treated-equally** — no risk-based fast path taken; rollback mandatory

## Output summary contract

**TL;DR** (change / blast radius / status) · **Files created/modified** · **Next recommended command** · **Open questions/risks**.

## Notes

**Cross-bet pull-out:** ops items carry `domain:*` tags (`domain:database | domain:ci-cd | domain:secrets | domain:infra | …`); `/metrics` pulls a domain-focused view across all bets (e.g., "all `domain:secrets` rotations this quarter").

**Hygiene cron:** recurring hygiene (Renovate dep bumps, secret rotation, cert renewal) is EA-owned; each run still goes through this full workflow — no auto-merge even for "trivial" bumps.

**Discipline always:** full Reviewer pass on every ops change, Security Reviewer when applicable, rollback mandatory, no fast path.

### Migration (legacy prose → v0.3.45 dispatch graph)

- **Pre-v0.3.45:** 6-phase embedded-methodology prose (18 numbered steps).
- **v0.3.45:** thin dispatch graph (8th in dispatch-graph shape). Methodology moved INTO agent tasks — new `engineer.apply-ops-change` task added (execute per approved plan + test rollback); `enterprise-architect.lead-ops-change` already existed. No behavior dropped (mandatory tested rollback, all-ops-equal, security auto-engage, domain tags, hygiene-cron-still-reviewed all preserved). `[explicit-dispatch-surfaces-latent-participation]`: confirmed reviewer/tech-writer/security-reviewer `ops` participation (already in frontmatter).
