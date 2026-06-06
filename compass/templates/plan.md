---
id: PROJECT-PLAN
type: plan
version: 1            # bumps on every /plan refresh
status: living        # never "proposed" or "approved" — never finalized
created: YYYY-MM-DD
last_refreshed: YYYY-MM-DD
parent: FOUNDATION-PRODUCT
---

# Project Plan

> Living, time-bound schedule for the MVP bet wedge and beyond. Derived from per-bet artifacts; refreshed by `/plan` (run manually or via cron per `compass/config.yaml`). Never hand-edited — re-run `/plan` to refresh.

**Last refreshed:** YYYY-MM-DD (version <N>)

## Currently in flight

Bets with `actual_start` populated and `actual_end` empty.

| Bet | Title | Phase | Actual start | Estimated end | Owner |
|-----|-------|-------|--------------|---------------|-------|
| <BET-ID> | <Title> | <brief / arch / story / build> | YYYY-MM-DD | YYYY-MM-DD | <role> |

## Next up (unblocked, not yet started)

Bets whose `depends_on` are all `actual_end`-populated, but the bet itself hasn't started.

| Bet | Title | Estimated start | Estimated duration | Confidence |
|-----|-------|-----------------|---------------------|------------|
| <BET-ID> | <Title> | YYYY-MM-DD | <N> weeks | low / medium / high |

## Blocked

Bets waiting on dependencies, HITL approval, or external input.

| Bet | Title | Blocked by | Since | Mitigation |
|-----|-------|------------|-------|------------|
| <BET-ID> | <Title> | <dep bet ID / HITL on artifact / external> | YYYY-MM-DD | <plan to unblock> |

## Done

Bets with `actual_end` populated.

| Bet | Title | Actual end | Duration (actual vs estimated) |
|-----|-------|------------|-------------------------------|
| <BET-ID> | <Title> | YYYY-MM-DD | <N> weeks (vs <M> estimated) |

## Full schedule

Every MVP bet with all date columns. Source of truth for downstream tools.

| Bet | Title | Depends on | Est. start | Est. end | Actual start | Actual end | Duration (wk) | Confidence | Last refined by |
|-----|-------|------------|------------|----------|--------------|------------|---------------|------------|-----------------|
| <BET-ID> | <Title> | [<ids>] | YYYY-MM-DD | YYYY-MM-DD | — | — | 2 | low | stub |

## Calendar view

Coarse week-by-week visualization. Each bet appears in the weeks it's estimated/actual to be in flight.

```
Week of:        | Wk 1 | Wk 2 | Wk 3 | Wk 4 | Wk 5 | Wk 6 |
----------------|------|------|------|------|------|------|
BET-A (auth)    |  ██  |  ██  |      |      |      |      |
BET-B (core)    |  ██  |  ██  |  ██  |      |      |      |
BET-C (persist) |      |      |  ██  |  ██  |      |      |
BET-D (notify)  |      |      |      |      |  ██  |  ██  |
```

## Refinement log

Each time a date moves, write a line here naming the triggering artifact. This is how "output → input" becomes auditable.

| Date | Bet | Field changed | From | To | Triggered by |
|------|-----|---------------|------|-----|--------------|
| YYYY-MM-DD | <BET-ID> | estimated_end | YYYY-MM-DD | YYYY-MM-DD | brief-approval (docs/bets/<id>/brief.md v2) |
| YYYY-MM-DD | <BET-ID> | actual_start | — | YYYY-MM-DD | build PR #N opened |

## Risks to plan

Things that could shift the schedule materially.

- **<risk>** — likelihood / impact — mitigation

## DRI Log

### Decisions

- [YYYY-MM-DD] [Delivery Manager] <scheduling decision> — rationale: <why> — area: <tag>

### Risks

- [YYYY-MM-DD] [Delivery Manager] <plan-level risk> — likelihood — impact — mitigation

### Issues

- [YYYY-MM-DD] [Delivery Manager] <issue> — severity — owner — status

---

_Living artifact — re-run `/plan` to refresh. Cron-driven refresh available per `compass/config.yaml`._
