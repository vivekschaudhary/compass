# The delivery process — design note

**Settled 2026-08-19.** This note carries the concept and only what is actually decided. Working
notes that ran ahead of it are parked in `phase-model-workings.md`, headed NOT SETTLED — real
thinking, no authority. Something moves from there to here when it settles, not before.

---

## The concept

**An ERP for software delivery.**

In SAP nobody "does" procurement freeform and then reports on it. A purchase order **sits at a step
in a process**. People work on screens — approve, release, post — and the object advances. The
system *is* the process; you cannot do the work except by moving the object through it.

Software delivery never worked that way for one reason: the real work — the code, the architecture,
the brief — was craft, done by individuals in their own tools. The process layer (Jira, Confluence)
was always a **shadow** of the real work, filled in afterwards, by hand, by the people who did it.
That is why it drifts, why it is gameable, and why status is a reporting exercise rather than a fact.

**AI removes the reason.** If the production of every artifact happens in the background, what is
left for the human is not production. It is the functional process: look at what was produced,
decide, advance.

So the lifecycle becomes what a business process is everywhere else in the enterprise: executable,
with screens.

| piece | is |
| ----- | -- |
| the lifecycle — setup → pre-sprint-0 → sprint 0 → sprint N → release | the process definition |
| the project | the object moving through it |
| the screens | where a human advances it |
| the AI | the transaction engine — it does what used to be typed |
| **status** | **position in the flow, not a report** |

The user's job shifts from producer to **functional operator of a process** — the same shift
accountants had when ledgers became systems, and buyers had when procurement became SAP.

---

## What stage one is

The ERP is the vision, not the first release. Stage one is **one engagement, moving through the
lifecycle, with every deliverable AI-drafted and every acceptance recorded in the tracker.**

What that deliberately defers: authorization, capacity and rate master data, lineage traversal,
multi-engagement portfolio views. Those are ERP-completeness, not proof.

### The thing that is actually new

Today a tracker holds only the **engineering half** of delivery. The PM writing a story, the
architect producing a design, the DM staffing the engagement — that work happens, and the board
never knows it exists.

Putting the *whole* lifecycle on the board is the first time an organisation can see planning work
as work. That is the differentiator, and it is sharper than "the tower has a WBS."

### Routing, for now

`role_code` on the task is the routing, and the queue is per engagement. That is exactly right while
one person holds one role. The ceiling is known: the moment two engineers exist, "the engineer's
tasks" is ambiguous and a real assignee column becomes unavoidable.

### The process definition lives in the table

The CSV is a **loader**, not the configuration surface. Phase 2's tailoring edits rows for one
engagement. Nothing yet does that write — the import path is one-way today.

---

## What Compass owns, and what it must not rebuild

**Jira and Compass are both storage engines for Compass.** The division:

| | owns |
| --- | ---- |
| **the tracker** | work items and their state — epics, stories, sprints, points, assignees, links, status, and every report built on them |
| **Compass** | the process — phases, rows, dependencies, ownership — and the **production**: agent runs, drafts, versions, citations, chat trails |

The tracker has no concept of a delivery process. Compass has no business rebuilding a sprint.

**A cache is fine; a copy is not.** This is where the rule erodes in practice: a rollup needs the
tracker on every page load, someone denormalises "just a few fields", and six months later there is
a second, stale, subtly different set of stories. Cached tracker data is **derived and disposable**
— droppable and refetchable at any moment, never written to, never the answer to a question the
tracker could answer directly. Anything that survives a cache flush is a copy.

### What that deletes

Four things that looked like gaps and are not Compass's to hold: **epics · stories · sprints ·
estimates and velocity.** All tracker-native. `work_task.ticket_key` and `sprint_key` already point
at them. "Where is this project" is likewise the board, not a Compass field.

### What the tower adds that the tracker cannot compute

The tracker's reports have always answered schedule questions — for the **engineering half only**,
because that is the only half ever on the board. Once the whole lifecycle is ticketed, its own
burnup becomes the schedule view, and Compass adds the three things it structurally cannot:

1. **What is owed but not yet drafted.** The tracker knows about tickets that exist; only the
   process definition knows what *should* exist.
2. **What derives from what.** Pinned inputs and citations. A tracker link says "blocks", never
   "was written from version 4 of this".
3. **Where the constraint is.** Time-in-review per person — measurable from the state transitions
   already recorded, no schema.

That third one is worth more than it looks. When a program is late the reason is usually a reviewer
bottleneck — one senior person gating twelve deliverables — and no board shows it. Note the shift
the model causes: when the agent drafts everything, the scarce resource stops being production time
and becomes **human attention on acceptance**. Clearly true for the upstream phases, where drafting
is minutes and review is days; murkier for implementation sprints, where code still takes real time.

