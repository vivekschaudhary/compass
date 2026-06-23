---
name: triage
status: active
owner: support
auto_invokes: []
invoked_by: [manual, incident_alert]
version: 0.3.52
requires_approved: []
---

# Workflow: /triage

## Framework grounding

- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [conditional-dispatch] (canon v0.3.49 — within-graph #96 + cross-workflow #103) · [per-surface-vertical-test] · [agent-handoff] · [refuse-escalate]
- **Verifies adherence to:** Principle #14 · Principle #16 · human-driven-stop-the-bleed (framework never auto-acts) · discipline-holds-under-P0 (full review on any code change, no carve-out)

## Purpose

The **front door** for every incoming item. `/triage` classifies what came in — incident, bug, enhancement, problem, change, service request, or not-an-issue — and routes it (the human confirms the route). Most categories **hand off** to the workflow that owns them (`/fix`, `/create-brief`, `/ops`); an **incident** is handled inline (Support + Engineer engage immediately, PM for awareness). **Stop-the-bleed is human-driven** — the framework drafts options and the human decides + executes; it never auto-rolls-back. Full review discipline holds on any code change, even under P0.

## Architectural shape (v0.3.49)

Thin dispatch graph per `[workflow-as-dispatch-graph]` (canon v0.3.24); **9th workflow in dispatch-graph shape**. Methodology lives in the agent tasks (`support.classify-intake`, `support.triage-incident`, `engineer.triage-and-fix`, `reviewer.review-pr`, `support.write-postmortem`, `tech-writer.accumulate-changelog`).

**`[conditional-dispatch]` — two instances in one graph (canon v0.3.49):**
- **Front-door ITIL intake router (Step 2, #98→#103):** a **routing gate** routing to either an inline branch (`incident` → Step 3) or a **cross-workflow hand-off** (`bug` → `/fix`, `enhancement`/`problem` → `/create-brief`, `change`/`service-request` → `/ops`) or `close`. v1 hand-off = the orchestrator records the decision and recommends the next command; auto-chaining the child workflow is v2 (#87 surface 3).
- **Fix-forward gate (Step 4, #95→#96):** within the incident branch, the human routes to one of two inline branches based on whether the mitigation resolved the incident or a code fix is needed.

## Preconditions (workflow-level GATE)

- **Trigger present** — `/triage <description>` OR an alert routed from the configured tool (PagerDuty / Sentry / Slack / Linear per `compass/config.yaml` `connectors.incident_alert`).
- **No `requires_approved` gate** — triage is reactive; it does not wait on foundation approval.

## Roles invoked (agents dispatched)

- `compass/agents/support.md` — `classify-intake` (front-door ITIL classification) + `triage-incident` (incident first response) + `write-postmortem`
- `compass/agents/engineer.md` — `triage-and-fix` (incident fix-forward branch: reproduce-from-code + fix) + investigation
- `compass/agents/reviewer.md` — `review-pr` (+ `security-reviewer.review-pr-security` if the fix touches sensitive surfaces)
- `compass/agents/tech-writer.md` — `accumulate-changelog` (if user-visible)

## Dispatch graph

### Step 1. `support.classify-intake` (Support agent owns)

**Dispatches:** Support agent
**Task definition:** `compass/agents/support.md` → Task `classify-intake`
**Input:** the raw incoming item (`/triage <description>` or a routed alert/ticket) · observability + recent deploys/ops changes for context
**What it covers:** read the item → classify into exactly one ITIL category by observed impact/urgency → one-line rationale → recommended route → short intake summary (used as hand-off context downstream). **Proposes; does not decide** — the human confirms at Step 2.
**Output:** intake summary (classification + rationale + recommended route)

### Step 2. **HITL — ITIL intake routing gate** (human)

**Dispatches:** HUMAN (not an agent)
**What it covers:** the human confirms or overrides the proposed category and routes the item. Incidents are handled inline; everything else hands off to the owning workflow (v1: the orchestrator recommends the next command) or closes.
**Routes:**
- `incident` → Step 3 — production is degraded/down; handle inline via the incident branch.
- `bug` → /fix — defective shipped behavior, not an active outage.
- `enhancement` → /create-brief — a new capability/improvement to plan (PM intake).
- `problem` → /create-brief — the underlying cause behind incidents/bugs; investigate + plan the fix.
- `change` → /ops — an operational/config/infra change to execute.
- `service-request` → /ops — a standard fulfilment ask (access, provisioning, export).
- `not-an-issue` → close — duplicate, working-as-intended, or out of scope.

**Right-size `enhancement`/`problem` (`[right-size-the-path-to-the-work]`, v0.3.51):** the `/create-brief` target above is the **default for a genuinely new capability**. `classify-intake` is given the **bet catalog** and right-sizes the recommendation: a **slice of an existing bet** → run `/create-story --bet <id>` (the classifier names the bet; no new brief) · **trivial** (a button/label) → the **hygiene** lane (skip the brief, keep review). `/create-brief` itself refuses to mint a redundant bet for a slice and points to `/create-story`. *The dry-run shows the **static fallback** targets; the **live** hand-off echoes `classify-intake`'s `**Next command:**` line — the right-sized command (#110).*

### Step 3. `support.triage-incident` (Support agent owns) — [incident branch]

**Dispatches:** Support agent
**Task definition:** `compass/agents/support.md` → Task `triage-incident`
**Input:** incident description / alert · observability (Sentry/Datadog via MCP) · recent deploys + ops changes
**What it covers:** acknowledge → engage Engineer + Support (+ PM awareness) → classify severity (P0–P3) → assess blast radius → Engineer investigates (recent deploys/ops, hypothesis) → identify stop-the-bleed options → draft incident artifact + comms.
**Output:** incident artifact (`docs/incidents/<incident-id>/triage.md` or under the affected bet) with stop-the-bleed options + drafted comms

### Step 4. **HITL — stop-the-bleed + fix-forward routing gate** (human) — [incident branch]

**Dispatches:** HUMAN (not an agent)
**What it covers:** human chooses and **executes** the mitigation (rollback / flag toggle / traffic shift — framework never auto-acts), approves comms for publishing, then **routes the fix-forward decision**:
**Routes:**
- `resolved` → Step 7 — mitigation resolved it (rollback / flag); no code change needed, go straight to postmortem.
- `needs-fix` → Step 5 — a code fix is required; enter the fix branch (full review holds under P0).

### Step 5. `engineer.triage-and-fix` (Engineer agent owns) — [needs-fix branch]

**Dispatches:** Engineer agent
**Task definition:** `compass/agents/engineer.md` → Task `triage-and-fix`
**What it covers:** reproduce-from-code → failing regression test first → minimum fix → checks + `[mechanical-output-verification]` → `[per-surface-vertical-test]` flag if a data surface is touched → open PR linking the incident artifact. **No P0 carve-out** — discipline holds.

### Step 6. `reviewer.review-pr` (Reviewer agent owns) — [needs-fix branch]

**Dispatches:** Reviewer agent (`preferred_hosts: [codex, gemini]` — excludes Claude)
**Task definition:** `compass/agents/reviewer.md` → Task `review-pr`
**What it covers:** full review of the incident fix; Security Reviewer (`security-reviewer.review-pr-security`) auto-engages if the fix touches auth/PII/payments/secrets/external input/sessions. Engineer responds (`engineer.respond-to-review`) until clean; human approves merge.

### Step 7. `support.write-postmortem` (Support agent owns) — [reconverge: both incident branches]

**Dispatches:** Support agent
**Task definition:** `compass/agents/support.md` → Task `write-postmortem`
**What it covers:** blameless postmortem — timeline + root-cause analysis + contributing factors + what-went-well/didn't + **action items** (each routable to a `/create-brief` tech-debt bet or `/create-story` slice). Recurring/systemic root → flag Enterprise Architect for foundational review.
**Output:** `postmortem.md` with action items

### Step 8. **HITL — postmortem approved** (human)

**Dispatches:** HUMAN (not an agent)
**What it covers:** human reviews the postmortem before it's marked `complete`; action items are spawned as bets/stories via `/create-brief` or `/create-story`.

### Step 9. `tech-writer.accumulate-changelog` (Tech Writer agent owns)

**Dispatches:** Tech Writer agent
**Task definition:** `compass/agents/tech-writer.md` → Task `accumulate-changelog`
**What it covers:** add the incident to the changelog if user-visible; internal/external comms already drafted + HITL-approved in Step 4.

## Workflow-level verification (final GATE)

- [ ] (Step 1) Intake classified into exactly one ITIL category with impact/urgency rationale + recommended route + intake summary
- [ ] (Step 2) **Human confirmed or overrode the route** (no auto-routing); hand-off items recommend the owning workflow's command; incidents continue inline
- [ ] (Step 3, incident) Incident artifact exists; severity + blast radius classified; stop-the-bleed options + comms drafted
- [ ] (Step 4, incident) **Stop-the-bleed chosen + executed by a human** (framework did not auto-act); comms HITL-approved before publishing; fix-forward route chosen
- [ ] (Steps 5–6, if `needs-fix`) regression-test-first fix · full Reviewer pass · Security Reviewer if sensitive · zero unresolved BLOCKERs/CRITICALs · **no P0 review carve-out**
- [ ] (Step 7) Postmortem: timeline + RCA + ≥1 action item (each routable to a bet/story)
- [ ] (Step 8) Postmortem HITL-approved before `complete`; action items spawned
- [ ] (Step 9) Changelog updated if user-visible

## Output summary contract

**TL;DR** (what came in / classification / route taken) · **Files created/modified** · **Next recommended command** (the hand-off target for non-incident items; `/create-brief` or `/create-story` for postmortem action items) · **Open questions/risks**.

## Notes

**Discipline always:** the human confirms every route (no autonomous routing in v1); full Reviewer pass on any incident code change, Security Reviewer when applicable, comms HITL-gated, postmortem HITL-gated. The framework's speed makes this practical — no P0 exceptions.

**Cross-cutting:** incident artifacts carry `area:*` tags; recurring incidents auto-flag as systemic → Enterprise Architect foundational review; postmortem action items roll up into `/metrics` as incident-driven work.

### Migration (legacy prose → v0.3.49 front-door dispatch graph)

- **Pre-v0.3.48:** 6-phase embedded-methodology prose (21 numbered steps), incident-response only.
- **v0.3.48:** thin dispatch graph (9th in dispatch-graph shape) + **the first `[conditional-dispatch]` instance** (#95→#96) — the fix-forward routing gate.
- **v0.3.49 (#98→#103):** generalized to the **front-door ITIL intake router**. Added `support.classify-intake` (Step 1) + the intake routing gate (Step 2), which routes to an inline incident branch OR **hands off cross-workflow** to `/fix` / `/create-brief` / `/ops` OR closes — the 2nd `[conditional-dispatch]` instance (codified to canon v0.3.49). The incident flow (now Steps 3–9) is unchanged behavior, just reached via the intake route; the fix-forward gate's targets were renumbered (resolved → Step 7, needs-fix → Step 5).
- **Conditional dispatch v1 scope:** HITL-routing only (human picks the branch); cross-workflow hand-off recommends the next command (auto-chaining the child workflow deferred to the LLM-driver surface, #87 surface 3); forward-only branches.
