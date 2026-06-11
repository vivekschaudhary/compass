---
id: RETRO-017
type: retro
status: archive
altitude: framework
period_start: 2026-06-11
period_end: 2026-06-11
improvement_count: 5
created: 2026-06-11
author: framework-Architect (Claude Fable 5)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #017 — framework — improvements #78 to #82

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 + `[fractal-retro]` (canon v0.3.17). **Status: archive.** First retro executed under the #78 rule: full-surface audit is mandatory at this altitude. Patterns surfaced here feed future improvements via normal triggers; this artifact reports, it does not prescribe.

## Source entries in scope

- **#78** — Retro full-surface audit step (user directive): retro.md Process step 6 + template section + verification gate — retros audit the artifact surface, not just the log
- **#79** — Orchestrator halt-not-skip: missing host/agent halts with exit 2; `--skip-missing` is the loud explicit escape (closes review finding C4)
- **#80** — HITL gate-detection hardening + first graph.py tests: tolerant Dispatches-line parsing + HITL-in-title marker; 17 new tests, 32 total (closes C5)
- **#81** — Orchestrator small-fix batch: `DEFAULT_MODELS` + `COMPASS_MODEL_*` env overrides, `max_tokens` 8192, exit-code contract 0/1/2, kit log dirs, README options table (closes review Bucket D)
- **#82** — `[pre-push-grep-discipline]` codified (user decision): canon entry (6th enforcement member, catalog 19), `pre-push-consistency-check.py`, CLAUDE.md discipline rule 8, AGENTS.md Principle #17 element-2 wiring

## Common patterns (positive)

| Pattern | Instances in this batch | What it means |
|---|---|---|
| **Review-to-hardening conversion, same day** | #79 + #80 + #81 all closed findings from the 2026-06-11 independent review; #78 + #82 codified its meta-lessons | The full loop — independent audit → verified triage → mechanical hardening → codification — ran inside one day. The framework metabolized external criticism into structure without a backlog rotting phase. |
| **Tool validates itself at birth** | #82 (script's first real run caught mvp.md's phantom `compass run` refs missed by #76); #80 (integration tests immediately pinned gate positions in all 4 real graphs) | New mechanical defenses shipped WITH evidence they catch real instances, not hypothetical ones. |
| **`[test-alongside-implementation]` 2nd instance** | #80 (new parsing behavior + 17 tests, same commit; 1st instance was #72) | Shape confirmed at threshold: when orchestrator code gains new behavior, tests ship in the same commit. Candidate is codification-ready per the 2-instance rule — surface to DRI. |
| **Failure-direction inversion as a design move** | #79 (silent skip → loud halt), #80 (silently-deleted gate → visibly-added gate) | Both fixes chose "false positive is visible, false negative was invisible" — a reusable hardening heuristic worth naming if it recurs. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening shape applied | Convention-ready? |
|---|---|---|---|
| **Same-fact-cited-N-times version drift** | Orchestrator self-claims: run.py "alpha-4" ×2, orchestrator README "alpha-2" ×4 — survived #76's sweep because that sweep fixed the *root* docs, not the component's self-claims | Audit-sweep commit ce4c825: replaced restated numbers with generic "v0.4-alpha" + CHANGELOG pointer — removed the recurring fact instead of updating it in N places again | Already codified — this is Principle #17 variant (d); the structural fix (de-duplicate the fact) is the lesson |
| **Sweep-followers miss the originator's own surface** | #76 fixed `compass run` in README but missed mvp.md; #76 fixed version claims in README but missed run.py/orchestrator-README | `pre-push-consistency-check.py` (#82) — greps ALL tracked files, not the editor's mental list | Yes — this is exactly why the script exists; watch its hit-rate over #83–#87 |

## Convention candidates

