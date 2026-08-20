# The delivery process — design note

**Settled 2026-08-19.** Rewritten the same day against the concept the session landed on; the first
draft is superseded. Decision numbers are kept stable — amended and dropped ones say so, so earlier
references still resolve.

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
