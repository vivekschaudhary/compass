# Delivery lifecycle (#139)

How a unit of work moves through Compass, and how an AI deliverable becomes tracked work rather than
prose in a doc. Dogfood-proven in the companion product app (compass-app, the Wealth engagement);
recorded here as a spec, not (yet) promoted to canon.

Declared in `compass/config.yaml` → `delivery_lifecycle:`.

## Status flow

```
Backlog ──▶ Ready ──▶ In Progress ──▶ Awaiting HITL approval ──▶ Done
raw,        refined +   an AGENT is     AI done — a HUMAN          approved /
just made   role-labeled executing      must decide (the gate)     accepted
```

- **Backlog** — created, unrefined.
- **Ready** — refined, has acceptance, role-labeled; an agent can pick it up.
- **In Progress** — an agent is actively executing the work.
- **Awaiting HITL approval** — **a first-class status, not just a workflow mechanic.** The AI has
  produced a deliverable and a human must gate it. Because it's a real status, the board shows a
  column you can filter for — "everything waiting on a person." This is the action-half of
  `[actionability-before-trust]` made observable on the board.
- **Done** — the human approved; acceptance is demonstrated (`[done-by-outcome-not-activity]`).

Status = phase (this small, stable set). **Role = a label** (the routing axis, below). Who-has-the-ball
= assignee. Never multiply statuses by role.

The shift from a human-only workflow: doing is fast and autonomous (agents), so the scarce, slow
resource is human judgment. The bottleneck moved from *building* to *approving* — so the approval gate
earns its own status, and that's the state an exec manages by exception.

## Role-labeled story routing

Each story is owned by exactly one delivery role, and that ownership is the routing axis — each role
pulls its own tickets, and the workflow that runs against a story is the owning role's. In the agent
methodology this is the story's `owner:` + `type:` pair (see `compass/agents/pm.md`
`decompose-bet-to-story` — non-UI → a feature story; UI → a design + copy + feature trio). In the
projected board it surfaces as the ticket's role label.

## The playbook — a deliverable's action items become tracked work

Every AI deliverable ends in an actionable section — research **Recommendations**, a design spec's next
steps, a story's **Acceptance Criteria**. The playbook turns those from paper into trackable work,
distinguishing two kinds:

- **Recommendations / action items → tasks.** The workflow drafts the next-step tasks (~80%); the human
  edits and adds the last ~20% **at the gate** (the HITL review), then promotes them as tracked,
  role-labeled tasks on the story. They flow through the same lifecycle.
- **Acceptance criteria → a checklist.** A story's AC becomes a checkable definition-of-done — verified,
  not new work — ticked off as build/QA satisfies each.

The gate is what keeps this honest: nothing is auto-created; the human always reviews the AI's draft
before it becomes work (mirrors the propose→accept pattern and `[conditional-dispatch]`'s HITL routing).

## Relation to canon

An application of `[actionability-before-trust]` (the actionable surface must not silently drop an
action — here, a recommendation that would otherwise die in a doc becomes a tracked, routable task) and
`[done-by-outcome-not-activity]` (AC as a demonstrated checklist, not self-reported completion). If the
patterns recur beyond this dogfood, they're candidates for a named canon principle at a future retro —
not promoted here (`[declare-not-implement]`-adjacent restraint).

## Proof

compass-app dogfood (Wealth engagement): research / design-spec / scan / etc. move their ticket
Backlog → In Progress → **Awaiting HITL approval** → Done in real time; role-labeled stories drive each
role's queue; a generic per-role workflow runner produces the deliverable + its playbook; the playbook
promotes to tracked tasks; and epic/story creation projects real AI-authored descriptions to Jira.
