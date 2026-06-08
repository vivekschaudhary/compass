# Compass Orchestrator — v0.4-alpha-0

Walks Compass dispatch-graph workflows and dispatches each step to the named agent's host via API. Currently single-host: all steps dispatch to **Claude API** (`claude-opus-4-8`).

This is the MVP unlock: instead of manually switching between hosts and pasting agent files, the orchestrator reads the workflow dispatch graph, loads the agent file as a system prompt, and runs each step end-to-end.

## Requirements

- Python 3.9+
- `anthropic` SDK: `pip install anthropic`
- `ANTHROPIC_API_KEY` environment variable set

## Usage

Run from the Compass repo root (set `ANTHROPIC_API_KEY` first):

```bash
# Print the dispatch graph (no API calls):
python3 -m compass.orchestrator.run setup-product --dry-run

# Run full workflow — writes artifacts to docs/orchestrator-runs/:
python3 -m compass.orchestrator.run setup-product \
  --context "We are building a personal finance app for millennials."

# Run a single step with inline context:
python3 -m compass.orchestrator.run setup-product --step 1 \
  --context "We are building a personal finance app for millennials."

# Stdout only — no file writes:
python3 -m compass.orchestrator.run setup-product --no-write \
  --context "..."

# Run /create-bet-architecture after setup-product completes:
python3 -m compass.orchestrator.run create-bet-architecture \
  --context "bet-id: WAF-001, brief approved"

# Use a faster/cheaper model:
python3 -m compass.orchestrator.run setup-product --step 1 \
  --model claude-sonnet-4-6 \
  --context "..."
```

## Options

| Flag | Description |
|---|---|
| `--project-dir PATH` | Root of the project repo (default: current directory) |
| `--dry-run` | Print the dispatch graph without executing |
| `--step N` | Execute only step N (1-indexed) |
| `--context TEXT` | Inline context for the first agent step (skips interactive prompt) |
| `--model ID` | Claude model ID (default: `claude-opus-4-8`) |
| `--no-write` | Print output to stdout only; do not write artifact files |

## How it works

1. Reads `compass/workflows/<workflow>.md` dispatch graph
2. Parses steps: `### Step N. <agent>.<task>` headers
3. For each step:
   - **HITL gate:** pauses, prompts user for approval (y/n)
   - **Workflow-level step** (merge constraints, etc.): prints a "handle manually" note
   - **Agent step:** loads `compass/agents/<agent>.md` as system prompt → dispatches to Claude API
4. Prints the agent's response to stdout

## v0.4-alpha-1 scope and known gaps

- **Artifact write** — step outputs written to `docs/orchestrator-runs/<workflow>/step-<N>-<agent>-<task>.md`. Use `--no-write` to suppress.
- **State passing** — each step receives prior step outputs as context (truncated to 3000 chars per step to fit context window). Full multi-step runs produce coherent output chains.
- **Single-host only** — all steps go to Claude API regardless of agent's `preferred_hosts:`. Multi-host dispatch (Codex for Reviewer, etc.) ships in v0.4-beta.
- **Interactive input only** — `--context` fills Step 1's input; subsequent steps still prompt interactively unless `--step N` is used.
- **No resume** — if the workflow errors mid-run, restart from `--step N`.
- **No git commit automation** — artifact files written to disk; user commits. Git automation ships in v0.4-beta.

## Files

```
compass/orchestrator/
  __init__.py        # package marker
  graph.py           # dispatch graph parser (reads workflow .md files)
  hitl.py            # HITL gate handler (pause + y/n prompt)
  run.py             # CLI entry point
  hosts/
    __init__.py
    claude.py        # Claude API adapter (anthropic SDK)
  README.md          # this file
```

## Forward: v0.4-beta

- Multi-host dispatch per agent's `preferred_hosts:` (Claude API + Codex CLI + Gemini)
- Artifact write automation (step output → `docs/` file commit)
- Structured state passing between steps (previous step output → next step context)
- `compass/config.yaml` integration (hitl_level, connectors)
- `pip install compass` entry point → `compass run <workflow>`
