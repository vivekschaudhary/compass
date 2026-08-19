---
id: <BET-ID>            # e.g., PROJ-42 (Jira-style)
type: feature           # feature | okr | tech-debt | continuous-improvement | architectural-initiative
status: proposed        # proposed | approved | in-build | shipped | measuring | won | learning | inconclusive
priority: P1            # P0 | P1 | P2 | P3
parent: <BET-ID>        # optional parent OKR or foundational bet
portfolio_stub: false   # true if created by /create-epics and not yet promoted via /create-brief. Cleared on promotion.
depends_on: []          # list of bet IDs this bet depends on (for portfolio dependency graph + sequencing)
parallel_with: []       # list of bet IDs this bet can be built in parallel with
architecture_required: auto    # true | false | auto
created: YYYY-MM-DD
author: PM
sources:
  - <link>
key_metric:
  name:
  baseline:
  target:
  source:
guardrails:
  - name:
    threshold:
measurement_window_days: 30
check_in_cadence: weekly        # weekly | biweekly | monthly
sprint_target: <sprint-id>      # optional
area_tags: [frontend, backend, mobile, payments, etc.]
estimate:                       # refined by /plan as phases complete (do not hand-edit)
  duration_weeks: 2
  confidence: low               # low | medium | high
  refined_by: stub              # stub | brief-approval | architecture | stories | build-actuals
  refined_at: YYYY-MM-DD
---

# <Title>

## Problem

<One paragraph. The user pain. Avoid jumping to a solution.>

## User

<Specific role / segment / job-to-be-done.>

## Why this matters

<Strategic context. Why is this on the roadmap and not something else?>

## Hypothesis (the bet)

<If we ship <X>, then <user> will <outcome>, measured by <metric> reaching <target> within <window>.>

## Defensibility (optional for feature bets)

If this feature ships and works, does it strengthen any moat? Examples:
- Increases switching costs by adding workflow embedding
- Generates proprietary usage data
- Strengthens brand in a specific user segment

If no — that's fine, not every feature contributes to defensibility. But name it explicitly rather than skip.

**Moat impact (one line):**

## Scope

### In scope
-

### Out of scope
-

## Open questions for Researcher

-

## Research findings

_To be filled by Researcher (or in a separate `research.md`)._

## User pain input (from Support)

_To be filled by Support._

## Stories

_Decomposed into the full story set (the complete backlog) via `/create-story`. Each lives under `stories/<story-id>/`; built one at a time via `/build`._

## Scan summary

Latest scanner posture for this bet. Full report at `docs/epics/<epic-id>/scan-report.md`. Re-run `/scan <epic-id>` to refresh. Auto-invoked at phase boundaries by `/build`.

- **Last scanned:** YYYY-MM-DD HH:MM UTC
- **Current phase:** <phase>
- **Open findings:** N (X critical · Y high · Z medium · W low)
- **Suppressed:** N
- **Blocking advance:** yes | no
- **Full report:** [`scan-report.md`](./scan-report.md)

## Check-in log

_Populated automatically by `/measure` cron._

## DRI Log

### Decisions
- [YYYY-MM-DD] [PM] <decision> — rationale: <why> — area: <tag> — alternatives: <what> — reversibility: <easy|medium|hard|one-way>

### Risks
- [YYYY-MM-DD] [PM] <risk> — likelihood — impact — mitigation — area

### Issues
- [YYYY-MM-DD] [PM] <issue> — severity — owner — status — area

---

_Approved by: <name> on <date>_
