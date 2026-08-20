# AGENTS.md

Read by every AI tool working in this repo. Where a tool-specific config disagrees with this file,
this file wins.

**What is being built: `compass/framework/mvp-brd.md`.** Read it first. It is the single description
of the product — the concept, the four delivery phases, the decisions already taken and what each
one beat, the requirements, and what is deliberately out of scope. Anything implying a different
target is stale.

This file holds the principles that apply whatever you are working on. `CLAUDE.md` holds what is
specific to Claude Code as a runtime.

---

## The product, in short

An **ERP for software delivery**. The lifecycle — setup → pre-sprint-0 → sprint 0 → sprint N — is an
executable process rather than a document. The AI drafts the first version of every deliverable the
plan calls for; a named human reviews it and advances it. Status is **position in the flow**, and it
lives in the client's tracker, not here.

A consequence worth internalising before writing anything: **the row is the instruction.** A row
names who, on what basis, producing what, after what, accepted by whom — that is a complete
functional rule. The model supplies the craft, the org's reference material supplies house style,
and the process discipline is structural rather than something an agent must be told.

---

## Layout

Both halves live here; a change spanning them is one commit.

- **repo root** — the framework a consumer vendors: `compass/agents/`, `compass/workflows/`,
  `compass/seed/`, `compass/templates/`, `compass/scripts/`, and the Python orchestrator (v1).
- **`app/`** — the control tower (Next.js 16 / Supabase). Its own toolchain; see `app/AGENTS.md`,
  which carries a Next 16 breaking-change warning worth heeding.

**v2 (in `app/`) is the engine.** v1's orchestrator is being ported into it. Where they disagree,
v2 is what runs.

---

## Roles

Seventeen agent files in `compass/agents/`. Each is self-sufficient and surface-independent —
identity, principles, tools, task definitions, refusal rules — so pasting one into any host's
system-prompt slot works. **Read the file; do not pattern-match from the name.**

Two things to know before assuming a role can be used:

- **`product-owner` and `security-reviewer` have agent files but no row in `compass/seed/roles.csv`,
  so nothing can dispatch them.**
- `org-admin` and `engagement-admin` are role rows with no agent file — administrative, not delivery.

`preferred_hosts:` in each agent's frontmatter declares which runtimes suit it. **v2 ignores this
today** — it calls one model directly. Treat host choice as a per-org setting that is not yet wired,
not as per-step routing.

### Supported hosts

The runtimes v1's `router.py` can dispatch to. A new host lands in code and here in the same
commit — `consistency-check.py` enforces it.

| host | invocation |
| ---- | ---------- |
| `claude` | Claude Code — CLI / IDE, reads local files, auto-loads `CLAUDE.md` |
| `claude-code` | Claude CLI on a logged-in subscription — no API key, flat marginal cost |
| `codex` | Codex CLI — reads `.codex/prompts/<agent>.md` |
| `codex-cli` | Codex CLI on a logged-in subscription — no API key |
| `chatgpt` | see router.py |
| `openai` | GPT API, or a Custom GPT with the agent file pasted as Instructions |
| `gemini` | Gemini CLI — reads `.gemini/prompts/<agent>.md` |

v2 dispatches to none of these — it calls one model directly. Wiring `preferred_hosts`
into v2 is listed in the BRD's §8 as out of scope for the MVP.

**Review independence is fresh context, not a different model.** The reviewer is a separate agent
dispatched with no implementation history — it sees the diff and the specs, not the implementer's
account of its own work. Running a reviewer on the same model as the author is fine. Folding review
into the implementing step, or having an implementer grade its own work, is not.

---

## Workflows

**21 workflow files exist, 12 of 21 workflows are in dispatch-graph shape, and 12 are seeded.** Only the seeded ones can run — the app executes
`workflow_step` rows imported from `compass/seed/*.csv`, not the markdown. A file describing a
workflow is not evidence the workflow works.

Run `python3 compass/scripts/seed-consistency-check.py` before believing otherwise. It fails on NEW
drift only; today's known gaps are baselined in `compass/seed/known-drift.txt`, and when it reports
an entry RESOLVED, delete that line.

The BRD describes four phases. The seed has two — `basecamp` and `groundwork`. Re-authoring them is
the first requirement in the BRD's §7.

