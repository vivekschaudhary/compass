---
id: RETRO-015
type: retro
status: archive
altitude: framework
period_start: 2026-06-09
period_end: 2026-06-10
improvement_count: 5
created: 2026-06-10
author: framework-Architect (Claude Sonnet 4.6)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #015 — framework — improvements #65, #69–#72

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 (soft-spec-rationalization defense via periodic pattern review) + `[fractal-retro]` (canon.md v0.3.17). **Status: archive.** Patterns surfaced here feed future improvements via normal triggers; this artifact reports, it does not prescribe.
>
> **Counter note:** Improvements.md header said "fires at #73" (Retro #014 at #68 + 5). This retro fires at #72 because improvement #65 (consumer migration guide — reserved and named as a counter gap) was shipped late in this session and counted as one of the 5 in this batch. This is correct behavior per `[hard-line-declaration]`: named gaps count. The header is updated to reflect the corrected next-fire horizon (#77).

## Source entries in scope

- **#65** — Consumer migration guide `MIGRATION.md`: v0.1 roles/ → current agents/ (shipped late; counter slot held open honestly in session containing #66) — [source](#65-late)
- **#69** — README: "Why discipline?" + OKR-driven organizations sections — [source](#69)
- **#70** — Institutional data layer declared: runs.jsonl as source of truth + hitl.jsonl schema + architecture amendment (connector-agnostic gating, HITL as write trigger) — [source](#70)
- **#71** — `[cross-artifact-sweep-on-contract-shift]` promoted to AGENTS.md Principle #17; Minimize friction renumbered #18; runs.jsonl + hitl.jsonl sweep confirmed clean — [source](#71)
- **#72** — runs.jsonl + hitl.jsonl end-to-end: `log_hitl()`, `load_hitl_log()`, `print_hitl_table()`, `--hitl-log` flag, 15 tests (first test suite in framework history) — [source](#72)

## Common patterns (positive)

| Pattern | Instances in this batch | What it means |
|---|---|---|
| **Declaration → implementation sequencing** | #70 (declare) → #72 (implement) | `[declare-not-implement]` working correctly. hitl.jsonl was declared when the vision was clear; implementation followed when user prioritized it. No premature build. |
| **Consumer evidence as primary codification trigger** | #65 (crypto-app v0.1 friction) · #71 (12 CB-bot instances) · #72 (hitl gap from #70 consumer run) | 3 of 5 improvements in this batch originated from real consumer friction, not synthetic framework reasoning. `[consumer-as-primary-signal]` continues to hold. |
| **Sweep-before-ship discipline** | #71 (hitl.jsonl + runs.jsonl sweep as part of cross-artifact-sweep improvement) | The framework applied its own new principle (#17) to itself in the same session it was promoted. Self-consistency. |
| **Tests alongside implementation** | #72 (15 tests shipped with the code in same commit) | First time the framework's orchestrator tooling shipped with a test suite. No tests existed before this batch. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening shape applied | Convention-ready? |
|---|---|---|---|
| **Counter header / entry discrepancy** | #65 gap + this retro header mismatch | Named gap in #66 entry ("logging gap honestly"), entry-level 5-of-5 tracking in #72 | No — 1 instance; minor; update the header discipline if it recurs |
| **Architecture declared, local artifact still written** | #70 (runs.jsonl = source of truth declared) yet PM agent still writes `docs/bets/<id>/brief.md` | #70 amendment named it correctly; connector abstraction not yet built so filesystem fallback IS the connector | No — expected state; becomes anti-pattern if connector ships and PM doesn't update |
| **Unmigrated agents deferred again** | enterprise-architect, security-reviewer, tech-writer not migrated in this batch (was planned as #72, replaced by hitl.jsonl implementation) | Documented in MIGRATION.md as "3 not-yet-migrated agents" | No — justified tradeoff; track as drift |

## Convention candidates

**`[test-alongside-implementation]`**
- **Name:** test-alongside-implementation
- **Instances counted:** 1 (#72 — 15 tests with log_hitl/log_step/parse_step_output shipped in the same commit as the implementation)
- **Proposed shape:** when a framework orchestrator script ships new write paths, at minimum: create + append + round-trip + linkage tests ship in the same commit. Not a separate "add tests later" PR.
- **Recommendation:** Wait for 2nd instance (next orchestrator feature). Strong 1st instance but shape needs validation.

**`[data-as-institutional-memory]`** (from #70)
- **Name:** data-as-institutional-memory
- **Instances counted:** 1 (declared in #70)
- **Proposed shape:** accumulated HITL decisions + DRI logs + run records = the org's proprietary judgment about what "good" looks like. This data cannot be copied with the framework files — it accumulates with use.
- **Recommendation:** Wait for 2nd instance (likely when first org-altitude retro runs with multi-project data, or when someone asks "can I share our HITL history with another team?").

**`[consumer-as-primary-signal]`** (now at 3+ instances)
- **Name:** consumer-as-primary-signal (already in watch-for from Retro #013 and #014)
- **Instances counted:** This batch: #65 + #71 + #72 = 3 in this batch alone. Prior batches: 2 instances in #013. Total: 5+.
- **Proposed shape:** consumer project friction is the primary codification trigger for framework improvements; synthetic framework-on-framework reasoning is secondary. When a framework improvement has no consumer origin, surface that explicitly and verify it isn't ceremony.
- **Recommendation:** **Promotion candidate.** 5+ instances across 3 batches. Shape is stable. Propose as a AGENTS.md cross-cutting principle or canon.md pattern in the next improvement cycle if user agrees.

## Drift signals

| Signal | Evidence | Investigation candidate |
|---|---|---|
| **3 unmigrated agents** | enterprise-architect, security-reviewer, tech-writer in `compass/roles/` since v0.3.x; deferred twice (once in #013 cycle, again this batch) | Schedule as #73 unless a higher-priority consumer signal arrives first; MIGRATION.md documents it but the asterisk stays |
| **Connector abstraction gap** | #70 declared runs.jsonl as canonical; PM agent still writes brief.md; no connector layer built | Two mental models now coexist (runs.jsonl = truth vs. brief.md = file); if a consumer sets up Confluence connector expecting this to work, it won't |
| **Orchestrator gate still file-based** | #70 declared gates should check runs.jsonl for prior step completion; run.py still runs sequentially with `--from-step` as the resume mechanism | Gate redesign deferred — low severity for single-user orchestration, becomes load-bearing when multi-agent parallel runs appear |
| **Test suite scope** | 15 tests cover logger.py only; run.py, graph.py, hitl.py, dispatch.py, router.py have zero test coverage | New features in untested modules won't have the regression protection #72 provides for the logger |

## Trigger-origin analysis

- **Consumer friction (real-world):** 3 of 5 improvements — #65 (crypto-app v0.1 migration gap), #71 (12 CB-bot cross-artifact drift instances), #72 (hitl.jsonl gap observed during consumer orchestrator run)
- **Framework-internal (institutional positioning):** 2 of 5 — #69 (README discipline + OKR overlay), #70 (data layer vision + architecture amendment)
- **Concentration:** single consumer (crypto-bot / crypto-app) is still the primary signal source. Kindtree install is done but no workflow runs are planned for this validation cycle. Second consumer signal TBD.

## Watch-for list (next 5 improvements, #73–#77)

- **Agent migrations** — enterprise-architect, security-reviewer, tech-writer. Third deferral would be a hard-line-declaration candidate.
- **Connector abstraction layer** — HITL approval triggering connector push (Confluence / Linear / GitHub / docs/ fallback). Without this, #70's gating redesign can't ship and brief.md stays the de-facto canonical.
- **`[test-alongside-implementation]`** 2nd instance — watch for the next orchestrator feature to confirm the pattern or flag its absence.
- **`[consumer-as-primary-signal]`** promotion decision — user to confirm or defer; shape is stable at 5+ instances.
- **Second consumer validation** — kindtree framework install is done but no workflow runs planned. Crypto-app remains the primary consumer signal source. Watch for a second consumer (TBD) to validate cross-consumer patterns.

## Meta-observations

**First test suite in framework history (#72).** Retro #015 is the first batch where the orchestrator tooling shipped with tests. This changes the risk profile of future logger.py changes — regressions are now catchable without manual orchestrator runs. The absence of tests for the other orchestrator modules (run.py, graph.py, dispatch.py) is the logical next risk surface.

**Declaration-to-implementation speed is improving.** #70 (declared 2026-06-10 morning) → #72 (implemented same day). Historically, declared improvements waited 1–3 sessions. Consumer urgency (user asked "better to populate and test the runs.jsonl and hitl.jsonl end to end") drove same-session implementation. This is `[user-as-load-bearing-oversight]` pulling framework priorities into alignment with real usage.

**11th consecutive on-time retro.** The `[discipline-as-muscle-memory]` canon entry (v0.3.34) hypothesized that the retro cadence would hold without active enforcement. Retro #015 fires at improvement #72 — within the 5-improvement window from #68. Consistent cadence across 11 retros confirms the hypothesis.

**Principle count reached 18.** AGENTS.md now has 18 numbered cross-cutting principles (1-16 existing + #17 cross-artifact-sweep + #18 Minimize friction). The enforcement class is the largest at 5 members. Framework discipline is now structurally dense enough that consumer projects running Compass get non-trivial constraint enforcement without customization.

---

_Archived 2026-06-10. Not edited after this date. Next retro fires after improvement #77._
