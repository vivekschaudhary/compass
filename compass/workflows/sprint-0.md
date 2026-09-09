<!-- SPRINT 0 — the phase that takes an engagement from a signed SOW to a team that can pick up a
     story. The DM initiates it once onboarding's connections are validated. Every row below becomes one
     task in that run.

     It absorbed pre-sprint-0. That phase is gone from the seed entirely — the database keeps it
     only as a retired workflow, disabled and with no steps — and its rows, the SOW, the timeline,
     staffing, the RACI, the epics and the tailored plan, are rows 1-8 here. The split existed when
     "what are we doing" and "can the team start" were separate
     ceremonies; one phase that runs in dependency order does the same work without a gate between
     them that nobody was waiting at. -->
---
name: sprint-0
title: Sprint 0
owner: delivery-manager
scope: foundation
trigger: delivery-manager initiates it
creates: one task per row below, in dependency order
status: active
version: 2.1.0

# ── ENTRY GATE ────────────────────────────────────────────────────────────
# The systems of record, and nothing else. This phase no longer requires a roster or a scope — it
# PRODUCES them, at rows 5 and 8. The old gate demanded `01-foundation/team` published before a
# phase whose own job is to publish it, which was unsatisfiable the moment pre-sprint-0 was absorbed.
#
# STATED AS THE PROBES, NOT AS "onboarding is closed". The gate that actually runs is two connector
# checks in criteria.csv, and a phase-closed gate is not something the criteria vocabulary can
# express — `subject_kind` is document, ticket, connector or backlog. Naming the phase here read as
# a dependency the engine never evaluated, which is worse than naming none: it looked like a gate
# and was a sentence.
requires:
  - docs.wired == true           # the same two probes `onboarding` runs, asked again at the door
  - tickets.wired == true

# ── PRODUCES ──────────────────────────────────────────────────────────────
produces:
  - 02-scope/sow@docs: published
  - 01-foundation/product-brief@docs: published
  - 01-foundation/design-library@docs: published
  - 02-scope/timeline@docs: published
  - 01-foundation/team@docs: published
  - 01-foundation/raci@docs: published
  - 02-scope/features@docs: published
  - 02-scope/deliverables@docs: published
  - 03-delivery/plan@docs: published
  - 01-foundation/foundational-architecture@docs: published
  - 01-foundation/ways-of-working@docs: published
  - 05-cadence/sprint-plans@docs: published
  - 05-cadence/kickoff@docs: published
---

## Purpose

What are we doing, with whom, by when — and then everything a team needs before it can pick up a
story: an architecture, a design system, an agreed way of working, and a plan for the first three
sprints.

Starts from a signed SOW and nothing else. Ends when sprint 1 can open.

## Dispatch graph

`reads` is DERIVED from `depends-on` for anything produced inside this phase, so it is not a column
here — printing it would be authoring the same edge twice. See `deriveReads` in
`app/app/lib/import/plan.ts`. Depending on a row means consuming what it produces.

`output` is what the app keys behaviour on — `roster`, `backlog`, `sprint`, or blank for an
ordinary document. It used to key on the produced path, and renaming a path silently disabled the
behaviour while the step went on passing its gates.

| # | task | dispatch | owner | produces | output | depends-on |
|---|------|----------|-------|----------|--------|------------|
| 0 | File the SOW | `agent: delivery-manager.file-sow` | delivery-manager | `SOW` | — | — |
| 1 | File the Requirements | `agent: delivery-manager.file-requirements` | delivery-manager | `Requirements` | — | 0 |
| 2 | Product brief | `workflow: product-brief` | product-owner | `—` | — | 0, 1 |
| 3 | Milestones and timeline | `agent: delivery-manager.draft-timeline` | delivery-manager | `Milestones and timeline` | — | 0 |
| 4 | Staffing plan and resources | `agent: delivery-manager.propose-staffing` | delivery-manager | `Staffing plan` | roster | 3, 0 |
| 5 | Roles and responsibilities | `agent: delivery-manager.draft-raci` | delivery-manager | `RACI` | — | 4 |
| 6 | Team working agreement | `agent: delivery-manager.draft-ways-of-working` | delivery-manager | `ways-of-working` | — | 4, 5 |
| 7 | Features and how each is judged | `workflow: feature` | product-owner | `—` | — | 1, 2 |
| 8 | Foundation architecture | `workflow: foundation-architecture` | staff-engineer | `—` | — | 1, 2, 7 |
| 9 | Feature architecture | `workflow: feature-architecture` | staff-engineer | `—` | — | 8 |
| 10 | Design library | `workflow: design-library` | designer | `—` | — | 2, 1 |
| 11 | Epics from milestones and features | `workflow: epics` | product-owner | `—` | — | 1, 2, 7, 3 |
| 12 | Tailor the delivery plan | `agent: delivery-manager.tailor-delivery-plan` | delivery-manager | `delivery plan` | — | 5, 11, 4, 0, 7 |
| 13 | Sprint plan for sprint 1 | `workflow: sprint-plan` | product-owner | `—` | — | 11, 4, 12 |
| 14 | Kickoff | `agent: delivery-manager.kickoff` | delivery-manager | `kickoff` | — | 13, 6, 12 |