---

## Cross-cutting principles

Numbering is stable — #14, #15 and #16 are cited by name across the agent files.

1. **Every artifact has a status field.** It drives the lifecycle and the gates.
2. **Traceability end to end.** Every output links back to the basis it derived from. A deliverable
   you cannot answer *"on what basis?"* for is not finished.
3. **No silent skips.** A declined or skipped step is logged with its rationale.
4. **DRI logging at every stage.** Decisions, risks and issues carry rationale, owner and severity.
5. **Configuration is data.** Team decisions live in `compass/config.yaml`, not in prose.
6. **Framework changes are explicit and versioned.**
7. **Discipline holds under pressure.** No reduced review during an incident or P0.
8. **HITL approval at every milestone.** The level is configurable; the gate is not optional.
9. **No silent writes.** When work writes files beyond the artifact it was asked for, list them
   first, wait for confirmation, and summarise what was written. Drafting the named artifact is
   expected; everything else is a side effect that needs consent.
10. **The maker is not the checker.** An agent drafts; a *different* named human or agent accepts.
    Both may run on the same model — independence is fresh context, not a different vendor.
11. **Reviewer findings are real.** Disputes go to a human, and are not auto-resolved by either side.
12. **Structured, scannable output.** TL;DR at the top · what was done · what is next, as one clear
    instruction · open questions only if there are any. Tables for lists, bullets for steps, code
    blocks for commands. A reader should know what to do in ten seconds.
13. **Findings, not failures.** Quality signals carry severity, confidence, location, reason and fix.
    Owners decide; the scanner informs.
14. **Soft spec → AI rationalization is a vulnerability surface, not flexibility.** Anywhere an agent
    has interpretive room, it will exercise judgment that diverges from intent under load.
    Constraints written as "implied", "obvious", "ensure", "consider" get rationalised away. The fix
    has three parts: **explicit imperative** with the failure spelled out concretely · a **mechanical
    verification gate** that blocks and cannot be hand-waved · a **named anti-pattern**, so the next
    reader inherits the vocabulary. This is the principle the others instantiate.
15. **N-category cite-or-mark-n/a.** When a deliverable depends on consulting N named kinds of
    evidence, each produces a citation or an explicit `n/a — <reason>`. An empty cell is not an
    answer.
16. **Refuse and escalate to the upstream artifact.** When work would silently widen a decision an
    earlier artifact owns — the stack, the data model, the scope — refuse and hand it back to
    whoever owns that decision. Never widen in place.
17. **Sweep on contract shift.** A change to a load-bearing fact — a contract surface, a count, a
    version string, a citation — sweeps every artifact that stated it, in the same commit. Includes
    intra-file drift: a prose summary contradicting the structured body of the same file.
18. **Minimise friction.** Do not increase the decisions, prompts or actions required of a person
    beyond what the task genuinely demands. Friction is a first-class failure mode.
19. **Consumer friction is the primary signal.** Improvements originate from real project friction —
    production failures, migration pain, review-loop waste, abandonment — not from reasoning about
    the framework in the abstract.
20. **Done is a demonstrated outcome, not activity.** Every work item declares an observable
    acceptance criterion up front — *Done when: &lt;observable&gt;* — and is done only when that is
    demonstrated.

---

## HITL levels

Set in `compass/config.yaml` under `hitl_level`:

- `every_phase` — approve at every handoff (heaviest)
- `milestones` — approve at major milestones (default)
- `merge_only` — approve only at merge (lightest)

---

## When you are unsure

| question | answer |
| -------- | ------ |
| What am I building? | `compass/framework/mvp-brd.md` |
| What agent am I playing? | the active phase's row names the role; load `compass/agents/<role>.md` in full |
| What should I produce? | the row's `produces`, and the agent's `Tasks I own` |
| On what basis? | the row's `reads`, pinned to the versions live when the task started |
| Do I need approval? | the row names who accepts it. If nobody does, that is a gap in the row |
| Does this workflow actually run? | `compass/seed/workflows.csv`. Twelve do; the markdown files overstate |
| Did past decisions settle this? | the BRD's §6, then the artifact's DRI log |
| The user corrected me | accept it. They have context you do not — course-correct and carry on |
