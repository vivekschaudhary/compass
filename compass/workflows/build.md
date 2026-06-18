---
name: build
status: active
owner: engineer
auto_invokes: []
invoked_by: []
version: 0.3.35
requires_approved: [docs/foundation/architecture.md, docs/bets/<bet-id>/brief.md]
---

# Workflow: /build

<!-- Role-boundary markers per [role-boundary] (canon.md, v0.3.4). The reference parser
     compass/scripts/token-usage.py reads these to attribute Claude Code session tokens
     to roles. Delivery-Manager-owned (renamed from PM in v0.3.15). Add markers when
     introducing new role transitions; remove only when restructuring phases. -->

## Framework grounding

What this workflow operationalizes. Full entries in `compass/framework/canon.md`.

- **Compass-originals operationalized:** `[agent-as-surface-independent-unit]` (v0.3.14 — agent files own task content) · `[mechanical-output-verification]` (v0.3.6 — Engineer's runtime-artifact inspection in `implement-story`; Reviewer's framework-registration check in `review-pr` Step 0) · `[freshness-check]` (v0.3.3 → v0.3.11 — Phase 5 reviewer.md freshness gate; review-time freshness on NEW load-bearing claims) · `[agent-handoff]` (v0.3.5 — Engineer → Reviewer via `agent-handoff.yml` template, automated when consuming repo installs it) · `[role-boundary]` (v0.3.4 — Engineer writes code/unit/component tests; Reviewer writes E2E; PM arbitrates disputes; no overlap) · `[refuse-escalate]` (Engineer refuses to improvise architectural decisions) · `[soft-spec-hardening]` (vague AC pushes back to PM)
- **Verifies adherence to:** Principle #14 (soft spec → AI rationalization — `polished-but-broken` failure mode hardened via mechanical-output-verification) · Principle #16 (refuse + escalate to upstream) · Cross-host independence — Engineer (Claude) implements; Reviewer (Codex, deliberately different model per `preferred_hosts: [codex, gemini]`) reviews

## Purpose

Engineer implements **ONE approved story end-to-end** — code + tests + PR → Reviewer reviews → human approves merge. Architect compliance enforced on every PR (no shortcuts — prevents tech debt). Story may produce multiple PRs (implementation, defect fixes, additional tests); each PR gets full review treatment.

## Architectural shape (v0.3.23 dispatch-graph refactor)

This workflow is a **thin dispatch graph** per `[agent-as-surface-independent-unit]` (canon v0.3.14). The heavy gate/work/postcondition content lives in the agent task definitions in `compass/agents/`. This file declares:

1. **Workflow-level preconditions** (story-readiness gates)
2. **Dispatch graph** — ordered sequence of `<agent>.<task>` invocations + HITL gates + the review/response loop
3. **Workflow-level verification** — cross-agent invariants the dispatch graph must satisfy
4. **Workflow-level patterns** that span multiple agents (Scanner at phase boundaries; Story → multiple PRs; Post-merge bugs)

The per-step gate/work/postcondition detail is NOT in this file. Read the named task in the named agent file for that.

**v0.3.23 is the 2nd workflow refactored to dispatch-graph shape** (joining `/setup-product` v0.3.14). 12 of the 14 workflows still embed full methodology bodies (v0.3.0-alpha shape); they refactor as their owning agents migrate.

## Trigger

`/build <story-id>`

## Preconditions (workflow-level GATE — checked once at start)

- **Story is `ready`:** AC present (required) · design link present (required if UI work) · tech notes present · dependencies + priority noted.
- **Brief is `status: approved`.** If `proposed` or `superseded`, refuse with: *"Brief <bet-id> is not approved (status: <current>). Approve via PM workflow first."*
- **If `architecture_required: true` on the bet, bet architecture is `status: approved`.** If missing or unapproved, refuse with: *"Bet architecture missing or unapproved. Run `/create-bet-architecture` first."*
- **Foundation architecture exists.** If missing, refuse with: *"`docs/foundation/architecture.md` missing. Run `/setup-foundation-architecture` first."*
- **If any precondition fails → refuse and flag to HITL. Do not proceed.**

## Roles invoked (agents dispatched)

