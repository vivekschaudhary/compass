---
id: RETRO-024
type: retro
status: archive
altitude: framework
period_start: 2026-06-23
period_end: 2026-06-23
improvement_count: 5
created: 2026-06-23
author: framework-Architect (Claude Opus 4.8)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #024 — framework — improvements #113 to #117

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 + `[fractal-retro]` (canon v0.3.17). **Status: archive.** The **"operability + cost" batch** — the orchestrator, built capability-first, met sustained real use for the first time and the bills/gaps came due. 5 improvements, **all from the live home-app session**; the standout was a **$20 burn** that exposed the orchestrator had never been cost-tuned.

## Source entries in scope

- **#113** — HTML cockpit (browser feed: `--html` snapshot + `--serve` read-only localhost live server)
- **#114** — `sync-into-consumer.py` (safe embedded-copy sync; dry-run default + backup)
- **#115** — Sonnet by default + `model_tier: deep` opt-up (~5×)
- **#116** — `--max-cost` budget cap (+ fixed the latent #104 `on_event` wiring bug)
- **#117** — condensed inter-step context (TL;DR/files/next-command, not 3KB raw)

## The arc

Three straight batches of *building* the orchestrator (#103–#112: routing, spine, cockpit, fix-collapse) gave way to **running it hard** — and real use is a different teacher than design. One home-app session surfaced: a browser-dashboard need (#113), embedded-copy drift between the dual surfaces VS Code + orchestrator (#114), and a **$20 cost shock** that traced to Opus-by-default with no ceiling (#115/#116/#117) — plus, found in passing, a **silent wiring bug** (`on_event` got an `emit(type,**fields)` fn but the loop calls `on_event(dict)`) that had been mangling tool/usage events since #104.

## Common patterns (positive)

| Pattern | Instances | What it means |
|---|---|---|
| **Real use exposes what design can't** | $20 burn (#115), drift (#114), the #104 wiring bug (found via #116), API-limit crash (#112 prior) | Sustained dogfooding surfaced cost, operability, and a latent bug that 168 tests + design review never did. The single richest operability signal of the project. |
| **Honest competitive framing** | "VS Code is cheaper" → accepted, not defended | The retro/owner conceded that for interactive single-task work a flat-subscription VS Code beats a metered orchestrator, and re-justified the orchestrator on what it *uniquely* does (cross-model review, parallel portfolio, headless, audited gates) — leading to the declared `claude-code` host. No false loyalty. |
| **Fix found a deeper bug** | #116's budget work uncovered the #104 `on_event` mismatch | Building the cost meter required usage events to actually arrive — which revealed they'd been mangled all along. A fix that pulls a bigger thread (cf. #112). |
| **Mechanized audit stays clean** | Retro #024 audit found nothing (5th straight) | consistency-check + 168 tests + double-ownership all clean. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening | Convention-ready? |
|---|---|---|---|
| **Built capability-first, never cost-tuned** | Opus default everywhere; no budget cap; raw growing context | #115 Sonnet default · #116 `--max-cost` · #117 condense | **Yes** — `[economy-by-default]`: default to the cheapest model/context that meets the bar; opt *up* deliberately. A framework that runs many metered steps must be cost-tuned, not just capable. |
| **A feature mechanized in one surface silently skips the others** | the #104 `on_event` wiring bug (orchestrator path mangled events the test path didn't); branch discipline lives only in run.py, not the agents (interactive VS Code edits `main`) | #116 fixed the wiring; branch-discipline declared (#115b candidate) | **Yes** — `[surface-independent-mechanism]`: a discipline/feature enforced in orchestrator code must also be encoded where interactive hosts read it. Same family as #107 (skill surface). **3rd instance** (skill desc, branch, emit) — codify. |
| **Refusal cascades instead of halting** | the `/ops` run: EA refused → 4 downstream steps cascaded (5 wasted Opus calls) | declared dispatch-on-outcome | **Yes** — steps should route on *outcome* (refused/halt), not fall through on completion. Declared. |

## Convention candidates

- **`[economy-by-default]`** (NEW, strong — #115/#116/#117) — cheapest-that-meets-the-bar by default; opt up deliberately; cap spend. The clearest new principle. **DRI-gated** for canon.
- **`[surface-independent-mechanism]`** (NEW, 3 instances — #107 skill desc, #116 emit, branch-discipline gap) — a mechanism in one surface must be encoded for all. **Codification-ready (3 instances).**
- **`[size-the-path-to-the-work]`** (from Retro #023, #108/#109) — still the standout architecture meta; DRI-gated.
- **`[failure-direction-inversion]`** — still overdue.

## Drift signals

| Signal | Evidence | Investigation |
|---|---|---|
| **Metered vs subscription economics** | $20 burn; VS Code cheaper for interactive | the declared `claude-code` host (subscription-backed dispatch) is the structural answer — prioritize. |
| **Declared backlog is large** | `claude-code` host · dispatch-on-outcome · branch discipline (#115b) · drafted-handoff-prompt · halt-on-refusal | healthy (declare-not-implement) but converging slowly; the cost batch *was* converted fast, so the loop works. |
| **Consumer work blocked on API limit** | home-app WP2/WP3 paused (key capped to 2026-07-01) | consumer, not framework — but it pauses the live signal source until reset/raise. |

## Full-surface audit

| Finding | Verified? | Disposition |
|---|---|---|
| consistency-check | CONSISTENT | clean (5th straight) |
| task double-ownership | none | clean |
| dispatch-graph count (9) vs AGENTS | match | clean |
| test suite | 168 pass | clean |

## Trigger-origin analysis

- **Consumer (live home-app session):** 5 of 5. Fourth consecutive ~100%-consumer batch (#021–#024). The signal has matured from features → architecture → **operability/economics** — the cost batch is the deepest "this would never survive real use as built" finding yet.

## Watch-for list (next 5 improvements, #118–#122)

- **`claude-code` host adapter** — subscription-backed dispatch; the real answer to the metered-vs-VS-Code economics.
- **Dispatch-on-outcome** — halt on refusal, stop the cascade + waste.
- **Branch discipline on the interactive surface** (#115b) — VS Code edits `main` today.
- **Codify `[surface-independent-mechanism]`** (3 instances) and decide `[economy-by-default]` / `[size-the-path-to-the-work]` (DRI-gated).
- **Verify the cost batch in the wild** once the API resets — confirm a real run is ~5× cheaper + the cap halts.

## Meta-observations

**The orchestrator graduated from "does it work" to "is it operable."** #103–#112 proved the loop runs; #113–#117 is the bill for never having run it at volume — cost, drift, a silent wiring bug, refusal cascades. That's not failure, it's the expected second phase, and `[consumer-as-primary-signal]` drove every fix. The honest concession that **VS Code is cheaper for interactive work** is the healthiest moment: the framework stopped competing where it can't win and re-aimed at what it uniquely does — which produced the `claude-code` host as the real strategic move.

**The `[surface-independent-mechanism]` lesson keeps recurring** (#107 skill desc → #116 emit → branch gap). Mechanizing a discipline in *one* place (orchestrator code, or one test path) leaves the other surfaces silently non-compliant. This is now codification-ready and should land.

**20th consecutive on-time retro.**

---

_Archived 2026-06-23. Not edited after this date. Next retro fires after improvement #122._
