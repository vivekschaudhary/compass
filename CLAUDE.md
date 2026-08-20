# Claude Code — working in this repo

**What is being built: `compass/framework/mvp-brd.md`.** Read it before touching anything. It is the
single description of the product — the concept, the four delivery phases, the decisions already
made and what each one beat, the requirements, and what is deliberately out of scope. If anything
else in this repo implies a different target, it is stale and the BRD wins.

This file is the other half: **how to build it here.**

`AGENTS.md` is shared with every AI tool and holds the cross-cutting principles. This file holds
what is specific to Claude Code as a runtime.

---

## What the product is, in three sentences

An ERP for software delivery. The lifecycle — setup → pre-sprint-0 → sprint 0 → sprint N — is an
executable process; the AI drafts the first version of every deliverable the plan calls for; a named
human reviews it on a screen and advances it. Status is **position in the flow**, not a report, and
it lives in the client's tracker rather than here.

The BRD carries the rest. Do not re-derive it.

---

## Repo layout

Both halves of Compass live here, and a change spanning them is one commit.

- **repo root** — the framework: `compass/agents/`, `compass/workflows/`, `compass/seed/`,
  `compass/templates/`, `compass/scripts/`, and the Python orchestrator. This is what a consumer
  project vendors.
- **`app/`** — the control-tower UI (Next.js 16 / Supabase), its own toolchain,
  `cd app && npm run dev`. Obeys `app/AGENTS.md`, which has a Next 16 breaking-change warning worth
  heeding. See `app/README.md`.

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

## Host-specific tool preferences

- **Read over web fetch** for files in the workspace
- **Edit over Write** for existing files — sends only the diff
- **Bash with `run_in_background`** for long-running processes
- **`gh` CLI** for GitHub

These are runtime shape. They do not override a task's own discipline.

---

## Capturing work

**Framework work is tracked in GitHub.** There is no improvement log in the repo.

- the why → a GitHub issue in `vivekschaudhary/compass`, labelled and milestoned
- the change → a PR that closes it (`Closes #N`)
- the shipped summary → `CHANGELOG.md` + Releases

Consumer projects track their work in Jira and Confluence, not GitHub issues.

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

1. `AGENTS.md` — once per session
2. **`compass/framework/mvp-brd.md`** — what is being built
3. the code you are changing, and its tests
4. `PROJECT.md` if present

Skipping (2) is how a session ends up building something the BRD already decided against.

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
