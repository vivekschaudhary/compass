<!-- SPRINT 0 — the engagement kickoff backlog. When an engagement is created (from the SOW),
     the intake instantiates ONE ticket per row in the table below, in @tickets + on the board.
     This file is the SOURCE OF TRUTH: edit the rows to change what a new engagement starts with —
     whatever is here is what gets created. Vocab (owner roles · @system slots · gate grammar):
     compass/templates/workflow.md. -->
---
name: sprint-0
title: Foundation & Setup
trigger: engagement created (intake)
creates: one ticket per row below, in dependency order
---

# Sprint 0 — Foundation & Setup

The setup work every engagement starts with — tracked as **real tickets**, worked agile (not an
upfront plan). Each ticket is DONE when its workflow's `produces` gate is met. Sprint 1+ (bets →
stories) is **pulled from state** after the foundation is approved; it is NOT pre-created here.

## Tickets  (instantiated at kickoff)
| # | ticket | workflow | owner | done (gate) | depends-on |
|---|--------|----------|-------|-------------|------------|
| 1 | Connect systems of record | — (intake/settings) | delivery-manager | tickets.wired && docs.wired && scm.wired | — |
| 2 | Create product foundation | /setup-product | pm | product@docs == approved | 1 |
| 3 | Foundation architecture | /setup-foundation-architecture | architect | foundation-arch@docs == approved | 2 |

## How a ticket is worked
Run its `workflow`; that drives the ticket through the lifecycle:

```
Create product foundation   ● Backlog → In Progress → Awaiting HITL → Done
   run /setup-product  ────────────────┘           (product@docs approved)
```

The ticket's **definition-of-done IS the workflow's `produces` gate** — no status theater; a ticket
is Done only when its artifact is actually approved.

## Notes
- **Ordered + `depends-on`.** A ticket can't start until its dependency is Done — foundation
  architecture needs the product approved; both need systems connected. (Ticket 1 is the enabler:
  until the adapters are wired, tickets 2–3 live on the local board and mirror to `@tickets` once wired.)
- **`docs.wired` includes the workspace scaffold.** Ticket 1 is Done only when the docs adapter is
  wired **and** the workspace doc structure is created. That structure is seeded per-engagement from
  the default in `compass/templates/doc-tree.md`, **refined** by the user (add / remove / rename
  nodes), then created on approve — the refined copy is what gets scaffolded, so an engagement can
  diverge from the default without changing it (`[sprint-0-materializes-refinable-defaults]`).
- **Lean by design.** Only load-bearing setup. Roster + milestones are seeded by intake directly
  (not tickets).
- **This table is editable — and load-bearing.** To change what a new engagement starts with, add /
  remove rows. The intake creates whatever rows are here (data-driven; no code change to add a task).
- **Sprint 1+ is derived, not planned.** After the foundation is approved, each bet flows
  `/create-brief → /create-bet-architecture → /create-story → /tech-design → /build`, each its own
  ticket, pulled from current state (`[derive-from-state]`) — not scheduled up front.
