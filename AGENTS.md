# AGENTS.md

Read by every AI tool working in this repo. Where a tool-specific config disagrees with this file,
this file wins.

**What is being built: `compass/framework/mvp-brd.md`.** Read it first. It is the single description
of the product — the concept, the four delivery phases, the decisions already taken and what each
one beat, the requirements, and what is deliberately out of scope. Anything implying a different
target is stale.

This is the only file of its kind — `CLAUDE.md` is a one-line pointer here, as `app/CLAUDE.md`
already was. Everything a tool needs to work in this repo is below: the product, the roles, what
actually runs, the principles, the refusal rules, and the mistakes this repo keeps repeating.

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

## The app has two engines, and v2 is the one

The single most confusing thing in the repo, and the source of most drift.

| | v1 (`compass/orchestrator/`, `app/app/lib/*.ts`, `app/api/*`) | v2 (`app/app/lib/data`, `app/app/lib/agent`, `app/app/v2/*`) |
|---|---|---|
| executes by | spawning `python -m compass.orchestrator.run` | calling the model SDK itself |
| step source | `compass/workflows/*.md` via `graph.py` | `workflow_step` rows imported from `compass/seed/*.csv` |
| spec resolution | `specs.ts` — engagement override → org default | **bypassed**: reads files off disk |
| host routing | `router.py` → `preferred_hosts` | **hardcoded** `new Anthropic()`, one model |

**v2 is the engine.** v1 is being ported into it one workflow at a time. v2 forking the spine was a
defect, not a design.

---

## Where truth lives, and what checks it

Several places describe the same workflows. Know which one executes:

- **`compass/seed/*.csv`** — what v2 imports and actually runs. Carries `produces`, `reads`,
  criteria and `title`.
- **the database** — a *versioned* copy of the seed. Published versions match it row for row; older
  versions accumulate, so raw counts overstate.
- `compass/workflows/*.md` — the dispatch graphs. Two formats: the old `### Step N.` headings and
  the newer table used by `basecamp.md` and `groundwork.md`. `graph.py` parses both.
- `.claude/skills/` — slash commands, most of which map to workflows the app cannot run.
- `compass/reference/workflow-catalog.csv` — derived from the .md, CI-checked.

**Run `python3 compass/scripts/seed-consistency-check.py` before believing the .md files describe
what runs.** It fails on NEW drift only; today's known gaps are baselined in
`compass/seed/known-drift.txt`. When it reports an entry RESOLVED, delete that line.

---

## The engagement, as the app runs it today

Note the gap: the BRD describes four phases; the seed still has two. Re-authoring them is R1.

1. **Intake** (`/v2/new` → `lib/data/onboard.ts`) provisions and **opens nothing**. It files the SOW
   and any supplied brief, scaffolds the 22-node doc tree, and canonicalises the Confluence space
   and Jira project.
2. **The delivery manager initiates a phase.** Nothing self-starts — an engagement existing is not
   the same as an engagement being ready to start.
3. **A phase is rows.** Each becomes a task and a ticket.
4. **Gates are three-state**: satisfied / not satisfied / **not yet measurable**. The app knows HOW
   to evaluate a criterion; `close_task` enforces that it WAS.
5. **`lib/data/tracker.ts` is the only seam that writes to the tracker** — epic per phase, story per
   row, status vocabulary discovered from the board rather than assumed.
6. **A close goes to the board first.** `approve` moves the ticket and closes the task only if that
   took. "Nothing to move" (no ticket, no tracker) proceeds; a real board saying no blocks.

---

## Runtime notes

Shape, not discipline — these make a tool efficient here and never override a task's own rules.

- **Read over web fetch** for files in the workspace
- **Edit over Write** for existing files — sends only the diff
- **background execution** for long-running processes
- **`gh` CLI** for GitHub

---

## Capturing work

**Framework work is tracked in GitHub.** There is no improvement log in the repo.

- the why → a GitHub issue in `vivekschaudhary/compass`, labelled and milestoned
- the change → a PR that closes it (`Closes #N`)
- the shipped summary → `CHANGELOG.md` + Releases

