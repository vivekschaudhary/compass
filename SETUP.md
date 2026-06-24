# Setup — Compass

How to install Compass with Claude Code (implementer) + OpenAI Codex CLI (reviewer) as the v1 supported tools. Vendor-neutral — add other tools later via thin wrappers.

## Install

### 1. Drop the kit into your repo

```bash
cd /path/to/your-empty-or-existing-repo
# No trailing slashes on the source paths — on macOS (BSD cp) a trailing
# slash copies the directory's CONTENTS into ./ instead of the directory.
cp -r path/to/compass/compass     ./
cp -r path/to/compass/docs        ./
cp -r path/to/compass/.claude     ./
cp -r path/to/compass/.codex      ./
cp -r path/to/compass/.github     ./
cp    path/to/compass/.mcp.json   ./
cp    path/to/compass/AGENTS.md   ./
cp    path/to/compass/CLAUDE.md   ./
cp    path/to/compass/PROJECT.md  ./
cp    path/to/compass/README.md   ./  # optional; rename your existing if present
```

### 2. Install both AI tools

**Claude Code:**

```bash
npm install -g @anthropic-ai/claude-code
```

Install the VS Code extension ("Claude Code") from the marketplace.

**OpenAI Codex CLI:**

```bash
npm install -g @openai/codex
codex login
```

### 3. Authenticate MCP connectors

**Claude Code (in VS Code panel):**

```
/mcp
```

Authenticate each: GitHub, Atlassian (Jira/Confluence), Sentry, Figma.

**Codex CLI:**
Codex reads `.codex/config.toml`. Verify in chat:

```
List the MCP servers available to you.
```

(Codex's MCP config format evolves — check `codex --help` if servers don't appear.)

### 4. Commit the bootstrap

```bash
git add .
git commit -m "chore: bootstrap Compass"
```

## First run

### Step 1 — foundational product bet

In the Claude Code panel:

```
/setup-product
```

You'll be asked for source material (Confluence link, GDrive doc, or free text describing what you're building). Compass drafts `docs/foundation/product.md` as a measurable bet.

**Approve it** either way — the two are equivalent (v0.3.x dual acceptance):
- edit the status field from `proposed` to `approved` in the file frontmatter and commit, **or**
- run `python3 -m compass.orchestrator.run --approve docs/foundation/product.md` — flips the frontmatter AND records the decision in `docs/orchestrator-runs/hitl.jsonl` (the machine-readable approval journal that orchestrator gates also check).

### Step 2 — foundational architecture bet

```
/setup-foundation-architecture
```

Compass asks ~12 stack questions (with smart defaults), scaffolds the repo with boundary folders + CI/CD config, populates `compass/config.yaml`, drafts `docs/foundation/architecture.md`.

**Approve** by flipping the status to `approved` and committing.

### Step 3 — MVP bet portfolio (bootstrap, new projects only)

```
/create-bet-portfolio
```

PM + Researcher draft the **MVP wedge** — 3-6 stub briefs that together let one real user complete the core value loop once. You'll be asked the forcing question: "What does this product need to do for one real user to complete the core value loop once?" Anything beyond that goes into "Deliberately out of MVP" and waits.

Output: `docs/foundation/portfolio.md` (with Mermaid dependency graph + parallel-build candidates) + stub briefs at `docs/bets/<bet-id>/brief.md` with `portfolio_stub: true`.

**Approve** the portfolio doc before promoting any stub.

After approval, run:

```
/plan
```

Seeds `docs/foundation/plan.md` with the initial time-bound schedule (coarse dates from dep graph + default 2-week durations). The plan is a **living artifact** — re-run `/plan` whenever you want it refreshed (after a brief is approved to refine scope, after architecture is approved to refine effort, after a build PR merges to write actuals). Cron-driven refresh available via `compass/config.yaml`.

> Skip portfolio + plan steps only if you're not bootstrapping (e.g., adding Compass to an existing project, or adding a single one-off bet to an in-flight project). For those, go straight to `/create-brief`.

### Step 4 — promote each stub to a full brief

For each MVP bet, when you're ready to fully scope it:

