---
id: ROLE-ACTIVITY-LOG-<role>
type: role-activity-log
status: living                     # rolling, append-only; never finalized
altitude: role                     # source data for role-altitude retros per [fractal-retro] (canon.md v0.3.17)
role: <agent-name>                 # e.g., engineer, reviewer, pm, delivery-manager, researcher
parent_artifact: null              # role activity is cross-bet by design
created: YYYY-MM-DD
last_appended: YYYY-MM-DD
# Lives at docs/role-activity/<role>.md in consuming projects (NOT in the framework — this template
# ships at compass/templates/role-activity-log.md; projects copy it into their docs/role-activity/<role>.md).
# A role-altitude retro reads this file to synthesize patterns in how an agent operates over time.
---

# Role Activity Log — <Role Name>

> **Rolling, append-only.** Status: `living`. Never edited after publication — new patterns get NEW entries, never revisions to old ones. A future `/retro --altitude=role --role=<role>` reads this log and synthesizes patterns into an archived role retro at `docs/retros/role-<role>-<NNN>.md`.

## Purpose

Captures **patterns the `<role>` agent surfaces mid-task** — friction, repeated decisions, recurring drift, novel constraints learned. The agent writes here whenever a pattern is acute enough to warrant naming (not for routine output; that lives in the artifact the task produces). Cadence: ad-hoc append; retro fires every N entries per the agent's own discipline (≥5 is the framework default per `[fractal-retro]`).

**Source for:** role-altitude retros (synthesized via `/retro --altitude=role --role=<role>`).

**NOT the same as:** the agent's task outputs (those land in artifacts like `brief.md`, `review.md`, `architecture.md`); DRI logs (those live in artifacts, scoped per-bet). This log is **agent-level + cross-bet**.

## Entry shape

Each entry uses this structure. Append-only.

```
### YYYY-MM-DDTHH:MM — <short title naming the pattern surfaced>

**Context:** what triggered the entry — which bet, which task, what happened. Specific enough that a future retro can re-find the evidence.

**Pattern surfaced:** the named pattern, in `[lower-kebab-case]` if it might be codification-worthy; otherwise plain prose. Examples: `[story-claim-trust-without-primary-doc-verification]`, "Engineer repeatedly cites bet architecture that's missing a load-bearing decision."

**Evidence:** the artifact(s) where this manifests. Links to PR, file path + line, or specific commit.

**Instance count (in this log):** how many times this pattern has appeared in THIS log's history. 1 = first instance; 2+ = recurring → flag for the next role-altitude retro to consider for codification.

**Recommended action (optional):** if the pattern suggests a specific fix or escalation, name it. Otherwise leave empty — the retro synthesis is where decisions happen.
```

## Discipline rules

- **Append-only.** Never edit a past entry. If a pattern resolves (no longer recurring), the NEXT retro captures that in its "Common patterns" or "Drift signals resolved" section; don't go back and mark old entries.
- **Specific over abstract.** "Engineer redid PR #42 5x because of CI flakiness on env-var resolution" beats "Engineer struggles with build-output verification."
- **Cite, don't assert.** Every entry has at least one Evidence link.
- **Cross-bet by design.** This log spans all bets the agent has worked on. Per-bet patterns belong in the bet's DRI log.
- **Counter discipline.** The agent self-flags when instance count crosses a threshold (default: ≥3 for "consider for codification at next retro"; ≥5 for "promote to canon if shape is stable").

## Entries

<!-- Append new entries below. Most recent at the bottom. -->

### Example — first entry shape (delete in real logs)

### 2026-06-06T14:32 — `[story-claim-trust-without-primary-doc-verification]` recurring on Next.js claims

**Context:** Engineer addressed bet PROJ-42's story story-3; story cited "Next.js 16 middleware uses `request.geo`" as load-bearing. Reviewer flagged BLOCKER on PR #18: the API was renamed in 16.0.0-rc.

**Pattern surfaced:** `[story-claim-trust-without-primary-doc-verification]` — Engineer accepted the story's framework claim without verifying against current Next.js docs. The story was written 2 weeks before the implementation; framework changed in between.

**Evidence:** docs/bets/PROJ-42/stories/story-3.md (the load-bearing claim); PR #18 review comment from Codex.

**Instance count (in this log):** 3 (prior: 2026-05-22 PROJ-31 story-2; 2026-05-29 PROJ-38 story-1).

**Recommended action:** Surface at next role-altitude Engineer retro as codification-ready (3rd instance); propose Engineer-side gate that requires the story's framework claims to be verified before opening PR.

---

_Append new entries above this line. Run `/retro --altitude=role --role=<role>` periodically to synthesize patterns into an archived retro._
