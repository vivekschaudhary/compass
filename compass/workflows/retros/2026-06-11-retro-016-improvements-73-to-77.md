---
id: RETRO-016
type: retro
status: archive
altitude: framework
period_start: 2026-06-10
period_end: 2026-06-11
improvement_count: 5
created: 2026-06-11
author: framework-Architect (Claude Fable 5)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #016 — framework — improvements #73 to #77

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 (soft-spec-rationalization defense via periodic pattern review) + `[fractal-retro]` (canon.md v0.3.17). **Status: archive.** Patterns surfaced here feed future improvements via normal triggers; this artifact reports, it does not prescribe.

## Source entries in scope

- **#73** — enterprise-architect agent migration (4 tasks; 2 mandatory HITL gates; 6-category research + 9-axis data model + Well-Architected scoring)
- **#74** — security-reviewer agent migration (single task `review-pr-security`; `preferred_hosts: [codex, gemini]` excludes claude)
- **#75** — tech-writer agent migration (2 tasks: append-only changelog + finalize-brief-docs). **All 14 agents migrated; `compass/roles/` grace-period-only.**
- **#76** — independent-review doc-consistency sweep (16 files: stale migration counts, SETUP `cp` trailing-slash install bug, CLAUDE.md commands/orchestrator sections, AGENTS.md host table + orphaned scanner block, 9 files still loading `compass/roles/` for migrated agents, config.yaml version, MIGRATION.md Path B orchestrator copy)
- **#77** — reviewer/automation task-ownership reconciliation (reviewer.md → v0.3.37, `write-e2e-tests` removed; build.md Step 2 → `automation.write-e2e-tests`; run.py rejection-note `--from-step` hint fixed)

## Common patterns (positive)

