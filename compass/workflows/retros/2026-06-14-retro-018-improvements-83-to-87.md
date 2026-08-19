---
id: RETRO-018
type: retro
status: archive
altitude: framework
period_start: 2026-06-11
period_end: 2026-06-14
improvement_count: 5
created: 2026-06-14
author: framework-Architect (Claude Opus 4.8)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #018 — framework — improvements #83 to #87

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 + `[fractal-retro]` (canon v0.3.17). **Status: archive.** Second retro under the #78 mandatory full-surface-audit rule. Reports; does not prescribe.

## Source entries in scope

- **#83** — `[consumer-as-primary-signal]` promoted to AGENTS.md Principle #19 + canon (v0.3.39)
- **#84** — the #70 slice: requirement gates + artifact promotion + manual approval bridge (v0.4.0-alpha-6); closed review findings C3 + C6
- **#85** — setup-foundation-architecture → dispatch graph (5th); EA agent v0.3.41 split into research/derive/scaffold; C7 reconciliation closed
- **#86** — create-story → dispatch graph (6th); pm.md v0.3.42 (chatgpt dropped, decompose task self-sufficient); **full bootstrap→build chain orchestratable**
- **#87** — `[pluggable-graph-executor]` DECLARED (LLM-as-orchestrator over a mechanical gate floor); no code changed

## Common patterns (positive)

| Pattern | Instances in this batch | What it means |
|---|---|---|
| **The full-chain-opening arc** | #84 → #85 → #86 | Three improvements that compose: #84 built the gate/promotion machinery, #85 + #86 made the last two workflows dispatch graphs, and the result is a mechanically-verified end-to-end chain (`setup-product` → … → `build`). Each was small; the composition is the MVP unlock. |
| **C-finding closure rate** | #84 (C3+C6), #85 (C7), audit sweep (the rest) | The independent review's critical findings are now essentially all closed: C3/C6 (#84), C7 (#85), C4/C5 (#79/#80 last batch). The review→hardening pipeline fully drained in two batches. |
| **Reconciliation cuts both ways** | #85 (fat workflow + fat agent diverged) · #86 (fat workflow + stub agent) | Two opposite drift shapes, same fix: methodology consolidates into the agent task (+ template), workflow becomes thin. The dispatch-graph refactor is a reconciliation move, not just a thinning move. |
| **Principle #19 self-applied immediately** | #87 entry flags its own no-consumer-origin | The principle promoted in #83 was honestly applied to #87 within the same batch — the entry names itself as framework-internal rather than hiding it. The discipline works on its author. |
| **Declared-not-implemented stayed disciplined** | #87 | A tempting architecture (Claude-as-orchestrator) was captured as a design + mechanical-floor constraint without being built — `[declare-not-implement]` holding against build-it-now energy. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening applied | Convention-ready? |
|---|---|---|---|
| **Version self-claims drift across doc surfaces** | README ×2 + CLAUDE ×1 still said orchestrator "alpha-5" after #84 shipped alpha-6; README also still said the reviewer step "skips with a warning" after #79 made it halt | Audit-sweep commit e73fded: version self-claims → generic "v0.4-alpha (see CHANGELOG)" (completing the de-dup Retro #017 started); skip→halt claim corrected | Already covered by Principle #17 variant (d) `same-fact-cited-twice`; the durable fix is de-duplication (point at CHANGELOG), not re-syncing N copies — applied |
| **pre-push-grep-discipline not run on the #84/#79 amendments** | The alpha-6 bump (#84) and halt-not-skip (#79) both changed load-bearing facts but weren't swept with `pre-push-consistency-check.py` | The script exists (#82); it just wasn't invoked on those amendments. The #78 retro audit caught the residue both times | The script's VALUE is proven (catches real drift); its ADOPTION is the gap — a discipline nobody runs is ceremony. Watch-for: is it actually invoked on #88+ amendments? |

## Convention candidates

**`[test-alongside-implementation]`** — **WELL PAST THRESHOLD, codify next**
- Instances: #72 (logger), #80 (graph), #84 (gates, 22 tests), #85 + #86 (graph integration tests). 5 instances across 3 batches.
- Recommendation: **codification-ready, user-gated.** Strongest unpromoted candidate. Natural home: Engineer/Automation engineering-discipline line + canon enforcement-class.

**`[per-surface-vertical-test]`** (new — auth→RLS→render prod-parity test) — **being codified as #88**
- Instance: home-app end-to-end consumer run (2026-06-14) surfaced that tests passing on mocked auth / service-role / dev-build give false green — they skip the authorization layer (Supabase RLS) and the prod render path (RSC), so a broken RLS policy or render-path contract ships green. Joins the prod-parity lineage: #50/#51 (RSC prop serialization + server-action export purity) + the Next.js runtime-contract consumer signal. 3rd instance of the local-green/prod-broken class.
- Recommendation: **user directed codify now → #88.** Distinct from `[mechanical-output-verification]` (which checks build artifacts) — this is test-COVERAGE of the real security+render vertical.