Consumer projects track their work in Jira and Confluence, not GitHub issues.

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

## Refusal rules

Generic to this runtime. Task-specific rules live in the agent files.

1. **Do not skip HITL gates.** They are hard stops.
2. **Do not skip steps silently.** A declined step is logged with its rationale.
3. **Do not amend commits** unless asked. A pre-commit failure means the commit did not happen — fix,
   re-stage, make a NEW commit. `--amend` rewrites the previous one and can destroy work.
4. **Do not force-push to `main`.** Warn if asked.
   - **4a.** Write-mode work on product code lands on a branch. Framework-doc edits to this repo's
     `main` are the standing exception the user has authorised; product code changes are not.
5. **Do not skip git hooks** (`--no-verify`, `--no-gpg-sign`) unless explicitly asked.
6. **Do not commit secrets.**
7. **Do not run destructive git** (`reset --hard`, `push --force`, `clean -f`, `branch -D`) unless
   explicitly asked.
8. **Grep before committing a load-bearing amendment.** A rename, a count, a version string, a
   contract surface: run `python3 compass/scripts/pre-push-consistency-check.py "<old phrasing>"`
   and sweep every hit in the SAME commit.
9. **The mechanical backstop.** `compass/scripts/consistency-check.py` computes the drift classes
   that keep recurring. Enable the shared hook once per clone:
   `git config core.hooksPath compass/scripts/githooks`.
10. **Ship tests alongside new code paths.** A new write path, parsing behaviour or capability lands
    its tests in the same commit — creation, the new behaviour, and the edge and failure cases. Run
    `python3 -m unittest discover -s compass/orchestrator/tests` and `npm --prefix app test` before
    committing.
11. **Fail loud, not silent.** Default a failure's direction toward a loud halt. A swallowed failure
    — a silent pass, a NULL that reads as "nothing wrong", a default standing in for a missing
    answer — is worse than a crash because it is indistinguishable from success. Aggregates over
    zero rows are the classic case: the guard finds no blockers and the gate passes because there
    was nothing to check.
12. **Inspect the output, not the exit code.** A process can succeed and produce the wrong thing.
13. **A data surface gets a test through the real vertical** on a prod-like build — authenticate as
    a real user, hit the authorization-enforced query, assert on what comes back. A unit test over a
    mocked client cannot see an authorization rule that is wrong.
14. **Reproduce before diagnosing.** An explanation built on a story about the failure, rather than
    on the failure itself, fixes the story.

---

## Before you write

1. **`compass/framework/mvp-brd.md`** — what is being built
2. the code you are changing, and its tests
3. `PROJECT.md` if present

Skipping (1) is how a session ends up building something the BRD already decided against.

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

---

## Lessons this repo keeps re-teaching

Every one shipped green and was caught by probing behaviour, not by reading output.

- **A migration reported "Finished" and changed nothing** — `if not exists (conname = ...)` found a
  same-named constraint from an older migration and skipped. A named constraint that must CHANGE is
  dropped and recreated; migrations assert their own effect.
- **A checker carried the literal it was policing** — `consistency-check.py` hardcoded "N of 18
  workflows", so adding a workflow made the checker the stale claim. Compute both numbers.
- **A diff that omits a field reports "unchanged"** — the importer's step key lacked `nests` and
  `title`, so a row could change what it nested and the import called it identical.
- **Identical `created_at` is not an ordering.** A phase writes every row in one transaction.
- **A rename is a writing job.** Blind substitution produced "The epics is published", and a
  slash-anchored pattern never saw `Path("docs") / "bets"`.
- **Fixing the caller and not the callee** leaves the bug alive: `open_phase_run` got a fallback its
  own first task never used, because that task comes from `open_workflow_run`.
- **A test can outlive the behaviour it tests.** Removing a check left a test asserting the removed
  behaviour; it failed for the right reason and had to be rewritten, not deleted quietly.
- **Deleting a document is not a documentation change.** Removing `improvements.md` touched two
  scripts' lists, a test, four docstrings and two templates. Grep for the path, not just the prose.
