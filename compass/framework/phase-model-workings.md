# Working notes — NOT SETTLED

Parked 2026-08-19. Working notes from the design session, kept because the thinking is real, but
**nothing here is decided.** The settled concept is `phase-model.md`; this file is everything that
ran ahead of it. Do not treat any decision below as agreed.

---

### The product claim

> The tower drives the AI's first version of every deliverable the plan calls for, and routes it to
> the named human who accepts it.

Not a status board. Not a quality verifier. A drafting engine with a plan.

The real delivery failure is not bad documents — it is **missing** ones: the RACI nobody wrote, the
working agreement that never happened, sprint 3 with no plan.

### The measurable outcome

- **time from phase open to first draft of every deliverable in the phase** — hours, observable, ungameable
- **what fraction of owed deliverables exist at all**, at any moment
- **time saved per ceremony** — the unit the customer actually feels

---

## The cascade

Load from the top, unpack one level at a time. Each row is the same loop: **AI drafts, the ceremony
the team already holds accepts it.**

| level | AI drafts | accepted at | produces |
| ----- | --------- | ----------- | -------- |
| SOW / BRD | — (supplied) | — | the basis |
| timeline + milestones | ✓ | kickoff | the dates |
| epics | ✓ per milestone / OKR | pre-sprint-0 review | scope, linked to milestones |
| stories | ✓ per epic | refinement | work, linked to epics |
| sprint allocation | ✓ | **sprint planning** | commitment, linked to dates |
| the work | ✓ first version | the assignee, in Compass | the deliverable |
| closure | — | the assignee, **in the tracker** | truth |
| sprint outcome | ✓ demo notes, retro input | **demo + retro** | next sprint's amendments |

### The ceremony is the gate

No new ritual, no new approval step. The meetings a delivery team already runs *are* the HITL gates.
Acceptance is attributable because the meeting happened and those people were in it, and the value
lands in the most credible unit there is: **the meeting got shorter.**

### Why tracking falls out

Every level is linked — story to epic to milestone to the SOW date — so closure at the bottom rolls
up **without anyone reporting status.** "Are we going to hit the March milestone?" becomes arithmetic
rather than a PM's opinion.

Three things decide whether that arithmetic is honest:

1. **Estimation** — without effort against capacity you get scope-remaining, not a date.
2. **Unplanned work** — real sprints absorb work that was never planned, and it eats the capacity the
   projection assumed. Must be first-class and visible or the rollup lies in the direction that hurts.
3. **Closure discipline** — inherited, not fixed.

---

## Decisions (unsettled)

**D1 — the tracker is the status of record.** State lives in its ticket; Compass is notified and reads
it back. The point is not the webhook — recording now happens where it already happened. Cost:
tracker down means no closes.

**D2 — out-of-band closes accepted and flagged.** Rejecting means fighting the client's own tool;
ignoring means rebuilding two-way sync.

**D3 — everything that is work is an issue; everything that is evidence attaches to its issue.**
Nothing Compass-private. The line is shape, not visibility.

**D4 — hierarchy engagement → phase → task** = project → epic → story. No sub-tasks.

**D5 — no runtime nesting.** Flat ordered task lists; a shared sequence is an include resolved at
authoring time. Deletes the depth cap, the flattening logic, and the "a row's Done is a rollup"
problem — the last irreconcilable with D1, since a rollup can disagree with the ticket.

**D6 — two kinds of phase:** authored (setup · pre-sprint-0 · sprint-0) and derived (each sprint).
Only the row generator differs; this stops sprints being a special engine.

**D7 — one task shape.** `To Do → agent drafts → In Review (HITL) → human verifies → Done`, with a
chat-to-revise loop back from In Review. Tracker vocabulary discovered from the client's board.

**D8 — no agent-task vs human-task.** `kind` dropped; every task is agent-drafted and human-owned.
Assignment becomes primary; the liveness-vs-status problem disappears; host routing becomes a per-org
setting.

**D9 — a review is a task.** The agent drafts findings; the reviewer accepts or corrects them. Same
leverage the author got, no new machinery.

**D10 — governance intensity is a dial on the deliverable.** `owner` + ordered `reviewers`. Light
engagement one reviewer, regulated four, identical phase table. Review tasks generated, not authored.

**D11 — rejection.** Reopens the deliverable's ticket; chain restarts from the first reviewer;
rejection carries a recorded reason.

**D12 — reviewers optional, owner accepts by default.** With the agent as maker and the human as
checker, the owner accepting is already maker ≠ checker.

**D13 — the plan is authored against actual staffing.** No fallback for unstaffed or double-hatted
roles. Publish-time validation: every role named must be staffed.

**D14 — tailoring the plan is a row in pre-sprint 0.**

