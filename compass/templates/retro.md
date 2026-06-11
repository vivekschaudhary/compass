---
id: RETRO-<NNN>
type: retro
status: archive                    # immutable once written; never edited after publication
altitude: <role | workflow | bet | project | org | framework>   # NEW in v0.3.17 — which altitude this retro fires at; per [fractal-retro] (canon.md)
period_start: <first improvement version or first source-entry date, e.g., v0.1.8 OR 2026-06-01>
period_end: <last improvement version or last source-entry date, e.g., v0.1.12 OR 2026-06-06>
improvement_count: 5               # source-entry count (improvements / log entries / runs / outcomes — meaning varies by altitude)
created: YYYY-MM-DD
author: <agent — typically Delivery Manager for project retros, framework Architect for framework retros, the agent itself for role/workflow retros>
# parent_log: where THIS retro reads its source data from. Altitude-specific:
#   - framework altitude → compass/workflows/improvements.md
#   - project altitude   → docs/improvements.md
#   - bet altitude       → docs/bets/<bet-id>/ (DRI logs + outcome)
#   - role altitude      → docs/role-activity/<role>.md
#   - workflow altitude  → docs/workflow-runs/<workflow>.md
#   - org altitude       → multiple paths via compass/scripts/aggregate-retros.py (v0.4+)
parent_log: <altitude-specific path per comment above>
# consolidates_from: NEW in v0.3.17. For higher-altitude retros that aggregate
# child-altitude retros. List the paths to child retros consumed at THIS retro.
# Lower-altitude retros (role, workflow) typically leave empty — they read raw
# logs, not other retros. Higher-altitude retros (project, org) list every child
# retro that fed this synthesis. Example: a project retro might list
# [docs/retros/role-engineer-001.md, docs/retros/workflow-build-002.md].
consolidates_from: []
---

# Retro #<NNN> — <altitude> — source entries <N> to <M>

> Batch retro at the **`<altitude>`** altitude per AGENTS.md principle #14 (the soft-spec-rationalization defense via periodic pattern review) + `[fractal-retro]` (canon.md v0.3.17 — same workflow shape at every altitude). **Status: archive.** Patterns surfaced here feed future improvements via normal triggers; this artifact reports, it does not prescribe.
>
> **Altitude reading guide:**
> - **framework / project / org** retros aggregate from a shipped-improvements log (`compass/workflows/improvements.md` / `docs/improvements.md` / multi-project aggregator output)
> - **bet** retros aggregate from per-bet DRI logs + outcome
> - **role** retros aggregate from `docs/role-activity/<role>.md` entries written by the agent mid-task
> - **workflow** retros aggregate from `docs/workflow-runs/<workflow>.md` entries written each time the workflow runs
> - **higher-altitude retros** also list child retros in `consolidates_from:` frontmatter and synthesize across them (cross-altitude pattern promotion)

## Source entries in scope

What this retro reads + synthesizes. Naming convention per altitude:
- framework / project / org → improvements (versioned)
- bet → DRI entries + outcome transition
- role → activity-log entries (timestamped)
- workflow → workflow-run-log entries (run-stamped)

- **<id/version>** — <one-line title> — [link to source entry]
- **<id/version>** — <one-line title>
- ...

## Common patterns (positive)

What's working across this batch. Shapes the framework is reinforcing successfully.

| Pattern | Instances in this batch | What it means |
|---|---|---|
| <pattern> | <list of versions> | <implication> |

## Recurring anti-patterns (negative)

What we kept catching. **Per principle #14, these are soft-spec rationalization surfaces** — places where the framework had interpretive room that agents exploited. Each anti-pattern here is a signal that future hardening will likely be needed (or has already happened multiple times).

| Anti-pattern | Instances | Hardening shape applied | Convention-ready? |
|---|---|---|---|
| <name> | <list of versions> | <constraint + gate + named-anti-pattern triple> | Yes / No |

## Convention candidates

Shapes that have stabilized across this batch (and possibly prior batches). Promote to AGENTS.md cross-cutting principles when ≥3 instances exist and the shape is stable. Each candidate gets:

- **Name**: short, memorable
- **Instances counted**: where it appears
- **Proposed principle text**: draft language for AGENTS.md
- **Recommendation**: promote now / wait for more instances / not yet ready

## Drift signals

Workflows being repeatedly patched in this batch — possible over-engineering or incomplete initial design. Big-bundle releases that needed immediate follow-ups. Anything that suggests the framework is accumulating its own technical debt.

| Signal | Evidence | Investigation candidate |
|---|---|---|
| <signal> | <which patches> | <what to look at> |

## Full-surface audit

> Framework + project altitudes: MANDATORY (v0.3.38). The source log sees what changed; this section reports what *drifted* in artifacts nobody touched. Name the method (independent context-free agent / mechanical sweep). Every finding is verified against the surface before recording — reviewer claims are claims, not facts. Leaf altitudes (role / workflow / bet) may note "n/a — altitude reads raw logs only."

**Method:** <independent agent (model/session) | mechanical sweep (greps run)>

| Finding | Verified? | Disposition |
|---|---|---|
| <claim + file:line evidence> | yes / refuted | fixed-in-batch / watch-for / improvement-candidate |

## Trigger-origin analysis

Where did the improvements in this batch come from? Single project? Diverse? Synthetic vs. real-world friction?

- **<project / source>** — N improvements
- Concentration risk if any source dominates.

## Watch-for list (next 5 improvements)

Things to track explicitly during improvements <N+1> to <N+5>. Future-you reading this should know what's hypothesized to recur or land.

- <item>
- <item>

## Meta-observations

Anything else worth recording for future-framework-historians. Examples: framework surface-area growth rate, hardening-to-new-capability ratio, convention-discovery lag observed in this batch.

---

_Archived <YYYY-MM-DD>. Not edited after this date. Next retro fires after improvement #<M+5>._
