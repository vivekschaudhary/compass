# Compass MVP — business requirements

**Status:** settled 2026-08-19 · the requirements baseline for the MVP.

What this document is: the concept, the scope, the process being built, the decisions already made
and the requirements that follow from them. It is the single description of what the MVP is — if
another document in this repo describes a different MVP, a different lifecycle or a different
status flow, this one wins and that one is stale.

---

## 1 · The concept

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

### The product claim

> The tower drives the AI's first version of every deliverable the plan calls for, and routes it to
> the named human who accepts it.

Not a status board. Not a quality verifier. A drafting engine with a plan.

The real delivery failure is not bad documents — it is **missing** ones: the RACI nobody wrote, the
working agreement that never happened, sprint 3 with no plan. That is what a tower that drafts
everything eliminates, and it needs no argument about quality to be true.

### What is actually new

Today a tracker holds only the **engineering half** of delivery. The PM writing a story, the
architect producing a design, the DM staffing the engagement — that work happens, and the board
never knows it exists.

Putting the *whole* lifecycle on the board is the first time an organisation can see planning work
as work. That is the differentiator, and it is sharper than "the tower has a WBS."

---

## 2 · Scope

**The MVP is one engagement, moving through the lifecycle, with every deliverable AI-drafted and
every acceptance recorded in the tracker.**

In scope: the four phases in §4, the task loop in §3, drafting and revision through the agentic
interface, publication to the docs system, and tickets in the tracker for every row.

Deliberately deferred — ERP completeness, not proof of it: authorization, capacity and rate master
data, lineage traversal, multi-engagement portfolio views. §8 lists what else is out and why.

---

## 3 · How work moves

### The task loop

```
To Do  →  agent drafts  →  In Review (HITL)  →  human verifies  →  Done
                                ↑                      │
                                └──── chats to revise ──┘
```

The agent produces the first pass. The human **owns** the task and verifies: accepts, or chats with
the agent to change the outcome, then accepts. There is no agent-task vs human-task distinction —
every task is agent-drafted and human-owned, and **HITL is the terminal state of every task, not a
step of its own.**

The exception is a `machine` row — a probe, where the check is the checker and there is no human and
no reviewer.

Tracker vocabulary, discovered from the client's board rather than assumed:

| Compass | on the board |
| ------- | ------------ |
| not started | Backlog / To Do |
| agent running | In Progress |
| **awaiting the human** | **Awaiting HITL approval**, or In Review where the board has no gate status |
| accepted | Done |

The third is load-bearing, and `compass/framework/delivery-lifecycle.md` — the spec `config.yaml`
points at — makes it a **first-class status rather than a workflow mechanic**, so "everything
waiting on a person" is a column you can filter for. Where a client's board has no such status the
vocabulary is discovered and In Review is the honest second choice.

That column is where the tower is more informative than the board: the board says a human has the
ball, the tower says what was produced, what it cites, and what is left.

### The authoring surface

The owner never types. They read the draft, **chat to revise**, and accept. The document lives in
Compass — versioned, every change traceable to the instruction that caused it. The docs system is a
publication target: where readers read, where the client looks, where the ticket links.

The chat trail is therefore **the review record** — not a proxy for review, the review itself,
verbatim, with reasoning. It also settles the rubber-stamp question without a metric: the chat
either happened or it did not, and it cannot be faked with cosmetic edits because there is nothing
to edit.

The conversation layer is **bought, not built** — chat plus a mutating document is what Claude
artifacts and OpenAI canvas already are. What makes it a product is four bindings: context
(pre-loaded, not pasted), output (a document version, not a message), scope (this deliverable only),
and attribution (a named person, in a role, against a task). Scope is a feature — a general
assistant fills the deliverable's trail with noise.

### The cascade

Load from the top, unpack one level at a time. Each row is the same loop: **AI drafts, the ceremony
the team already holds accepts it.**

| level | AI drafts | accepted at |
| ----- | --------- | ----------- |
| SOW / BRD | — (supplied) | — |
| timeline + milestones | ✓ | kickoff |
| epics | ✓ per milestone / OKR | pre-sprint-0 review |
| stories | ✓ per epic | refinement |
| sprint allocation | ✓ | **sprint planning** |
| the work | ✓ first version | the assignee, in Compass |
| closure | — | the assignee, **in the tracker** |
| sprint outcome | ✓ demo notes, retro input | **demo + retro** |