```
/create-brief PROJ-XX
```

Detects the portfolio stub at `docs/bets/PROJ-XX/brief.md` and promotes it: fills in problem, user, scope, research, guardrails. Clears `portfolio_stub`. Approve when ready.

(For mid-project new bets — not from the portfolio — keep using `/create-brief <source>` or `/create-brief "<free text>"` as before.)

### Step 5 — bet-level architecture (if needed)

```
/create-bet-architecture PROJ-XX
```

Architect + Enterprise/Solution Architect produce `docs/bets/PROJ-XX/architecture.md`. Skipped automatically for small bets.

### Step 6 — first story

```
/create-story PROJ-XX
```

PM identifies the first shippable slice. If UI, Designer + UX Writer engage in parallel for design + copy.

### Step 7 — build it

```
/build PROJ-XX-1
```

Engineer implements + tests + opens PR. Story may produce multiple PRs.

### Step 8 — Codex reviews

In your terminal:

```bash
codex
```

Then in Codex:

```
Run the reviewer prompt at .codex/prompts/reviewer.md against the diff on PR #N.
```

Codex reads `AGENTS.md`, the bet architecture, and the diff. Posts findings on the PR.

### Step 9 — back to Claude

```
Address the Codex findings on PR #N.
```

Loop until clean, then merge.

### Step 10 — measure

Cron auto-runs `/measure PROJ-XX` per the bet's `check_in_cadence`. Or run manually:

```
/measure PROJ-XX
```

When the measurement window closes, the bet transitions to `won`, `learning`, or `inconclusive`.

## Anytime

- `/status` — what's in flight
- `/metrics` — top-down outcomes view
- `/dashboard` — generate `docs/dashboard.html` for a single-file browser view of all living artifacts (foundation, plan, portfolio, scan reports, metrics, status). Share with stakeholders who skim outside the IDE — opens via `file://`, attachable to email/Slack. Auto-refreshed by `/scan`, `/metrics`, `/plan`, `/status`.

  **Gitignore the output.** Add `docs/dashboard.html` to your project's `.gitignore`. The dashboard is a derived view that regenerates on demand — committing it produces large, non-meaningful diffs on every workflow run (~2500+ lines that grow with project size). Other living artifacts (`plan.md`, scan reports, metrics snapshots, `status.md`) do get committed because they carry user state (suppressions, refinement log, history); the dashboard doesn't.

  ```bash
  echo 'docs/dashboard.html' >> .gitignore
  ```

