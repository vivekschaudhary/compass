---
id: WORKFLOW-RUN-LOG-<workflow>
type: workflow-run-log
status: living                     # rolling, append-only; never finalized
altitude: workflow                 # source data for workflow-altitude retros per [fractal-retro] (canon.md v0.3.17)
workflow: <workflow-name>          # e.g., build, fix, ops, triage, setup-product, create-brief
parent_artifact: null              # workflow runs span bets by design
created: YYYY-MM-DD
last_appended: YYYY-MM-DD
# Lives at docs/workflow-runs/<workflow>.md in consuming projects.
# A workflow-altitude retro reads this file to synthesize patterns in how the workflow executes over time.
---

# Workflow Run Log — `/<workflow>`

> **Rolling, append-only.** Status: `living`. Never edited after publication. A future `/retro --altitude=workflow --workflow=<workflow>` reads this log and synthesizes patterns into an archived workflow retro at `docs/retros/workflow-<workflow>-<NNN>.md`.

## Purpose

Captures **per-run metadata + patterns surfaced during the run** for `/<workflow>`. Distinct from per-bet artifacts (which capture WHAT the workflow produced for ONE bet) — this log captures HOW the workflow ran ACROSS BETS over time. The workflow itself appends one entry per run; patterns surface from the time-series view.

**Source for:** workflow-altitude retros (synthesized via `/retro --altitude=workflow --workflow=<workflow>`).

**Highest-value workflow to log first:** `/build` — the Engineer → Reviewer → Engineer iteration cycle. PR-redo counts, dispute counts, freshness-check refusals, framework-registration-check catches all become time-series data; the workflow retro surfaces patterns like "Engineer redoes PRs 5x in 4+ instances" (the v0.3.17 trigger pattern itself).

## Entry shape

Each entry captures one workflow invocation. Append-only.

```
### YYYY-MM-DDTHH:MM — <bet/story ID> — <one-line outcome>

**Triggered by:** <user invocation | cron | other workflow's auto_invokes>
**Bet/story:** <BET-ID> / <story-id> (or `n/a` for hygiene/ops)
**Engineer agent:** <claude | codex | etc.>      # who implemented (build/fix workflows)
**Reviewer agent:** <codex | gemini | etc.>      # who reviewed (build/fix workflows)
**Workflow phases reached:** <e.g., 1→5 of 5; or 1→3 with refusal at 4>
**Time-to-merge:** <duration if shipped; "incomplete" / "refused" otherwise>

**Run metrics (workflow-specific — adapt the table per workflow):**

| Metric | Value |
|---|---|
| PR-redo cycles (build: Engineer ↔ Reviewer iterations) | <N> |
| BLOCKER findings | <N> |
| ISSUE findings | <N> |
| NIT findings | <N> |
| Disputes raised | <N> |
| Freshness-check refusals | <N> |
| Framework-registration-check catches | <N> |

**Patterns surfaced this run (if any):** name patterns observable WITHIN this single run. Most runs have none; some surface a new pattern or a recurrence of an existing one (link to first instance).

**Outcome:** shipped | refused | abandoned | escalated-to-pm
```

## Discipline rules

- **One entry per workflow run.** Not per phase; not per finding. The run is the unit.
- **Append-only.** Never edit past entries. If a run was later retroactively reclassified (e.g., shipped but later rolled back), the rollback gets its own entry, not an edit to the original.
- **Run metrics are mechanical.** Numbers come from the workflow's own state — PR comment count, CI status events, refusal log. Avoid subjective metrics here; those belong in role-activity logs.
- **Patterns mid-run are agent-authored.** When the workflow detects a recurring pattern (e.g., 3rd refusal in a row on the same freshness check), the agent writes a `[freshness-window-too-tight]` line in the "Patterns surfaced" field — same shape as role-activity entries.
- **Cross-workflow patterns surface at retro time, not entry time.** If `/build` and `/fix` share a pattern, the workflow retro for each catches it locally; the project-altitude retro promotes it cross-workflow.

## Entries

<!-- Append new entries below. Most recent at the bottom. -->

### Example — first entry shape (delete in real logs)

### 2026-06-06T16:45 — PROJ-42 / story-3 — shipped after 5 PR-redo cycles

**Triggered by:** user invocation of `/build PROJ-42-3`
**Bet/story:** PROJ-42 / story-3
**Engineer agent:** claude
**Reviewer agent:** codex
**Workflow phases reached:** 1→5 of 5 (full)
**Time-to-merge:** 4h 12m

**Run metrics:**

| Metric | Value |
|---|---|
| PR-redo cycles | 5 |
| BLOCKER findings | 3 (initial review); 1 (round 3); 1 (round 4) |
| ISSUE findings | 7 (round 2); 4 (round 5) |
| NIT findings | 12 (round 5) |
| Disputes raised | 0 |
| Freshness-check refusals | 0 |
| Framework-registration-check catches | 1 (round 3, missing functions-config-manifest.json entry) |

**Patterns surfaced this run:** `[story-claim-trust-without-primary-doc-verification]` — Engineer's first BLOCKER was a Next.js framework claim from the story that no longer matched current docs. **3rd instance** in role-activity log; flag for next Engineer retro.

**Outcome:** shipped

---

_Append new entries above this line. Run `/retro --altitude=workflow --workflow=<workflow>` periodically to synthesize patterns into an archived retro._