**`[test-alongside-implementation]`** — **AT THRESHOLD (2 instances: #72, #80)**
- **Proposed shape:** when orchestrator/script code gains a new write path or new parsing behavior, tests ship in the same commit — create + append + round-trip + variant cases. Not a "tests later" PR.
- **Recommendation:** codification-ready; user decision. Natural home: canon enforcement-class or a CLAUDE.md/AGENTS.md engineering-discipline line.

**`[failure-direction-inversion]`** — new this batch (1 instance-pair)
- **Proposed shape:** when hardening a detection mechanism, prefer designs where the failure mode is a visible false positive over an invisible false negative (#79's halt, #80's extra-gate).
- **Recommendation:** wait — 1 batch's evidence; watch whether the heuristic fires again in the #70 gate redesign.

**`[independent-review-as-signal-source]`** — partially absorbed by #78
- The retro-time audit (#78) now structurally mandates the review cadence at every 5 improvements. The standalone candidate (ad-hoc deep reviews between retros) stays at 1 instance; the mandatory audit may make a separate canon entry redundant. Re-evaluate after Retro #018 runs its audit.

## Drift signals

| Signal | Evidence | Investigation candidate |
|---|---|---|
| **#70 implementation still unstarted** | Declared 2026-06-09; gate redesign + connector + C6 manual-path bridge all pending; 3 batches elapsed | Strongest candidate for #84+ — pipeline mode remains gate-broken until this ships (orchestrator output never satisfies downstream gates) |
| **setup-foundation-architecture dual source of truth** | C7 unresolved; interim "agent file wins" note only | Next workflow→dispatch-graph refactor; must reconcile content, not just thin |
| **Test coverage still partial** | 32 tests cover logger.py + graph.py; run.py control flow, hitl.py, dispatch.py, router.py at zero | run.py's new halt/skip branches (#79) are untested — `[test-alongside-implementation]` was NOT applied to #79 (halt paths are interactive/exit-code-based, harder to test, but not impossible) |
| **Batch had zero consumer involvement, again** | #78–#82: 2 review-driven, 2 user-directive, 1 internal | Two consecutive zero-consumer batches; `[consumer-as-primary-signal]` promotion (#83, user-approved) should make this visible per-improvement going forward |

## Full-surface audit

**Method:** mechanical sweep (`pre-push-consistency-check.py` + targeted greps: version claims, counts, `compass/roles/` refs, task double-ownership across all 14 agent files, referenced-template existence, doc-claims-vs-code spot-checks). An independent context-free agent review ran earlier the same day (origin of #76/#77 and this batch's findings); re-dispatching one hours later would be ceremony — recorded honestly per the #78 rule's minimum bar.

| Finding | Verified? | Disposition |
|---|---|---|
| run.py self-claims "v0.4-alpha-4" (L3, L596); orchestrator README self-claims "alpha-2" (×4) — both stale vs CHANGELOG alpha-5 | yes | **fixed-in-batch** (ce4c825): restated numbers removed, CHANGELOG made the single source |
| SETUP.md:267 still offered `compass/roles/<role>.md (legacy)` as a wrapper source | yes | **fixed-in-batch** (ce4c825) |
| Task double-ownership across agent files | none found | clean |
| Referenced templates (retro-project.md, role-activity-log.md, workflow-run-log.md) | all exist | clean |
| Remaining `compass/roles/` mentions | all justified (grace-period notes, historical migration notes, deprecated advance.md, the audit instruction itself) | clean |
| Count-claims ("N of M", catalog totals) | 2 hits, both justified (canon "grows from→to" historical lines; script's own docstring example) | clean |

## Trigger-origin analysis

- **Independent-review findings:** 3 of 5 (#79, #80, #81) — the review's net-new items, closed same-day.
- **User directive:** 2 of 5 (#78 retro scope; #82 codify decision).
- **Consumer friction:** 0 of 5 — second consecutive zero-consumer batch. The #82 canon entry's instance 1 is consumer-origin evidence, but no new consumer signal arrived this cycle.

## Watch-for list (next 5 improvements, #83–#87)

- **#83 (queued, user-approved):** `[consumer-as-primary-signal]` promotion — lands immediately after this retro.
- **#70 implementation slice** — connector + runs.jsonl/hitl.jsonl gate redesign + C6 manual-path bridge. Three batches deferred; if it defers past #87, that's a `[hard-line-declaration]` trigger.
- **`[test-alongside-implementation]` codification decision** — at 2 instances; user-gated. Also: apply it retroactively to #79's untested halt branches.
- **setup-foundation-architecture reconciliation (C7)** — content decision, not just refactor.
- **`pre-push-consistency-check.py` adoption** — does it actually get run on load-bearing amendments in #83–#87? A codified discipline nobody invokes is ceremony; track invocations.
- **Retro #018's audit** — second run of the mandatory audit; if it also yields verified findings, the #78 rule is earning its gate status.

## Meta-observations

**First retro under its own new rule.** #78 was logged at the start of this batch; this retro is the first bound by it. The audit found real drift (orchestrator version self-claims) that #76's 16-file sweep had missed — third demonstration this week that sweeps anchored to a reviewer's instance list miss the class. The lesson compounds: instance-fix < class-sweep < fact-deduplication. The ce4c825 fix chose deduplication (remove the restated fact) over another round of synchronized updates.

**Fastest finding-to-structure cycle so far.** Review findings published, triaged against backlog, fixed (#79–#81), and their meta-lessons codified (#78, #82) within ~24 hours — with the retro and audit landing the same day. Cadence discipline (12 prior on-time retros) made this possible: there was no backlog debt competing for the batch.

**Counter discipline held under pressure.** The user approved two improvements back-to-back ("codify 1, promote 2"); the second would have pushed the counter past the retro horizon. The retro fired between them instead of after both — the first time the cadence rule has constrained sequencing of explicitly user-approved work. `[discipline-as-muscle-memory]` holding against user-velocity pressure, not just agent-velocity pressure.

**13th consecutive on-time retro.**

---

_Archived 2026-06-11. Not edited after this date. Next retro fires after improvement #87._