**The ceremony is the gate.** No new ritual, no new approval step, nobody asked to log in somewhere
and click approve. The meetings a delivery team already runs *are* the HITL gates, acceptance is
attributable because the meeting happened and those people were in it, and the value lands in the
most credible unit there is: the meeting got shorter.

**Tracking falls out.** Every level is linked, so closure at the bottom rolls up without anyone
reporting status. "Are we going to hit the March milestone?" becomes arithmetic rather than a PM's
opinion. Three things decide whether that arithmetic is honest: estimation (without effort against
capacity you get scope-remaining, not a date), unplanned work (it eats the capacity the projection
assumed), and closure discipline (inherited, not fixed).

---

## 4 · The delivery process

Two kinds of phase, same execution model — only the row generator differs:

| | rows come from |
| --- | -------------- |
| **Authored** | a table written once per org, tailored per engagement — setup · pre-sprint-0 · sprint-0 |
| **Derived** | generated from an upstream artifact at open — each implementation sprint |

Row shape: `ord · role · task · title · reads · produces · depends_on`.

### 4.1 · Setup engagement

Nothing can start until this is true.

| ord | role | task | depends-on |
| --- | ---- | ---- | ---------- |
| 1 | dm | Name the delivery manager | — |
| 2 | dm | Configure document storage | 1 |
| 3 | dm | Configure the tracker | 1 |
| 4 | dm | Validate the connections | 2, 3 |

Row 4 earns the phase: write a probe page, create and delete a probe issue, read the board's status
vocabulary. **Config that was never exercised is not config.** It is a `machine` row — the check is
the checker, so it needs no reviewer.

**Bootstrap:** this is the phase that configures the tracker, so there is nowhere to put its own
tickets. Phase 1 runs in Compass and row 4 **back-fills** the epic and its four stories, already
Done. A setup epic showing four Done stories with real timestamps is a better first impression than
an empty board.

### 4.2 · Pre-sprint 0

What are we doing, with whom, by when.

| ord | role | task |
| --- | ---- | ---- |
| 1 | dm | File the SOW / BRD / product brief |
| 2 | dm | Engagement timeline — start, end, milestones |
| 3 | dm | Staffing plan and resources |
| 4 | dm | Roles and responsibilities |
| 5 | pm | Epics from milestones / OKRs |
| 6 | dm | Tailor the delivery plan to this engagement |

Every row is owned by `dm` because the DM is the only person known before staffing exists. **Row 3
gates every later phase's ticket creation** — you cannot route acceptance to a role nobody fills. The
precondition on phase 3 is *staffing published*, not merely *phase 2 done*.

Row 6 is where the org's phase tables become this engagement's: a tracked, accepted deliverable
like any other.

### 4.3 · Sprint 0

The team can start.

| ord | role | task |
| --- | ---- | ---- |
| 1 | architect | Architecture design |
| 2 | designer | Design library |
| 3 | dm | Team working agreement |
| 4 | pm | Sprint plan — stories for sprints 1–3 |
| 5 | dm | Kickoff |

### 4.4 · Sprint N — hybrid, repeats

| | rows | source |
| --- | ---- | ------ |
| **ceremony** | sprint planning · demo · retro | authored, same every sprint |
| **work** | one row per story in the sprint | derived from the sprint plan |

A work row's `produces` is a PR rather than a document — a declaration, not a different process.

### 4.5 · Reviews and staffing

**A review is an ordinary row**: it `reads` the deliverable, `produces` findings, and `depends_on`
the row that made it. The reviewer's agent drafts the findings; the reviewer accepts or corrects
them — the same leverage the author got.

**The plan is authored against actual staffing.** No fallback for unstaffed or double-hatted roles:
if the engagement has no EA, the DM does not write the EA review row. Adding or not adding a row
*is* the governance dial. Validated at publish — every role named as an owner or a reviewer must be
staffed, refused at publish, never resolved at run time.

**Send back generalises.** Any row can send back to its dependencies, so nothing needs to know a row
"is a review" — it is a row whose human said the thing it depended on is not right. Reopening a
deliverable puts everything downstream back automatically, because the edges already name that set.
A send-back carries a recorded reason.

### 4.6 · Amending a running plan

- adding a row to a running phase creates a new task and its ticket
- editing a row whose task is **closed never retro-changes it**
- removing a row **cancels its ticket explicitly**, never silently abandons it
- **a task pins the plan version it was created under** — without this you cannot tell whether a
  task passed the gate it has now or the gate it had then

---

## 5 · System boundaries

