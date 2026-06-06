---
id: RETRO-<NNN>
type: retro
status: archive                    # immutable once written; never edited after publication
period_start: <first improvement version, e.g., v0.1.8>
period_end: <last improvement version, e.g., v0.1.12>
improvement_count: 5
created: YYYY-MM-DD
author: <agent — typically Delivery Manager for project retros, framework Architect for framework retros>
parent_log: compass/workflows/improvements.md   # OR docs/improvements.md for project-level retros
---

# Retro #<NNN> — improvements <N> to <M>

> 5-improvement batch retro per AGENTS.md principle #14 (the soft-spec-rationalization defense via periodic pattern review). **Status: archive.** Patterns surfaced here feed future improvements via normal triggers; this artifact reports, it does not prescribe.

## Improvements in scope

- **<version>** — <one-line title> — [link to improvements log entry]
- **<version>** — <one-line title>
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
