# Workflow: /plan

Maintains the **living project plan** — a time-bound schedule derived from per-bet artifacts, refreshed whenever any phase advances. The plan is how "each phase's output feeds the next phase's plan" becomes auditable.

**This is a derived artifact.** `/plan` reads per-bet records (brief, architecture, stories, build state) and rolls them up. It does **not** make scheduling decisions on its own — it reflects the decisions encoded in the upstream artifacts. There is no HITL gate on `/plan`; HITL lives in the upstream phases.

## Trigger

- **Manual:** `/plan` whenever you want the schedule refreshed — typically after a brief is approved (refines scope estimate), after architecture is approved (refines effort), after a build PR merges (writes actuals).
- **Cron:** configurable per `compass/config.yaml` for periodic refresh.

## State detection

| State                                          | Action                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `docs/foundation/portfolio.md` missing or not `approved` | **Refuse.** No MVP wedge to schedule yet. Tell user to run `/create-bet-portfolio` first. |
| `docs/foundation/plan.md` missing, portfolio `approved` | **Seed run.** Initial coarse dates from dep graph + default durations. |
| `docs/foundation/plan.md` exists               | **Refresh run.** Re-read all artifacts, refine dates, log what changed. |

## Process

1. **Verify gate:** `docs/foundation/portfolio.md` exists with `status: approved`. Otherwise refuse.
2. **State detection** per table above.
3. **Load Delivery Manager agent** (`compass/agents/delivery-manager.md`) — Delivery Manager owns rolling project scheduling. (Migrated + renamed v0.3.15; legacy role file at `compass/roles/project-manager.md` retained during v0.3.x grace period.)
4. **Read all current artifacts:**
   - `docs/foundation/portfolio.md` — bet list, dependency graph, parallel-build candidates.
   - For each MVP bet:
     - `docs/bets/<bet-id>/brief.md` — status, `estimate` frontmatter, `portfolio_stub`, `depends_on`, `parallel_with`.
     - `docs/bets/<bet-id>/architecture.md` if exists — effort refinement.
     - `docs/bets/<bet-id>/stories/<story-id>/story.md` for each story if exists — story count + size.
   - Build state via git log + GitHub MCP if available (PR open/merged dates → `actual_start`/`actual_end`).
5. **Compute date refinements** using the estimate model below. For any change, write to the bet's `brief.md` frontmatter `estimate` block.
6. **Write/update `docs/foundation/plan.md`** using `compass/templates/plan.md`:
   - Currently in flight
   - Next up (unblocked, not started)
   - Blocked
   - Done
   - Full schedule table
   - Calendar view (week-by-week markdown grid)
   - Refinement log — append one row per date that moved this run
7. **Bump version** in plan frontmatter; set `last_refreshed: <today>`.
8. **Auto-run `/dashboard`** to refresh `docs/dashboard.html` so the latest plan is visible in the browser view.
9. **No HITL gate.** Plan is `status: living` always.

## Estimate model

The per-bet `estimate` frontmatter sharpens as each phase lands:

| Trigger | Refinement | Confidence after |
|---|---|---|
| **Stub brief** (portfolio created) | Default `duration_weeks: 2`; `estimated_start` derived from dep graph position | `low` |
| **Brief promoted + approved** | Scope size from brief (small/medium/large) → `duration_weeks: 1 / 2 / 4` | `medium` |
| **Bet architecture approved** | Add `+1` week if `architecture_required: true`; refine if architecture flags complexity | `medium-high` |
| **Stories created** | Story count × per-story size (default 3 days each) → recomputed `duration_weeks` | `high` |
| **First build PR merged** | Write bet's `actual_start` if not set; recompute remaining duration | `high` |
| **All bet stories merged** | Write bet's `actual_end`; downstream bets' `estimated_start` shifted by (actual_end − estimated_end) | n/a (bet done) |

Each refinement writes the bet's `brief.md` frontmatter:

```yaml
estimate:
  duration_weeks: <N>
  confidence: low | medium | high
  refined_by: stub | brief-approval | architecture | stories | build-actuals
  refined_at: YYYY-MM-DD
```

## Verification (mandatory)

- [ ] Every MVP bet in the portfolio has a row in `docs/foundation/plan.md`'s full schedule
- [ ] Every row has `estimated_start` AND `estimated_end` (even if coarse — never empty)
- [ ] Refinement log has an entry for every date that moved since the previous version, with the triggering artifact named (file path + what changed)
- [ ] In flight / Next up / Blocked / Done sections reflect current bet statuses correctly
- [ ] Status: `living` (never `proposed` or `approved`)
- [ ] Frontmatter `last_refreshed: <today>` and `version` incremented

## Output

- `docs/foundation/plan.md` — refreshed or seeded
- Each affected bet's `docs/bets/<bet-id>/brief.md` frontmatter `estimate` block updated

## Freshness

The plan can go stale between manual `/plan` invocations. `/status` (which reads `plan.md`) surfaces staleness via the `last_refreshed` timestamp — if it's > 3 days old during active development, that's a flag to re-run `/plan`. Cron-driven refresh per `compass/config.yaml` is the recommended mechanism for keeping freshness automatic.

## Refusal cases

- `docs/foundation/portfolio.md` missing or not approved — refuse with pointer to `/create-bet-portfolio`
- No bets exist in portfolio (empty bet list) — refuse with clarifying message

## Notes

- **Derived, not authored.** `/plan` is to per-bet brief/architecture/stories what `/status` is to the project: a roll-up view, not the source of truth. Hand-editing `plan.md` is anti-pattern — the next `/plan` run will overwrite it.
- **Date estimation is coarse on purpose.** The point is to give the team a calendar starting point and a slip-detection mechanism, not to commit to dates. Confidence levels (low/medium/high) signal how much weight to give each estimate.
- **The refinement log is the audit trail** for "output → input" causality. Every date movement names the artifact that triggered it.
