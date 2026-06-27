> **Status:** Early alpha. Used by the author on real projects. Orchestrator v0.4-alpha ships (exact alpha in CHANGELOG) — clone + run a workflow on your own API keys or on your Claude/Codex subscription (CLI hosts). Feedback welcome via Discussions; no support promises.

# Compass

> The vendor-neutral delivery control tower.

Compass is a **multi-model delivery control tower**. The work — briefs, architecture, stories, builds, cross-model reviews, gated merges — **runs *on* the platform**. So transparency isn't a status report you ask for; it's a **byproduct of execution**. The board can't lie, because the board *is* the work.

That one property is the whole idea: a delivery exec opens one screen and knows the **ground truth** of every program — what's done, what's stuck, what decided what, what it cost, where the risk is — without asking anyone for a status, and without anyone being able to game it.

## Why a control tower (and not the tools you already have)

| | What it shows you | The catch |
|---|---|---|
| **Status decks / Jira / Jellyfish / LinearB** | Reports *about* work done elsewhere | Self-reported proxies — gameable, and late |
| **Cursor / Copilot / Devin** | Do the work | Reveal nothing org-wide; no governance |
| **Compass** | **Does the work *and* reveals it** | The status report can't lie — the orchestrator *is* the work |

This changes the executive conversation from **monthly, reactive status reporting → proactive management-by-exception**: spend time only on the programs that need help, caught at week 1, not month 3. For consultancies and outsourcers, the same transparency becomes a **client trust** lever — the black box becomes glass.

And it's **vendor-neutral**: Claude implements, Codex/Gemini review, no lab lock-in — a property the model labs structurally won't build. Your canonical record is plain markdown + an append-only ledger in a git repo you can clone any time: **system of record *and* zero lock-in.**

## Why the ground truth is trustworthy (the discipline layer)