- `compass/agents/engineer.md` — implementation + PR open + response loop (migrated v0.3.14; tasks: `implement-story`, `respond-to-review` NEW v0.3.23)
- `compass/agents/reviewer.md` — PR code review (migrated v0.3.16; `preferred_hosts: [codex, gemini]` deliberately excludes claude per cross-host integrity; task: `review-pr`. E2E authoring split to Automation in v0.3.33)
- `compass/agents/automation.md` — E2E tests + test framework + CI configs (NEW agent v0.3.33, split from Reviewer; task: `write-e2e-tests`)
- `compass/agents/pm.md` — arbitrate Engineer-vs-Reviewer disputes (ad-hoc; fires only when Engineer adds `## Dispute` to PR; task: `arbitrate-dispute`)
- `compass/agents/security-reviewer.md` (migrated v0.3.36; `preferred_hosts: [codex, gemini]` deliberately excludes claude) — auto-engages on diffs touching auth/PII/payments/secrets/external input/sessions; task: `review-pr-security`
- `compass/agents/tech-writer.md` (migrated v0.3.36) — post-merge changelog accumulation (Phase 7); task: `accumulate-changelog`

## Dispatch graph

The workflow walks this sequence. The runtime mechanism is one of:

- **Today (no orchestrator):** human dispatcher — opens the right agent's host (e.g., Claude Code for Engineer; Codex CLI for Reviewer per its `preferred_hosts: [codex, gemini]`), pastes the workflow command, agent runs its task, halts at the next handoff, human transitions to the next agent's host. If `.github/workflows/ai-review.yml` is installed in the consuming repo (per `compass/scripts/agent-handoff.yml`), the Engineer → Reviewer handoff is automated on CI-green per `[agent-handoff]` (canon v0.3.5).
- **v0.4 (orchestrator):** orchestrator walks the graph, dispatches each step to its assigned agent on its assigned host automatically; cross-host loops (Step 3 ↔ Step 4) handled natively.

Either way, the GRAPH is the same.

### Step 1. `engineer.implement-story` (Engineer agent owns) — covers Phase 2 + Phase 4

<!-- COMPASS_ROLE_BOUNDARY: enter | role=engineer | workflow=build | step=1 -->

**Dispatches:** Engineer agent
**Task definition:** `compass/agents/engineer.md` → Task `implement-story`
**What it covers:** read context in order (AGENTS.md → brief → bet architecture → story → copy doc → foundation architecture → existing code) → plan smallest viable diff → write tests first when possible → implement following bet architecture (no improvising) → copy verbatim from copy doc → run ALL local checks (typecheck, lint, all test suites, format, **production build**) → **runtime-artifact inspection** per `[mechanical-output-verification]` (Next 16 functions-config-manifest.json / Vercel functions output / Expo prebuild config) → **runtime-config audit** (public-namespace env vars resolved; no silent dev-default fallback) → open PR via GitHub MCP with full template + ADR refs → story status flips `in-build` → `in-review`.
**Stop point:** halts after PR open. Does NOT review own diff. Waits for Reviewer.

<!-- COMPASS_ROLE_BOUNDARY: exit | role=engineer | workflow=build | step=1 -->

### Step 2. `automation.write-e2e-tests` (Automation agent owns) — covers Phase 3

<!-- COMPASS_ROLE_BOUNDARY: enter | role=automation | workflow=build | step=2 -->

**Dispatches:** Automation agent (`preferred_hosts: [claude, codex, gemini]`)
**Task definition:** `compass/agents/automation.md` → Task `write-e2e-tests` (split from Reviewer in v0.3.33 — Reviewer is read-only on all code as of v0.3.37)
**What it covers:** write E2E tests covering AC user flows in top-level `e2e/` folder → maintain E2E framework (Playwright/Cypress/etc.) → author CI/CD pipeline configs for test orchestration → commit with `test:` prefix.
**Sequencing note:** can run in parallel with Step 1's later phases OR after Step 1 completes; preferred = after Step 1 so Automation sees the implementation surface before writing E2E. Engineer does not review Automation's test code (Automation is the test owner per `[role-boundary]`).

<!-- COMPASS_ROLE_BOUNDARY: exit | role=automation | workflow=build | step=2 -->

### Step 3. `reviewer.review-pr` (Reviewer agent owns) — covers Phase 5 review side

<!-- COMPASS_ROLE_BOUNDARY: enter | role=reviewer | workflow=build | step=3 -->

