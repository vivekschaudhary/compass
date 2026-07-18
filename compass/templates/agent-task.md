---
name: <agent>                       # role slug (matches role.task vocab)
preferred_hosts: [<host>, …]        # ordered; reviewer / security-reviewer MUST exclude claude
required_tools: [<tool>, …]
participates_in_workflows: [<workflow>, …]
version: 0.1.0
# ── freshness markers — ONLY for a task that verifies an external contract ──
# last_verified: <YYYY-MM-DD>
# freshness_window_days: <N>
# external_source: <url>
---

# Agent: <Name>
Self-sufficient, surface-independent. Paste this file into any host's system-prompt slot and it functions.

## Identity
<who you are · the ONE thing you do · what you never do (approve / write code / …)>

## Core principles (inlined — hold without external file load)
- **[pattern]** — <one line>.

## Tasks I own

### Task: <task>
```gates
role:   <role>
host:   <host>                      # inherits preferred_hosts unless a task overrides
reads:  [<artifact>@<system>, …]    # @system + artifact vocab: compass/templates/workflow.md
writes: [<artifact>@<system>, …]
pre:    <predicate>                 # gate BEFORE starting — refuse if false (task-internal; the workflow inherits it)
post:   <predicate>                 # done ∧ good — a workflow step's `gate` cell IS this task's post
```
**Work** (the *how* — methodology; the ONLY prose a task carries):
1. <step>
2. …

**Handoffs:** upstream `<workflow>#<step>` · downstream `<role.task>` [| `<role.task>`]

## Refusal rules
- <hard never>

<!-- ═══════════════════════════════════════════════════════════════════════
The `gates` block is the machine-checkable half; **Work** is the prose half.
  · reads / writes  — `<artifact>@<system>` tokens (same vocab as workflow.md)
  · pre  — task-INTERNAL precondition. Load-bearing gates like freshness / wait-for-CI live
           HERE, structured, and the workflow "inherits" them (they are NOT in the workflow table).
           May reference frontmatter fields — (today − last_verified) <= freshness_window_days —
           and the `host` object — host.tool_capable (a capability gate, not an artifact status).
  · post — the completion predicate. The workflow's dispatch-graph `gate` column === this task's `post`.
           Mark JUDGMENT predicates `~`-prefixed with the evaluator: ~fix.proportional ⟨reviewer⟩ —
           a recorded verdict, not an auto-check. Mechanical predicates (ci.green · count == 0) are bare.
So every gate at BOTH tiers is a predicate: workflow (requires + step gate) AND task (pre + post).
Object + @system + role.task vocab: compass/templates/workflow.md. No cell is prose; methodology stays in **Work**.
═══════════════════════════════════════════════════════════════════════ -->