**Rows 2, 7 and 8 NEST a workflow rather than doing the work in one row.** The product brief, the
features and the foundation architecture each have an author, an independent reviewer and a
different role approving — nine rows for the architecture alone. Doing that in a single sprint-0 row
meant the agent's draft was accepted by the role whose name it drafted in. The nested run's rows
become Jira sub-tasks under this row's story, so the work is visible to the team rather than only
inside Compass.

**Row 1 files the SOW; it does not write one.** The contract arrives from the delivery manager, in
chat, and lands verbatim — an agent that drafts it into a page paraphrases, and every document
downstream cites the paraphrase without being able to tell.

**Row 5 gates everything that routes acceptance.** You cannot send a deliverable to a role nobody
fills, which is why staffing is a row rather than a setting, and why it comes before the RACI, the
plan and the sprint plan rather than beside them.

**Row 3's page LINKS the library, it does not describe it.** The real artifact is a Figma file or a
component library; a page restating it would be a copy that goes stale. The agent researches, asks
what it needs in chat, and produces the page that points at the thing — so a reader has one place to
start and the artifact stays where designers work.

**Row 12's page is the kickoff record** — agenda, who attended, what was walked through, what was
decided. The meeting itself is not something Compass does; the record of it is, and the gate is the
delivery manager confirming it happened with their name on the close.

**No review rows are authored here.** The plan is authored against actual staffing, and adding or
not adding a review row is the governance dial: an engagement with an enterprise staff-engineer and an
staff-engineer can author a review of row 9, and one without does not. A review is an ordinary row — it
reads the deliverable, produces findings, and depends on the row that made it — so nothing needs to
know it "is a review" for send-back to work.

Not every path above is in the scaffolded tree and none needs to be: `file_document` creates a
document at a path that does not exist yet. They are in the default tree anyway, so a new engagement
shows the shape of what is coming rather than pages appearing when an agent first files one.

## Gates

### 5. Staffing plan and resources

    check:    01-foundation/team is published
    judgment: every role named as an owner or a reviewer downstream is actually filled

Refused at publish, never resolved at run time. A plan that routes a deliverable to an empty role is
a plan that stops the first time someone tries to accept something.

### 11. Sprint plan for sprint 1

    check:    this sprint's plan is published
    check:    every committed story belongs to an epic
    check:    every committed story is on the board with an owner
    judgment: the plan fits the roster's capacity, or says where it does not
    judgment: work taken on that was not in the plan is recorded as unplanned

**This is the same row as `sprint` row 1, and deliberately so.** Sprint 0 has to end with sprint 1
planned, but planning three sprints ahead here and one sprint at a time later was two answers to one
question. Both rows now produce `05-cadence/sprint-plans`, and everything that acts on that path —
the tool the agent may call, what approval turns into, the criteria above — is keyed on the path
rather than on the row. Change one and you have changed both.

A plan that does not fit and says so is useful. A plan that does not fit and does not say so is how
a fixed-price engagement bleeds.

## Notes

The phase is a chain at the top and a fan at the bottom. Rows 1 and 2 are strictly sequential —
nothing here can be written before the contract and the brief exist. From row 4 the graph widens:
the timeline feeds staffing and the epics, and rows 9 and 10 run in parallel once staffing and the
epics are published. Row 11 also waits on row 8, because a sprint plan drawn without the delivery
plan is drawn against a cadence nobody has agreed. Row 12 waits on all the closing arms.

Row 9 depends on the epics rather than the brief alone — an architecture drawn against a scope
nobody has decomposed is drawn against a guess.