---

## Settled since

### Reviews are authored rows, not a generated chain

A review is an ordinary row: it `reads` the deliverable, `produces` findings, and `depends_on` the
row that made it. Considered and rejected: declaring `reviewers` on a step and generating review
tasks from it — which would have needed a reviewers column, a self-reference on `work_task` to say
what a review reviews, and an ordering answer for tasks that have no step of their own.

The cost is table length; the gain is that nothing is generated and the DM sees exactly which
tickets will exist. It also fits **the plan is authored against actual staffing** — no EA on the
engagement means the DM does not write the EA review row. Adding or not adding a row *is* the
governance dial.

**Send back generalises rather than special-cases.** Any row can send back to its dependencies, so
nothing needs to know a row "is a review" — it is a row whose human said the thing it depended on
is not right. Reopening a deliverable puts everything downstream of it back automatically, because
the dependency edges already name that set.

### `depends_on` — task slugs, same phase, backward-only

- **By slug, not row number.** `depends_on: draft-epics` survives reordering, insertion and
  deletion; `depends_on: 2` breaks the moment the DM moves a row while reviewing the plan. It also
  reads as intent rather than arithmetic, which matters when a human is checking an AI's draft.
- **Backward-only** — a row may depend only on rows above it. In an ordered list a forward
  dependency was already a contradiction, and the constraint makes **cycles unrepresentable**: no
  cycle detection anywhere, a valid topological order for free. That matters more because an AI is
  the author — it cannot draft an invalid plan in this dimension.
- **Intra-phase only.** Cross-phase ordering is a phase precondition (*staffing published*, *epics
  approved*), not a row edge. Avoids qualified references entirely.
- The plan-drafting agent **produces the edges as part of its draft** — so this is an agent-file
  change as well as a column.

### The close goes to the board first

Shipped. `approve` moved the ticket after closing locally, so a refused move left Compass reading
Done and the board reading To Do. The ticket moves first; the task closes only if that took.
`mirrorState` now reports *why* it did nothing, so "nothing to move" (no ticket, no tracker) is
distinguished from "a real board said no" — the first proceeds, the second blocks.

### External edits: read before publish, fold in as input

Somebody will edit the published page — it is a wiki, that is what it is for — and a blind publish
destroys their edit silently.

The fix is not version tracking. **Read the live page immediately before any publish**, and hand
any difference to the agent as *input* to the next draft. Nothing is lost, no new column, no
refuse-or-warn dialog.

The trigger is publish, not chat: acceptance can publish with no revision at all, so a hook only on
"the owner starts chatting" would still clobber.

Deliberately NOT making the docs system the source: the externally-edited page is an input, never
the new base. As a base it would mean parsing storage format back into sections and re-anchoring
citations — lossy. As input the agent just reads it and folds in what is real.

### `kind` shrinks, it does not disappear

Two values, not three:

| | |
| --- | --- |
| `agent` | drafted by the agent, accepted by a human — HITL is the **terminal state of every task**, not a step |
| `machine` | a probe; the check is the checker, no human, no reviewer |
| ~~`hitl`~~ | gone — folded into the step it was approving |

Dropping `hitl` is a **data migration with judgment in it**, not a column change: each existing
`hitl` row has to fold into the step it approved.

### Nesting: right to remove, wrong to remove first

Removing `nests_workflow_code` also means the `nests_iff_workflow` constraint,
`workflow_run.parent_task_id`, and the nested-run logic — and it means expanding today's nesting
rows into flat ones, which is the same work as re-authoring the phases. Leave the column unused and
remove it in that change.

---

## Raised and deliberately not acted on

**`close_task` does not check what the row promised.** A step declaring `produces` can close having
produced nothing: the gate reads a separate hand-written criteria list, and where that list is
empty it passes. The design direction makes the empty list the *normal* case, so the hole widens
from an edge case to the default.

Not blocking on it. If it bites, the fix needs no new authoring — the promise is already in the
row, so it is a read: a row that declares a deliverable must have one before it can close; a row
that produces nothing (a kickoff, a meeting) closes on the named human's word, which is correct.

---

## Still open

**Context assembly.** When the agent sits down to draft, what exactly goes into the prompt.

> The draft is only as good as what it was given, and nothing currently decides what it should be
> given, records what it was given, or notices when that became stale.

Quality, audit and tracking are the same missing piece. It is load-bearing for the cascade: each
level is drafted from the level above, so if the architecture was drafted without the epics, "the
architecture derives from the epics" is a diagram, not a fact.
