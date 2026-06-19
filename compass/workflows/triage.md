---
name: triage
status: active
owner: support
auto_invokes: []
invoked_by: [manual, incident_alert]
version: 0.3.48
requires_approved: []
---

# Workflow: /triage

## Framework grounding

- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [conditional-dispatch] (#95 — first instance) · [per-surface-vertical-test] · [agent-handoff] · [refuse-escalate]
- **Verifies adherence to:** Principle #14 · Principle #16 · human-driven-stop-the-bleed (framework never auto-acts) · discipline-holds-under-P0 (full review on any code change, no carve-out)

## Purpose

Production incident response. Support + Engineer engage immediately (PM for awareness). **Stop-the-bleed is human-driven** — the framework drafts options and the human decides + executes; it never auto-rolls-back. Full review discipline holds on any code change, even under P0.

## Architectural shape (v0.3.48)

Thin dispatch graph per `[workflow-as-dispatch-graph]` (canon v0.3.24); **9th workflow in dispatch-graph shape**. Methodology lives in the agent tasks (`support.triage-incident`, `engineer.fix-bug`, `reviewer.review-pr`, `support.write-postmortem`, `tech-writer.accumulate-changelog`).

**First `[conditional-dispatch]` instance (#95→#96):** the fix-forward gate (Step 2) is a **routing gate** — the human routes to one of two branches based on whether the mitigation resolved the incident or a code fix is needed.

## Preconditions (workflow-level GATE)

- **Trigger present** — `/triage <description>` OR an alert routed from the configured tool (PagerDuty / Sentry / Slack / Linear per `compass/config.yaml` `connectors.incident_alert`).
- **No `requires_approved` gate** — an incident is reactive; it does not wait on foundation approval.

## Roles invoked (agents dispatched)

- `compass/agents/support.md` — `triage-incident` (first response, stop-the-bleed options, comms) + `write-postmortem`
- `compass/agents/engineer.md` — `fix-bug` (fix-forward branch) + investigation
- `compass/agents/reviewer.md` — `review-pr` (+ `security-reviewer.review-pr-security` if the fix touches sensitive surfaces)
- `compass/agents/tech-writer.md` — `accumulate-changelog` (if user-visible)

## Dispatch graph

### Step 1. `support.triage-incident` (Support agent owns)

**Dispatches:** Support agent
**Task definition:** `compass/agents/support.md` → Task `triage-incident`
**Input:** incident description / alert · observability (Sentry/Datadog via MCP) · recent deploys + ops changes
**What it covers:** acknowledge → engage Engineer + Support (+ PM awareness) → classify severity (P0–P3) → assess blast radius → Engineer investigates (recent deploys/ops, hypothesis) → identify stop-the-bleed options → draft incident artifact + comms.
**Output:** incident artifact (`docs/incidents/<incident-id>/triage.md` or under the affected bet) with stop-the-bleed options + drafted comms

### Step 2. **HITL — stop-the-bleed + fix-forward routing gate** (human)

**Dispatches:** HUMAN (not an agent)
**What it covers:** human chooses and **executes** the mitigation (rollback / flag toggle / traffic shift — framework never auto-acts), approves comms for publishing, then **routes the fix-forward decision**:
**Routes:**
- `resolved` → Step 5 — mitigation resolved it (rollback / flag); no code change needed, go straight to postmortem.
- `needs-fix` → Step 3 — a code fix is required; enter the fix branch (full review holds under P0).

### Step 3. `engineer.fix-bug` (Engineer agent owns) — [needs-fix branch]

**Dispatches:** Engineer agent
**Task definition:** `compass/agents/engineer.md` → Task `fix-bug`
**What it covers:** failing regression test first → minimum fix → checks + `[mechanical-output-verification]` → `[per-surface-vertical-test]` flag if a data surface is touched → open PR linking the incident artifact. **No P0 carve-out** — discipline holds.

### Step 4. `reviewer.review-pr` (Reviewer agent owns) — [needs-fix branch]

**Dispatches:** Reviewer agent (`preferred_hosts: [codex, gemini]` — excludes Claude)
**Task definition:** `compass/agents/reviewer.md` → Task `review-pr`
**What it covers:** full review of the incident fix; Security Reviewer (`security-reviewer.review-pr-security`) auto-engages if the fix touches auth/PII/payments/secrets/external input/sessions. Engineer responds (`engineer.respond-to-review`) until clean; human approves merge.

### Step 5. `support.write-postmortem` (Support agent owns) — [reconverge: both branches]

**Dispatches:** Support agent
**Task definition:** `compass/agents/support.md` → Task `write-postmortem`
**What it covers:** blameless postmortem — timeline + root-cause analysis + contributing factors + what-went-well/didn't + **action items** (each routable to a `/create-brief` tech-debt bet or `/create-story` slice). Recurring/systemic root → flag Enterprise Architect for foundational review.
**Output:** `postmortem.md` with action items

### Step 6. **HITL — postmortem approved** (human)

**Dispatches:** HUMAN (not an agent)
**What it covers:** human reviews the postmortem before it's marked `complete`; action items are spawned as bets/stories via `/create-brief` or `/create-story`.

### Step 7. `tech-writer.accumulate-changelog` (Tech Writer agent owns)

**Dispatches:** Tech Writer agent
**Task definition:** `compass/agents/tech-writer.md` → Task `accumulate-changelog`
**What it covers:** add the incident to the changelog if user-visible; internal/external comms already drafted + HITL-approved in Step 2.

## Workflow-level verification (final GATE)

- [ ] (Step 1) Incident artifact exists; severity + blast radius classified; stop-the-bleed options + comms drafted
- [ ] (Step 2) **Stop-the-bleed chosen + executed by a human** (framework did not auto-act); comms HITL-approved before publishing; fix-forward route chosen
- [ ] (Steps 3–4, if `needs-fix`) regression-test-first fix · full Reviewer pass · Security Reviewer if sensitive · zero unresolved BLOCKERs/CRITICALs · **no P0 review carve-out**
- [ ] (Step 5) Postmortem: timeline + RCA + ≥1 action item (each routable to a bet/story)
- [ ] (Step 6) Postmortem HITL-approved before `complete`; action items spawned
- [ ] (Step 7) Changelog updated if user-visible

## Output summary contract

**TL;DR** (what broke / mitigation / status) · **Files created/modified** · **Next recommended command** (`/create-brief` or `/create-story` for action items) · **Open questions/risks**.

## Notes

**Discipline always:** full Reviewer pass on any incident code change, Security Reviewer when applicable, comms HITL-gated, postmortem HITL-gated. The framework's speed makes this practical — no P0 exceptions.

**Cross-cutting:** incident artifacts carry `area:*` tags; recurring incidents auto-flag as systemic → Enterprise Architect foundational review; postmortem action items roll up into `/metrics` as incident-driven work.

### Migration (legacy prose → v0.3.48 dispatch graph)

- **Pre-v0.3.48:** 6-phase embedded-methodology prose (21 numbered steps).
- **v0.3.48:** thin dispatch graph (9th in dispatch-graph shape) + **the first `[conditional-dispatch]` instance** (#95→#96). The Phase-4 prose branch ("rollback resolved → postmortem" vs "needs code fix → /fix") became a real **routing gate** (Step 2) the orchestrator executes — forward-only, human-chosen. New `support.write-postmortem` task added (no existing task owned the postmortem). No behavior dropped: human-driven stop-the-bleed, full-review-under-P0, comms + postmortem HITL gates, action-items-spawn-work all preserved. `[explicit-dispatch-surfaces-latent-participation]`: added `triage` to reviewer + tech-writer `participates_in_workflows`.
- **Conditional dispatch v1 scope:** HITL-routing only (human picks the branch); agent-classified/autonomous routing deferred to the LLM-driver surface (#87 surface 3); forward-only branches.
