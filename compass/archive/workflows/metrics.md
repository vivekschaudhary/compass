# Workflow: /metrics

Top-down view: foundation → OKR → feature → story → engineering metrics. Shows bet outcomes (won/learning/inconclusive), trends, attention items.

## Trigger

- `/metrics` — all bets aggregate view
- `/metrics <epic-id>` — single-bet drill-down
- `/metrics --filter <window>` — time-bounded (all-time / current sprint / last quarter / custom)
- `/metrics --hygiene` — show hygiene % of total work

## Process

1. **Gather data:**
   - Read all bets from `docs/epics/` (including foundation)
   - **Read all `docs/epics/*/scan-report.md`** for findings posture (open/suppressed by severity, top patterns, trends)
   - Read cached snapshots from `docs/metrics/` (JSON for machine, MD for human)
   - Pull live metrics from MCP sources (Sentry, observability, analytics) when staleness matters
   - Pull PR / commit data via GitHub MCP
   - Pull ticket data via Jira/Linear MCP
2. **Compute aggregations:**
   - TL;DR at top: bet outcome rollup, **scanner posture (open/suppressed by severity)**, top trends, attention items
   - **Open findings roll-up** (see Output format below)
   - Per-bet drill-down (when filtered or `/metrics <epic-id>`)
   - Engineering metrics per story (PRs, merge time, review cycles, CI time, deploy success, test coverage, app perf)
   - DRI risk/issue rollups
3. **Surface trends** — always: deltas over the chosen window (including findings trends — Critical count, time-to-remediate)
4. **Cache snapshots** to `docs/metrics/<epic-id>-<date>.{json,md}`
5. **Auto-run `/dashboard`** to refresh `docs/dashboard.html` so the latest metrics snapshot is visible in the browser view. Skip only if `docs/foundation/product.md` is missing.

## Output format

```
🧭 Compass — Metrics
Window: <selected>

────────────────────────────────────────
TL;DR
────────────────────────────────────────
• 23 bets shipped: 14 won / 6 learning / 3 inconclusive (61% win rate)
• Open scanner findings: 47 across 12 active bets (3 critical, 12 high)
• Trends:
  - Review cycles ↑12% over 4 sprints
  - Deploy success steady at 98%
  - Hygiene work: 18% of capacity (↑ from 12% last quarter)
  - Critical findings ↓40% over 4 sprints
• Attention:
  - 2 briefs overdue for check-in
  - PROJ-127 learning rate above threshold (was a heavy bet)
  - 3 open P0 issues across active bets
  - 3 blocking-Critical findings on bets in Production Ready

────────────────────────────────────────
Compass — Open Findings
────────────────────────────────────────
Total: 47 across 12 active bets
• Critical: 3 · High: 12 · Medium: 22 · Low: 10
Most common findings:
  • Runbook missing (8 bets)
  • SLO undefined (6 bets)
  • Privacy review incomplete (4 bets)
Suppressed (accepted risk): 12
  • Mostly: cost monitoring deferred for internal-only bets
Time-to-remediate (median): 4 days
Trend: critical findings ↓40% over 4 sprints

────────────────────────────────────────
Foundation
────────────────────────────────────────
Product Bet (v1, approved 2026-01-15)
  ├─ Status: measuring
  ├─ Metric: <name> — <current> vs <target>
  └─ OKR Bets:
       ├─ Q2 2026: Activation
       │    ├─ Outcome: measuring
       │    ├─ Feature Bets:
       │    │    ├─ PROJ-42 — won
       │    │    ├─ PROJ-43 — learning
       │    │    └─ PROJ-44 — measuring
       │    └─ Engineering rollup:
       │         • 14 PRs merged
       │         • Avg merge time: 2.3 days
       │         • Avg review cycles: 1.8
       │         • Test coverage: 84%
       │         • Deploy success: 100%
       │         • p95 latency: 320ms
       └─ Q2 2026: Retention
            └─ ...

Architecture Bet (v1, approved 2026-01-20)
  └─ Architectural Initiative Bets:
       └─ ...
```

## DRI integration

Cross-bet DRI surfacing:
- Open risks across bets (by area, by impact)
- Open issues (by severity, by area)
- Decision velocity per sprint
- Reversed decisions count (strategy churn signal)
- P0/P1 alerts requiring immediate attention

## Cron-driven refresh

Snapshots refresh on cron schedule (defined per bet's check-in cadence). Manual `/metrics` always pulls live.

## Notes

- Different from `/status` — `/status` is current operational state; `/metrics` is outcomes and trends
- Hygiene-driven view: `/metrics --hygiene` shows the % of work that's bet-driven vs maintenance
- Tree drill-down by default; flat list available via `--flat`