**The tracker and Compass are both storage engines for Compass.**

| | owns |
| --- | ---- |
| **the tracker** | work items and their state — epics, stories, sprints, points, assignees, links, status, and every report built on them |
| **Compass** | the process — phases, rows, dependencies, ownership — and the **production**: agent runs, drafts, versions, citations, chat trails |

The tracker has no concept of a delivery process. Compass has no business rebuilding a sprint.

**A cache is fine; a copy is not.** This is where the rule erodes: a rollup needs the tracker on
every page load, someone denormalises "just a few fields", and six months later there is a second,
stale, subtly different set of stories. Cached tracker data is **derived and disposable** — droppable
and refetchable at any moment, never written to, never the answer to a question the tracker could
answer directly. Anything that survives a cache flush is a copy.

**The tracker holds the status of record.** A close the board refused is not a close: the ticket
moves first, and the task closes only if that took. "Nothing to move" — no ticket, no tracker
configured — is not a failure and proceeds. A close made directly in the tracker is accepted and
recorded as such rather than fought.

**No tracker configured is fatal.** There is nowhere for status to live, which is why setup is a
phase with a validation row rather than a form.

### What the tower adds that the tracker cannot compute

The tracker's reports have always answered schedule questions — for the **engineering half only**,
because that is the only half ever on the board. Once the whole lifecycle is ticketed, its own
burnup becomes the schedule view, and Compass adds:

1. **What is owed but not yet drafted.** The tracker knows about tickets that exist; only the
   process definition knows what *should* exist.
2. **What derives from what.** Pinned inputs and citations. A tracker link says "blocks", never
   "was written from version 4 of this".
3. **Where the constraint is.** Time-in-review per person, from state transitions already recorded.

That third is worth more than it looks. When a program is late the reason is usually a reviewer
bottleneck — one senior person gating twelve deliverables — and no board shows it. When the agent
drafts everything, the scarce resource stops being production time and becomes **human attention on
acceptance**. Clearly true upstream, where drafting is minutes and review is days; murkier for
implementation sprints, where code still takes real time.

---

## 6 · Design decisions

Recorded with what each one beat, so none is re-proposed cold.

**Quality is not measured. Trust the human.** No content scanner, no criteria vocabulary, no
engagement metrics. Structural checks are satisfiable by the generator — if the drafting agent knows
the org standard, every doc it produces meets it and the tick attests to nothing. Grounding checks
catch sloppiness, never wrongness. And a tool whose opening move is "we are checking whether you
really reviewed that" is the worst posture for landing inside a consultancy. Attributed human
judgment is already the professional-services standard; reproducing it faithfully is the goal.

*Kept: a record, not a gate.* The revision trail exists anyway. When a program goes sideways in
month four, "what did we know in month one" has an answer.

**Measurement is not hand-authored.** The row declares what it produces and who accepts it; that is
the criterion. Rejected: requiring a Done criterion per row, which puts a vacuity problem on the
extensibility path — *"Done when: the team is aligned"* passes any such rule. Hand-written criteria
survive only where there is no document and no reviewer, only a probe.

**Reviews are authored rows.** Rejected: declaring `reviewers` on a step and generating review
tasks — which needs a reviewers column, a self-reference on `work_task` saying what a review
reviews, and an ordering answer for tasks with no step of their own. Authoring costs table length
and buys the DM seeing exactly which tickets will exist.

**`depends_on` by task slug, same phase, backward-only.** Slugs survive the DM reordering rows while
reviewing the plan; row numbers do not, and they read as intent rather than arithmetic.
Backward-only makes cycles **unrepresentable** rather than detectable — which matters because an AI
drafts the plan.

**External edits are read before every publish and folded in as input**, never taken as the new
base. As a base it would mean parsing storage format back into sections and re-anchoring citations —
lossy. The trigger is publish, not chat, because acceptance can publish with no revision at all.

**No runtime nesting.** Phases are flat ordered lists; a shared sequence is an include resolved at
authoring time. This removes the depth cap, the flattening logic and the "a row's Done is a rollup
of its children" problem — the last irreconcilable with the tracker holding status, since a rollup
can disagree with the ticket.

**`kind` shrinks to `agent | machine`.** `hitl` goes, folded into the step it was approving — HITL is
the terminal state of every task rather than a row.

**Routing is `role_code` for now.** Correct while one person holds one role. The ceiling is known:
two engineers make "the engineer's tasks" ambiguous and an assignee column unavoidable.

