# Compass Orchestrator — v0.4-alpha-0

Walks Compass dispatch-graph workflows and dispatches each step to the named agent's host via API. Currently single-host: all steps dispatch to **Claude API** (`claude-opus-4-8`).

This is the MVP unlock: instead of manually switching between hosts and pasting agent files, the orchestrator reads the workflow dispatch graph, loads the agent file as a system prompt, and runs each step end-to-end.

## Requirements

- Python 3.9+
- `anthropic` SDK: `pip install anthropic`
- `ANTHROPIC_API_KEY` environment variable set

## Usage

Run from the Compass repo root:

```bash
# Print the dispatch graph (no API calls):
python3 -m compass.orchestrator.run setup-product --dry-run

# Run only Step 1 with inline context:
python3 -m compass.orchestrator.run setup-product --step 1 \
  --context "We are building a personal finance app for millennials."

# Run the full workflow interactively:
python3 -m compass.orchestrator.run setup-product

# Run /build Step 1 (implement-story):
python3 -m compass.orchestrator.run build --step 1

# Use a specific model:
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

## How it works

1. Reads `compass/workflows/<workflow>.md` dispatch graph
2. Parses steps: `### Step N. <agent>.<task>` headers
3. For each step:
   - **HITL gate:** pauses, prompts user for approval (y/n)
   - **Workflow-level step** (merge constraints, etc.): prints a "handle manually" note
   - **Agent step:** loads `compass/agents/<agent>.md` as system prompt → dispatches to Claude API
4. Prints the agent's response to stdout

## v0.4-alpha-0 scope and known gaps

- **Single-host only** — all steps go to Claude API regardless of agent's `preferred_hosts:`. Multi-host dispatch (Codex for Reviewer, etc.) ships in v0.4-beta.
- **No artifact writing** — responses print to stdout. File-write automation ships next.
- **No HITL context passing** — after a HITL approval, the next step starts fresh (no structured state passing from previous step output). Wired in next iteration.
- **Interactive input only** — `--context` fills Step 1's input; subsequent steps still prompt interactively.
- **No resume** — if the workflow errors mid-run, restart from `--step N`.

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
