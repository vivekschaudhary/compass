---
name: tech-design
status: active
owner: architect
auto_invokes: []
invoked_by: [manual]
version: 0.3.1
requires_approved: []
---

# Workflow: /tech-design

## Framework grounding

- **Compass-originals operationalized:** [agent-as-surface-independent-unit] (v0.3.14) · [workflow-as-dispatch-graph] (v0.3.24) · [functional-story] (#127) · [architecture-grounded-in-code] (#127/#130) · [cite-or-mark-na]
- **Verifies adherence to:** Principle #14 · Principle #16 · the functional-story → tech-design → build split (the *what* is PM-authored; the *how* is authored here, grounded in code, before build)

## Purpose

Author **one Ready story's technical design** — the *how* for a single functional slice — and mark it **Tech-ready** before build. A story arrives **purely functional** (the *what*, PM-authored, no code access); the **Architect reads the actual code** (`executor_tools`, #130) and authors its `## Technical approach` (data model, API/contract, file/module touch-list, test strategy), bounded by the bet architecture. This is **not** a new architecture tier and **not** a review — foundational arch + bet arch are the architecture; this is the slice's **technical solution**, *authored* (nothing prior to review). The output is written back onto the Story ticket and the story is labelled `tech-ready`; `/build` (Phase 1d) refuses a story that isn't both Ready and Tech-ready.

## Architectural shape

Thin dispatch graph per `[workflow-as-dispatch-graph]` (canon v0.3.24) — story-scoped (one Story per run, like `/build`). Methodology lives in `compass/agents/architect.md` → Task `design-story-tech`. The write-back onto the ticket + the `tech-ready` mark is **orchestrator** machinery (not an agent step), so the tracking can't be skipped (#89).

## Preconditions (workflow-level GATE)

- **Trigger present** — `/tech-design <STORY-KEY>` (a Jira Story key).
- **Story is functionally Ready** — it carries the `ready` mark (AC present; design linked if UI). The orchestrator refuses loud otherwise (*"Not Ready — complete the AC/design (`/create-story`) first"*), plus refuses a missing/unreadable/Done key or absent Jira creds. No `requires_approved` repo gate — in `source_of_truth: external` the story lives in Jira, not the tree.
- **Foundation + bet architecture loaded** — `docs/foundation/architecture.md` Stack table (+ the bet's `architecture.md` if any) so the technical design stays inside the approved architecture and any stack deviation is caught.

## Roles invoked (agents dispatched)

- `compass/agents/architect.md` — Task `design-story-tech` (reads the Story + the real code → authors `## Technical approach`, cited to files; foundational-stack deviation gate holds).

## Dispatch graph

### Step 1. `architect.design-story-tech` (Architect agent owns)

**Dispatches:** Architect agent (tool-capable host — it reads the real code via `read_file`/`glob`/`grep`, #130)
**Task definition:** `compass/agents/architect.md` → Task `design-story-tech`
**Input:** the Jira Story (functional AC/description) · the project source (read-only) · foundation Stack table · the bet's `architecture.md` if any
**What it covers:** read the story + the **actual code** → foundational-stack deviation gate (STOP + escalate to `/setup-foundation-architecture` if the slice needs an un-listed tool) → author a `## Technical approach` section (data model / migrations · API / contract · **file/module touch-list of real paths** · how it fits existing patterns · test strategy), **every claim cited to a file read** (`[cite-or-mark-na]`), bounded by the bet architecture. Design only — does NOT write code or build.
**Output:** the `## Technical approach` section for this story.

### Run-level write-back (orchestrator, not an agent)

On completion the **orchestrator** — not the agent — extracts the authored `## Technical approach`, splices it onto the Jira Story's description (replacing the `_Pending technical design._` placeholder), and marks the story **`tech-ready`** (additive label — the `ready` mark is preserved). If no approach was produced, the story is left **un-Tech-ready** (never a false Tech-ready). The interactive/manual write-back surface is `--apply-tech-design <STORY-KEY> --from <file>`.

## Workflow-level verification (final GATE)

- [ ] (Step 1) The story was **functionally Ready** at entry (refused otherwise) · the technical design was authored **from the actual code** (touch-list names real paths; claims cited) · no undeclared foundational-stack deviation
- [ ] (Run completion) `## Technical approach` **written back onto the Story ticket** (placeholder replaced) and the story **marked `tech-ready`** — OR left un-Tech-ready with a stated reason (no approach produced). The `ready` mark is preserved.
- [ ] **The Architect did not write code or build** — this step designs the *how*; `/build` implements it.

## Output summary contract

**TL;DR** (story · what the technical approach decides · Tech-ready yes/no) · **Ticket updated** (key + URL) · **Next recommended command** (`/build <STORY-KEY>`) · **Open questions/risks** if applicable.

## Notes

**Producer, not gate-consumer.** This workflow *produces* Tech-ready; `/build` (Phase 1d) *consumes* it (refuses a story that isn't both Ready and Tech-ready), generalizing the #171 design/copy readiness gate into the ready-to-build gate read from the ticket.

**Idempotent.** Re-running `/tech-design <STORY-KEY>` re-authors and re-writes the `## Technical approach` (the section is replaced, not appended twice) and re-affirms `tech-ready`.