**The process definition lives in the table.** The CSV is a loader, not the configuration surface.

---

## 7 · Requirements

Grounded in what the app contains as of 2026-08-19.

### Already built — do not rebuild

- **Context assembly** (`app/lib/agent/context.ts`). Pins each declared input at start with the
  exact live version; records a null version for a document never drafted and tells the agent so
  rather than proceeding quietly; guarantees the pin on EVERY agent call rather than one UI path;
  separate draft and revision prompts carrying the prior draft and any rejections; citations
  validated against the pin set, so a cite naming a document this task did not read is dropped.
- **The close goes to the board first.**
- **The tracker seam** — epic per phase, story per row, status vocabulary discovered from the board.
- **Documents** — tree, versions, sections, citations with the source version pinned NOT NULL.
- **Execution** — phase runs, tasks, criteria and measurements, `close_task`, the event spine.

### R1 · Re-author the phases

The largest item and mostly writing. The seed has `basecamp` (2 rows) and `groundwork` (3); §4 has
four phases with different rows. **Until this exists a demo walks the old shape.**

- the four tables in the row shape of §4
- `hitl` rows folded into the step each was approving
- `kind` reduced to `agent | machine`, role constraint reworded
- nesting expanded flat — `create-product-brief` and `setup-foundation-architecture` become rows
- review rows authored where the staffing supports them
- `depends_on` edges on every row that has one

### R2 · `depends_on`

`text[]` of task slugs, intra-phase only, with a constraint that every slug names a row above this
one. Generates native tracker issue links on mirror. The plan-drafting agent produces the edges as
part of its draft — an agent-file change as well as a column.

### R3 · The bar in the prompt

**A direct consequence of dropping hand-authored criteria.** `systemPrompt` ends its criteria block
with *"No done criteria are recorded. Say so; do not invent a bar for your own work."* Making
`produces` + acceptance the criterion makes that the NORMAL branch — so every agent would open by
announcing it has no bar to work to.

The bar is what the row promised: the deliverable, what it must rest on, and who accepts it. The
context object already carries all three. Same root cause as the `close_task` gap, surfacing in the
prompt instead of the gate — and here it degrades every draft rather than one close.

### R4 · Reference material in the system prompt

The agent gets its own file, the workflow inventory, the task and the pinned basis. It gets **no
deliverable template, no org standard, no glossary, no stack profile** — which is why drafts are
structurally inconsistent between runs.

Declared **on the agent**, not on the row: every architecture task uses the architecture standard,
so the row author should not have to name it. **Basis is the row's; reference is the agent's.**

### R5 · Publish reads the live page first

Fetch the published page immediately before any publish; hand any external edit to the agent as
input to the next draft.

### R6 · Send back reopens dependencies

Any row can send back to its `depends_on`, reopening the deliverable and everything downstream.

### Sizing

R1 and R3 are the substance — R1 because everything hangs off it, R3 because it silently degrades
every draft. R2, R4, R5 and R6 are each small.

---

## 8 · Out of scope

| | why |
| --- | --- |
| a tracker listener / webhook | the close button writes through instead. Needed when developers close their own stories from the board in sprints |
| epics · stories · sprints · estimates as Compass entities | tracker-native (§5) |
| `close_task` checking that `produces` exists | raised, deferred. If it bites the fix needs no new authoring — the promise is already in the row |
| a fetch tool for the agent | none exists, so declared-vs-fetch is moot. If added, a fetch must write a `task_input` row like any pin, or prompt reconstruction stops working |
| a staleness query | falls out of the pins whenever wanted; nothing depends on it |
| an assignee column on `work_task` | `role_code` routes correctly until two people share a role |
| authorization | the MVP is one operator |
| content quality scanning | §6 — deliberately not built |

---

## 9 · Success criteria

The claim has an in-loop sensor, which the quality framing never did:

- **time from phase open to first draft of every deliverable in the phase** — hours, observable,
  ungameable
- **what fraction of the owed deliverables exist at all**, at any moment
- **time saved per ceremony** — the unit the customer actually feels

The MVP is proved when one engagement walks setup → pre-sprint-0 → sprint 0 with every deliverable
drafted by the agent, revised by chat rather than typing, accepted by a named human, and closed on
the board.

---

## 10 · Open

**Nothing blocking.** The one thing genuinely unanswered: whether an architect will accept a drafted
architecture and revise it by chat rather than opening Confluence and writing it themselves. That is
answered by one real deliverable with one real person, not by more design.