**Dispatches:** Reviewer agent
**Task definition:** `compass/agents/reviewer.md` → Task `review-pr`
**Task-internal gate (load-bearing):** Reviewer's task has a `Freshness window` precondition — `today - last_verified > freshness_window_days` on `compass/agents/reviewer.md` → **refuse before review begins** per `[freshness-check]` (canon v0.3.3 → v0.3.11). The workflow inherits this gate; no separate check needed at workflow level. _Note: freshness markers were relocated from `compass/roles/reviewer.md` → `compass/agents/reviewer.md` in v0.3.16 alongside the Reviewer migration._
**What it covers:** wait for CI green (refuse if failing) → **Step 0 framework-registration check** (conditional, when PR touches framework-discovered surfaces — per `[mechanical-output-verification]`) → read diff file-by-file → bet-architecture compliance → **review-time freshness on NEW load-bearing claims** per `[freshness-check]` scope-tightening (v0.3.11) → categorize findings (BLOCKER / ISSUE / NIT) → cite, don't assert → post structured PR comment in the documented format.
**Auto-engagement (parallel):** Security Reviewer (`compass/agents/security-reviewer.md` → Task `review-pr-security`) auto-engages if diff touches auth/PII/payments/secrets/external input/sessions. Two reviews, two PR comments. `review-pr` does NOT absorb Security Reviewer's role.
**Stop point:** halts after PR comment posted. Awaits Engineer's response.

<!-- COMPASS_ROLE_BOUNDARY: exit | role=reviewer | workflow=build | step=3 -->

### Step 4. `engineer.respond-to-review` (Engineer agent owns) — covers Phase 5 response side

<!-- COMPASS_ROLE_BOUNDARY: enter | role=engineer | workflow=build | step=4 -->

**Dispatches:** Engineer agent
**Task definition:** `compass/agents/engineer.md` → Task `respond-to-review`
**What it covers:** read each finding (Severity / Confidence / Location / Reason / Fix) → address all BLOCKERs and most ISSUEs → push fixes as commits with conventional-commit prefixes (`fix:`, `refactor:`, `test:`) → auto re-request review.
**Dispute branch:** if Engineer believes a finding is wrong, adds `## Dispute` section to PR with reasoning → halts the Step 3 ↔ Step 4 loop → dispatches Step 5 (PM arbitration).
**Stop point:** halts after fixes pushed. Re-dispatches to Step 3 (review loop) OR Step 5 (dispute arbitration).

<!-- COMPASS_ROLE_BOUNDARY: exit | role=engineer | workflow=build | step=4 -->

### Step 5. `pm.arbitrate-dispute` (PM agent owns) — fires ad-hoc when Engineer disputes

**Dispatches:** PM agent (ad-hoc; ONLY when Step 4 raises `## Dispute`)
**Task definition:** `compass/agents/pm.md` → Task `arbitrate-dispute`
**What it covers:** read both sides + the artifact in question + arbitrate. PM executes the decision; PM does NOT make engineering choices. Post resolution comment on the PR with rationale.
**Stop point:** halts after resolution comment posted. Engineer addresses per arbitration; re-enters Step 3 loop OR proceeds to Step 6 HITL gate per arbitration outcome.

### Step 6. **HITL gate — human approves merge** (human)

**Dispatches:** HUMAN (not an agent)
**What it covers:** human reviews the PR + reviewer comments + arbitration resolutions (if any). Approves merge in GitHub UI.
**Per Principle #16:** Engineer must NOT self-merge; Reviewer must NOT auto-merge. HITL is a hard stop.

### Step 7. **Mechanical merge constraints** (CI + branch protection)

**Dispatches:** CI / branch protection rules (not an agent)
**Merge blocked unless ALL of:**

- CI green
- Zero Reviewer BLOCKERs unresolved
- Zero Security Reviewer CRITICALs unresolved
- Zero unresolved disputes
- Human approval recorded (Step 6)

Squash merge to main (per `compass/config.yaml` merge strategy). CI/CD pipeline triggered automatically per `compass/config.yaml` `ci_cd:` settings.

### Step 8. Post-merge — tech-writer engagement + story status finalization

**Dispatches:** Tech Writer agent
**Task definition:** `compass/agents/tech-writer.md` → Task `accumulate-changelog`

<!-- COMPASS_ROLE_BOUNDARY: enter | role=tech-writer | workflow=build | step=8 -->

