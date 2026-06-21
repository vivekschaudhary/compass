# Compass Orchestrator — Product Vision

**Status:** north star. This is the product intent in plain language — what the orchestrator is *for*. The technical design that serves it lives in [`DESIGN-pluggable-executor.md`](DESIGN-pluggable-executor.md) (#87); the current build state is tracked in `compass/workflows/improvements.md` and `compass/framework/mvp.md`. Everything we build for the orchestrator should point back here.

---

## What I want (as the user)

I want to drive an entire product effort — whether I'm starting something brand new or improving an existing product — from one command. The orchestrator is the **conductor**: it brings in the right expert at each stage, passes the work cleanly from one to the next, and keeps me in control at the decisions that matter. I shouldn't have to babysit handoffs or copy work between tools — the orchestrator is the glue that runs the whole lifecycle.

And I want to run my **whole portfolio at once** — many briefs and tasks progressing in parallel — with one place that shows me what's moving, what's blocked, and the short list of decisions waiting on me.

## The team it conducts (the players)

Each role is a specialist the orchestrator calls at the right moment:

- **Triage** — takes in a request, bug, or idea and routes it to the right starting point.
- **PM** — decides what we're building and why; shapes the bet and the stories.
- **Architect** — decides how it's built; the load-bearing technical choices.
- **Engineer** — builds it.
- **Reviewer** — an independent second set of eyes that checks the work.
- **E2E / QA** — proves it actually works through real user flows.
- **SRE** — makes sure it's production-ready and resilient.
- **Deploy** — ships it.
- **Monitor** — watches it live and feeds problems back to Triage. The loop closes.

## How the players work together — two ways

1. **Down the lifecycle.** Each stage hands to the next (Triage → PM → Architect → Engineer → Reviewer → E2E → SRE → Deploy → Monitor), carrying the work and context forward automatically.
2. **Sideways, on demand.** Any lead can pull in the specialists they need. PM can bring in a Researcher; the Architect can bring in specialists for a hard call; the Engineer can bring in whatever the task needs. It's not a rigid assembly line — a lead delegates to get the right input, then carries on.

## Run the whole portfolio (in parallel)

Real product orgs run many initiatives at once. The orchestrator should too: point it at the portfolio and it keeps many things moving — some briefs being drafted, some in architecture, some being built, some in review. What *can* run in parallel is decided by the portfolio's dependency map (the conductor runs the independent work together and holds what's blocked); I don't sequence it by hand.

## The cockpit — one view

One place that answers, at any moment: **what's moving, what's blocked, and the short list of decisions waiting on me** — and lets me act on that list (approve, send back) right there. As work runs in parallel, this is what keeps the volume manageable: the machine fans the work out; the cockpit funnels the decisions back to me as a clean queue, not a flood of interruptions.

## I stay in control

At the moments that matter — the plan, the architecture, the merge, the deploy — it stops and asks me to sign off. Nothing irreversible happens without my yes, and every decision is recorded, so I can always see why something was done. **This never goes away, even as the roles get smarter** — it's the floor the whole system stands on.

---

## Where we are today (for the build team)

Honest gap analysis against the vision above:

- **Most of the team already exists** as migrated agents: Triage (support), PM, Architect (+ Enterprise Architect), Engineer, Reviewer, E2E (automation). **Two gaps:** **SRE** (production-readiness) and **Monitor** (live observability) are not built yet.
- **Down-the-lifecycle handoff exists** — the bootstrap→build chain plus reactive `/fix` and `/ops` are dispatch graphs the orchestrator can walk (8 of 17 workflows as of v0.3.45).
- **Sideways, on-demand delegation is the big new capability.** Today the lifecycle runs as a fixed sequence; a lead *deciding* to pull in a specialist mid-task (PM → Researcher) is dynamic delegation the current conductor can't do. This is what the tool-using / delegating executor in [`DESIGN-pluggable-executor.md`](DESIGN-pluggable-executor.md) (#87) is for.
- **The cockpit — slice 1 shipped (#104).** The orchestrator now has a real **event spine** (`events.py`): run/step/gate lifecycle events emitted through one `on_event` path and persisted to a **user-local, portfolio-wide** store (`~/.compass/orchestrator/events.jsonl`, override `$COMPASS_HOME`). The first consumer is `python3 -m compass.orchestrator.cockpit` — a live, portfolio-spanning text view with **⏸ Awaiting your decision** at the top (the open-gate queue across every project, each with a ready-to-run approve/reject command), **▶ In flight**, and **✓ Done/halted**. This realizes the cockpit's core ("what's moving, what's blocked, what needs me") at the CLI. **Still pieces elsewhere:** `/plan` is the schedule half; `/status` the decisions half; `/dashboard` the browser merge. **Next slices:** feed the HTML `/dashboard` live from the spine, route to Slack/WhatsApp, and make the cockpit's queue actionable inline (approve *from* it, not just copy-paste).
- **Control + record-keeping already exist** — the sign-off checkpoints and the decision journal (`hitl.jsonl` / DRI logs) are in place. That's the floor; preserve it as everything else gets smarter.
- **Honest limit of today's executor:** the orchestrator's roles produce text (proposals, drafts, the markdown artifact). For planning work the markdown *is* the deliverable, so that's enough; for code/infra work (build/fix/ops) the actual change still happens in interactive Claude Code, which has real tools. Closing that gap — giving the roles real tools while keeping the gates mechanical — is #87.

## Roadmap shape (plain language)

1. **Tool-using roles** — give the roles the ability to read the real code and (later) make + verify changes, starting small with `/fix`. (#87, in progress.)
2. **Roles can delegate** — let a lead pull in the specialists it needs on demand.
3. **The cockpit** — one live, actionable, portfolio-wide view of what's moving + what needs me. *(Slice 1 shipped #104: event spine + user-local store + text cockpit. Next: HTML/Slack surfaces + inline approve.)*
4. **Fill the gaps** — add the SRE and Monitor roles so the lifecycle runs all the way to "watch it in production and feed problems back."
5. **The full loop, in parallel** — the whole portfolio running at once, the dependency map deciding order, the cockpit keeping me in control.

Sequencing principle: parallelize the safe, independent work first (planning/briefs — different files, no conflicts), keep parallel *building* isolated (each in its own work area, clean merges), and treat the human approval queue — not the machine — as the real constraint to design around.
