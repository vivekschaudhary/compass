---
id: RETRO-029
type: retro
status: archive
altitude: framework
period_start: 2026-06-25
period_end: 2026-06-25
improvement_count: 10
created: 2026-06-26
author: framework-Architect (Compass-on-Compass)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #029 — framework — improvements #148 to #157

The batch that made the dashboard a **trustworthy, surface-independent, subscription-only control plane** — and shipped the first real consumer outcome through it: WLT-26-1 merged to `main` via a fully orchestrated, cross-model (claude implements → codex reviews → PM arbitrates → human approves) loop with **no API keys**.

## Source entries in scope

#148 claude-code host-context isolation · #149 per-step outcome (✓ done / ✗ failed) · #150 delivery warning workflow-aware · #151 doc workflows skip the branch→PR dance · #152 claude-code idle-timeout + streaming · #153 agents can't self-approve a gated artifact · #154 awaiting gates observable + safely resumable · #155 `codex-cli` host (reviewer on the Codex subscription) · #156 dashboard approve carries `--bet` + run mode · #157 resume reuses the branch + merge gate names the next step.

## Common patterns (positive)

- **`[reproduce-before-diagnose]` (codified #144) was practiced 4× — immediately.** #152 probed `claude -p --output-format stream-json` and watched a "hung" step actually *work* (448s, not hung) before fixing; #155 probed `codex exec --json` before building the host; #156/#157 folded the event spine before diagnosing. A canon entry changing behavior in the very next batch is rare and worth celebrating.
- **Surface-independence proven, not asserted.** The cockpit became a complete loop — observe (#149 ✓/✗, #152 live streaming, #154 gate age), decide (#156 approve actually registers, #157 next-step guidance), on flat-cost subscription hosts (#148, #155). The "the surface is a thin client over `/run` + `/decide` + the spine" thesis is now demonstrated end to end.
- **Adapter symmetry.** #155 `codex-cli` mirrors #120 `claude-code` exactly. The architecture now has two clean adapter rings — **hosts** (model side) and **surfaces** (human side) — around an invariant dispatch-graph + event-spine core.
- **Prompt-then-mechanical-backstop.** #153 didn't trust the prompt (the agent ignored four "never self-approve" lines) — it added a mechanical revert at the gate. Same lesson as #144: when a rule is load-bearing, back the prose with a guard.

## Recurring anti-patterns (negative)

- **`prompt-discipline-doesnt-hold-a-load-bearing-rule`** (#153) — four explicit instructions ignored by a headless agent. Prompts are advisory under execution pressure; gates must be mechanical.
- **`resume-drops-run-state`** (#156 `--bet`, #157 branch + host mode) — a `/decide` relay silently lost everything the run needed to continue. Surface-independence demands the surface carry the *whole* continuation, not a fragment.
- **`silent-no-op`** (#156 approve did nothing; #154 gate orphaned forever) — the session's most frustrating class: "looks like it worked, didn't." Fixed by making the failure observable (#154 age) and the path correct (#156 bet).
- **`regenerate-identity-from-input-on-resume`** (#157) — the resume re-derived a branch name from the bet-context blob → `feat/WLT-26-bet-context-wlt-26-briefmd-----id`. Identity must be *recovered*, not *regenerated*.
- **`wall-clock-cant-tell-stuck-from-slow`** (#152) — a duration cap killed a healthy long step; the fix is to guard on *silence*, not *time*.

## Convention candidates

- **`[observability-before-trust]` — PROMOTE candidate.** ≥3 acted-on instances this batch alone (#152 streaming, #154 gate age, #149 per-step ✓/✗), plus prior (#129/#133/#140). The pattern: you can't trust an autonomous loop you can't watch; build the instrument before the automation. Recommend surfacing for canon (would join `[fail-loud-not-silent]` / `[reproduce-before-diagnose]` as an observability-class member). **Don't auto-promote — needs its own improvement entry.**
- **`[surface-carries-run-state]` (resume-completeness)** — 2 instances (#156, #157). A relay/resume must carry bet + branch + write-mode + host. New; watch for the 3rd.
- **`[cli-host-as-flat-cost-adapter]`** — 2 instances of the identical shape (#120 claude-code, #155 codex-cli): shell the logged-in CLI, strip the API key, stream events, idle-timeout, map allow_write → bypass. Codify when a 3rd CLI host (gemini) appears.
- **prompt-then-mechanical-backstop** — #153 + #144. "Load-bearing rule ⇒ prompt AND guard." Candidate.

## Drift signals

- **`⚠ DELIVERY INCOMPLETE` misfires when an open PR exists** (#157 known follow-up) — it prints "no PR → no deploy" while a PR is open. Open; needs a PR-aware softening.
- **Two consistency-check blind spots** (this audit, both now closed) — the check's host-list reads the router's *error string* (which omitted `codex-cli`), and its version scan omitted `orchestrator/__init__.py` (stale `alpha-0`). The mechanical check had gaps in exactly the classes it exists to cover.
- **The double-retro backlog** (#028 + #029 written together, late) — cadence is structurally right (every-10) but execution lagged through the high-velocity session.

## Full-surface audit

**Method:** independent, context-free general-purpose agent (fresh session) auditing the full surface as a skeptical newcomer + `python3 compass/scripts/consistency-check.py`. Findings verified by direct read/grep before acting.

- `consistency-check.py` → **CONSISTENT** (dispatch-graph count, catalog 25 patterns, version self-claims, host list).
- **Counts verified clean:** AGENTS.md "9 of 17 workflows" dispatch-graph (= 9 `## Dispatch graph` files), "7 shapes / 25 patterns" (= 25 canon entries; class breakdown sums to 25), 14 agents, 13 roles files, README 17 workflows. ✅
- **Host list:** AGENTS.md documents all router hosts incl. `claude-code` + `codex-cli`. ✅ (docs correct)
- **Stale `compass/roles/`:** none problematic — only deprecated `advance.md` + historical `improvements.md` entries + correctly-framed grace-period notes. ✅
- **Code-vs-docs (host opt-in + resume):** `COMPASS_CLAUDE_HOST`/`COMPASS_CODEX_HOST` remaps + `/decide --bet` + same-run resume verified in run.py/cockpit.py. ✅
- **Task-ownership:** no collisions across the 14 agents. ✅
- **FINDING 1 (med) — FIXED IN-BATCH:** `codex-cli` was absent from router.py's `RuntimeError "Supported:"` enumeration (router.py:222) — and `consistency-check._router_supported_hosts()` parses *that exact string* as its host-list source of truth, so #155's host had a coverage blind spot. Added `codex-cli` to the string.
- **FINDING 2 (low-med) — FIXED IN-BATCH:** `orchestrator/__init__.py:1` hardcoded `v0.4-alpha-0` (CHANGELOG at alpha-6) — the precise drift class CLAUDE.md rule 9 guards, but `__init__.py` wasn't in the check's `VERSION_SELF_CLAIM_FILES`. Replaced with bare `v0.4-alpha` (matching run.py:3) **and** added `__init__.py` to the scan list so the class is mechanically caught hereafter.

Both findings landed in gaps the automated check couldn't see — vindicating the mandatory independent-audit step (`[independent-review-as-signal-source]`, Retro #016). A zero-context agent found in one pass what the resident session shipped past.

## Trigger-origin analysis

100% Principle #19. Sub-origins skew toward **live-gate friction** (#149 "show done/failed", #154 "stuck gate I couldn't see", #156 "approved but nothing happened", #157 "no next steps") and **deep-fix reproduction** (#152/#155). The session's defining trait: the DRI drove a real story to `main` and every stumble became a fix. The most strategic non-fix exchange (the surface-independence / Telegram-trigger discussion) seeded the next watch-for.

## Watch-for list (next 10 improvements)

- **Telegram / Slack surface adapter** — the surface-independence thesis's next proof (DRI's stated next interest). A thin client to `/run` + `/decide` + push-on-gate-open.
- **`DELIVERY INCOMPLETE` PR-aware fix** — stop claiming "no PR" when one is open.
- **`[observability-before-trust]` 3rd→canon decision** — surface as a promotion improvement.
- **Pull→push observability** — gates currently wait to be polled; an away operator needs to be *reached* (the #154 gate-age is the seed).
- **The stranded WLT-26-1 e2e tests** (`e2e/dashboard-spend.spec.ts`) — follow-up PR (DRI chose "merge as-is").

## Meta-observations

- **The framework shipped its first story this batch.** WLT-26-1 (category spend chart) reached `main` through claude→codex→PM→human, subscription-only. Compass crossed from "can run a step" to "can ship a slice."
- **Codification paid off within one batch.** `[reproduce-before-diagnose]` (#144) wasn't shelf-ware — it visibly changed how every #029 fix was approached. That's the retro discipline's whole thesis working: name the loophole, and the next batch doesn't fall in it.
- **The mechanical check needs the same `[reproduce-before-diagnose]` humility it enforces** — it reported CONSISTENT while two real drifts sat in its own blind spots. The independent audit is not optional belt-and-suspenders; it's the part that catches what the check structurally can't.

## Promotion candidates to canon

- **`[observability-before-trust]`** — ≥3 acted-on instances, durable across batches. Strongest canon candidate. (Surface as its own improvement, don't auto-promote.)
- `[reproduce-before-diagnose]` — already canon (#144); this batch is its field validation.

---
