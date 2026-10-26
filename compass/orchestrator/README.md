# Compass Orchestrator — v0.4-alpha

> Current alpha number is tracked in the repo-root `CHANGELOG.md` — this file deliberately avoids restating it (same-fact-cited-twice drift, Principle #17).

Walks Compass dispatch-graph workflows and dispatches each step to the named agent's host via API. **Multi-host dispatch:** each step reads the agent's `preferred_hosts:` frontmatter and routes to the best available host (Claude API, OpenAI API, or Gemini API).

This closes the P0 drift from Retro #009: every step dispatches to the host its agent declares, rather than defaulting to Claude. Reviewer steps route to whatever the engagement configures (#155) — Claude by default, or OpenAI (Codex) / Gemini API, preserving cross-model independence.

## Requirements

- **Database access.** The orchestrator reads its workflow graph, agent prompts and stack profiles from the database (`spec_file`, `workflow_step`, `role`) through `spec_source.py`, using `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Without them it halts — there is no disk fallback. A missing row halts too, naming the row and the command that loads it (`app/scripts/seed-specs.mts`).
- Python 3.9+
- **Claude API** (for agents with `claude` in preferred_hosts): `pip3 install anthropic` + `ANTHROPIC_API_KEY`
- **OpenAI API** (for agents with `codex`/`chatgpt`/`openai` in preferred_hosts): `pip3 install openai` + `OPENAI_API_KEY`
- **Gemini API** (for agents with `gemini` in preferred_hosts): `pip3 install google-generativeai` + `GEMINI_API_KEY` or `GOOGLE_API_KEY`

At minimum, set `ANTHROPIC_API_KEY` to run PM + Researcher + Engineer + Architect steps. Set `OPENAI_API_KEY` additionally to enable Reviewer steps (cross-model independence).

## Usage

Run from the Compass repo root:

```bash
# Print dispatch graph with host routing (no API calls):
python3 -m compass.orchestrator.run create-product-brief --dry-run

# Run full workflow — each step routes to its preferred host:
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...    # optional — enables Reviewer steps
python3 -m compass.orchestrator.run create-product-brief \
  --context "We are building a personal finance app for millennials."

# Run a single step with inline context:
python3 -m compass.orchestrator.run create-product-brief --step 1 \
  --context "We are building a personal finance app for millennials."

# Stdout only — no file writes:
python3 -m compass.orchestrator.run create-product-brief --no-write \
  --context "..."

# Full /build run — Engineer → Claude, Reviewer → OpenAI (codex):
python3 -m compass.orchestrator.run build \
  --context "story-id: PROJ-43"

# Use a specific model override (applied to whichever host is selected):
python3 -m compass.orchestrator.run create-product-brief --step 1 \
  --model claude-haiku-4-5-20251001 \
  --context "..."
```

## Options

| Flag | Description |
|---|---|
| `--project-dir PATH` | Root of the project repo (default: current directory) |
| `--compass-dir PATH` | The directory holding `config.yaml` (checks, stack, connectors); default `<project-dir>/compass`. Agent prompts, workflows and stack profiles are NOT read from here |
| `--engagement ID` | The engagement whose `spec_file` / `role` / `workflow` rows apply; an engagement-tier row overrides the org default. Without it only the org default is read |
| `--pipeline W1,W2,…` | Run workflows in sequence with cross-workflow context handoff |
| `--dry-run` | Print dispatch graph with host routing (no API calls) |
| `--step N` | Execute only step N (1-indexed) |
| `--from-step N` | Resume from step N (prior step outputs loaded from disk) |
| `--context TEXT` | Inline context for the first agent step (skips interactive prompt) |
| `--bet ID` | Auto-load `docs/epics/<ID>/` brief + architecture + story summaries as context |
| `--full-project` | Load foundation docs + status + all bet summaries as context |
| `--model ID` | Model override applied to whichever host is selected (see also `COMPASS_MODEL_<CLAUDE\|OPENAI\|GEMINI>` env vars) |
| `--no-write` | Print output to stdout only; do not write artifact files |
| `--skip-missing` | Skip steps with no available host/agent instead of halting (loud, must be DRI-logged; default is halt — no silent skips) |
| `--log` / `--dri` / `--hitl-log` | Report modes: runs.jsonl table / DRI decisions / HITL decision log |
| `--approve PATH` | Manual approval bridge: flip PATH's frontmatter to `status: approved` AND append an approved hitl.jsonl record, then exit |
| `--reject PATH [--feedback TEXT]` | Record a rejected hitl.jsonl decision for PATH (file untouched), then exit |

Exit codes: `0` complete · `1` HITL rejection (run halted) · `2` missing host/agent without `--skip-missing` · `3` unmet requirement gate.

## Requirement gates + artifact promotion (improvement #70)

> `requires_approved:` lived in the `.md` frontmatter. The published `workflow_step` rows do not carry it, so a run built from them evaluates no requirement gate: the app opens a task only when its `depends_on` are done.

- A workflow's frontmatter may declare `requires_approved:` — artifact paths that must be approved before dispatch. PASS per path (v0.3.x dual acceptance): an approved hitl.jsonl record (latest decision wins) **or** the file existing with `status: approved` frontmatter. Unmet → live runs halt (exit 3) naming the producing workflow; `--dry-run` reports without halting. Paths may use a `<epic-id>` placeholder resolved from `--bet`.
- HITL gate steps may declare `**Artifact target:** \`<path>\``. On approval, the orchestrator promotes the gated draft (the preceding step's output, with its `## Output summary` tail stripped) to that canonical path with `status: approved` frontmatter, via the connector layer (`connector.py` — filesystem backend; configured-but-unimplemented connectors fall back with an honest label in the hitl.jsonl record).
- The two mechanisms close the loop: approval writes the canonical artifact, which satisfies the next workflow's requirement gate — `--pipeline` chains are no longer gate-broken.

## How it works

1. Reads the workflow's published `workflow_step` rows from the database
2. Builds the steps: `number` is the row's `ord`; the agent is the role's `agent`
3. For each step:
   - **HITL gate:** pauses, prompts user for approval (y/n)
   - **Workflow-level step** (merge constraints, etc.): prints a "handle manually" note
   - **Agent step:**
     1. Reads `preferred_hosts:` from the frontmatter of the agent's `spec_file` row
     2. Selects first host with API credentials available
     3. Takes the agent's text from `spec_file` as the system prompt (held in a temp file for the dispatch) → dispatches to selected host's API
     4. Prints and optionally writes output to `docs/orchestrator-runs/`
4. For a story build (`--story <key>`), hands the engineer the story's own text (its section of the epic's `stories/<epic key>` document), the epic's technical design (`epic/<key>`), the foundational and feature architecture, and the design library when there is one — all read from the database, none from `docs/` in the repo. A required document that is missing halts the run (exit 3), naming it.
5. Passes prior step outputs as context to each subsequent step

## Host routing example — /build workflow

With `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` set:

| Step | Agent | preferred_hosts | Dispatches to |
|---|---|---|---|
| 1 | `engineer.implement-story` | `[claude, codex, gemini]` | Claude API |
| 2 | `automation.write-e2e-tests` | `[claude, codex, gemini]` | Claude API |
| 3 | `reviewer.review-pr` | `[codex, gemini]` | OpenAI API (codex) |
| 4 | `engineer.respond-to-review` | `[claude, codex, gemini]` | Claude API |
| 5 | `pm.arbitrate-dispute` | `[chatgpt, claude, ...]` | OpenAI API (chatgpt) |

Engineer and Reviewer dispatch as separate agents; the Reviewer runs on a fresh context with no implementation history (#155). Different models optional, not required.

## v0.4-alpha scope and known gaps

- **Multi-host dispatch** — routes per agent `preferred_hosts:` to Claude API, OpenAI API, or Gemini API.
- **Artifact write** — step outputs written to `docs/orchestrator-runs/<workflow>/step-<N>-<agent>-<task>.md`.
- **State passing** — each step receives prior step outputs as context (truncated to 3000 chars per step).
- **Interactive input only** — `--context` fills Step 1's input; subsequent steps prompt interactively.
- **No resume** — if the workflow errors mid-run, restart from `--step N`.
- **No git commit automation** — artifact files written to disk; user commits. Ships v0.4-beta.

## Files

```
compass/orchestrator/
  __init__.py        # package marker
  graph.py           # dispatch graph parser
  hitl.py            # HITL gate handler
  run.py             # CLI entry point
  hosts/
    __init__.py
    claude.py        # Claude API adapter (anthropic SDK)
    openai.py        # OpenAI API adapter (for codex/chatgpt targets)
    gemini_api.py    # Gemini API adapter (google-generativeai SDK)
    router.py        # Host selection + dispatch routing
  README.md          # this file
```

## Forward: v0.4-beta

- Artifact write automation (step output → `docs/` file commit)
- `compass/config.yaml` integration (hitl_level, connectors)
- `pip install compass` entry point → `compass run <workflow>`
- HITL context passing (approval text fed to next step as context)