- **Cockpit — the portfolio-wide orchestrator feed.** `python3 -m compass.orchestrator.cockpit --serve` runs a **read-only** localhost feed (`http://127.0.0.1:8765`) over the user-local event spine: ⏸ awaiting / ▶ in-flight (+ step plan) / ✓ done / 💰 spend, auto-refreshing. Distinct from `/dashboard` (that renders one repo's artifacts; this is portfolio-wide across every project the orchestrator has run). Add **`--allow-actions`** to make it **actionable** — launch a workflow and approve/route a paused gate **from the browser** (#119):

  ```bash
  python3 -m compass.orchestrator.cockpit --serve --allow-actions \
      --project-dir . --max-cost 5
  ```

  Localhost-only. Browser-launched runs always go through `compass-run` with `--non-interactive` + `--max-cost`, so the gate floor and the budget cap still fire — a click can't bypass control or run away on cost.

  **Make dashboard launches flat-cost (#120):** export `COMPASS_CLAUDE_HOST=cli` before starting the server — spawned runs inherit it, so every browser launch dispatches via your `claude` CLI subscription (no API key), reviewers excepted.

  Each action **confirms before running** and **disables the buttons on submit** (#122), and a resumed gate **continues the same run** rather than forking a duplicate (#121) — so a gate clears from "awaiting" after one decision, and a stale tab gets an "already actioned" notice instead of a second run.

## What's where

```
.
├── AGENTS.md                    ← rules every AI tool reads first
├── PROJECT.md                   ← thin pointer to foundation docs
├── README.md                    ← project overview
├── SETUP.md                     ← this file
│
├── compass/                     ← ★ THE FRAMEWORK (vendor-neutral)
│   ├── agents/                  #   14 agent files — all migrated as of v0.3.36
│   ├── roles/                   #   legacy role files (grace period only; removed in v0.4)
│   ├── workflows/               #   17 workflows (one per command; 6 as dispatch graphs)
│   ├── orchestrator/            #   v0.4-alpha multi-host orchestrator (python3 -m compass.orchestrator.run)
│   ├── templates/               #   10 artifact templates
│   └── config.yaml              #   team decisions
│
├── docs/                        ← ★ THE ARTIFACTS (your project's outputs)
│   ├── foundation/              #   product + architecture foundational bets
│   ├── bets/                    #   all bets, organized by ID
│   ├── ops/, fixes/, incidents/ #   standalone (hygiene + cross-system)
│   ├── sprints/                 #   weekly comms
│   ├── metrics/                 #   cached snapshots (json + md)
│   ├── status.md                #   rolling project status
│   └── changelog.md             #   user-visible changes
│
├── .github/PULL_REQUEST_TEMPLATE.md
├── .mcp.json                    ← MCP connectors for all tools
│
│   ─── TOOL WRAPPERS (thin; point at compass/) ───
│
├── CLAUDE.md                    ← Claude Code: read AGENTS.md + compass/
├── .claude/skills/              ← 18 skill stubs, one per command
└── .codex/                      ← Codex CLI: config + reviewer prompts
```

## Picking which agent plays which role

As of v0.3.14, **each agent file declares its own `preferred_hosts:` in its frontmatter** — that is the source-of-truth for routing. The v0.4-alpha orchestrator reads `preferred_hosts:` and dispatches each workflow step to the appropriate host automatically.

```yaml
# Inside compass/agents/engineer.md frontmatter
preferred_hosts: [claude, codex, gemini]   # Claude first

# Inside compass/agents/reviewer.md frontmatter
preferred_hosts: [codex, gemini]           # NOT claude — enforces cross-model independence
```

**To use the orchestrator** (recommended):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...        # optional: enables Codex/Reviewer routing
python3 -m compass.orchestrator.run build --context "story-id: PROJ-43"
```

The orchestrator selects the first host in `preferred_hosts:` that has credentials set. Dry-run with `--dry-run` to see which host each step routes to.

**Model tier (cost) — Sonnet by default (#115).** Every Claude step defaults to the **economy** model (`claude-sonnet-4-6`) — Opus-by-default was ~5× the cost. Opt **up** to the frontier model two ways: per agent, add `model_tier: deep` to its frontmatter (→ Opus); per run, pass `--model claude-opus-4-8`. Override globally with `COMPASS_MODEL_CLAUDE`. **Cap spend per run with `--max-cost <USD>`** — it halts (with a resume hint) when estimated spend crosses the cap, checked on every usage event (mid-tool-loop too). Watch live spend in `cockpit` (💰 SPEND).

**Flat-cost dispatch — run on your `claude` CLI subscription, not the metered API (#120).** Add `--claude-cli` (or export `COMPASS_CLAUDE_HOST=cli`) and Claude steps dispatch via your **logged-in `claude` CLI** (`claude -p`) instead of the API — **no `ANTHROPIC_API_KEY`, flat marginal cost** (the cockpit 💰 SPEND shows ~$0 for those runs). Needs the `claude` CLI installed + logged in. It remaps **only** the `claude` host → `claude-code`; reviewer steps stay on Codex/Gemini, so cross-model review independence is preserved. The env var is what the dashboard uses: export it before `cockpit --serve --allow-actions` and every browser-launched run is flat-cost too.

```bash
COMPASS_CLAUDE_HOST=cli python3 -m compass.orchestrator.run triage \
    --project-dir . --compass-dir $COMPASS_FW/compass --context "subscriptions panel empty"
```

**To use manually** (interactive, any host):

Paste any `compass/agents/<agent>.md` file into your LLM host's system-prompt slot. Agent files are self-sufficient — identity + principles + tasks + refusal rules + handoffs are all inlined.

**Reviewer constraint:** `reviewer` and `security_reviewer` must use a **different model** than the implementer. `reviewer.md` declares `preferred_hosts: [codex, gemini]` (NOT claude) — enforcing cross-model independence at the file level, not config. Same-model reviewer + same-model author share aesthetic priors and miss what an independent-model reviewer catches.

**Legacy:** `compass/config.yaml tool_assignments:` is deprecated since v0.3.14. Per-agent `preferred_hosts:` is the source-of-truth. Existing `tool_assignments:` entries are ignored by the orchestrator but harmless to leave.

## Adding more AI tools later

The framework lives in `compass/`. To add Cursor, Cline, Windsurf, etc.:

1. Create the tool's expected config folder (`.cursor/rules/`, `.clinerules`, etc.)
2. Write thin wrappers that paste `compass/agents/<agent>.md` as the system prompt, referencing `compass/workflows/<workflow>.md` for dispatch.
3. Add the tool's credential env var to the orchestrator's host map (`compass/orchestrator/hosts/router.py`) if you want automated dispatch.
4. `compass/agents/` and `compass/workflows/` files don't change. Only the wrapper folder is added.

For tools with flatter customization (Copilot, Cline's single-file rules), concatenate the relevant role files instead of referencing.

## Customizing

- **Agents:** edit `compass/agents/<agent>.md` (all 14 agents live here as of v0.3.36). All tools pick up the change.
- **Workflows:** edit `compass/workflows/<workflow>.md`. Skills reference, don't duplicate.
- **HITL strictness:** edit `compass/config.yaml` `hitl_level`.
- **Connectors:** edit `.mcp.json` and `compass/config.yaml` `connectors`.
- **New agent:** add `compass/agents/<new>.md` with `preferred_hosts:` frontmatter, register in `AGENTS.md`.
- **New workflow:** add `compass/workflows/<new>.md` + a thin `.claude/skills/<new>/SKILL.md`.

## Starting fresh at the same folder path

If you delete a Compass project folder and recreate it at the same path, **AI tools may carry stale memory from the previous project**. This is a quirk of how Claude Code, Cursor, and other tools store project context — keyed to absolute folder path, not folder identity.

Symptom: you start `/setup-product` in an empty repo and Claude references a project name, OKRs, or roles that aren't yours.

### Fix it (Claude Code)

Memory lives at `~/.claude/projects/<path-with-slashes-as-dashes>/memory/`. Delete it:

```bash
# Example for project at ~/apps/compass-test
rm -rf ~/.claude/projects/-Users-<you>-apps-compass-test/memory/
```

Replace `<you>` and the path components with your actual values. The folder name mirrors the absolute path with `/` replaced by `-`.

### Fix it (Cursor / other tools)

Each tool stores memory differently. Check the tool's settings or documentation for "project memory" or "workspace context" — clear it manually for the affected project.

### Avoid the issue entirely

Easiest workaround: don't reuse folder paths. Start each Compass project in a fresh path (`~/apps/project-a`, `~/apps/project-b`, not the same `~/apps/test` repeatedly).

## Smoke test

In an empty branch after install:

```
/setup-product
```

(Use defaults; this is just to verify the loop works.)

After approving the product foundation, run `/setup-foundation-architecture`, then try `/create-brief "test feature"`.

If anything feels broken, look at the workflow file that's running — workflows are plain markdown you can edit.

## The principles, in 11 lines

1. Every initiative is a measurable bet (won / learning / inconclusive)
2. Agents, not job titles — 14 self-sufficient agent files (all migrated)
3. Bets contain stories contain implementations
4. Cross-model independence: Claude implements, Codex/Gemini reviews — enforced via `preferred_hosts:` per agent
5. Decisions, Risks, Issues logged at every stage
6. HITL milestones — humans approve at meaningful gates
7. Discipline holds always — no shortcuts under pressure
8. Traceability end-to-end — everything links back to its source
9. No silent skips — declined engagements get logged with rationale
10. Minimize friction — every step avoids adding user decisions beyond task demands
11. The framework is markdown — edit it freely as your team learns
