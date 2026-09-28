---
name: foundation-architecture
status: active
owner: principal-engineer
auto_invokes: []
invoked_by: []
version: 0.3.42
requires_approved: [docs/foundation/product.md]
---

# Workflow: /setup-foundation-architecture

## Purpose

Establish the technical foundation an engagement builds on: what the ground actually is, what the
architecture will be, and a scaffold that matches it.

## Dispatch graph

| # | task | dispatch | owner | produces | depends-on |
|---|------|----------|-------|----------|------------|
| 1 | Research the ground | `agent: staff-engineer.research-architecture` | staff-engineer | `architecture-research` | — |
| 2 | Accept the research | `hitl` | principal-engineer | `—` | 1 |
| 3 | Foundation architecture | `agent: staff-engineer.derive-architecture` | staff-engineer | `foundational-architecture` | 2 |
| 4 | Accept the architecture | `hitl` | principal-engineer | `—` | 3 |
| 5 | Scaffold the foundation | `agent: staff-engineer.scaffold-foundation` | staff-engineer | `scaffold-record` | 4 |
| 6 | Review the scaffold plan | `hitl` | principal-engineer | `—` | 5 |
| 7 | Accept the scaffold and the registered repos | `hitl` | principal-engineer | `—` | 6 |
| 8 | Scaffold each repo | `workflow: scaffold-repo` | staff-engineer | `—` | 7 |

## Why it is eight rows and not three

**The author never approves.** An agent drafts in the staff engineer's name, so a staff engineer
accepting it would be the same role producing and accepting. Authorship and acceptance sit on two
different roles: the staff engineer writes, the principal engineer accepts. The principal engineer
is oversight tier and has the competence — a delivery manager could carry the accountability and
not the judgement, which is why they are not on these rows.

**Three deliverables, so three gates.** Research, architecture and scaffold are each accepted on
their own before the next is drafted, rather than one approval at the end standing for all three.
The dependency chain is what enforces it: row 3 reads what row 2 accepted, not what row 1 produced.

**A gate is an ordinary row.** Nothing in the engine knows a row "is a review" — it is a `hitl` row
that depends on the one that drafted. That is what lets send-back work without a special case, and
it means how much review an engagement wants is rows in the seed rather than a code path.

**Every agent row here produces a document.** `run.ts` refuses a step that declares none: the agent
would draft for two minutes and then error at the filing step. The `hitl` rows produce nothing,
correctly — a human accepting something files nothing. Row 8 writes no code itself: it nests
`scaffold-repo`, whose one code row hands off to the `code` tool.

**The scaffold is planned, reviewed, provisioned, accepted, then executed.** Row 5 writes what the
scaffold should be, including which repos it needs. Row 6 is the principal engineer reviewing that
plan; only after it closes does anyone create anything external. Between 6 and 7 the team creates the
listed repos offline and registers each on the engagement (key, name, URL, area, local path). Row 7
is the principal engineer confirming the registered repos match the plan and accepting it, so the
closed list of repos exists before anything targets one. Two `hitl` rows in a row read as review
then approve, which is what they are here.

**Row 8 fans out, once per registered repo.** Which shape applies is derived from what the nested
workflow produces: `scaffold-repo` produces a `{repo}` path, so it opens one run per `repo` row,
with the repo key as the run's subject — the same mechanism `tech-design` uses per epic. Zero
registered repos refuses rather than completing over nothing.

**Every row depends on the one before it.** `reads` is DERIVED from `depends_on`, so a row without
one is handed nothing and drafts from a blank page. That was the state of this workflow before it
was rewritten: rows with no dependencies and nothing filed.
