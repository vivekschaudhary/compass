---
id: RETRO-026
type: retro
status: archive
altitude: framework
period_start: 2026-06-24
period_end: 2026-06-25
improvement_count: 5
created: 2026-06-25
author: framework-Architect (Compass-on-Compass)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #026 — framework — source entries #123 to #127

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 + `[fractal-retro]` (canon v0.3.17). **Status: archive.** Reports patterns; does not prescribe.

## Source entries in scope

- **#123** — refresh `mvp.md` to current truth (MVP declared functionally complete)
- **#124** — mechanize the host-list drift class in `consistency-check.py`
- **#125** — dispatch-on-outcome: a refused step halts, not cascades (`REFUSE:` sentinel)
- **#126** — branch discipline spans the interactive surface (CLAUDE.md + engineer.md)
- **#127** — codify `[fail-loud-not-silent]` (Compass-original #24, 9th enforcement member)

## Common patterns (positive)

| Pattern | Instances | What it means |
|---|---|---|
| **Mechanize the drift the audit keeps catching** | #124 (host-list check), and the prior #93 commit-time check | A retro finding (host-list missing from AGENTS.md, #025) became a *computed* check the same/next batch — converting "remember to" into "the hook enforces it." The strongest anti-drift move the framework has. |
| **Codify only on accumulated evidence, user-gated** | #127 (`[fail-loud-not-silent]` after ~6 instances across #79/#97/#104/#120/#125, candidate since Retro #020) | The longest-overdue candidate finally promoted — by evidence, not impulse, and renamed by the DRI for clarity. Healthy codification discipline. |
| **Declaring "done" is a doc act** | #123 (mvp.md refresh) | "It works" only becomes "it's done" when the tracker says so truthfully; the refresh was the act that closed the MVP. |
| **A principle applied to the framework's own tools** | #125/#127 (`[fail-loud-not-silent]` → dispatch-on-outcome halts a refusal) | The same enforcement shape the framework preaches got wired into the orchestrator itself. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening shape | Convention-ready? |
|---|---|---|---|
| **Invariant enforced in one place only** | #126 (branch discipline lived in `run.py` but not the interactive surfaces) → later #143 (branch base) | State a load-bearing invariant on *every* surface that can violate it, not just the mechanical one | Sibling of `[surface-independent-mechanism]` (already codification-ready) |
| **`silent-skip` / `success-on-failure` / `swallowed-error`** | the 3 anti-patterns named under #127 | Named in canon; default failure direction toward a loud halt | Codified (#127) |

## Convention candidates