| Pattern | Instances in this batch | What it means |
|---|---|---|
| **Migration arc completed** | #73 + #74 + #75 | The v0.3.14 `[agent-as-surface-independent-unit]` refactor is structurally complete: 14/14 agents in `compass/agents/`. Closed on the 3rd cycle after the Retro #015 watch-for warned a 3rd deferral would be a hard-line candidate — the cadence pressure worked. |
| **Independent adversarial review as a new signal source** | #76 + #77 (both originated from a single context-free review agent run) | First time the framework was audited by an agent with zero session history. It found drift the resident session was structurally blind to — the resident session *wrote* the stale docs, so it doesn't reread them. New origin class alongside consumer-friction and user-oversight. |
| **Verify-before-fix discipline** | #76 (every reviewer claim grep-verified against the repo before any edit; one claim — the clone URL — was checked and found NOT broken, so not "fixed") | Independent review output was treated as findings to validate, not instructions to execute. Prevented one unnecessary edit. |
| **Sweep widened beyond the reported instances** | #76 (reviewer flagged build.md + scan.md; the fix swept the whole class — 7 more workflow files + 2 skill stubs loading `compass/roles/` for migrated agents) | Principle #17 applied at class level, not instance level. The grep found 9 files the reviewer's sample missed. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening shape applied | Convention-ready? |
|---|---|---|---|
| **`[cross-artifact-sweep-on-contract-shift]` violated by the framework itself** | 2 in this batch: the v0.3.36 "all 14 migrated" shift (#73–#75) not swept to README/SETUP/CLAUDE.md/build.md (fixed in #76); the v0.3.33 reviewer→automation split never swept to reviewer.md/build.md Step 2 (fixed in #77, ~2 days latent) | Principle #17 exists (codified #71) but its mechanical gate lives in `/build` `implement-story` Step 7 — a CONSUMER-code surface. Framework edits made in interactive sessions bypass it entirely. No gate fired; an external reviewer caught it. | **Yes** — this is the 2nd/3rd instance of `[pre-push-grep-discipline]` (1st: 2026-06-08 consumer Codex session). At threshold; user-gated (deferred to post-MVP per standing direction — MVP orchestrator has shipped, so the deferral condition is arguably met). |
| **Aspiration written as current fact** | README "HITL stops are hard" (orchestrator `--from-step` bypasses; regex fragility) · CLAUDE.md "orchestrator not yet present" (shipped at alpha-5) · README `compass run` (no packaging exists) · "commit artifacts to repo" (not implemented) | #76 rewrote all to present-honest with explicit caveats. Same spirit as `[no-padded-status]` (1 prior instance, v0.3.15) — status language must match mechanical reality. | No — 2 total instances of the named shape; watch for 3rd. |
| **Counter/version-claim drift** | 4 different orchestrator version claims across README/orchestrator-README/run.py/CHANGELOG; `framework_version: 1.0` in config.yaml matching nothing | #76 normalized. Root cause: version is a same-fact-cited-N-times contract surface (Principle #17 variant d) with no single source of truth. | No — fold into `[pre-push-grep-discipline]` mechanics (version strings are exactly what a grep sweep catches). |

## Convention candidates

**`[pre-push-grep-discipline]`** — **AT THRESHOLD, user decision pending**
- **Instances counted:** 2–3. (1) 2026-06-08 consumer Codex review session (4 rounds of rename sweeps + 30-day-window drift). (2) v0.3.36 migration contract shift unswept → #76. (3) v0.3.33 split unswept → #77. Instances 2 and 3 are the same session-discipline failure class on the framework's own surface.
- **Proposed shape:** after amending a load-bearing concept (rename, split, count, version, ownership), grep the full artifact + neighbors for the old phrasing BEFORE committing. Mechanizable: `compass/scripts/pre-push-consistency-check.py` taking amended-terms + paths; agent-file pre-commit checklist line for framework-edit sessions; pre-Reviewer-dispatch sub-step in the orchestrator (don't pay cross-model review cost for grep-class drift).
- **Recommendation:** **Codification-ready.** Standing user direction was "defer to post-MVP, surface at 2nd instance" — both conditions are now met (orchestrator MVP shipped; 2nd instance logged). Decision belongs to the DRI; do not auto-promote.

**`[independent-review-as-signal-source]`** — new this batch
- **Instances counted:** 1 (the 2026-06-11 context-free review producing #76 + #77 + 4 net-new backlog items).
- **Proposed shape:** periodically dispatch a zero-context agent (or different model) to audit the framework as a skeptical newcomer; treat output as claims to verify, not instructions. Complementary to `[consumer-as-primary-signal]`: consumer signal finds what breaks in use; independent review finds what drifted in docs. The resident session cannot find its own doc drift — it has the stale claims in its priors.
- **Recommendation:** Wait for 2nd instance. If the next independent review (post-#82) again yields multiple verified findings, codify with a cadence (e.g., every N improvements or each minor version).

**`[consumer-as-primary-signal]`** — promotion still pending from Retro #015
- **This batch: 0 of 5 consumer-driven** — first zero-consumer batch since the orchestrator arc began. Doesn't weaken the candidate (5+ prior instances stand); it shows the framework can also run a healthy internal-maintenance batch. Promotion decision remains with the user.

**`[test-alongside-implementation]`** — 2nd instance NOT triggered
- #77 touched run.py but only a string template (no new write path); 15/15 existing tests pass, none added. Shape's trigger condition ("new write path") genuinely didn't fire. Honest non-instance, not a miss. Next real opportunity: the C5 graph.py hardening (new parsing behavior ⇒ tests required).

## Drift signals

| Signal | Evidence | Investigation candidate |
|---|---|---|
| **Doc-drift debt exceeded tracked backlog** | Independent review: 11 critical findings + 13 inconsistencies. Cross-check vs improvements log: ~4 were genuine blind spots (silent host-skip C4, HITL-regex fragility C5, manual-path approval gap C6, setup-foundation-architecture content divergence C7); the rest were already declared (#70), scheduled (v0.4), or watch-fors | The blind spots cluster in the orchestrator-honesty area — docs vs code behavior. The C/D-vs-backlog comparison (chat, 2026-06-11) is the triage record |
| **Orchestrator silently skips steps** (C4) | run.py: missing host or agent file → warn + `continue`. A `/build` with no OPENAI/GEMINI key proceeds with NO review | Highest-severity open item; contradicts "No silent skips" (Principle + AGENTS.md). Candidate #78: halt-or-explicit-DRI-skip |
| **HITL gate detection is one brittle regex; graph.py untested** (C5) | graph.py:55-57 `\*\*Dispatches:\*\*\s+HUMAN`; a formatting change silently deletes a human gate. Test coverage still logger.py-only (carried from Retro #012 + #015 watch-fors) | Tolerant parsing + graph.py test suite; natural `[test-alongside-implementation]` 2nd instance |
| **Two approval mechanisms, neither path complete** (C6) | SETUP.md: flip `status:`; new agents (EA, tech-writer) gate on hitl.jsonl. Manual sessions have no hitl.jsonl writer; orchestrator runs never flip status | Fold into #70 implementation (connector + gate redesign): gates accept either during v0.3.x, or ship a manual hitl-append helper |
| **setup-foundation-architecture dual source of truth** (C7) | 363-line legacy workflow (elicitation, scaffolding, canary, config population) vs EA agent task (research + data model + scoring) — same name, divergent content. #76 added "agent file wins" note as interim | Next workflow→dispatch-graph refactor must RECONCILE content (decide where elicitation/scaffold/canary live), not just thin the file |
| **Dev environment lacks pytest** | 15-test suite runs only via `unittest` discovery in this environment | Minor; document `python3 -m unittest discover` as the fallback runner or add dev-requirements |

## Trigger-origin analysis

- **Framework-internal (planned migration completion):** 3 of 5 — #73, #74, #75. Long-tracked watch-for items, not new friction.
- **Independent adversarial review:** 2 of 5 — #76, #77. **New origin class, first appearance.** Signal-source diversity is now: consumer friction · user oversight · framework-internal · independent review.
- **Consumer friction:** 0 of 5. Crypto-app idle this cycle; kindtree installed but dormant. Concentration risk unchanged from Retro #015 — still effectively one consumer when active.

## Watch-for list (next 5 improvements, #78–#82)

- **C4 halt-not-skip** — orchestrator must halt (or log an explicit DRI skip) when a step's host/agent is unavailable, especially review steps. Highest-priority net-new from the review.
- **C5 graph.py hardening + tests** — tolerant HITL-marker parsing; first test coverage beyond logger.py; `[test-alongside-implementation]` 2nd-instance opportunity.
- **#70 implementation slice** — connector abstraction + runs.jsonl/hitl.jsonl gate redesign, now including the C6 manual-path approval bridge.
- **C7 setup-foundation-architecture refactor** — dispatch-graph shape WITH content reconciliation (elicitation/scaffolding/canary placement decided, not dropped).
- **`[pre-push-grep-discipline]` codification decision** — at threshold; user-gated. If declined, log the decline as a DRI decision so the candidate stops resurfacing.
- **D-batch small fixes** — router.py model defaults + `max_tokens: 8096` typo + HITL-rejection exit code + missing `docs/role-activity/` `docs/workflow-runs/` `docs/orchestrator-runs/` dirs in the kit. One commit.

## Meta-observations

**The framework failed its flagship principle on the batch that completed its flagship refactor.** Principle #17 (`[cross-artifact-sweep-on-contract-shift]`, codified #71 with n=12 consumer evidence) was violated by the very next batch (#73–#75) on the framework's own surface — and the violation was found by an outside agent, not by the gate. The lesson is Principle #14 applied reflexively: "the fix is never 'tell the agent to be better'" holds for the framework's own maintenance loop too. The principle's mechanical gate lives only in consumer-facing `/build`; framework-edit sessions have no equivalent. That asymmetry is the structural root of both #76 and #77.

**Resident-session blindness is a real phenomenon with a cheap antidote.** The session that writes the docs cannot notice the docs going stale — staleness is invisible from inside the context that produced it. A zero-context reviewer found in one pass what 12 consecutive on-time retros did not, because retros read the improvements log, not the full doc surface. Retros catch process drift; independent review catches artifact drift. They are different instruments.

**Migration arc: v0.3.14 → v0.3.36, 14 agents, ~9 days.** The `[agent-as-surface-independent-unit]` declaration (2026-06-02 canon) to full migration took 22 agent-files-days of elapsed work across 9 calendar days, interleaved with the orchestrator alpha track. The incremental per-release migration model (3 + 1 + 2 + 1 + 1 + 1 + 2 + 3) worked: no big-bang, no broken intermediate state, grace-period roles/ throughout.

**12th consecutive on-time retro.** Fired at #77 exactly per the #015 horizon. `[discipline-as-muscle-memory]` continues to hold post-canon-promotion.

---

_Archived 2026-06-11. Not edited after this date. Next retro fires after improvement #82._
