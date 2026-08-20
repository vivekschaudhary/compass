# AGENTS.md

Read by every AI tool working in this repo. Where a tool-specific config disagrees with this file,
this file wins.

**What is being built: `compass/framework/mvp-brd.md`.** Read it first. It is the single description
of the product — the concept, the four delivery phases, the decisions already taken and what each
one beat, the requirements, and what is deliberately out of scope. Anything implying a different
target is stale.

**This file is only about building the codebase.** Repo layout, which engine runs, where truth
lives, the git and testing rules, and the mistakes this repo keeps repeating. `CLAUDE.md` is a
one-line pointer here, as `app/CLAUDE.md` already was.

It deliberately does NOT describe the product's runtime. Roles are rows in `compass/seed/roles.csv`;
the process is rows in `compass/seed/*.csv` imported into the database; the discipline an agent
carries is inlined in `compass/agents/<agent>.md`, which is what lets one be pasted into a host that
cannot see this repo. A fourth copy here would go stale, and that is the failure this repo keeps
having.

---

## The product, in short

An **ERP for software delivery**. The lifecycle — setup → pre-sprint-0 → sprint 0 → sprint N — is an
executable process rather than a document. The AI drafts the first version of every deliverable the
plan calls for; a named human reviews it and advances it. Status is **position in the flow**, and it
lives in the client's tracker, not here.

One consequence shapes almost every decision below: **the row is the instruction.** A row names who,
on what basis, producing what, after what, accepted by whom — a complete functional rule. The model
supplies craft, the org's reference material supplies house style, and process discipline is
structural rather than something an agent is told. So discipline belongs in rows and gates, not in
prose about roles.

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
