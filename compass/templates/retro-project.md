---
id: RETRO-<NNN>
type: retro
status: archive
altitude: project                  # project-altitude retro per [fractal-retro] (canon.md v0.3.17)
period_start: <first improvement version in scope, e.g., v0.1.5>
period_end: <last improvement version in scope, e.g., v0.1.9>
improvement_count: 5
created: YYYY-MM-DD
author: Delivery Manager           # default; can be overridden per project
parent_log: docs/improvements.md   # project-altitude shipped-improvements log
# A project retro CAN also consolidate child retros (bet, role, workflow) if they exist
# in the project. List paths to child retros here.
consolidates_from:
  - docs/retros/role-engineer-<NNN>.md          # if exists
  - docs/retros/role-reviewer-<NNN>.md          # if exists
  - docs/retros/workflow-build-<NNN>.md         # if exists
  - docs/bets/<bet-id>/retro.md                 # bet retros at outcome transition (if exists)
# Lives at docs/retros/<NNN>-<period>.md in consuming projects.
---

# Project Retro #<NNN> — <project name> — improvements <N> to <M>

> **Project-altitude retro** per `[fractal-retro]` (canon v0.3.17) — same workflow shape as framework retros, applied at the project altitude. Synthesizes patterns from the project's own `docs/improvements.md` (5-improvement batches by default) plus any child-altitude retros (bet, role, workflow) that exist in the project. **Status: archive.** Patterns surfaced here feed future project improvements via normal triggers; this artifact reports, it does not prescribe.

## Source entries in scope

- **<v/date>** — <one-line title> — [docs/improvements.md#...](docs/improvements.md)
- **<v/date>** — ...

### Child retros consolidated (if any)

- [docs/retros/role-engineer-<NNN>.md](docs/retros/role-engineer-<NNN>.md) — N entries synthesized into M patterns
- [docs/retros/workflow-build-<NNN>.md](docs/retros/workflow-build-<NNN>.md) — N runs synthesized into M patterns

## Common patterns (positive)

| Pattern | Instances in this batch | What it means | Cross-altitude (from child retros)? |
|---|---|---|---|
| <pattern> | <list of improvements / runs / bets> | <implication> | yes / no |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening applied | Convention-ready? | Cross-altitude? |
|---|---|---|---|---|
| <name> | <list> | <constraint + gate + named-anti-pattern triple> | yes / no | yes / no |

## Convention candidates

Patterns stable enough to promote to AGENTS.md project-level principles (or to the parent org/framework altitude if the pattern reappears across projects). Each candidate:

- **Name**: short, memorable
- **Instances counted**: where it appears in this project + which child retros
- **Cross-project potential**: would this also appear in other projects using Compass? (informs whether to forward-link to next org retro)
- **Proposed principle text**: draft language
- **Recommendation**: promote now / wait for more instances / not yet ready

## Drift signals

Workflows or roles being repeatedly patched within the project. Big-bundle releases needing immediate follow-ups. Anything suggesting accumulated tech debt in HOW the project executes.

| Signal | Evidence | Investigation candidate |
|---|---|---|
| <signal> | <which patches / which runs / which retros> | <what to look at> |

## Trigger-origin analysis

Where did the improvements in this batch come from? Single bet? Diverse? Engineer-detected vs Reviewer-detected vs user-flagged? Pattern in WHICH agent surfaces friction first.

- **<source>** — N improvements
- Concentration risk if any source dominates.

## Watch-for list (next batch)

Things to track explicitly during improvements <N+1> to <N+5>.

- <item>
- <item>

## Promotion candidates to ORG altitude (if multi-project)

Patterns surfaced here that appear ACROSS multiple projects in this org. The next `/retro --altitude=org` should consider these for cross-program codification.

- <pattern> — also appears in project <name> per retro <link>

## Meta-observations

Project-level surface-area growth, hardening-to-new-capability ratio, convention-discovery lag within the project, cross-altitude propagation (did role/workflow retros catch things project retro would have missed?).

---

_Archived <YYYY-MM-DD>. Not edited after this date. Next project retro fires after improvement #<M+5> in `docs/improvements.md`._
