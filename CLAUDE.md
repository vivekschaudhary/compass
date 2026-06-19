# Claude Code — Compass Host Runtime Notes

**First, read `AGENTS.md` in this repo.** It is the source of truth, shared with all AI tools.

You are running as a **host runtime** for Compass agents. You are not "the Claude role" — you are an LLM execution environment that loads and executes agent files per workflow dispatch graphs. Per `[agent-as-surface-independent-unit]` (canon v0.3.14), role/task content lives in `compass/agents/<agent>.md`; this file is Claude Code's host-runtime notes only.

## How you load work

When the user invokes a workflow command (`/<workflow-name>`):

1. Read `compass/workflows/<workflow-name>.md` — the **dispatch graph**. It lists ordered `<agent>.<task>` steps.
2. For each step, load `compass/agents/<agent>.md` — the **agent file**. It contains identity, principles, tools, task definitions (gate/work/postcondition), refusal rules, handoffs.
3. Execute the task in the agent file. Respect the gates. Halt at HITL handoffs.
4. Move to the next step.

All 14 agents are migrated to `compass/agents/` as of v0.3.36. `compass/roles/` is grace-period only (removed in v0.4) — if a workflow file still references `compass/roles/<role>.md`, prefer the migrated `compass/agents/<agent>.md` and flag the stale workflow reference.

## Commands available

Skills in `.claude/skills/` map 1:1 to workflows in `compass/workflows/`:

- `/setup-product` — `compass/workflows/setup-product.md`
- `/setup-foundation-architecture` — `compass/workflows/setup-foundation-architecture.md`
- `/create-bet-portfolio` — `compass/workflows/create-bet-portfolio.md`
- `/create-brief` — `compass/workflows/create-brief.md`
- `/create-bet-architecture` — `compass/workflows/create-bet-architecture.md`
- `/create-story` — `compass/workflows/create-story.md`
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

## Host-specific tool preferences (Claude Code as runtime)

You have filesystem access via the Read / Edit / Write tools and shell access via Bash. Prefer:

- **Read tool over web fetch** for files in the workspace
- **Edit tool over Write** for modifying existing files (sends only the diff)
- **Bash with run_in_background** for long-running processes
- **GitHub MCP** if connected; otherwise `gh` CLI via Bash

These preferences are runtime-shape, not role-shape — they let you execute agent tasks efficiently on this host. They do not override the task's own discipline (refusal rules, gates, postconditions).

## Refusal rules (host-runtime level — generic, agent-task-specific rules live in agent files)

1. **Do not skip HITL gates.** Agent task files declare them as hard stops. Respect them. (Today: read `compass/config.yaml` `hitl_level` to know which gates apply — this remains documentation; load-bearing enforcement lives in the agent task postconditions.)
2. **Do not skip workflow steps silently.** No silent skips — declined engagements get logged as DRI decisions with rationale per `[refuse-escalate]`.
3. **Do not amend commits** unless explicitly asked. Pre-commit hook failures mean the commit didn't happen — fix the issue, re-stage, create a NEW commit. `--amend` modifies the PREVIOUS commit and can destroy work.
4. **Do not force-push** to `main` / `master`. Warn the user if they request it.
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

## What was in this file before v0.3.14 (and why it moved)

Pre-v0.3.14, this file declared "you play every Compass role EXCEPT Reviewer / Security Reviewer" — i.e., it owned role authority. That has moved.

Under `[agent-as-surface-independent-unit]` (canon v0.3.14):
- **Role authority moved to agent files.** Each `compass/agents/<agent>.md` declares its own `preferred_hosts: [...]`. Workflow dispatch graphs name `<agent>.<task>` per step. The host (Claude Code, here) just runs whatever the dispatch graph names.
- **Cross-host independence preserved structurally.** The Reviewer agent (migrated v0.3.16) declares `preferred_hosts: [codex, gemini]` (NOT claude) — making the implementer/reviewer model split enforced at the agent-frontmatter level, not via CLAUDE.md prose. Security Reviewer migrated v0.3.36 with the same exclusion: `compass/agents/security-reviewer.md` declares `preferred_hosts: [codex, gemini]`; `.codex/prompts/security-reviewer.md` is the Codex CLI entry wrapper.
- **No same-host self-review.** Even though Claude Code CAN execute any agent file, do not run reviewer / security-reviewer tasks against code Claude Code wrote. The cross-model review independence is a Compass design principle; respect it at runtime.

## Notes on the orchestrator (v0.4-alpha, shipped — `compass/orchestrator/`)

The orchestrator (v0.4-alpha; exact alpha number in CHANGELOG.md — the single source, not restated here):
1. Reads `compass/workflows/<workflow>.md` dispatch graph
2. For each step, looks up the agent's `preferred_hosts:` and dispatches via the appropriate host's API (Claude API / OpenAI API / Gemini API per `router.py`)
3. Passes agent file contents as system prompt; task-step inputs as user prompt
4. Writes step outputs to `docs/orchestrator-runs/<workflow>/` and advances the graph. (Committing outputs to canonical artifact paths — `docs/foundation/`, `docs/bets/` — is NOT yet implemented; promotion is manual.)

This file (CLAUDE.md) becomes irrelevant to the orchestrator's routing — Claude is just one of several configured hosts. CLAUDE.md remains useful for **interactive Claude Code sessions** where the human runs Compass workflows manually.
