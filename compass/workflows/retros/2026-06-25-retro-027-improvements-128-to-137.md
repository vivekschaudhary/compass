---
id: RETRO-027
type: retro
status: archive
altitude: framework
period_start: 2026-06-24
period_end: 2026-06-25
improvement_count: 10
created: 2026-06-25
author: framework-Architect (Compass-on-Compass)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #027 — framework — source entries #128 to #137

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 + `[fractal-retro]` (canon v0.3.17). **Status: archive.** Reports patterns; does not prescribe. **First batch under the every-10 cadence (#146).**

## Source entries in scope

- **#128** — cockpit auto-refresh no longer wipes the Launch form (JS reload, pause-on-compose)
- **#129** — DECLARED: stale-run detection + dashboard-run visibility
- **#130** — spinning loader on the active step + per-step timing
- **#131** — `claude-code` host timeout (hung `claude -p` fails loud)
- **#132** — `claude-code` runs in the target repo (`cwd=project_dir`) + clearer $0 wording
- **#133** — dashboard runs are observable (per-run logs in the browser)
- **#134** — non-interactive runs no longer deadlock on a per-step input prompt
- **#135** — cockpit server threaded (a dropped browser can't wedge it)
- **#136** — gate cards link to the artifact (`review ↗`) before you decide
- **#137** — `researcher` is Claude-first; ChatGPT dropped

## Common patterns (positive)

| Pattern | Instances | What it means |
|---|---|---|
| **Dogfooding is the validation loop** | all 10 — every entry came from the DRI driving the live dashboard against home-app | 6th straight ~100%-consumer batch. The framework hardened itself in real time at each snag. |
| **Observability is the precondition for trust** | #130 (spinner+timing) · #133 (live logs) · #136 (review link) | Turned the dashboard from a black box into something you can *watch* and *read* — and #133's log capture is what diagnosed #134 minutes later. The feature built to SEE runs caught the bug that BLOCKED runs. |
| **`[fail-loud-not-silent]` applied repeatedly** (just codified #127) | #131 (timeout halts a hang) · #134 (no silent input-deadlock) · #128 (form not silently wiped) | The freshly-codified pattern immediately governed 3 fixes — a sign it was real, not ceremonial. |
| **The claude-code host needed real hardening to be trustworthy** | #131 timeout · #132 cwd · plus #138–#141 next batch | A flat-cost CLI host is powerful but leaky (cwd, timeout, context); making it production-grade took a sustained sub-arc. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening shape | Convention-ready? |
|---|---|---|---|
| **Silent block instead of loud failure** | #134 (input() deadlock on a tty no one can type to) · #131 (no timeout → infinite block) | timeout + non-interactive skip + `[fail-loud-not-silent]` | Codified (#127) |
| **Inherited env/context shadows intent** | #132 ($0 wording confusion) + the #120/#137 host-context bleed | strip/clarify; carried to #138–#141 | feeds `[host-capability-validation]` + a future host-isolation pattern |
| **Wrong-host-for-the-task** | #137 (researcher on ChatGPT — no web_search, no file write) | Claude-first; `[host-capability-validation]` 2nd instance | codification-ready |

## Convention candidates

- **`[surface-independent-mechanism]`** — *carried, codification-ready.* #128/#133/#135 all reuse existing seams (env-through-Popen, the spine, hidden fields). **PROMOTE (user-gated) — long overdue.**
- **`[economy-by-default]`** — *carried, codification-ready.* #132's flat-cost clarity is adjacent. **Promote with the above.**
- **`[host-capability-validation]`** — 2 acted-on (pm, researcher #137). **Codification-ready.**
- **NEW: `[observability-before-trust]`** — you can't trust an autonomous surface you can't watch; ship the spinner/timer/log/diff views *with* the capability, not after. 3 instances this batch (#130/#133/#136). **Wait for a 4th** (or fold into `[user-as-load-bearing-oversight]`).

## Drift signals

| Signal | Evidence | Investigation candidate |
|---|---|---|
| **A declared item shipped piecemeal across batches** | #129 declared "stale-detection + log capture + host-event-streaming"; the log-capture slice shipped at #133, the rest still open | Declared bundles should name their slices so "what's left" stays legible (the #026 audit had to disambiguate this). |
| **Buffering / tty assumptions break headless** | #134 (input on a tty) + #140 next batch (block-buffered log) | Headless/dashboard execution needs explicit unbuffered + no-stdin discipline — a class, not one bug. |

## Full-surface audit

**Method:** mechanical sweep (`consistency-check.py` CONSISTENT · 239 tests · 9 graphs · stale-cadence grep) **+ the independent context-free audit run for Retro #026 already covered this exact surface (#123–#143)** and its 5 prose-drift findings were fixed-in-batch there. No new independent dispatch this batch (would re-audit the same just-cleaned surface).

| Finding | Verified? | Disposition |
|---|---|---|
| consistency-check (counts · host-list · version) | CONSISTENT | no action |
| residual "every 5" cadence refs after #146 | yes — only immutable history + the unrelated 5s refresh interval remain | no action |
| (5 prose drifts from the #026 audit) | yes | fixed-in-batch at #026 |

## Trigger-origin analysis

- **10 of 10 dogfood-driven** (live dashboard `/fix` + `/create-brief` on home-app). **6th straight ~100%-consumer batch.** Concentration risk unchanged: one DRI, one consumer, one intense session — deep but narrow.

## Watch-for list (next: Retro #028 covers #138–#147)

- **The #138–#145 sub-arc** (reviewer-gets-diff, execute-not-plan, always-tool-capable, branch-fresh, `[reproduce-before-diagnose]`, delivery check) is the *correctness* counterpart to this batch's *observability* — #028 should synthesize the two into the claude-code-host + `/fix`-delivery story.
- **Promote the overdue pair** (`[surface-independent-mechanism]` + `[economy-by-default]`) and decide `[host-capability-validation]`.
- **Host-context isolation** (the deeper claude-code bleed) still unbuilt.
- **Mechanize per-agent `preferred_hosts`-table consistency** (#026 watch-for).

## Meta-observations

- **Cadence reset to every-10 (#146).** After ~26 retros the discipline is muscle-memory (`[discipline-as-muscle-memory]`); fewer, deeper reviews now cost less overhead than 5-batch churn during high-velocity sessions (the #128–#143 run blew past four 5-batch horizons). This batch (10 entries) is the new unit.
- **The dashboard-as-orchestrator went from "works" (Retro #025) to "trustworthy"** here — observable (#130/#133/#136), un-wedgeable (#135), un-deadlockable (#134), and the host runs where the code is (#132) without hanging (#131). The remaining gap (correctness of *what* it builds) is #028's story.
- The audit step's value compounds: because #026 ran a deep independent audit over #123–#143, #027 could honestly lean on it — retros that overlap a recently-audited surface don't need to re-pay the cost.

---

_Archived 2026-06-25. Not edited after this date. Next retro (#028, every-10) covers improvements #138–#147._
