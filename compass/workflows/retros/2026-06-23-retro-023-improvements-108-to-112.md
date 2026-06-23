---
id: RETRO-023
type: retro
status: archive
altitude: framework
period_start: 2026-06-22
period_end: 2026-06-23
improvement_count: 5
created: 2026-06-23
author: framework-Architect (Claude Opus 4.8)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #023 — framework — improvements #108 to #112

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 + `[fractal-retro]` (canon v0.3.17). **Status: archive.** The **"size the path + watch the work" batch** — five improvements, **all five from one continuous live home-app session** driving the orchestrator. Third straight ~100%-consumer batch, and the deepest yet: it produced two candidate *architecture* principles, a step-level dashboard, and two orchestrator bugs only real use could surface.

## Source entries in scope

- **#108** — `/fix` ITIL-tier collapse (the Retro #022 redesign) — `engineer.triage-and-fix` reproduces-from-code; `[ai-collapses-org-tiering]` 1st instance
- **#109** — right-size the path to the work: the enhancement lanes (new bet vs existing-bet story vs hygiene; classifier names the bet via the catalog) — `[right-size-the-path-to-the-work]` 1st instance
- **#110** — right-sized hand-off: the live hand-off echoes the classifier's `Next command:` (not the static route target)
- **#111** — step-level cockpit (`cockpit --run` ✓done/▶running/⏸awaiting/·pending) + first-turn heartbeat
- **#112** — OpenAI adapter `max_tokens`→`max_completion_tokens`; dispatch halts cleanly on any host error

## The arc (one session, end to end)

