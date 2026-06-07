# Setup — Compass

How to install Compass with Claude Code (implementer) + OpenAI Codex CLI (reviewer) as the v1 supported tools. Vendor-neutral — add other tools later via thin wrappers.

## Install

### 1. Drop the kit into your repo

```bash
cd /path/to/your-empty-or-existing-repo
cp -r path/to/compass/compass/    ./
cp -r path/to/compass/docs/       ./
cp -r path/to/compass/.claude/    ./
cp -r path/to/compass/.codex/     ./
cp -r path/to/compass/.github/    ./
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

**Approve it** by editing the status field from `proposed` to `approved` in the file frontmatter, then commit.

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

## What's where

```
.
├── AGENTS.md                    ← rules every AI tool reads first
├── PROJECT.md                   ← thin pointer to foundation docs
├── README.md                    ← project overview
├── SETUP.md                     ← this file
│
├── compass/                     ← ★ THE FRAMEWORK (vendor-neutral)
│   ├── roles/                   #   12 role definitions
│   ├── workflows/               #   13 workflows (one per command)
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
├── .claude/skills/              ← 13 skill stubs, one per command
└── .codex/                      ← Codex CLI: config + reviewer prompts
```

## Picking which agent plays which role

Per `[agent-agnostic-role-assignment]` (v0.3.8 — `compass/framework/canon.md`), Compass ships an agent registry + sensible defaults. To override:

1. Open `compass/config.yaml`.
2. Look at the `agents:` registry — supported agents include `claude`, `codex`, `openai` (ChatGPT/GPT API), `gemini`, `deepseek`, `codestral`, `apple` (marked unsupported), and `custom`. Each declares its invocation pattern (`cli` / `api` / `manual`) + context-loading convention + auth env var.
3. Edit the `tool_assignments:` block to assign any registry agent to any role.

```yaml
# Example: ChatGPT for PM-side roles, Claude for tech roles, Codex stays for review
tool_assignments:
  pm:                  openai     # ChatGPT for PM
  researcher:          openai     # ChatGPT for research
  designer:            gemini     # Gemini for design decisions
  engineer:            claude     # Claude for engineering
  reviewer:            codex      # MUST differ from engineer (independent model)
  security_reviewer:   codex
  ...
```

**Reviewer constraint:** `reviewer` and `security_reviewer` must use a **different model** than the implementer. Same-model reviewer + same-model author share aesthetic priors and miss what an independent-model reviewer catches (empirically validated during aura-app CB-1.4; see AGENTS.md "Tool division of labor").

**Defaults work out of the box.** If you change nothing, Compass uses Claude implements + Codex reviews — matching the empirically-validated split.

**Non-default agents may require manual setup** depending on their type:

- **CLI-based agents** (`claude`, `codex`, `gemini`): need a per-tool prompt directory (`.codex/prompts/<role>.md`, `.gemini/prompts/<role>.md`). Until v0.3.9 ships `compass/scripts/setup-agent.py` to generate these, copy the pattern from existing `.codex/prompts/reviewer.md` (it's a thin wrapper pointing at `compass/agents/<agent>.md` for migrated agents, or `compass/roles/<role>.md` for legacy ones during the v0.3.x grace period).

- **API-based agents** (`openai`, `deepseek`, `codestral`): use an upstream adapter library — **LiteLLM recommended** (handles 100+ providers, unified API, Python + JS). Alternatives: **Vercel AI SDK** (TypeScript-first), **OpenRouter** (hosted proxy), **LangChain LLM providers**. Compass passes `compass/roles/<role>.md` as the system prompt; the adapter routes to the right provider given a model string (e.g., LiteLLM uses `openai/gpt-5`, `deepseek/deepseek-chat`, `mistral/codestral-latest`). Auth via standard env vars (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`).

- **Apple Intelligence** (`apple`): flagged `unsupported: true` in the registry — system-level features only, no open API for arbitrary role-playing. Use `custom` if you need a non-standard Apple-side workflow.

- **Custom**: declare your own invocation pattern in the registry. Use for self-hosted models, custom CLI wrappers, internal APIs.

See `compass/config.yaml` registry `note:` for each agent's specific integration path.

## Adding more AI tools later

The framework lives in `compass/`. To add Cursor, Cline, Windsurf, etc.:

1. Add the tool to the `agents:` registry in `compass/config.yaml` with its invocation + context-loading details
2. Create the tool's expected config folder (`.cursor/rules/`, `.clinerules`, etc.)
3. Write thin wrappers that reference `compass/roles/<role>.md` and `compass/workflows/<workflow>.md`
4. Assign roles to the new agent via `tool_assignments`
5. `compass/` files don't change. Only the wrapper folder + a registry entry are added.

For tools with flatter customization (Copilot, Cline's single-file rules), concatenate the relevant role files instead of referencing.

## Customizing

- **Roles:** edit `compass/roles/<role>.md`. All tools pick up the change.
- **Workflows:** edit `compass/workflows/<workflow>.md`. Skills reference, don't duplicate.
- **HITL strictness:** edit `compass/config.yaml` `hitl_level`.
- **Connectors:** edit `.mcp.json` and `compass/config.yaml` `connectors`.
- **New role:** add `compass/roles/<new>.md`, register in `AGENTS.md` and `compass/config.yaml`.
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

## The principles, in 10 lines

1. Every initiative is a measurable bet (won / learning / inconclusive)
2. Roles, not job titles — 12 product roles loaded as context
3. Bets contain stories contain implementations
4. Two tools, separated jobs: Claude implements, Codex reviews
5. Decisions, Risks, Issues logged at every stage
6. HITL milestones — humans approve at meaningful gates
7. Discipline holds always — no shortcuts under pressure
8. Traceability end-to-end — everything links back to its source
9. No silent skips — declined engagements get logged with rationale
10. The framework is markdown — edit it freely as your team learns
