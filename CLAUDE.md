# Claude Code — Compass Host Runtime Notes

**First, read `AGENTS.md` in this repo.** It is the source of truth, shared with all AI tools.

**Building the product? Read `compass/framework/mvp-brd.md`.** It is the single description of what the MVP is — the concept, the four phases, the decisions already made and what each one beat, the requirements, and what is deliberately out of scope. If another document describes a different MVP, a different lifecycle or a different status flow, the BRD wins and that one is stale. `compass/framework/mvp.md` and `release-1.0.md` described earlier, superseded scopes and were removed for exactly that reason.

You are running as a **host runtime** for Compass agents. You are not "the Claude role" — you are an LLM execution environment that loads and executes agent files per workflow dispatch graphs. Per `[agent-as-surface-independent-unit]` (canon v0.3.14), role/task content lives in `compass/agents/<agent>.md`; this file is Claude Code's host-runtime notes only.

## Repo layout (monorepo)

This repo holds **both halves of Compass**:

- **repo root** — the **framework**: the Python orchestrator (`compass.orchestrator`), `compass/agents/`, `compass/workflows/`, templates, docs, `pyproject.toml`. This is what consumer projects vendor (the `compass/` dir). CI (`consistency-check`, `freshness-check`) scopes to `compass/`.
- **`app/`** — the **control-tower UI** (Next.js 16 / Supabase). Its own `package.json` / toolchain, run with `cd app && npm run dev`. It drives the framework by shelling into `python -m compass.orchestrator.run` and resolves the framework root *relative to its cwd* (`<repo>/app` → `<repo>`), overridable via `COMPASS_REPO` / `COMPASS_DIR`. See `app/README.md`.

A change spanning both halves is now one atomic commit. Framework edits still follow the GitHub-issue discipline below; app edits obey `app/AGENTS.md` (Next 16 breaking-change note).

## How you load work

When the user invokes a workflow command (`/<workflow-name>`):

1. Read `compass/workflows/<workflow-name>.md` — the **dispatch graph**. It lists ordered `<agent>.<task>` steps.
2. For each step, load `compass/agents/<agent>.md` — the **agent file**. It contains identity, principles, tools, task definitions (gate/work/postcondition), refusal rules, handoffs.
3. Execute the task in the agent file. Respect the gates. Halt at HITL handoffs.
4. Move to the next step.

