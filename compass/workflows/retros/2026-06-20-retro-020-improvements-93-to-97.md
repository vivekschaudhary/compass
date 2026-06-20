---
id: RETRO-020
type: retro
status: archive
altitude: framework
period_start: 2026-06-19
period_end: 2026-06-20
improvement_count: 5
created: 2026-06-20
author: framework-Architect (Claude Opus 4.8)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #020 — framework — improvements #93 to #97

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 + `[fractal-retro]` (canon v0.3.17). **Status: archive.** Fourth retro under the #78 mandatory full-surface-audit rule — and the first where the audit found nothing because the #93 commit-time check now prevents the drift it kept catching.

## Source entries in scope

- **#93** — mechanical consistency check + git hook (commit-time drift backstop)
- **#94** — codified `[test-alongside-implementation]` (8th enforcement member)
- **#95** — declared `[conditional-dispatch]` / triage-as-router
- **#96** — `/triage` → dispatch graph + conditional dispatch **built** (first instance)
- **#97** — tool-loop hardening + event spine (4 fixes from the first live write-mode run)

## Common patterns (positive)

| Pattern | Instances | What it means |
|---|---|---|
| **Hygiene → capability arc** | #93/#94 (mechanize drift, codify test discipline) then #95/#96/#97 (advance the vision) | The batch cleaned house first, then built — and the house-cleaning paid off immediately (see below). |
| **Mechanization closes the loop it was built for** | #93 made THIS retro's audit clean; #93 caught #94's own `alpha-N` slip same-day | The commit-time check is doing the work three prior retro audits did at retro-time. The #019 "3 straight audits caught drift" pattern is resolved by construction. |
| **declared → built → exercised, fast** | #95 declare → #96 build (`/triage` routing gate) → the home-app `/fix` run as live evidence for the next instance | `[conditional-dispatch]` went from idea to working branch in one batch, with consumer evidence already pointing at instance #2. |
| **One real run, four fixes** | #97 ← home-app `/fix --allow-write` | The first live write-mode consumer run surfaced silent-loop, max-iter-as-success, bash-stdin-hang, and host-adapter-crash in a single session. Principle #19 in its purest form. |
| **Discipline catches its own author** | triage refused to treat a feature as a bug (home-app); #93 refused #94's version drift | The anti-rationalization ethos held against both the user's "press Y anyway" and the framework's own slip. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening applied | Convention-ready? |
|---|---|---|---|
| **Silent success on failure** | #97: `max_iterations` returned a non-answer string that `run.py` promoted + advanced. Joins #79 (host-missing → skip) as the same class | #97: the loop now RAISES → halts. #79 halted host-skip earlier. | The class is real (2 instances) — **watch for other silent-success-on-failure paths** in run.py (e.g., empty agent output, malformed step output). |
| **Feature routed through `/fix`** | home-app run: a feature-parity request entered `/fix`; triage flagged it but the linear graph had no route to `/create-brief`; engineer blew the iteration cap | Declared `[conditional-dispatch]`/bug-intake-router (#95); not yet built for bug intake | Yes — the bug-intake router is the clear next build, now with live evidence. |

## Convention candidates

**`[failure-direction-inversion]`** — **codification-ready (many instances).**
- #79 (halt-not-skip), #80 (gate false-positive over false-negative), #92 (default-off write), #97 (max-iter raises + host fall-through). ~4 instances across the v0.4 build.
- Recommendation: **codify next** — prefer designs whose failure mode is a visible false-positive over an invisible false-negative. Strong, repeatedly-applied; user-gated.

**`[mechanical-defense-for-discipline]`** — meta-pattern, accruing.
- Codify a discipline, then ship its mechanical guard: `check-agent-cap.py` (for `[agent-file-compression]`), `pre-push-consistency-check.py` + `consistency-check.py` (for `[cross-artifact-sweep]`/`[pre-push-grep-discipline]`). 3 instances.
- Recommendation: name it at #021 if a 4th lands — "a principle without a mechanical guard regresses; ship the guard."

**`[conditional-dispatch]`** (#95 declared, #96 built) — 1 built instance. Codify as canon (4th architecture-discipline member) at the 2nd (the bug-intake router).

## Drift signals

| Signal | Evidence | Investigation |
|---|---|---|
| **Other silent-success-on-failure paths** | #97 fixed one; #79 another | Sweep run.py for results promoted without validation (empty output, parse failures). |
| **Orchestrator UX is dev-only** | the home-app run looked hung; raw terminal output | #97 event spine is the foundation; the delivery/cockpit layer (dashboard/Slack, remote HITL) is the next user-facing leap (VISION step 3). |
| **bug-intake router still unbuilt** | home-app feature-through-fix | #95 follow-on; the most-evidenced queued build. |
| **bash denylist is best-effort** | carried from #92 | watch live `--allow-write` runs; allowlist-mode if a dangerous command slips. |

## Full-surface audit

**Method:** `consistency-check.py` (mechanized: dispatch-graph count, catalog count, version self-claims) + `pre-push-consistency-check.py` version sweep + task double-ownership across agents + dispatch-graph count + full suite.

| Finding | Verified? | Disposition |
|---|---|---|
| consistency-check (counts + version self-claims) | CONSISTENT | clean — **the mechanization (#93) made the audit pass with nothing to fix** |
| `alpha-N` in test_consistency.py | yes — a test fixture that deliberately injects drift to prove detection | justified (not a real self-claim) |
| `alpha-N` in scripts/README.md | yes — a `#93` codification-version citation; scripts/README is not a guarded self-claim file | justified |
| task double-ownership across agents | none | clean |
| dispatch-graph count (9) vs AGENTS (9 of 17) | match | clean |
| test suite | 102 pass | clean |

## Trigger-origin analysis

- **Consumer run:** 1 of 5 (#97 — home-app `/fix --allow-write`, the standout).
- **User direction:** 2 of 5 (#95 declare conditional-dispatch, #96 build `/triage`).
- **Framework-internal hygiene:** 2 of 5 (#93 mechanize drift, #94 codify test discipline).
- Healthy mix; home-app + crypto-app both active. The live write-mode run is the highest-signal event of the batch.

## Watch-for list (next 5 improvements, #98–#102)

- **Bug-intake router** (#95 follow-on) — route feature-gaps/duplicates/L1 out of `/fix`; 2nd `[conditional-dispatch]` instance → canon codification. Most-evidenced queued build (home-app).
- **Delivery / cockpit layer** — wire the #97 event spine to a surface (dashboard render + Slack/WhatsApp); remote HITL (approve from the surface). VISION step 3; the next user-facing leap.
- **`[failure-direction-inversion]` codification** — ~4 instances, user-gated.
- **Sweep for other silent-success-on-failure paths** in run.py.
- **A clean live run** — re-run home-app/crypto-app `/fix` or `/triage` now that the loop streams progress + halts cleanly; judge fix quality with the friction removed.

## Meta-observations

**The mechanization closed its own loop.** Three consecutive retros (#017/#018/#019) caught the same drift classes at retro-time; #93 moved that to commit-time; Retro #020's audit found nothing because the guard now prevents it. The framework fixed the *process gap*, not just the instances — and proved it within one retro cycle.

**The framework improved itself from a single real run.** One home-app `/fix --allow-write` produced four orchestrator fixes (#97), validated the triage-as-decision thesis, and generated the live evidence for the bug-intake router. This is the tightest consumer-signal → hardening loop in framework history — exactly what Principle #19 is for.

**The product grew a new dimension this batch.** The user's "deliver to my surface / dashboard-as-orchestrator" question reframed the cockpit (VISION step 3) as concrete next work, and #97's event spine is its foundation — structured events now, surface routing later.

**16th consecutive on-time retro.**

---

_Archived 2026-06-20. Not edited after this date. Next retro fires after improvement #102._
