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
| 2 | Review the research | `agent: reviewer.review-research` | reviewer | `architecture-research-review` | 1 |
| 3 | Accept the research | `hitl` | principal-engineer | `—` | 2 |
| 4 | Foundation architecture | `agent: staff-engineer.derive-architecture` | staff-engineer | `foundational-architecture` | 3 |
| 5 | Review the architecture | `agent: reviewer.review-architecture` | reviewer | `architecture-review` | 4 |
| 6 | Accept the architecture | `hitl` | principal-engineer | `—` | 5 |
| 7 | Scaffold the foundation | `agent: staff-engineer.scaffold-foundation` | staff-engineer | `scaffold-record` | 6 |
| 8 | Review the scaffold | `agent: reviewer.review-scaffold` | reviewer | `scaffold-review` | 7 |
| 9 | Accept the scaffold | `hitl` | principal-engineer | `—` | 8 |

## Why it is nine rows and not three

**The author never approves.** An agent drafts in the staff engineer's name, so a staff engineer
accepting it would be the same role producing and accepting. Authorship, review and acceptance sit
on three different roles: staff engineer writes, reviewer judges, principal engineer accepts. The
principal engineer is oversight tier and has the competence — a delivery manager could carry the
accountability and not the judgement, which is why they are not on these rows.

**A review is an ordinary row.** It reads the deliverable, produces findings, and depends on the row
that made it. Nothing in the engine knows it "is a review", which is what lets send-back work
without a special case — and it means whether you review at all is a governance dial rather than a
code path. An engagement without a spare reviewer simply does not author rows 2, 5 and 8.

**Findings, not verdicts.** Each review produces a document rather than a pass/fail, because the
approver has to read something, and a send-back needs a thing to point at. `approve-architecture`
carries the gate that every finding is answered — accepted, actioned, or overruled with a reason —
so a review cannot be filed and ignored.

**Every agent row produces a document.** `run.ts` refuses a step that declares none: the agent would
draft for two minutes and then error at the filing step. The `hitl` rows produce nothing, correctly
— a human accepting something files nothing.

**Every row depends on the one before it.** `reads` is DERIVED from `depends_on`, so a row without
one is handed nothing and drafts from a blank page. That was the state of this workflow before: six
rows, no dependencies, no documents.