**D15 — measurement is not hand-authored.** The row already declares what it produces and who accepts
it; that is the criterion. Hand-written criteria survive only where there is no document and no
reviewer, only a probe (setup's "validate the connections").

**D15a — quality is not measured; trust the human.** No content scanner, no criteria vocabulary, no
engagement metrics. Structural checks are satisfiable by the generator; grounding checks catch
sloppiness, never wrongness; and checking whether someone "really reviewed" is the worst posture for
landing inside a consultancy. Kept: the revision trail as a **record, not a gate** — so that when a
program goes sideways in month four, "what did we know in month one" has an answer.

**D16 — amendment rules.** Adding a row to a running phase creates a task; a closed task is never
retro-changed; removal cancels its ticket explicitly; a task pins the plan version it was created
under.

**D17 — `depends-on` becomes tracker issue links.**

**D18 — tickets created from the plan, never by hand.** Authored phases expand up front (the whole
WBS on day one); derived phases at open; no orphans.

**D19 — "no tracker configured" is fatal.** Nowhere for status to live.

**D20 — Compass is the authoring surface; the docs system publishes.** The owner never types — they
read, chat to revise, accept. Forces: publish must detect divergence and refuse to clobber; and
reviewers do not edit (their chat produces findings that go back to the owner), or the independence
D12 relies on disappears. Co-authoring is the one thing this takes away that Confluence does natively.

**D21 — the chat trail is the review record.** Not a proxy — it *is* the review, verbatim, with
reasoning. Settles the rubber-stamp question without a metric: it cannot be faked with cosmetic edits
because there is nothing to edit.

**D22 — the conversation layer is bought, not built.** Chat plus a mutating document is what Claude
artifacts and OpenAI canvas already are. What makes it a product is four bindings — context, output
as a document version, scope, attribution. Scope is a feature. The build is **context assembly +
document binding + the version trail.**

---

## The row shape

`ord` · `role` (slot, resolved by the staffing plan) · `task` · `title` · `reads` · `produces` ·
`depends-on` · `reviewers`. `kind` gone (D8), `nests` gone (D5), `criteria` gone in the ordinary
case (D15).

---

## The phases

**1 · Setup engagement** — name the DM · configure document storage · configure the tracker ·
validate the connections. Row 4 earns the phase: write a probe page, create and delete a probe issue,
read the board's status vocabulary. Config never exercised is not config.

*Bootstrap problem:* D18 and D19 cannot hold here — this is the phase that configures the tracker, so
there is nowhere to put its own tickets. Resolution: phase 1 runs in Compass and row 4 **back-fills**
the epic and its four stories, already Done.

**2 · Pre-sprint 0** — file the SOW/BRD/brief · timeline and milestones · staffing plan and resources ·
roles and responsibilities · epics from milestones/OKRs · tailor the delivery plan. Every row owned by
`dm`, the only person known before staffing exists. **Row 3 gates every later phase's ticket creation**
— the phase-2 → phase-3 precondition is *staffing published*, not merely *phase 2 done*.

**3 · Sprint 0** — architecture design · design library · team working agreement · sprint plan for
sprints 1–3 · kickoff.

**4 · Sprint N (hybrid, repeats)** — ceremony rows (planning · demo · retro) authored; work rows
derived from the sprint plan. A work row's `produces` is a PR; its `reviewers` are code and security
review — a declaration, not a different process.

---

## The open problem: context assembly

When the agent drafts a deliverable, **something must decide exactly what goes into that prompt** —
and `reads` naming two paths is not a policy.

> The draft is only as good as what it was given, and nothing currently decides what it should be
> given, records what it was given, or notices when that became stale.

First clause is quality, second is audit, third is tracking — the same missing piece. It is
load-bearing for the cascade: if the architecture was drafted without the epics, "architecture derives
from epics" is a diagram, not a fact.

1. **Selection.** Sprint 1 has a SOW and a brief. Sprint 6 has a SOW, brief, architecture, 8 epics,
   120 stories, 6 sprint plans and 5 retros. Accuracy degrades on irrelevant content well before any
   token limit.
2. **Version pinning.** The schema already insists on an answer — `task_input` pins a
   `document_version`, `citation.source_version_id` is NOT NULL — so assembly must be deterministic
   and recorded, never "whatever is current."
3. **Staleness propagation.** Drafted from brief v2, brief is now v5 — is it stale? With pinned inputs
   this is computable: *the SOW changed, here are the 14 deliverables derived from the old version.*
   A tracking feature that falls out of solving the context problem.
4. **Draft vs revise.** A first draft needs the full basis; a revision needs the current document, the
   instruction and recent turns.

*Unresolved fork:* declared inputs only, or can the agent fetch? Declared-inputs gives reproducibility
and a meaningful audit; the cost is that a missing input does not error, it produces a confident wrong
draft — so `reads` becomes load-bearing authoring.

### Also open

Where the product brief is authored when the client supplies none · what generates sprint rows
(re-reading the sprint plan makes it a living document amended between sprints) · ad-hoc work as a
first-class flagged row · estimation · what `produces` means for a PR versus a document.

---

## Delta against what is built

- The tracker seam is **one-way** (Compass → tracker). D1 needs the read back; the seam and credentials
  exist, the listener does not.
- The tracker's own comment says it is "never fatal, a MIRROR, Compass is the record." D1 and D19
  invert that.
- `close_task` builds its refusal with `string_agg`, NULL over zero rows — a task with no Done criteria
  closes green. The routine should fail closed.
- Per-engagement spec resolution is bypassed, so engagement-level overrides silently do not apply.
- Nesting machinery (`nests`, `parent_task_id`) removed by D5.
- Host routing hardcoded to one model.
- Documents are authored and published, but nothing prevents divergence when the published page is
  edited (D20).
