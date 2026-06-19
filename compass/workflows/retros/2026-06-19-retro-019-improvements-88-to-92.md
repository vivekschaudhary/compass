---
id: RETRO-019
type: retro
status: archive
altitude: framework
period_start: 2026-06-14
period_end: 2026-06-19
improvement_count: 5
created: 2026-06-19
author: framework-Architect (Claude Opus 4.8)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #019 — framework — improvements #88 to #92

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 + `[fractal-retro]` (canon v0.3.17). **Status: archive.** Third retro under the #78 mandatory full-surface-audit rule. Reports; does not prescribe.

## Source entries in scope

- **#88** — `[per-surface-vertical-test]` codified (canon, 7th enforcement member; auth→RLS→render prod-parity test)
- **#89** — test-data cleanup AC companion rule (delete or soft-delete; `orphaned-test-data`)
- **#90** — `/fix` + `/ops` → dispatch graphs (7th + 8th); engineer.fix-bug stub→self-sufficient + new apply-ops-change
- **#91** — `[pluggable-graph-executor]` slice 1: read-only tool-using executor (hosts/tools.py + dispatch_with_tools)
- **#92** — slice 2: write+verify loop under `--allow-write` (write_file + bash, sandboxed + denylisted)

(Plus the strategic artifact `compass/orchestrator/VISION.md`, unnumbered.)

## Common patterns (positive)

| Pattern | Instances | What it means |
|---|---|---|
| **Consumer signal → discipline, fast** | #88, #89 (home-app run → vertical-test + cleanup canon) | The first real consumer orchestrator run immediately produced two codified disciplines. Principle #19 working as designed; the zero-consumer drift from Retro #018 is decisively broken. |
| **Declared → built, on a real trigger** | #87 (declared) → #91 → #92 (slices 1–2 shipped) | `[declare-not-implement]` ran its full arc: declared #87 with build triggers, then built when the user pulled it. The design doc's status moved declared → partially-built honestly (audit-swept this batch). |
| **The slice discipline held** | #91 read-only (low-risk) → #92 write+verify (opt-in, guarded) | Splitting the risky capability into read-first then write-behind-a-flag meant the dangerous surface (autonomous bash) shipped with the safe one already proven. Textbook `[L-layered-progressive-rollout]`. |
| **Safety designed in, not bolted on** | #92 (default-off `--allow-write`, sandbox, denylist mechanizing refusal rules, two-layer gating) | The riskiest code of the whole project shipped with the failure-direction set safe: write/bash can't be reached without explicit opt-in, and the framework's prose refusal rules became mechanical denials. |
| **VISION as the spine** | every #88–#92 entry traces to a roadmap step or its enabler | The north-star doc (captured this batch) is already orienting the work — improvements name which vision step they serve. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening applied | Convention-ready? |
|---|---|---|---|
| **Status/version drift in design + doc surfaces** | DESIGN-pluggable-executor still said "DECLARED, not implemented" after #91/#92 built it; an imprecise "alpha-6" shipped marker | Audit-sweep commit c2549d0: status → "partially built (slices 1–2 shipped)"; version generalized | Already covered by Principle #17; the audit (#78) is the backstop that keeps catching it |
| **pre-push script still not mechanized** | 3rd consecutive retro whose audit caught drift the #82 commit-time script would have caught if run | Audit fixed it again; the script exists but isn't wired to pre-commit | **Yes — overdue.** Mechanize it (pre-commit hook). This is now a 3-retro pattern; it should stop being retro-time work. |

## Convention candidates

**`[test-alongside-implementation]`** — **STILL codification-ready, still un-actioned.**
- Instances now: #72, #80, #84, #85/#86, #91 (+14), #92 (+12). Every orchestrator change this arc shipped with tests. ~7 instances.
- Recommendation: **codify next** (user-gated). It's the most-evidenced unpromoted candidate in framework history; the gate is purely the user's go.

