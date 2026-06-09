> **Status:** Early alpha. Used by the author on real projects. Orchestrator v0.4-alpha-2 ships — clone + set `ANTHROPIC_API_KEY` + run `compass run setup-product`. Feedback welcome via Discussions; no support promises.

# Compass

> Product development with direction.

A vendor-neutral product development framework. Compass holds the shape of work from problem → ship → measure → learn, with AI tools playing roles across the lifecycle.

## What Compass is

A markdown-based framework that any AI tool can read. The framework lives in `compass/`. **Agents are self-sufficient, surface-independent units** (`compass/agents/<agent>.md`) — the same agent file runs on ChatGPT Custom GPT Instructions, Claude Code session, Codex prompt, Gemini system message, or as a CrewAI / LangGraph agent definition. **Host wrappers** (`CLAUDE.md`, future host analogs) are thin runtime-notes, not role authorities. Per `[agent-as-surface-independent-unit]` (canon v0.3.14).

## Core ideas

- **Every initiative is a bet.** Foundation product, OKRs, features, architectural initiatives — all measurable bets with a hypothesis, key metric, and an outcome: **won / learning / inconclusive**.
- **Bets contain stories.** Stories contain implementation, tests, fixes, ops.
- **Agents own tasks; workflows sequence agents.** 14 agent files in `compass/agents/` (**11 of 14 migrated**: pm · researcher · engineer · delivery-manager · reviewer · architect · designer · ux-writer · support · scanner · automation. Remaining 3 deferred: enterprise-architect · security-reviewer · tech-writer). Each agent file is self-sufficient: identity + inlined principles + tools required + task definitions (gate/work/postcondition) + refusal rules + handoffs. Workflow files in `compass/workflows/` are **thin dispatch graphs** that sequence `<agent>.<task>` references — they don't embed methodology; methodology lives in the agent task definitions.
- **Surface-independent by design.** Each agent declares `preferred_hosts: [...]` in its own frontmatter. Paste any agent file into the host's system-prompt slot → it works on ChatGPT, Claude, Codex, or Gemini. **The orchestrator (v0.4-alpha-2) walks dispatch graphs and dispatches each step to its preferred host automatically** — Engineer → Claude API, Reviewer → OpenAI API (Codex), preserving cross-model independence structurally. Run manually with `python3 -m compass.orchestrator.run <workflow>` or use any host interactively. Per `[agent-as-surface-independent-unit]` (canon v0.3.14). *Legacy:* `compass/config.yaml.tool_assignments:` deprecated in v0.3.14; per-agent `preferred_hosts:` is the source-of-truth.
- **Discipline holds always.** Full review on every PR, no shortcuts under pressure.
- **Decisions, Risks, Issues** logged at every stage (DRI logs).
- **Retros are fractal** (`[fractal-retro]`, canon v0.3.17). Same `/retro` workflow shape applied at every altitude — role · workflow · bet · project · org · framework — with bottom-up consolidation. Patterns visible at the role/workflow level (e.g., recurring PR-redo loops) bubble up to project retros, then to org retros, then promote to canon. Agents log patterns mid-task to `docs/role-activity/<role>.md` + `docs/workflow-runs/<workflow>.md` so leaf-altitude retros have source data.
- **Compass scans your product like Snyk scans your code.** A continuous quality scanner runs across six SDLC phases — Product, Architecture, Build, Production Ready, GTM, Operate — and produces *findings, not failures*. Each finding has severity (Critical / High / Medium / Low) + confidence + location + reason + fix. Measurement is automatic (no manual self-assessment). Suppressions are explicit, justified, logged in DRI. Owners decide; the scanner informs.

## The flow

17 workflows, grouped by **when you reach for them**. Several Observe workflows are auto-invoked by others — marked `[auto]` and rarely called by hand.

### 1. Bootstrap — once per project

Sequenced. Run in order on a new repo.

```
/setup-product                  → Foundation product bet (PM + Researcher)
/setup-foundation-architecture  → Foundation architecture bet + data model (Enterprise Architect)
/create-bet-portfolio           → MVP wedge: 3-6 stub briefs + dependency graph (PM + Researcher)
```

### 2. Plan — per bet

Define what a bet is, design it, decompose into shippable slices.

```
/create-brief                   → New bet — fresh OR promote portfolio stub (PM + Researcher)
/create-bet-architecture        → Bet-level technical strategy (Architect + Enterprise Arch)
/create-story                   → One shippable slice under the bet (PM, +Designer/UX Writer if UI)
```

### 3. Execute — per story / event

Do the work. Build for stories; the others for the reactive cases.

```
/build <story>                  → Engineer implements + Codex reviews + Architect compliance
/fix <ticket>                   → Bug flow (Support → Engineer → Codex)
/triage <alert>                 → Incident response (Engineer + Support + PO awareness)
/ops <change>                   → Infra / config / non-code changes (Enterprise Arch + Codex)
```

### 4. Observe — rolling visibility

You invoke `/status`, `/scan`, `/metrics` on demand. `/plan`, `/dashboard`, `/measure` typically run themselves.

```
/status                         → Delivery Manager's rolling status
/scan <bet>                     → Snyk-style continuous quality scanner — 6 SDLC phases
/metrics                        → Outcomes (won/learning/inconclusive) + open-findings posture
/plan                           → Living time-bound schedule (run manually or via cron)
/retro                          → Periodic batch retro at any altitude
                                  (role / workflow / bet / project / org / framework
                                  per [fractal-retro] v0.3.17 — same workflow shape
                                  applied recursively; bottom-up consolidation)
/dashboard             [auto]   → Single-file HTML view of all living artifacts
                                  (refreshed by /scan, /metrics, /plan, /status)
/measure <bet>         [cron]   → Cron-driven bet outcome resolution
```

> **Phase transitions:** flip the artifact's `status:` field directly (`proposed` → `approved` → `in-build` → `shipped` → etc.). No canonical "advance" command — that's what status fields are for.

## Get started (orchestrator — recommended)

```bash
git clone https://github.com/vivekschaudhary/compass
cd your-project-repo
# Copy the framework into your repo
cp -r path/to/compass/compass ./
cp path/to/compass/AGENTS.md ./

# Install the anthropic SDK
pip3 install anthropic --break-system-packages

# Run your first workflow
export ANTHROPIC_API_KEY=sk-ant-...
python3 -m compass.orchestrator.run setup-product --dry-run   # see the steps
python3 -m compass.orchestrator.run setup-product \
  --context "We are building <your product description>."
```

For cross-model review (Engineer → Claude, Reviewer → OpenAI):

```bash
export OPENAI_API_KEY=sk-...
python3 -m compass.orchestrator.run build --context "story-id: PROJ-43"
```

See `compass/orchestrator/README.md` for full options.

## Get started (manual — any host)

Read `SETUP.md`.

## Heads-up: AI tool memory persists across folder deletion

If you reuse a folder path for a new Compass project (delete + recreate at the same path), AI tools may carry stale context from the prior project. See `SETUP.md` → "Starting fresh at the same folder path" for the cleanup steps.

Read `SETUP.md`.
