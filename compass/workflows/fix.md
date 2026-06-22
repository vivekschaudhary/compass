---
name: fix
status: active
owner: engineer
auto_invokes: []
invoked_by: [manual, triage]
version: 0.3.50
requires_approved: []
---

# Workflow: /fix

## Framework grounding

- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [per-surface-vertical-test] (v0.3.43) · [role-boundary] · [agent-handoff] · [refuse-escalate] · [ai-collapses-org-tiering] (candidate, v0.3.50 — 1st instance)
- **Verifies adherence to:** Principle #14 · Principle #16 · no-hotfix-exception discipline (full review holds for every fix) · maker ≠ checker (the fixer never reviews its own diff)

## Purpose

Bug-fix flow — lighter than `/build` but **full review discipline holds** (no hotfix carve-out). Can be **hygiene** (no bet) or **bet-linked**. **One tool-capable agent reproduces, diagnoses, and fixes** — it triages from the code, not from interrogating the user. Regression test lands before the fix; an independent (different-model) reviewer always checks it.

## Architectural shape (v0.3.50 — the ITIL-tier collapse)

Thin dispatch graph per `[workflow-as-dispatch-graph]` (canon v0.3.24); 7th workflow in dispatch-graph shape. Methodology lives in the agent tasks (`engineer.triage-and-fix`, `automation.write-e2e-tests`, `reviewer.review-pr`, `engineer.respond-to-review`, `tech-writer.accumulate-changelog`).

**Retro #022 collapse (`[ai-collapses-org-tiering]`, 1st instance):** the old `support.triage-bug → HITL(triage confirm) → engineer.fix-bug` L1/L2→L3 escalation is **removed**. In the AI world the "expensive engineer you protect" is an agent that reads the code instantly, so a repo-blind support triage that interrogates the user then escalates is ceremony. `engineer.triage-and-fix` now owns reproduce + diagnose + severity itself. **What's kept (not tiering):** front-door routing (`/triage`), **maker ≠ checker** (a different-model Reviewer + Security Reviewer + the response loop), and the HITL merge gate.

## Preconditions (workflow-level GATE)

- **Trigger present** — `/fix <ticket-id-or-link>` (pull from Jira/Linear via MCP) OR `/fix <free text>` OR a `bug` route handed off from `/triage`.
- **No `requires_approved` gate** — a fix is reactive; it does NOT require an approved brief (hygiene fixes have no bet). Bet-linkage is determined during the engineer's triage.

## Roles invoked (agents dispatched)

- `compass/agents/engineer.md` — `triage-and-fix` (reproduce-from-code → diagnose → regression test first → fix) + `respond-to-review`
- `compass/agents/automation.md` — `write-e2e-tests` (extend E2E if user-flow regression)
- `compass/agents/reviewer.md` — `review-pr` (+ `security-reviewer.review-pr-security` auto-engages on sensitive surfaces)
- `compass/agents/tech-writer.md` — `accumulate-changelog` (if user-visible) + reporter resolution comms

## Dispatch graph

### Step 1. `engineer.triage-and-fix` (Engineer agent owns)