**`[failure-direction-inversion]`** — strengthened (now ~3 instances: #79 halt, #80 gate-add, #92 default-off-write).
- Prefer designs whose failure mode is a visible false-positive over an invisible false-negative. #92's opt-in write model is a clean third instance.
- Recommendation: approaching codification; surface formally at Retro #020.

**`[pluggable-graph-executor]`** (#87) — slices 1–2 built; the *pattern* (executor swappable over a mechanical gate floor) is 1 substantial instance. Codify as the 4th architecture-discipline canon member once surface 3 (LLM-as-driver) or a 2nd executor lands.

## Drift signals

| Signal | Evidence | Investigation |
|---|---|---|
| **pre-push hook still manual** | 3 consecutive audits (#017/#018/#019) caught version/status drift | Mechanize `pre-push-consistency-check.py` as a git pre-commit hook — the single highest-leverage hygiene item left. |
| **`[test-alongside-implementation]` un-codified at ~7 instances** | carried since Retro #015 | The discipline is followed perfectly but never written to canon; codify so it binds future non-orchestrator work too. |
| **Two vision roles still unbuilt** | SRE + Monitor (VISION.md gaps) | Not urgent, but they're the remaining lifecycle gap; schedule after the tool-using arc settles. |
| **bash denylist is best-effort** | #92 — a denylist can't be exhaustive | Watch real `--allow-write` runs; if a dangerous command slips the denylist, move to an allowlist mode (named in #92 as future hardening). |

## Full-surface audit

**Method:** mechanical sweep (`pre-push-consistency-check.py` on versions/counts + `grep` for `compass/roles/` refs + task double-ownership across all agent files + dispatch-graph count verification + full test suite).

| Finding | Verified? | Disposition |
|---|---|---|
| DESIGN-pluggable-executor "DECLARED, not implemented" — stale after #91/#92 | yes | **fixed-in-batch** (c2549d0) → "partially built; slices 1–2 shipped" |
| DESIGN "alpha-6" shipped marker — imprecise | yes | **fixed-in-batch** (c2549d0) → generalized |
| "8 of 17" dispatch graphs (AGENTS.md, VISION.md) | yes — 8 confirmed by grep | accurate, no change |
| canon "7 shapes / 20" line | historical (consumer-as-primary-signal codification point) | justified, no change |
| `compass/roles/` refs in active surfaces | all justified (grace-period rule, historical notes, deprecated advance.md, audit instruction) | clean |
| Task double-ownership across agents | none | clean |
| Test suite | 85 pass | clean |

## Trigger-origin analysis

- **Consumer-rooted:** 2 of 5 (#88, #89 — home-app run).
- **User direction (vision build):** 3 of 5 (#90, #91, #92 — "move fix/ops to orchestrator," "vision first," "go with slice 2").
- **Concentration:** home-app + crypto-app both active; the vision build is user-driven against that real backdrop. Healthy mix — not the zero-consumer drift of the prior two batches.

## Watch-for list (next 5 improvements, #93–#97)

- **Mechanize the pre-push hook** — 3-retro-old drift; highest-leverage hygiene. Stop doing at retro-time what a commit hook can do.
- **Codify `[test-alongside-implementation]`** — user-gated, ~7 instances; the clearest pending codification.
- **Slice 3 / openai-gemini tool-use** — extend tool-using beyond Claude implementer steps, or start the LLM-as-driver surface (the declared-not-built remainder of #87).
- **Live `--allow-write` run on a consumer** — exercise the full write+verify loop on home-app/crypto-app `/fix`; watch the bash denylist against real commands (allowlist-mode trigger).
- **Cockpit (VISION step 3)** — elevate `/status` once the tool-using arc settles; the next big user-facing win.
- **`[failure-direction-inversion]`** — formalize at #020 if a 4th instance lands.

## Meta-observations

**The text-only gap is closed (under opt-in).** The limitation that defined the #90 caveat — "orchestrated fix/ops yield text, not applied code" — is, as of #92, no longer true for Claude implementer steps run with `--allow-write`: the agent reads the real repo, writes the fix, and runs the regression test fail→pass. The whole #87→#91→#92 arc was one coherent capability delivered in safe increments.

**Three straight audits have caught drift the #82 script would catch at commit time.** That's no longer a coincidence — it's a signal the script must be mechanized into the commit path. The #78 retro-audit is doing recurring work that belongs earlier in the pipeline. Top of the next watch-for for a reason.

**Safety was treated as the feature, not the constraint.** #92 — autonomous writes + shell, the most dangerous capability in the codebase — shipped default-off, sandboxed, denylisted, two-layer-gated, with the human still gating the merge. The framework's anti-rationalization ethos applied to its own riskiest code.

**15th consecutive on-time retro.**

---

_Archived 2026-06-19. Not edited after this date. Next retro fires after improvement #97._