The DRI ran the **whole shape live on home-app** and it worked: `/triage` classified "logged off every few hours" as a **bug** (overriding the reporter's "enhancement" guess), handed off with a right-sized `Next command`, and `/fix`'s `engineer.triage-and-fix` **reproduced from the code** — diagnosed an AAL2 second-factor marker's accidental 1h TTL, **ruled out JWT/refresh/cookie by reading the auth code**, applied `[refuse-escalate]` (fixed the accidental cap, left the policy call to Architect/PM), and on the second pass **caught that its own prior fix (PR #104) was incomplete** (RSC `cookies().set()` swallowed → moved renewal to middleware) and **the build caught a `node:crypto` Edge-bundle leak** 40 unit tests missed. `automation.write-e2e-tests` **refused to mock the clock** and escalated the test seams. The Codex reviewer handoff fired (maker≠checker) — and exposed #112.

## Common patterns (positive)

| Pattern | Instances | What it means |
|---|---|---|
| **Using the tool is the engine** | 5/5 from one live session | Third consecutive ~100%-consumer batch (#021, #022, #023). The signal has deepened from bugs → architecture (the ITIL collapse, right-sizing) → the framework's *own* orchestrator bugs (#112). Principle #19 is now the default mode. |
| **Two "size the path" principles shipped** | `[ai-collapses-org-tiering]` (#108) + `[right-size-the-path-to-the-work]` (#109) | Both reject ceremony for ceremony's sake: collapse human tiers when AI removes the constraint (#108); match the workflow's weight to the work's size (#109). **Siblings — likely one meta-principle: _size the path to the work_.** |
| **The agent caught its own incomplete prior fix** | engineer, across two `/fix` runs | The 2nd `/fix` pass diagnosed PR #104 (its own work) as incomplete and superseded it — self-correction across runs, exactly what reproduce-from-code enables. The ITIL collapse (#108) paying off. |
| **Mechanized audit stays clean** | Retro #023 audit found nothing (4th straight) | consistency-check + 151 tests + double-ownership all clean at commit time. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening | Convention-ready? |
|---|---|---|---|
| **Untested host path crashed live** | #112 — the OpenAI adapter's `max_tokens` was never exercised until a real Codex review hit it; 400 on gpt-5 | #112 fix + broadened dispatch-halt | **Watch-for:** the openai/gemini adapters have no live-equivalent test; a host path that never ran is a latent crash. Candidate: a smoke/contract test per host adapter. |
| **Dispatch crashed instead of halting** | #112 — host SDK 400 escaped the `(RuntimeError, ImportError)` catch as a raw traceback | #112 broadened to `except Exception` → clean halt + resume hint + `RUN_END` | The #79 "failures halt cleanly" principle wasn't covering host-SDK errors. Now it does. |
| **The tool cap keeps biting write-mode** | #100's wrap-up fired again at 50 iters on the real `/fix`; the `fix:` commit wasn't created | wrap-up summary worked (no lost work) but the run ended mid-task | **Watch-for:** a thorough write-mode fix on a real repo exceeds 50 iterations. Candidate: a higher default cap for `--allow-write`, or auto-commit staged work at the cap. |

## Convention candidates

- **`[size-the-path-to-the-work]`** (NEW meta — pairs `[ai-collapses-org-tiering]` #108 + `[right-size-the-path-to-the-work]` #109) — match the process weight to the work; drop tiers/briefs that exist for constraints AI removed. **2 sub-instances shipped this batch.** Strongest new candidate; **DRI-gated** for canon (would be the 24th pattern, a new `process-economy` shape or under scope-discipline).
- **`[ai-collapses-org-tiering]`** (#108) + **`[right-size-the-path-to-the-work]`** (#109) — 1 instance each; codify together as the meta above, or individually. DRI-gated.
- **`[exercise-every-host-path]`** (NEW, 1 instance — #112) — every host adapter needs a live-equivalent (fake-client) test; an unexercised host is a latent crash. Codify on 2nd instance.
- **`[skill-surface-is-load-bearing]`** (#107, prior batch) — still open at 1 instance.
- **`[failure-direction-inversion]`** — still codification-ready, now overdue (carried since #017). #112's clean-halt is arguably another instance.

## Drift signals

| Signal | Evidence | Investigation |
|---|---|---|
| **Host adapters under-tested** | #112 openai crash; gemini adapter likely has the same untested risk | add per-adapter fake-client tests; the openai one landed in #112. |
| **Write-mode cap ceiling** | 50-iter cap hit on a real fix, commit not made | raise default for `--allow-write` or auto-commit-at-cap; declared, not built. |
| **Declared backlog still growing** | HTML dashboard live feed · triage→child auto-chain (v2) · Lane-3 trivial build · worktree isolation (#102) · 5 candidate codifications | keep converting — but this batch converted 2 retro-declared items (#108 from #022), so the loop is working. |

## Full-surface audit

**Method:** consistency-check (counts + version self-claims) + task double-ownership + dispatch-graph count vs AGENTS + full suite.

| Finding | Verified? | Disposition |
|---|---|---|
| consistency-check | CONSISTENT | clean (4th straight) |
| task double-ownership | none | clean |
| dispatch-graph count (9) vs AGENTS | match | clean |
| test suite | 151 pass | clean |

## Trigger-origin analysis

- **Consumer (live home-app session):** 5 of 5. The ITIL challenge → #108; "are all enhancements the same space?" + "name the bet" → #109; the dry-run contradiction → #110; "see the whole plan / looks frozen" → #111; the Codex review crash → #112. Deepest consumer batch yet — architecture, UX, and framework-internal bugs all from one run.

## Watch-for list (next 5 improvements, #113–#117)

- **Codify `[size-the-path-to-the-work]`** (the #108/#109 meta) — strongest candidate; DRI-gated.
- **Per-host-adapter tests** (#112 watch-for) — close the untested-host gap; check the gemini adapter for the same `max_tokens` issue.
- **Write-mode cap** — raise the default for `--allow-write` or auto-commit at the cap (the recurring 50-iter ceiling).
- **HTML `/dashboard` live feed** — the browser surface the DRI keeps asking for (text cockpit shipped #104/#111).
- **Codify `[failure-direction-inversion]`** — overdue.

## Meta-observations

**The framework is now improved almost entirely by *running* it.** Three straight batches (#021–#023) are ~100% consumer/DRI-driven, and #023 is the proof of concept at full depth: one session produced two architecture principles, a dashboard feature, and fixed two orchestrator bugs that only real use could surface — including the framework's first **cross-host review actually executing** (Codex), which immediately found a latent adapter bug. The lesson from #021 ("get the tool in front of real work") has compounded.

**"Size the path to the work" is becoming a through-line.** #108 (collapse the fix tier) and #109 (right-size the enhancement path) are the same idea in two places; #110/#111 made it visible. This is the batch's intellectual center and the most promotion-ready pattern.

**19th consecutive on-time retro.**

---

_Archived 2026-06-23. Not edited after this date. Next retro fires after improvement #117._