**`[pluggable-graph-executor]`** (declared #87) — 1 instance; codify after 2nd OR once built.

## Drift signals

| Signal | Evidence | Investigation |
|---|---|---|
| **3rd consecutive zero-consumer IMPROVEMENT batch — but it CLOSED with a consumer run** | #83–#87 all framework-internal; yet the batch ended with the first real end-to-end orchestrator run on a consumer (home-app), which immediately produced signal (#88). | The honest read: the framework-build phase (#84–#86) was building toward exactly this validation. Zero-consumer is a real signal for the *improvements*, but the batch is redeemed by closing on a consumer run. Watch that #88+ stays consumer-anchored now that the chain is runnable. |
| **pre-push script adoption gap** | Version drift (above) slipped because the #82 script wasn't run on #79/#84 amendments | If the #78 audit keeps catching what the #82 script would have caught at commit time, the script needs to be wired into a pre-commit hook, not left to discipline. Candidate: mechanize it (the `[discipline-as-muscle-memory]` inverse — automate before the habit is proven). |
| **MVP doc stale** | `compass/framework/mvp.md` still shows shipped agents/workflows as ❌ | Refresh pending (flagged when the user asked "pending items to MVP"). Not done this batch. |
| **#79 halt-branch tests still absent** | run.py halt/skip branches untested (carried from Retro #017) | Bundle with the `[test-alongside-implementation]` codification. |

## Full-surface audit

**Method:** mechanical sweep (`pre-push-consistency-check.py` on version/count claims + `grep` for `compass/roles/` refs across active surfaces + task double-ownership across all 14 agent files + dispatch-graph count verification + full test suite). No independent context-free agent dispatched this round — the home-app *consumer run* is itself a stronger form of external validation this batch, and a doc-drift agent ran in the #76/Retro-#017 window; recorded honestly per the #78 minimum bar.

| Finding | Verified? | Disposition |
|---|---|---|
| README ×2 + CLAUDE ×1 orchestrator version = "alpha-5", stale vs alpha-6 (#84) | yes | **fixed-in-batch** (e73fded) → generic "v0.4-alpha (CHANGELOG single source)" |
| README:34 reviewer step "skipped with a warning" — stale vs #79 halt-not-skip | yes | **fixed-in-batch** (e73fded) → "halts (exit 2) … or `--skip-missing`" |
| "6 of 17 workflows in dispatch-graph shape" (AGENTS.md) | yes — 6 confirmed by grep | accurate, no change |
| `compass/roles/` refs in active surfaces | all justified (grace-period rule, historical relocation notes, deprecated advance.md, audit instruction) | clean |
| Task double-ownership across 14 agent files | none | clean |
| Test suite | 57 pass | clean |

## Trigger-origin analysis

- **Framework-internal:** 5 of 5 improvements (#83–#87) — completing the orchestrator chain + a declared design.
- **Consumer validation (batch-closing event, not an improvement):** the home-app end-to-end run — the first real orchestrator run on a consumer, producing the #88 signal. This is the remedy for the zero-consumer concern materializing exactly when the chain became runnable.
- **Concentration:** home-app is now a second active consumer alongside crypto-app (kindtree still dormant). First genuine multi-consumer signal since the orchestrator arc began.

## Watch-for list (next 5 improvements, #88–#92)

- **#88 (in progress):** `[per-surface-vertical-test]` codification — auth→RLS→render prod-parity test discipline into Engineer + Automation + canon.
- **`[test-alongside-implementation]` codification** — 5 instances, user-gated; bundle #79 halt-branch tests with it.
- **pre-push script mechanization** — wire `pre-push-consistency-check.py` into a pre-commit hook so version/count drift can't slip to the next retro's audit.
- **Stay consumer-anchored** — now that home-app runs end-to-end, #88+ should keep drawing on real run signal (Principle #19); a 4th zero-consumer batch would be a hard drift call.
- **MVP doc refresh** + the git-automation alpha-or-beta decision (the two remaining "pending items to MVP").
- **Tier-2/3 workflow refactors** — declare v0.4-beta scope explicitly per `[hard-line-declaration]` so the 11 remaining don't drift.

## Meta-observations

**The MVP unlock landed this batch.** #84–#86 made the full `setup-product → setup-foundation-architecture → create-brief → create-epic-architecture → create-story → build` chain mechanically orchestratable end-to-end — the single thing `compass/framework/mvp.md` calls "the MVP unlock." The home-app run is the first exercise of it. Compass is, by its own checklist, at or near "start sending."

**Second consecutive retro where the mandatory audit caught real drift the amendment's own commit missed.** Retro #017 caught orchestrator version self-claims; Retro #018 caught more version drift + a stale behavior claim (skip vs halt). The #78 audit step is not ceremony — it has a 2-for-2 hit rate. But the deeper signal is that the #82 *commit-time* script isn't being run, so the *retro-time* audit is doing work that should happen earlier. Mechanize the script (pre-commit hook) is the structural fix.

**Consumer signal returned at the moment the chain became runnable.** The framework spent three batches building the orchestrator chain with zero consumer-origin improvements — a real drift signal Principle #19 would flag. It's redeemed not by argument but by outcome: the moment the chain ran end-to-end on home-app, consumer signal (#88) appeared. The build phase was load-bearing for the validation, not introspection for its own sake.

**14th consecutive on-time retro.**

---

_Archived 2026-06-14. Not edited after this date. Next retro fires after improvement #92._
