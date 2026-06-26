---
id: RETRO-028
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

# Retro #028 — framework — improvements #138 to #147

The batch where `/fix` stopped being "only step 1 works" and became a real pipeline: idea → triage → fix → review → approve → **merge → deploy**, end to end. Every entry came from a live dashboard `/fix` run hitting a wall.

## Source entries in scope

#138 reviewer-gets-the-diff · #139 execute-not-plan · #140 live dashboard logs (`python -u`) · #141 claude-code always tool-capable · #142 `changes ↗` (real deliverables per run) · #143 work branches cut fresh from main · #144 `[reproduce-before-diagnose]` codified (canon #25) · #145 `/fix` fails loud when work isn't delivered · #146 retro cadence 5 → 10 · #147 delivery closure (approve-merge actually merges).

## Common patterns (positive)

- **Live-dogfooding was the sole trigger — 10/10 Principle #19.** The whole batch is one continuous `/fix` session against a real consumer app (home-app accounts-balance bug → PR #116), each snag immediately converted to a framework fix. Highest-signal trigger density in framework history.
- **Pipeline-completion arc.** The batch systematically removed every reason the non-implementer steps were no-ops: planning-instead-of-executing (#139), tool-less dispatch (#141), bare reviewer (#138), no delivery (#145), no merge (#147). It reads as a single goal pursued across ten fixes.
- **Mechanical enforcement over prose, repeatedly.** #143 (branch-fresh in `_ensure_work_branch`), #145 (`_uncommitted_code` delivery check), #144 (gated reproduce-before-diagnose), #147 (`_is_merge_gate` + `_merge_pr`). Discipline encoded where it can't be skipped.
- **`[fail-loud-not-silent]` as the through-line** — #145 (delivery incomplete), #144 (REFUSE on wrong-layer). A "successful" run that ships nothing now says so.

## Recurring anti-patterns (negative)

- **`headless-claude-plans-instead-of-executing`** (#139, #141) — `claude -p` defaults to a chat/planning posture; needed both an execute directive AND always-tool-capable routing. Two fixes for one root posture.
- **The four `[reproduce-before-diagnose]` anti-patterns** (#144): `theorize-from-code` · `anchor-on-true-but-irrelevant` · `self-confirming-test` · `wrong-layer-when-fix-dwarfs-symptom`. The deepest signal — a true-but-irrelevant freshness "fix" (~500 lines) for a one-field bug.
- **`looks-successful-ships-nothing`** (#145) — run reports complete; no commit → no PR → no deploy.
- **`contract-concept-leaks-across-host-types`** (#141) — the API-host `executor_tools:` gate mis-applied to the CLI host, silently making most agents tool-less.

## Convention candidates

- **`[reproduce-before-diagnose]` — CODIFIED this batch (#144, canon #25, 10th enforcement member).** The standout. Immediately practiced in the next batch (#029) 4×.
- **`[fail-loud-not-silent]`** (added #127) — now applied across #144/#145 (and #150/#152/#153 next batch). Durable; a class member.
- **host-capability-validation / CLI-host-owns-its-tools** — #138 + #141 (the bare-API-vs-CLI-tools split). Recurs in #155 next batch (codex-cli). Watch for the 3rd instance → codify.

## Drift signals

- **Retro backlog accrued mid-session.** #144 already flags "Retros #027–#029 owed"; the velocity blew past four 5-batch horizons. #146 raised the cadence 5 → 10 to fit, but the backlog (this very late double-retro, written in the #029 session) is the residue. Classic `retro-cadence-rationalization` — the exact drift the retro discipline names. Cadence is now structurally right (every-10); execution lag is the thing to watch.
- **Delivery closure shipped but off-by-default** (#147 `--auto-merge`) — left the merge-gate UX immature, which surfaced loudly next batch (#156/#157).

## Full-surface audit

A single independent, context-free agent audit of the **current** surface was run for this session and is recorded in full in **Retro #029** (same session; the surface is shared). Method: independent general-purpose agent + `consistency-check.py`. Result relevant to this batch: the #143 branch logic and #138/#140/#142 cockpit/run changes introduced **no doc/code drift**; `compass/roles/` references are all legitimate (deprecated `advance.md` + historical log entries). The two findings the audit did surface (router error-string omission, `__init__.py` stale alpha) trace to the #029 batch / pre-existing state — see Retro #029, both **fixed-in-batch**.

## Trigger-origin analysis

100% Principle #19 (live friction). Sub-origins: autonomous-run observation (#139/#141/#145 — watching what the agents actually did), DRI directive at a gate (#142 "point to the files created", #146 cadence, #147 "tackle delivery closure"), DRI post-mortem (#144 — the richest, a written four-failure analysis). The post-mortem origin is the highest-value: it produced a canon entry, not just a patch.

## Watch-for list (next 10 improvements)

- Tool-capable **codex/gemini CLI host** (declared "still open" in #138/#141) → shipped as #155.
- **host-context isolation** (declared in #139/#141 as the deeper cause of chat-mode drift) → shipped as #148.
- **Merge-gate UX** after #147 (off-by-default merge; what does approval *tell* the operator?) → surfaced hard as #156/#157.
- **Cadence execution lag** — does the every-10 horizon actually fire on time now?

## Meta-observations

- This is the batch where the orchestrator crossed from "step 1 works" to "the pipeline delivers." The fixes are individually small but collectively a phase change — the difference between a demo and a tool.
- The single most valuable artifact wasn't a fix but a *post-mortem* (#144). When the DRI wrote down four named failures, it converted a glitchy run into a permanent canon guardrail. Process reflection > patch.

---