**What it covers:** Tech Writer updates `docs/changelog.md` accumulator entry for this brief. Story status: `merged` (deploy pending). If deploy succeeds → `shipped`; if deploy fails → `deploy-failed`, alert via configured channel. Brief stays `in-build` until ALL stories of the brief have shipped. When all stories ship → brief `shipped`, Tech Writer finalizes consolidated changelog entry for the brief.

<!-- COMPASS_ROLE_BOUNDARY: exit | role=tech-writer | workflow=build | step=8 -->

## Workflow-level patterns (span multiple agents)

### Story → multiple PRs

A story may produce multiple PRs (implementation, additional tests, defect fixes). **Each PR gets the SAME full dispatch graph treatment** — Steps 1 → 8. No shortcuts on subsequent PRs. Per `[role-boundary]` + Reviewer's "no shortcut under pressure" refusal rule.

### Post-merge bugs

If a bug is found post-merge on this story → reopen the story, fix it right. Do NOT create a separate "fix" story for the same defect (that fragments the DRI log + breaks `/build`'s story-as-unit assumption).

### Scanner at phase boundaries

Invoke `/scan <bet-id>` at each phase boundary so the bet enters the next phase with a fresh findings snapshot:

- **Build → Production Ready:** triggered when all stories of the brief ship (Step 8 final). Surfaces runbook / SLO / monitoring / rollback / on-call / backup / cost / compliance gaps before the bet is treated as production-bound.
- **Production Ready → GTM:** triggered when Production Ready findings are resolved or suppressed. Surfaces user-docs / API-docs / sales / support / pricing / launch-comms / customer-comms / legal gaps.
- **GTM → Operate:** triggered when GTM findings are clear. Surfaces measurement-cron / SLO-met / incident-rate / adoption / cost-actuals / defect-rate / outcome-resolved gaps.

If `compass/config.yaml` `scanner.per_phase` is `strict` for the upcoming phase, any open Critical finding blocks the transition (matching scanner's strict-mode block semantics). Catches missing production-readiness work *before* the bet is treated as shipped, not after an incident.

## Workflow-level verification (final GATE — workflow cannot complete until all checked)

Mirrors per-task postconditions + cross-agent invariants.

- [ ] (Step 1 — engineer.implement-story) Code implements story's AC; unit + API + component tests cover happy + unhappy paths; production build green with runtime-artifact inspection confirming framework registration; runtime-config audit clean; copy matches copy doc verbatim; PR open with full template + ADR refs
- [ ] (Step 1 — pre-PR) **`[rsc-prop-serialization]`** checked if story touches RSC boundary: Server→Client props are JSON-serializable or Server Actions — no functions, class instances, Promises; confirmed or DRI Risk logged
- [ ] (Step 1 — pre-PR) **`[server-action-file-export-purity]`** checked if story adds/touches `"use server"` files: all exports are `async` functions — no non-async exports; confirmed or DRI Risk logged
- [ ] (Step 1 — pre-PR) **`[cross-artifact-sweep-on-contract-shift]`** complete if story changed any contract: DRI Decision logged confirming all referencing artifacts swept (components · API clients · tests · config · docs · env vars); no stale references remain
- [ ] (Step 2 — automation.write-e2e-tests) E2E tests in `e2e/`; AC user flows covered; CI configs version-controlled
- [ ] (Step 2 — automation.write-e2e-tests) **Per-surface vertical test** (`[per-surface-vertical-test]`): every data surface has ≥1 test traversing the real auth→authz(RLS)→render vertical on a prod-like build — no mocked-auth / service-role / dev-build substitute
- [ ] (Step 2 — automation.write-e2e-tests) **Test-data cleanup**: data-mutating E2E tests delete or soft-delete every record they create (no residue in shared/prod-like envs); story has the cleanup AC (anti-pattern `orphaned-test-data`)
- [ ] (Step 3 — reviewer.review-pr) PR comment posted in documented format; every finding has File · Rule violated · Issue · Fix; BLOCKERs are real BLOCKERs (not softened to ISSUE); Step 0 framework-registration check completed if PR touches framework-discovered surfaces
- [ ] (Step 3 — security-reviewer if applicable) Second PR comment posted if diff touched auth/PII/payments/secrets/external input/sessions
- [ ] (Step 4 — engineer.respond-to-review) All BLOCKERs addressed; ISSUEs addressed or explicitly deferred with rationale; commits use conventional-commit prefixes
- [ ] (Step 5 — pm.arbitrate-dispute if applicable) Resolution comment posted on PR if any `## Dispute` raised; PM did NOT make engineering choices, only arbitrated
- [ ] (Step 6 — HITL) Human approved merge; not self-approved by Engineer or Reviewer
- [ ] (Step 7 — mechanical) CI green · zero BLOCKERs · zero CRITICALs · zero disputes · human approval recorded — all 5 conditions met before merge
- [ ] (Step 8 — tech-writer) `docs/changelog.md` accumulator entry updated; story status reflects post-merge state (`merged` / `shipped` / `deploy-failed`)

Workflow is NOT complete until every item is checked.

## Output summary contract (mandatory to user)

After completion (or refusal), report in this exact shape:

- **TL;DR** — 3 lines max: story → PR → merge status (e.g., "story SPR-42 → PR #1234 → merged + deployed")
- **Files created/modified** — table with path + change type
- **Runtime-artifact verification** — what build-output files were inspected; what they confirmed (e.g., "functions-config-manifest.json shows /_middleware registered")
- **Reviewer findings summary** — BLOCKERs count + ISSUEs count + disputes count
- **Next recommended command** — `/build <next-story-id>` if more stories in brief; `/scan <bet-id>` if all stories shipped (Build → Production Ready boundary)
- **Open questions or risks** — only if applicable
- **Per-step agent dispatch** — which agent ran on which host (informs Finance / Time tracking when v0.4 orchestrator ships)

## DRI logging

**Engineer logs:**
- **Decisions:** implementation choices, library use — rationale + area tag
- **Risks:** regression, performance, integration — likelihood + impact
- **Issues:** AC ambiguities, missing context — severity + owner

**Reviewer logs:**
- **Decisions:** review interpretation
- **Risks:** uncovered gaps
- **Issues:** repeated drift patterns

**PM (only if dispute arbitrated):**
- **Decisions:** arbitration outcome + rationale

**Mid-task pattern logging** per `[fractal-retro]` (canon v0.3.17):
- Engineer → `docs/role-activity/engineer.md` (PR redos, story-claim drift, build-output mismatch, cross-bet pattern)
- Reviewer → `docs/role-activity/reviewer.md` (dispute clusters, freshness misses, framework-registration false-negatives)
- Per-workflow patterns → `docs/workflow-runs/build.md` (cross-agent friction observed during this `/build` run)

## Discipline always

No shortcuts under pressure. Full Reviewer review + Architect compliance + Security review (if applicable) on every PR including drafts and hotfixes. The cross-host integrity (Engineer ≠ Reviewer model) is structurally enforced via Reviewer's `preferred_hosts: [codex, gemini]` (claude deliberately excluded). Do NOT run Reviewer on Claude Code against code Claude Code wrote.

## Notes

### What changed in v0.3.23

- **Heavy step content moved out of this file** into `compass/agents/engineer.md` (tasks `implement-story` + `respond-to-review` NEW), `compass/agents/reviewer.md` (tasks `write-e2e-tests` + `review-pr` at the time; `write-e2e-tests` later split to `compass/agents/automation.md` in v0.3.33), `compass/agents/pm.md` (task `arbitrate-dispute`). This file became a thin **dispatch graph** per `[agent-as-surface-independent-unit]` (canon v0.3.14).
- **No behavior change.** Every gate/work/postcondition that existed in v0.3.0-alpha shape is preserved, now inside the agent task definitions. Verification items unchanged. Refusal cases unchanged. HITL gates unchanged. Mechanical merge constraints unchanged.
- **NEW task `engineer.respond-to-review`** added so the Phase 5 review-response loop has an explicit dispatch surface (previously inline guidance in engineer.md's "Addressing reviewer findings" section).
- **PM agent now participates in `/build`** (frontmatter `participates_in_workflows:` updated) — explicit recognition of the existing `arbitrate-dispute` task that fires in `/build` disputes.
- **Cross-host orchestration enabled.** Same workflow file works whether Engineer runs on Claude Code and Reviewer runs on Codex CLI (today, with human dispatcher) or whether v0.4 orchestrator dispatches across hosts (later). The graph is the contract.
- **Second workflow refactored to dispatch-graph shape** (joining `/setup-product` v0.3.14). `[workflow-as-dispatch-graph]` now at 2 instances → codification-ready candidate. `[task-ownership-locality]` now at 2 instances → codification-ready candidate. Both surface in v0.3.23 release notes; codification decision deferred to Retro #008.

### Anti-patterns

- **Reading the workflow file alone and trying to execute it.** This file does NOT contain the step-by-step work — that lives in agent task definitions. Always load the named agent file for each step.
- **Engineer reviewing own diff.** Closed inside `engineer.implement-story` Postconditions ("Stop. Wait for Reviewer.") + `engineer.md` Refusal rules.
- **Reviewer writing production code.** Closed inside `reviewer.md` Refusal rules — E2E tests + test framework + CI configs are the only writing surfaces.
- **PM making engineering choices during dispute arbitration.** Closed inside `pm.arbitrate-dispute` Task description ("PM executes the decision; PM does NOT make engineering choices").
- **`polished-but-broken` failure mode** (tests pass + build green + narrative coherent + behavior wrong). Closed inside Engineer's `implement-story` mechanical-output-verification step + Reviewer's `review-pr` Step 0 framework-registration check.
- **Shortcutting review under pressure.** Closed inside Engineer + Reviewer Refusal rules — no P0 carve-out.

### Edge cases

- **Story produces multiple PRs** — each PR gets full dispatch graph treatment (Steps 1 → 8). Handled at workflow-level pattern section above.
- **Post-merge bug on shipped story** — reopen the story; do NOT create a separate "fix" story for the same defect. Handled at workflow-level pattern section above.
- **`.github/workflows/ai-review.yml` installed** — Engineer → Reviewer handoff automated on CI-green per `[agent-handoff]` (canon v0.3.5). Either path (automated OR manual `codex` invocation) terminates at the same place (PR comment); automation removes the tool-switch only.
- **Security-Reviewer auto-engages** in parallel with Reviewer when diff touches sensitive surfaces. Two reviews + two PR comments; both must clear (zero BLOCKERs + zero CRITICALs) before Step 7 mechanical merge constraints pass.
- **Single-host run (everything on Claude Code)** — works but VIOLATES cross-host integrity per Reviewer's `preferred_hosts: [codex, gemini]`. Engineer can run on Claude Code; Reviewer task must dispatch to Codex CLI (or Gemini CLI) for a fresh model perspective. Do NOT run Reviewer-on-Claude against Claude-written code.
- **Tech Writer / Security Reviewer migrated v0.3.36** — workflow references `compass/agents/tech-writer.md` (Task `accumulate-changelog`) + `compass/agents/security-reviewer.md` (Task `review-pr-security`). Legacy `compass/roles/` copies are grace-period only (removed in v0.4).

### Migration (v0.3.0-alpha → v0.3.23)

- **v0.3.0-alpha:** gate/work/postcondition step content lived in this workflow file (7 phases, 164 lines, methodology embedded).
- **v0.3.23:** content moved to `compass/agents/engineer.md` + `compass/agents/reviewer.md` + `compass/agents/pm.md` as task definitions. This file became a dispatch graph. **No behavior change.** Per Principle #16, every refusal case + verification gate preserved.
- **Why:** `[agent-as-surface-independent-unit]` — agents are self-sufficient surface-independent units; tasks live in agents; workflows sequence tasks. Enables cross-host orchestration (Engineer on Claude Code + Reviewer on Codex CLI today; full orchestrator dispatch in v0.4).
- **What still works the same:** workflow-level preconditions, verification checklist, HITL gates, mechanical merge constraints, output summary contract, story → multiple PRs, post-merge bugs, Scanner at phase boundaries, COMPASS_ROLE_BOUNDARY markers (relocated from per-phase markers to per-dispatch-step markers — same token-attribution semantics).
- **Companion workflow refactor expected:** `/fix` is the natural next workflow to refactor since its primary agent (Engineer) is migrated + has `fix-bug` task. `[workflow-as-dispatch-graph]` at 2 instances after v0.3.23 → 3rd instance with `/fix` refactor would trigger codification per Compass 3-instance rule.

---

_Workflow refactored 2026-06-08 (v0.3.23) per `[agent-as-surface-independent-unit]` (canon v0.3.14). 2nd workflow refactored to thin dispatch graph shape (joining `/setup-product` v0.3.14); 12 of 14 workflows still embed full methodology bodies (refactor as their owning agents migrate)._