**Dispatches:** Engineer agent (tool-capable host — it reads + runs the real code)
**Task definition:** `compass/agents/engineer.md` → Task `triage-and-fix`
**Input:** ticket / free-text bug report (or a `/triage` route's classification) · the project source · bet context if bet-linked
**What it covers:** **triage from the code** — reproduce by reading + running the actual source (don't interrogate the user for what the code shows) → classify severity P0–P3 → check duplicates → identify affected bet(s) or tag `hygiene: true`. `[refuse-escalate]` (refined): reproduce from code first; ask the human only for what code can't reveal (prod data, account state, credentials); **if still irreproducible, HALT with a precise ask — don't fix blind**. Then: **failing regression test FIRST** (`test: reproduce <bug>`) → minimum fix (`fix: …`) → run ALL local checks + `[mechanical-output-verification]` → `[per-surface-vertical-test]` flag if a data surface is touched → pre-PR `[cross-artifact-sweep-on-contract-shift]` → open PR with a short **triage summary** (severity · repro · root-cause vs symptom). Halts for Reviewer; does NOT self-review.
**Output:** PR with regression-test-first commit order + triage summary

### Step 2. `automation.write-e2e-tests` (Automation agent owns)

**Dispatches:** Automation agent
**Task definition:** `compass/agents/automation.md` → Task `write-e2e-tests`
**What it covers:** if the fix addresses a user-flow regression, extend E2E coverage — incl. the per-surface auth→authz(RLS)→render vertical test + test-data cleanup for any data surface the fix touches. Skip (logged) if the fix has no user-flow surface.

### Step 3. `reviewer.review-pr` (Reviewer agent owns)

**Dispatches:** Reviewer agent (`preferred_hosts: [codex, gemini]` — excludes Claude; **maker ≠ checker**)
**Task definition:** `compass/agents/reviewer.md` → Task `review-pr`
**What it covers:** full review, no shortcuts even for tiny fixes → bet-architecture compliance still holds after the fix → categorize findings.
**Auto-engagement (parallel):** Security Reviewer (`compass/agents/security-reviewer.md` → `review-pr-security`) if the fix touches auth/PII/payments/secrets/external input/sessions.

### Step 4. `engineer.respond-to-review` (Engineer agent owns)

**Dispatches:** Engineer agent
**Task definition:** `compass/agents/engineer.md` → Task `respond-to-review`
**What it covers:** address findings OR `## Dispute` (PM arbitrates). Loop with Step 3 until clean.

### Step 5. **HITL gate — approve merge** (human)

**Dispatches:** HUMAN (not an agent)
**What it covers:** the human reviews the fix + triage summary and approves merge after CI green + zero unresolved BLOCKERs/CRITICALs. (This is the single human gate — severity/bet-linkage are in the engineer's triage summary, confirmed here rather than at a separate pre-fix gate.) Squash merge → CI/CD deploys → fix status `shipped` (or `deploy-failed` + alert).

### Step 6. `tech-writer.accumulate-changelog` (Tech Writer agent owns)

**Dispatches:** Tech Writer agent
**Task definition:** `compass/agents/tech-writer.md` → Task `accumulate-changelog`
**What it covers:** changelog entry under `### Fixed` if user-visible → resolution communicated to the reporter → cross-bet defect attribution (each touched bet's counter increments). **If a post-merge bug recurs: reopen the fix, don't open a new one** (it wasn't fixed right).

## Workflow-level verification (final GATE)

- [ ] (Step 1) Defect **reproduced from the code** (or HALTED with a precise ask if irreproducible) · severity + bet-linkage/hygiene classified in the triage summary · **failing regression test landed BEFORE the fix** (visible in commit order) · minimum fix · all local checks + runtime artifact green
- [ ] (Step 2) E2E extended for user-flow regressions (vertical test + cleanup AC for data surfaces) OR skip logged
- [ ] (Step 3) Full Reviewer pass by a **different model**; Security Reviewer engaged if sensitive surface; zero unresolved BLOCKERs/CRITICALs
- [ ] (Step 5) HITL merge approval (not self-approved)
- [ ] (Step 6) Changelog entry if user-visible; reporter informed; cross-bet attribution recorded
- [ ] **No hotfix exception taken** — full review held regardless of severity; **the fixer did not review its own diff**

## Output summary contract

**TL;DR** (what broke / fix shipped / status) · **Files created/modified** · **Next recommended command** · **Open questions/risks**.

## Notes

**Promotion to deeper work:** if the bug is symptomatic of an architectural root, ship the symptom fix (this PR) AND run `/create-brief` for root-cause work as a tech-debt bet, linking the symptom fix in DRI. Architect review prevents accumulated symptom fixes from becoming silent tech debt.

**Discipline always:** full review, full Architect compliance, full security review when applicable — no hotfix exceptions. The collapse removed the *tier*, not the *discipline*: reproduce-before-fix, regression-test-first, and independent review all hold.

### Migration (legacy prose → dispatch graph → v0.3.50 tier collapse)

- **Pre-v0.3.45:** 4-phase embedded-methodology prose (28 numbered steps).
- **v0.3.45:** thin dispatch graph (7th in dispatch-graph shape), 8 steps: `support.triage-bug` → HITL(triage confirm) → `engineer.fix-bug` → `automation.write-e2e-tests` → `reviewer.review-pr` → `engineer.respond-to-review` → HITL(merge) → `tech-writer.accumulate-changelog`.
- **v0.3.50 (#108, Retro #022 `[ai-collapses-org-tiering]`):** collapsed the ITIL L1/L2→L3 escalation. Removed `support.triage-bug` + the "triage confirmed" HITL gate (repo-blind support triage was interrogating users for facts the code answers — live home-app consumer signal). `engineer.fix-bug` renamed → `engineer.triage-and-fix` and now owns reproduce + diagnose + severity from the code. 8 steps → 6; one HITL gate (merge). **Nothing dropped but the tier:** regression-test-first, MOV, per-surface-vertical-test, contract sweep, no-hotfix-exception, maker≠checker, promote-to-tech-debt-brief all preserved. `[refuse-escalate]` refined at the application level (reproduce-from-code; ask the human only for what code can't reveal) — Principle #16 itself (foundational scope-widening) untouched. Support shrinks to the front door (`/triage` + comms); `fix` removed from its `participates_in_workflows`.
