---
name: foundation-architecture
status: active
owner: principal-engineer
auto_invokes: []
invoked_by: []
version: 0.3.41
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
| 6 | Accept the scaffold | `hitl` | principal-engineer | `—` | 5 |

## Why it is six rows and not three

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

**Every agent row produces a document.** `run.ts` refuses a step that declares none: the agent would
draft for two minutes and then error at the filing step. The `hitl` rows produce nothing, correctly
— a human accepting something files nothing.

**Every row depends on the one before it.** `reads` is DERIVED from `depends_on`, so a row without
one is handed nothing and drafts from a blank page. That was the state of this workflow before it
was rewritten: rows with no dependencies and nothing filed.
