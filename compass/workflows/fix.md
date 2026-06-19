---
name: fix
status: active
owner: support
auto_invokes: []
invoked_by: [manual, triage]
version: 0.3.45
requires_approved: []
---

# Workflow: /fix

## Framework grounding

- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [per-surface-vertical-test] (v0.3.43) · [role-boundary] · [agent-handoff] · [refuse-escalate]
- **Verifies adherence to:** Principle #14 · Principle #16 · no-hotfix-exception discipline (full review holds for every fix)

## Purpose

Bug-fix flow — lighter than `/build` but **full review discipline holds** (no hotfix carve-out). Can be **hygiene** (no bet) or **bet-linked**. Regression test lands before the fix.

## Architectural shape (v0.3.45)

Thin dispatch graph per `[workflow-as-dispatch-graph]` (canon v0.3.24); 7th workflow in dispatch-graph shape. Methodology lives in the agent tasks (`support.triage-bug`, `engineer.fix-bug`, `automation.write-e2e-tests`, `reviewer.review-pr`, `engineer.respond-to-review`, `tech-writer.accumulate-changelog`).

## Preconditions (workflow-level GATE)

- **Trigger present** — `/fix <ticket-id-or-link>` (pull from Jira/Linear via MCP) OR `/fix <free text>`.
- **No `requires_approved` gate** — a fix is reactive; it does NOT require an approved brief (hygiene fixes have no bet). Bet-linkage is determined during triage.

## Roles invoked (agents dispatched)

- `compass/agents/support.md` — `triage-bug` (reproduce, classify, route) + resolution comms
- `compass/agents/engineer.md` — `fix-bug` (regression test first) + `respond-to-review`
- `compass/agents/automation.md` — `write-e2e-tests` (extend E2E if user-flow regression)
- `compass/agents/reviewer.md` — `review-pr` (+ `security-reviewer.review-pr-security` auto-engages on sensitive surfaces)
- `compass/agents/tech-writer.md` — `accumulate-changelog` (if user-visible)

## Dispatch graph

### Step 1. `support.triage-bug` (Support agent owns)

**Dispatches:** Support agent
**Task definition:** `compass/agents/support.md` → Task `triage-bug`
**Input:** ticket / free-text bug report · ticketing system (for duplicates) · bet context
**What it covers:** reproduce (or request more info) → classify severity P0–P3 → check duplicates → identify affected bet(s) or tag `hygiene: true` → decide L1-resolve vs escalate → draft triage note (`compass/templates/triage-note.md`) at the bet/story/hygiene-appropriate path → acknowledge reporter.
**Output:** triage note (`docs/bets/<bet-id>/stories/<story-id>/fixes/<fix-id>.md`, or `docs/bets/<bet-id>/fixes/<fix-id>.md`, or `docs/fixes/<fix-id>.md` for hygiene)

### Step 2. **HITL gate — triage confirmed** (human)

**Dispatches:** HUMAN (not an agent)
**What it covers:** human confirms the triage classification (severity, bet-linkage/hygiene, escalate-vs-L1) before Engineer is dispatched (in `milestones` mode). Reject → re-triage. **Per Principle #16:** Support must not self-escalate past a wrong classification. _(No artifact target: the fix-id path is dynamic; this gate confirms classification, it does not promote a fixed canonical artifact.)_

### Step 3. `engineer.fix-bug` (Engineer agent owns)

**Dispatches:** Engineer agent
**Task definition:** `compass/agents/engineer.md` → Task `fix-bug`
**What it covers:** read triage note + bet context → **failing regression test FIRST** (`test: reproduce <bug>`) → minimum fix (`fix: …`) → tag tests → run ALL local checks + `[mechanical-output-verification]` → `[per-surface-vertical-test]` flag if a data surface is touched → pre-PR contract-shift sweep → open PR linking the triage note. Halts for Reviewer; does NOT self-review.
**Output:** PR with regression-test-first commit order

### Step 4. `automation.write-e2e-tests` (Automation agent owns)