A control tower is only as good as the truthfulness of its state. AI speed without discipline is faster chaos — the dominant failure mode is **soft-spec rationalization** (the agent finds a plausible path, fills gaps with assumptions, skips the uncomfortable questions, and produces output that *looks* complete but isn't). Compass is the structural enforcement that makes the board's status real:

- **Every phase has a gate** with explicit postconditions — gates don't pass on vibes.
- **HITL stops halt the flow.** Runs pause for explicit approval at each checkpoint; the agent **cannot self-approve** (enforced mechanically, not just by prompt).
- **Refusal rules live in the agent files.** The agent refuses to proceed when conditions aren't met because the refusal is *defined in its task*, not because it was asked nicely.
- **Cross-model review independence.** The reviewer is never the same model as the implementer — enforced at the agent-frontmatter level.
- **Every decision is logged.** DRI (Decision / Risk / Issue) logs create an audit trail across every bet, phase, and agent. "Why did we do it this way?" always has an answer.
- **No silent skips.** Skipped steps are logged as DRI Decisions with rationale. The framework says *no* for you when the pressure is on to cut corners.

OKRs give you the goals. Compass gives you the discipline to execute them honestly — and the transparency to *prove* it.

## What Compass is

A markdown-based framework that any AI tool can read. The framework lives in `compass/`. **Agents are self-sufficient, surface-independent units** (`compass/agents/<agent>.md`) — the same agent file runs on ChatGPT Custom GPT Instructions, a Claude Code session, a Codex prompt, a Gemini system message, or as a CrewAI / LangGraph agent definition. **Host wrappers** (`CLAUDE.md`, future host analogs) are thin runtime-notes, not role authorities. Per `[agent-as-surface-independent-unit]` (canon v0.3.14).

## Core ideas

- **Every initiative is a bet.** Foundation product, OKRs, features, architectural initiatives — all measurable bets with a hypothesis, key metric, and an outcome: **won / learning / inconclusive**.
- **Bets contain stories — that's your Work Breakdown Structure.** A bet is the deliverable (epic); its stories are the work items; their builds/reviews/deploys are the leaves. The control tower renders this WBS **live**, with ground-truth status on every node.
- **Agents own tasks; workflows sequence agents.** 14 agent files in `compass/agents/` (**all 14 migrated** as of v0.3.36). Each is self-sufficient: identity + inlined principles + tools + task definitions (gate/work/postcondition) + refusal rules + handoffs. Workflow files in `compass/workflows/` are **thin dispatch graphs** that sequence `<agent>.<task>` references — methodology lives in the agent task definitions, not the workflow.
- **Surface-independent by design.** Each agent declares `preferred_hosts: [...]` in its own frontmatter. **The orchestrator (v0.4-alpha) walks dispatch graphs and dispatches each step to its preferred host automatically** — Engineer → Claude, Reviewer → OpenAI or Gemini — preserving cross-model independence structurally. (Caveat: if no reviewer host is reachable, the reviewer step **halts the run** rather than shipping without independent review — set a key, run a subscription CLI host, or pass `--skip-missing` for an explicit, DRI-logged skip.) Run via `python3 -m compass.orchestrator.run <workflow>`, or use any host interactively.
- **Cost-flat on subscriptions.** Dispatch Claude steps via your logged-in `claude` CLI and Codex steps via your `codex` CLI (`--claude-cli` / `--codex-cli`) — no metered API keys; the cross-model reviewer runs on your Codex subscription.
- **Decisions, Risks, Issues** logged at every stage (DRI logs) — the audit trail *is* a byproduct, not extra work.
- **Retros are fractal** (`[fractal-retro]`, canon v0.3.17). The same `/retro` shape applies at every altitude — role · workflow · bet · project · org · framework — with bottom-up consolidation; patterns promote to canon.
- **Compass scans your product like Snyk scans your code.** A continuous quality scanner runs across six SDLC phases — Product, Architecture, Build, Production Ready, GTM, Operate — producing *findings, not failures* (severity + confidence + location + reason + fix). Owners decide; the scanner informs.

## The control tower — shipped vs. building now

Compass is honest about what exists today versus the direction (`[declare-not-implement]`):

**Shipped today**
- The delivery spine: dispatch-graph workflows → per-role agents → HITL gates → cross-model gated review → merge.
- The orchestrator (v0.4-alpha) + a live **cockpit** (`compass/orchestrator/cockpit.py`) — a portfolio view of runs, awaiting gates (with age), per-step ✓/✗, live logs, cost, and one-tap approve/reject from the browser.
- An append-only **event spine** as the orchestration-state + audit ledger.
- Subscription CLI hosts (flat-cost), self-approval guards, idle-timeout/streaming, fail-loud on silent failures.

**Building now — the Control Tower MVP** (tracked as a real Compass bet in this repo: [`docs/bets/CT-1/`](docs/bets/CT-1/brief.md) — the tower tracking its own construction)
- **Coherence layer** — no zombie runs, no stranded bookkeeping, deploy/URL/flag visibility through to the board (so the chain doesn't go dark at the merge line).
- **Compass-primary store + projection** — deliverables are canonical *on Compass*, then projected one-way to **Jira** (epics/stories) and **Confluence** (product/strategy); gate approval drives the Jira transition + Confluence update. Code stays GitHub-canonical (observed + reconciled).
- **Exec control-tower view** — the live WBS / ops-center: programs → epics → stories with ground-truth status, manage-by-exception surfacing, and an unbroken **traceability chain** (intake → brief → architecture → stories → build → review → merge → deploy → live → metric).

## OKR-driven organizations

Compass maps directly onto an OKR planning cycle. The bet IS the initiative; the portfolio IS the quarterly initiative list.

| OKR concept | Compass equivalent |
|---|---|
| Objective | `docs/foundation/product.md` → Vision / North-star |
| Key Result | `product.md` → OKRs section + `architecture.md` → fitness functions |
| Initiative | Bet (`docs/bets/<bet-id>/brief.md`) |
| Sprint work | Story set (`docs/bets/<bet-id>/stories/`) |
| OKR check-in | `/status` → delivery manager → `docs/status.md` |
| Quarter retro | `/retro --altitude=project` |

**Ceremonies:**
- **OKR planning** → `/setup-product` (O + KRs at foundation) + `/create-bet-portfolio` (map KRs → bets; dependency graph = sprint sequencing)
- **Weekly check-in** → `/status` produces the check-in content automatically
- **Bet execution** → `/create-brief` → `/create-bet-architecture` → `/create-story` → `/build`
- **Quarter retro** → `/retro` at project altitude consolidates all bet outcomes

**Traceability closes the OKR → PR gap.** Each bet hypothesis traces to a specific OKR line in `product.md`. Stories trace to the bet. PRs trace to stories. The chain from OKR → shipped PR is explicit and auditable — no more "which work moved which KR?" *(This traceability chain is exactly what the control-tower view renders live.)*

**Schema addition for OKR orgs:** add `drives_kr: [KR-2.1, KR-3.4]` + `okr_cycle: Q3-2026` to `brief.md` frontmatter. `/status` then produces a KR-progress table. **Multi-team OKRs:** each team runs its own Compass project; cross-team KR patterns surface via `/retro --altitude=org`.

## The flow

17 workflows, grouped by **when you reach for them**. Several Observe workflows are auto-invoked by others — marked `[auto]` and rarely called by hand.

### 1. Bootstrap — once per project

```
/setup-product                  → Foundation product bet (PM + Researcher)
/setup-foundation-architecture  → Foundation architecture bet + data model (Enterprise Architect)
/create-bet-portfolio           → MVP wedge: 3-6 stub briefs + dependency graph (PM + Researcher)
```

### 2. Plan — per bet

```
/create-brief                   → New bet — fresh OR promote portfolio stub (PM + Researcher)
/create-bet-architecture        → Bet-level technical strategy (Architect + Enterprise Arch)
/create-story                   → Decompose the bet into its full story backlog (PM, +Designer/UX Writer if UI)
```

### 3. Execute — per story / event

```
/build <story>                  → Engineer implements + Codex reviews + Architect compliance
/fix <ticket>                   → Bug flow (Support → Engineer → Codex)
/triage <item>                  → Front-door intake router: classify + route (bug→fix, enhancement→brief, change→ops, incident→inline)
/ops <change>                   → Infra / config / non-code changes (Enterprise Arch + Codex)
```

### 4. Observe — rolling visibility (the control-tower surface)

```
/status                         → Delivery Manager's rolling status
/scan <bet>                     → Snyk-style continuous quality scanner — 6 SDLC phases
/metrics                        → Outcomes (won/learning/inconclusive) + open-findings posture
/plan                           → Living time-bound schedule (run manually or via cron)
/retro                          → Periodic batch retro at any altitude (role / workflow / bet / project / org / framework, [fractal-retro] v0.3.17)
/dashboard             [auto]   → The cockpit / control-tower view of all living artifacts
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

# Install the SDK (in a venv)
python3 -m venv .venv && .venv/bin/pip install anthropic
source .venv/bin/activate

# See the steps, then run your first workflow
export ANTHROPIC_API_KEY=sk-ant-...
python3 -m compass.orchestrator.run setup-product --dry-run
python3 -m compass.orchestrator.run setup-product \
  --context "We are building <your product description>."
```

For cross-model review (Engineer → Claude, Reviewer → OpenAI):

```bash
export OPENAI_API_KEY=sk-...
python3 -m compass.orchestrator.run build --context "story-id: PROJ-43"
```

Or run **flat-cost on subscriptions** (no metered keys):

```bash
python3 -m compass.orchestrator.run build --claude-cli --codex-cli --context "story-id: PROJ-43"
```

> **Where output lands:** orchestrator step outputs are written to `docs/orchestrator-runs/<workflow>/step-NN-<agent>-<task>.md`. Promote approved outputs to their canonical paths (`docs/foundation/`, `docs/bets/`) yourself — automatic artifact promotion is on the roadmap.

See `compass/orchestrator/README.md` for full options.

## Get started (manual — any host)

Read `SETUP.md`.

## Heads-up: AI tool memory persists across folder deletion

If you reuse a folder path for a new Compass project (delete + recreate at the same path), AI tools may carry stale context from the prior project. See `SETUP.md` → "Starting fresh at the same folder path" for the cleanup steps.