- **`[surface-independent-mechanism]`** — *carried, codification-ready (≥3 instances since Retro #024).* #126 (invariant must hold on every surface) is another instance. **Recommendation: PROMOTE (user-gated)** — still open at #143.
- **`[economy-by-default]`** — *carried, codification-ready.* No new instance this batch. **Recommendation: promote alongside `[surface-independent-mechanism]`.**
- **`[host-capability-validation]`** (rename of the queued `[host-preference-validation]`) — validate a host actually has the capabilities an agent's tasks require (web_search, file write) before defaulting to it; consumer evidence overrides the generic prior. **2 acted-on instances** (pm v0.3.42, researcher #137). **Recommendation: codification-ready — decide next batch** (the #128–#143 work added the evidence).

## Drift signals

| Signal | Evidence | Investigation candidate |
|---|---|---|
| **Per-agent `preferred_hosts` tables drift from agent files** | This retro's audit found `support` + `delivery-manager` rows in AGENTS.md disagreeing with their agent-file frontmatter (stale since #108 / host re-orderings) | #124 mechanized the *supported-host list*; the *per-agent* table isn't checked. Candidate: extend `consistency-check.py` to diff each agent file's `preferred_hosts:` against the AGENTS.md table. |
| **Retro cadence slipped hard** | Retro #025 = #122; this retro fires at **#143** (should have fired at #127, #132, #137, #142) — 4 batches overdue | A high-velocity live-dogfooding session (#128–#143, all consumer-driven) outran the cadence. Classic `retro-cadence-rationalization` ("mid-build, retro later"). #027–#029 still owed. |
| **Roadmap rows not swept when items ship** | mvp.md #125/#126/#129-log rows stayed open after shipping | The #93/#124 mechanical checks don't cover prose roadmap state; relies on the audit. |

## Full-surface audit

**Method:** independent context-free agent (fresh session, Sonnet) over the whole orchestrator/docs surface (#123–#143, since the cadence had slipped); plus `consistency-check.py` + live `unittest`.

| Finding | Verified? | Disposition |
|---|---|---|
| mvp.md roadmap: #125 + #126 still 🟡 (shipped) | yes | **fixed-in-batch** (→ ✅, + #143) |
| mvp.md #129 row: "tee dashboard-run logs" listed open but shipped at #133 | yes | **fixed-in-batch** (reworded: log-capture ✅, stale-bucketing + host-event-streaming open) |
| AGENTS.md `support` row `[chatgpt,…]` vs `support.md` `[claude, codex, gemini]` (stale since #108) | yes | **fixed-in-batch** |
| AGENTS.md `delivery-manager` in chatgpt-first row vs agent file claude-first | yes | **fixed-in-batch** (own row) |
| CHANGELOG + improvements #133: "`log ↗` on every run card" vs code (actionable-mode only) | yes | **fixed-in-batch** (reworded) |
| test count (236) · catalog (24) · host-list · dispatch-graph (9/17) · `claude-code` in table/router · researcher chatgpt-dropped · all new flags/endpoints (`--claude-cli`, `--run-id`, `--allow-actions`, `COMPASS_CLAUDE_CLI_TIMEOUT`, `/log` `/doc` `/changes`, `python -u`, `_ensure_work_branch` from origin/main) | yes (consistent) | no action |

## Trigger-origin analysis

- **#123–#127:** mixed — **DRI-directed roadmap-closure** (the "let's do 1,2 / 3,4,5" sequence) rather than the prior batches' pure consumer-dogfooding. First non-~100%-consumer batch in 5 (a deliberate "close the MVP-done overlay" push).
- The *next* batches (#128–#143) swing hard back to **~100% live dogfooding** (the dashboard `/fix` + `/create-brief` runs) — to be covered by Retro #027–#029.

## Watch-for list (next: Retro #027 covers #128–#132)

- **Run the owed retros** — #027 (#128–#132), #028 (#133–#137), #029 (#138–#142); #143 lands in #029's successor. Don't let the cadence-slip compound.
- **Mechanize per-agent `preferred_hosts` table consistency** (the drift this audit caught by hand).
- **Promote** `[surface-independent-mechanism]` + `[economy-by-default]` (overdue); decide `[host-capability-validation]`.
- The #128–#143 arc is the real story (claude-code host hardening, dashboard observability, branch hygiene) — Retro #027–#029 should mine it for the `claude-code-host` lessons (execute-not-plan, context bleed, tool-routing).

## Meta-observations

- **First cadence slip since Retro #004** (the streak of on-time retros broke at #127 under an unusually intense, productive live-build session). The slip is itself evidence the session was deep, not negligent — but #027–#029 are owed and this retro flags them explicitly to avoid `commitment-drift`.
- **The full-surface audit earned its keep again** — `consistency-check.py` passed clean, yet the independent reviewer found **5 prose drifts** the mechanical check can't see (roadmap state, per-agent host tables, a doc-vs-code link claim). The "audit finds what the check can't" pattern holds for the 4th straight retro.
- **#123–#127 was the MVP-done closure batch** — overlay items converted to shipped (#125/#126) + codified (#127) + mechanized (#124) + declared-true (#123). The orchestrator's correctness floor (`[fail-loud-not-silent]`) is now canon.

---

_Archived 2026-06-25. Not edited after this date. Next retro (#027) covers improvements #128–#132._