All 17 agents live in `compass/agents/` (source of truth) — the 14 coded (migrated by v0.3.36) plus `gtm`, `sre`, and `product-owner`, declared new at v1.0 per `[declare-not-implement]` (authored, not yet wired into dispatch graphs; PO split from the merged PM). **`compass/roles/` was removed in v1.0 (#38)** — if any doc still references `compass/roles/<role>.md`, use the migrated `compass/agents/<agent>.md`.

## Commands available

Skills in `.claude/skills/` map 1:1 to workflows in `compass/workflows/`:

- `/create-product-brief` — `compass/workflows/create-product-brief.md`
- `/setup-foundation-architecture` — `compass/workflows/setup-foundation-architecture.md`
- `/create-epics` — `compass/workflows/create-epics.md`
- `/create-brief` — `compass/workflows/create-brief.md`
- `/create-epic-architecture` — `compass/workflows/create-epic-architecture.md`
- `/create-story` — `compass/workflows/create-story.md`
- `/tech-design` — `compass/workflows/tech-design.md`
- `/build` — `compass/workflows/build.md`
- `/fix` — `compass/workflows/fix.md`
- `/triage` — `compass/workflows/triage.md`
- `/ops` — `compass/workflows/ops.md`
- `/status` — `compass/workflows/status.md`
- `/plan` — `compass/workflows/plan.md`
- `/dashboard` — `compass/workflows/dashboard.md`
- `/metrics` — `compass/workflows/metrics.md`
- `/measure` — `compass/workflows/measure.md`
- `/scan` — `compass/workflows/scan.md`
- `/retro` — `compass/workflows/retro.md`
- `/advance` — `compass/workflows/advance.md` (DEPRECATED — prints the status-field migration table)

**`basecamp` and `groundwork` are NOT slash commands.** They are engagement phases, initiated by the
delivery manager in the app (`/v2/e/<engagement>/jobs`), and they have no skill in `.claude/skills/`
because nothing about them is a Claude Code invocation. They are dispatch graphs in the table format
and they run in v2. See "The engagement shape" below.

## Host-specific tool preferences (Claude Code as runtime)

You have filesystem access via the Read / Edit / Write tools and shell access via Bash. Prefer:

- **Read tool over web fetch** for files in the workspace
- **Edit tool over Write** for modifying existing files (sends only the diff)
- **Bash with run_in_background** for long-running processes
- **GitHub MCP** if connected; otherwise `gh` CLI via Bash

These preferences are runtime-shape, not role-shape — they let you execute agent tasks efficiently on this host. They do not override the task's own discipline (refusal rules, gates, postconditions).

## Capturing framework work — GitHub is the record (#42, supersedes #180)

All **framework** work (this repo only) is tracked in **GitHub**. There is no improvement log in the repo — the frozen `compass/workflows/improvements.md` was removed; CHANGELOG.md and the retros hold what it recorded:

- **The why / proposal** → a **GitHub issue** in `vivekschaudhary/compass` (`gh issue create`), labeled `bug`/`enhancement`/`codification`/`tech-debt`/`from-retro` and tagged to a **release milestone** (1.0, …).
- **The change** → a **PR that closes it** (`Closes #N`). The issue + PR are the record.
- **The shipped summary** → `CHANGELOG.md` + GitHub Releases.
- **Retros** read closed issues + merged PRs for the period.
- **Consumer apps** (home-app, …) track their work in **Jira + Confluence** (the projection Compass ships, #34), not GitHub issues.

So: framework → GitHub issues + PRs; consumer work → Jira/Conf.

## Refusal rules (host-runtime level — generic, agent-task-specific rules live in agent files)

1. **Do not skip HITL gates.** Agent task files declare them as hard stops. Respect them. (Today: read `compass/config.yaml` `hitl_level` to know which gates apply — this remains documentation; load-bearing enforcement lives in the agent task postconditions.)
2. **Do not skip workflow steps silently.** No silent skips — declined engagements get logged as DRI decisions with rationale per `[refuse-escalate]`.
3. **Do not amend commits** unless explicitly asked. Pre-commit hook failures mean the commit didn't happen — fix the issue, re-stage, create a NEW commit. `--amend` modifies the PREVIOUS commit and can destroy work.
4. **Do not force-push** to `main` / `master`. Warn the user if they request it.
   - **4a. Write-mode work lands on a branch, never `main` (#99/#126 — interactive-surface parity).** The orchestrator enforces this mechanically via `_ensure_work_branch`; interactive sessions must do it by hand. Before you edit files for a build/fix task on `main`/`master`, create + switch to a work branch (e.g. `git switch -c fix/<slug>` or `<epic-id>/<slug>`). Framework-doc edits to this repo's `main` (the Compass repo itself) are the standing exception the user has authorized; product/consumer code changes are not.
5. **Do not skip git hooks** (`--no-verify`, `--no-gpg-sign`) unless user explicitly requests. Fix root causes, don't bypass.
6. **Do not commit secrets** (`.env`, credentials.json, etc.).
7. **Do not run destructive git operations** (`reset --hard`, `push --force`, `clean -f`, `branch -D`) unless user explicitly requests.
8. **Pre-push grep on load-bearing amendments** (`[pre-push-grep-discipline]`, canon v0.3.38). Before committing an edit that changes a load-bearing fact — a rename, a count ("N of M"), a version string, a task-ownership move, a contract surface — run `python3 compass/scripts/pre-push-consistency-check.py "<old phrasing>"` and sweep every hit in the SAME commit (or justify it in a DRI Decision).
9. **Mechanical consistency check (the commit-time backstop, #93).** `compass/scripts/consistency-check.py` computes the drift classes the retro audits kept catching — dispatch-graph count, catalog pattern count, hardcoded orchestrator version self-claims — and needs no arguments. Enable it as a shared git hook once per clone: `git config core.hooksPath compass/scripts/githooks` (runs the check + the orchestrator tests on every commit). It also runs in CI (`.github/workflows/consistency-check.yml`). Where rule 8 needs you to name the amended term, rule 9 catches the computable drift on its own.
10. **Ship tests alongside new code paths** (`[test-alongside-implementation]`, canon v0.3.47). When you add a new orchestrator/script write path, parsing behavior, or capability, its tests land in the SAME commit (create + new behavior + edge/failure cases) — not a "tests later" PR. Run `python3 -m unittest discover -s compass/orchestrator/tests` before committing. Anti-pattern: `tests-later`.

Per-task refusal rules (don't review your own code, don't paraphrase UX Writer copy, don't improvise architecture, etc.) live in the agent files themselves — `compass/agents/<agent>.md` → Refusal rules section. Load those when executing the agent's tasks.

## Reading discipline at each phase load

When entering a workflow phase, in order:

1. `AGENTS.md` (once per session — sets the universal principles)
2. `compass/workflows/<workflow>.md` (the dispatch graph)
3. `compass/agents/<active-agent>.md` (the agent file — identity, principles, tasks, refusal rules, handoffs)
4. `PROJECT.md` (project-level overrides if present)
5. `docs/foundation/product.md` and `docs/foundation/architecture.md` (foundation context)
6. Artifacts from prior phases (brief, architecture, design, copy, etc.)
7. The bet's DRI log

Don't skip step 6. Missing prior context is the #1 cause of off-spec work.

## The app has two engines, and v2 is the one (2026-08-18)

`app/` contains **v1 and v2, and they are different execution engines** — not a UI reskin. This is
the single most confusing thing about the repo and the source of most of the drift below.

| | v1 (`app/app/lib/*.ts`, `app/api/*`) | v2 (`app/app/lib/data`, `app/lib/agent`, `app/v2/*`) |
|---|---|---|
| executes by | spawning `python -m compass.orchestrator.run` | calling the Anthropic SDK itself |
| step source | `compass/workflows/*.md` via `graph.py` | `workflow_step` rows imported from `compass/seed/*.csv` |
| spec resolution | `specs.ts` — engagement override → org default → `compass/` | **bypassed**: reads files off disk |
| host routing | `router.py` → `preferred_hosts` | **hardcoded** `new Anthropic()`, `MODEL = "claude-opus-5"` |

**DRI decision (2026-08-18): v2 is the engine.** v1 is being ported into it one workflow at a time.
v2 forking the spine was a defect, not a design — it was meant to be a new surface on v1's.

## Where truth lives, and what checks it

Five places describe the same workflows. Know which one executes:

- `compass/workflows/*.md` — the framework's dispatch graphs. **Two formats now**: the old
  `### Step N.` headings, and the newer **table** (`| # | task | dispatch | owner | reads | produces
  | depends-on |`) used by `basecamp.md` and `groundwork.md`. `graph.py` parses BOTH.
- `compass/seed/*.csv` — **what v2 imports and actually runs.** Carries `produces`, `reads`,
  criteria, `nests` and `title`, none of which the `### Step N.` format can express.
- the database — a *versioned* copy of the seed. Published versions match it row for row; older
  versions accumulate, so raw counts overstate.
- `.claude/skills/` — the slash commands.
- `compass/reference/workflow-catalog.csv` — derived from the .md, CI-checked.

**`compass/scripts/seed-consistency-check.py`** reconciles the seed against the graphs and fails on
NEW drift only; today's known gaps are recorded in `compass/seed/known-drift.txt`. Run it before
believing the .md files describe what runs.

## The engagement shape

1. **Intake** (`/v2/new` → `lib/data/onboard.ts`) provisions and **opens nothing**. It files the SOW
   and an optionally-supplied BRD/product brief, scaffolds the 22-node doc tree, and canonicalises
   the Confluence space and Jira project (`test` → `TEST`, and the space NAME → its key).
2. **The delivery manager initiates a phase.** Nothing self-starts: an engagement existing is not
   the same as an engagement being ready to start.
3. **A phase is rows.** `basecamp` (connect systems, staff) then `groundwork` (brief → epics →
   architecture → plan → status). Each row is satisfied by `agent: <role>.<task>`, a nested
   `workflow: <code>`, or nothing at all — and a phase mixes them freely.
4. **Gates are three-state everywhere**: satisfied / not satisfied / **not yet measurable**. Criteria
   are marked `check:` (machine) or `judgment:` (a person, recorded against their name). The app
   knows HOW to evaluate; `close_task` enforces that it WAS.
5. **`lib/data/tracker.ts` is the only seam that writes to Jira** — epic per phase, story per row,
   status vocabulary discovered from the board rather than assumed.

## What is missing (2026-08-19)

- **`preferred_hosts` is ignored in v2**, so review independence (#155) cannot hold — the reviewer
  cannot run on codex/gemini however the agent file is written. Biggest gap.
- **v2 bypasses `specs.ts`**, so per-engagement agent/workflow overrides silently do not apply.
- **Three workflows have no dispatch graph** — `create-epics`, `plan`, `status` — and they are
  groundwork rows 2, 4 and 5, so **groundwork cannot complete**.
- **A gate with no Done criteria closes green.** `close_task` builds its refusal with `string_agg`,
  which returns NULL over zero rows. Only basecamp and groundwork are fully gated.
- `security-reviewer` → `security-ops` rename; `product-owner` and `security-engineer` have agent
  files but no role row, so they cannot be dispatched.
- Ad-hoc epics (`work_task.origin` already distinguishes `defined` from `adhoc`).
- Nested rows have never been exercised through the UI, only in scripts.

## Lessons this repo keeps re-teaching

Every one of these shipped green and was caught by probing behaviour rather than reading output:

- **A migration reported "Finished" and changed nothing** — `if not exists (conname = ...)` found a
  same-named constraint from an older migration and skipped. A named constraint that must CHANGE
  gets dropped and recreated; migrations now assert their own effect.
- **A checker carried the literal it was policing** — `consistency-check.py` hardcoded "N of 18
  workflows", so adding a workflow made the checker the stale claim. Compute both numbers.
- **A diff that omits a field reports "unchanged"** — the importer's step key lacked `nests` and
  `title`, so a row could change which workflow it nested and the import called it identical.
- **Identical `created_at` is not an ordering.** A phase writes its rows in one transaction.
- **A rename is a writing job.** Blind substitution produced "The epics is published", and a
  slash-anchored pattern never saw `Path("docs") / "bets"`.
- **Fixing the caller and not the callee** leaves the bug alive: `open_phase_run` got a fallback its
  own first task never used, because that task comes from `open_workflow_run`.

## What was in this file before v0.3.14 (and why it moved)

Pre-v0.3.14, this file declared "you play every Compass role EXCEPT Reviewer / Security Reviewer" — i.e., it owned role authority. That has moved.

Under `[agent-as-surface-independent-unit]` (canon v0.3.14):
- **Role authority moved to agent files.** Each `compass/agents/<agent>.md` declares its own `preferred_hosts: [...]`. Workflow dispatch graphs name `<agent>.<task>` per step. The host (Claude Code, here) just runs whatever the dispatch graph names.
- **Review independence is structural, not host-based (#155).** Reviewer and Security Reviewer declare `preferred_hosts: [claude, codex, gemini]` — any host, configurable per engagement. Review independence is **maker ≠ checker, on a fresh context**: the reviewer is a separate agent, dispatched with **no implementation history** (the orchestrator withholds prior step outputs from review steps), seeing only the diff and the specs, and its BLOCKERs gate the merge. The **model** is a free choice — the cross-model requirement was dropped in #155 because research did not support it. So running the reviewer on Claude against Claude-written code is fine; **folding review into the implementing step, or having the implementer grade its own work, is not**.

## Notes on the orchestrator (shipped — `compass/orchestrator/`)

The orchestrator (framework version 1.0.0-rc.1 — `framework_version` in `compass/config.yaml` is the single source, #38; CHANGELOG.md is the change log):
1. Reads `compass/workflows/<workflow>.md` dispatch graph
2. For each step, looks up the agent's `preferred_hosts:` and dispatches via the appropriate host's API (Claude API / OpenAI API / Gemini API per `router.py`)
3. Passes agent file contents as system prompt; task-step inputs as user prompt
4. Writes step outputs to `docs/orchestrator-runs/<workflow>/` and advances the graph. (Committing outputs to canonical artifact paths — `docs/foundation/`, `docs/epics/` — is NOT yet implemented; promotion is manual.)

This file (CLAUDE.md) becomes irrelevant to the orchestrator's routing — Claude is just one of several configured hosts. CLAUDE.md remains useful for **interactive Claude Code sessions** where the human runs Compass workflows manually.
