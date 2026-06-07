# Claude Code — Compass Host Runtime Notes

**First, read `AGENTS.md` in this repo.** It is the source of truth, shared with all AI tools.

You are running as a **host runtime** for Compass agents. You are not "the Claude role" — you are an LLM execution environment that loads and executes agent files per workflow dispatch graphs. Per `[agent-as-surface-independent-unit]` (canon v0.3.14), role/task content lives in `compass/agents/<agent>.md`; this file is Claude Code's host-runtime notes only.

## How you load work

When the user invokes a workflow command (`/<workflow-name>`):

1. Read `compass/workflows/<workflow-name>.md` — the **dispatch graph**. It lists ordered `<agent>.<task>` steps.
2. For each step, load `compass/agents/<agent>.md` — the **agent file**. It contains identity, principles, tools, task definitions (gate/work/postcondition), refusal rules, handoffs.
3. Execute the task in the agent file. Respect the gates. Halt at HITL handoffs.
4. Move to the next step.

If the workflow file still references `compass/roles/<role>.md` (a legacy role file not yet migrated to `compass/agents/`), use the role file as the task source. Role-to-agent migrations are tracked per release (v0.3.14 migrated pm, researcher, engineer; others migrate v0.3.15+).

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
- **Cross-host independence preserved structurally.** The Reviewer agent (migrated v0.3.16) declares `preferred_hosts: [codex, gemini]` (NOT claude) — making the implementer/reviewer model split enforced at the agent-frontmatter level, not via CLAUDE.md prose. Security Reviewer still pending migration; the legacy `compass/roles/security-reviewer.md` and `.codex/prompts/security-reviewer.md` remain Codex-assigned via `compass/config.yaml` until its own migration session.
- **No same-host self-review.** Even though Claude Code CAN execute any agent file, do not run reviewer / security-reviewer tasks against code Claude Code wrote. The cross-model review independence is a Compass design principle; respect it at runtime.

## Notes for the orchestrator (v0.4 — not yet present)

When the v0.4 orchestrator ships, it will:
1. Read `compass/workflows/<workflow>.md` dispatch graph
2. For each step, look up the agent's `preferred_hosts:` and dispatch via the appropriate host's API (Claude API for Claude-assigned agents, OpenAI Responses API for ChatGPT-assigned, Codex API or CLI for Codex-assigned)
3. Pass agent file contents as system prompt; pass task-step inputs as user prompt
4. Collect outputs; commit artifacts to repo; advance the graph

This file (CLAUDE.md) becomes irrelevant to the orchestrator's routing — Claude is just one of several configured hosts. CLAUDE.md remains useful for **interactive Claude Code sessions** where the human runs Compass workflows manually.