**Dispatches:** Automation agent
**Task definition:** `compass/agents/automation.md` → Task `write-e2e-tests`
**What it covers:** if the fix addresses a user-flow regression, extend E2E coverage — incl. the per-surface auth→authz(RLS)→render vertical test + test-data cleanup for any data surface the fix touches. Skip (logged) if the fix has no user-flow surface.

### Step 5. `reviewer.review-pr` (Reviewer agent owns)

**Dispatches:** Reviewer agent (`preferred_hosts: [codex, gemini]` — excludes Claude)
**Task definition:** `compass/agents/reviewer.md` → Task `review-pr`
**What it covers:** full review, no shortcuts even for tiny fixes → bet-architecture compliance still holds after the fix → categorize findings.
**Auto-engagement (parallel):** Security Reviewer (`compass/agents/security-reviewer.md` → `review-pr-security`) if the fix touches auth/PII/payments/secrets/external input/sessions.

### Step 6. `engineer.respond-to-review` (Engineer agent owns)

**Dispatches:** Engineer agent
**Task definition:** `compass/agents/engineer.md` → Task `respond-to-review`
**What it covers:** address findings OR `## Dispute` (PM arbitrates). Loop with Step 5 until clean.

### Step 7. **HITL gate — approve merge** (human)

**Dispatches:** HUMAN (not an agent)
**What it covers:** human approves merge after CI green + zero unresolved BLOCKERs/CRITICALs. Squash merge → CI/CD deploys → fix status `shipped` (or `deploy-failed` + alert).

### Step 8. `tech-writer.accumulate-changelog` (Tech Writer agent owns)

**Dispatches:** Tech Writer agent
**Task definition:** `compass/agents/tech-writer.md` → Task `accumulate-changelog`
**What it covers:** changelog entry under `### Fixed` if user-visible → Support communicates resolution to the reporter → cross-bet defect attribution (each touched bet's counter increments). **If a post-merge bug recurs: reopen the fix, don't open a new one** (it wasn't fixed right).

## Workflow-level verification (final GATE)

- [ ] (Step 1) Triage note exists at the correct path; severity + bet-linkage/hygiene classified; reporter acknowledged
- [ ] (Step 3) **Failing regression test landed BEFORE the fix** (visible in commit order); minimum fix; all local checks + runtime artifact green
- [ ] (Step 4) E2E extended for user-flow regressions (vertical test + cleanup AC for data surfaces) OR skip logged
- [ ] (Step 5) Full Reviewer pass; Security Reviewer engaged if sensitive surface; zero unresolved BLOCKERs/CRITICALs
- [ ] (Step 7) HITL merge approval (not self-approved)
- [ ] (Step 8) Changelog entry if user-visible; reporter informed; cross-bet attribution recorded
- [ ] **No hotfix exception taken** — full review held regardless of severity

## Output summary contract

**TL;DR** (what broke / fix shipped / status) · **Files created/modified** · **Next recommended command** · **Open questions/risks**.

## Notes

**Promotion to deeper work:** if the bug is symptomatic of an architectural root, ship the symptom fix (this PR) AND run `/create-brief` for root-cause work as a tech-debt bet, linking the symptom fix in DRI. Architect review prevents accumulated symptom fixes from becoming silent tech debt.

**Discipline always:** full review, full Architect compliance, full security review when applicable — no hotfix exceptions.

### Migration (legacy prose → v0.3.45 dispatch graph)

- **Pre-v0.3.45:** 4-phase embedded-methodology prose (28 numbered steps).
- **v0.3.45:** thin dispatch graph (7th in dispatch-graph shape). Methodology moved INTO agent tasks — `engineer.fix-bug` rewritten from a v0.3.14 stub to a self-sufficient gate/work/postcondition task; all other tasks already existed. No behavior dropped (regression-test-first, full review, no-hotfix-exception, promotion-to-deeper-work, cross-bet attribution all preserved). `[explicit-dispatch-surfaces-latent-participation]`: the refactor surfaced reviewer / tech-writer / security-reviewer `fix` participation (added to `participates_in_workflows`).
