# Workflow: /measure

Cron-driven measurement of a bet's metrics. Pulls data via MCP, updates the brief, transitions outcome status when measurement window closes.

## Trigger

- Cron: framework auto-runs per bet's `check_in_cadence` (weekly / biweekly / monthly)
- Manual: `/measure <epic-id>` to check a specific bet on demand

## Owner

Enterprise/Solution Architect is accountable for cron health (per `compass/config.yaml` cron_owner).

## Process

### Phase 1 — gate

1. **Verify bet eligible:**
   - Bet status is `shipped` or `measuring` (all stories shipped + CI/CD complete)
   - Brief has measurement plan (primary metric, source, target, window, cadence)
2. **If not eligible:** skip silently (cron) or report (manual)

### Phase 2 — pull data

3. **Read primary metric** via MCP source (Sentry / analytics / DB query / etc.)
4. **Read guardrail metrics** via same sources
5. **If data unavailable:**
   - Log issue in brief DRI
   - Per config (`measurement.data_unavailable_action`):
     - `hitl_flag` (default): flag to human, hold status as `measuring`
     - `extend`: extend window by 50%, retry next cron
     - `mark_inconclusive`: flip status to `inconclusive` with reason

### Phase 3 — interim check-in

If measurement window not yet closed:
6. **Append check-in entry** to brief's "Check-in log" section:
   ```
   - [DATE] Check-in #N
     - Primary metric: <current> (was <baseline>, target <target>)
     - Guardrails: <status of each>
     - Trend: on-track / at-risk / off-track
   ```
7. **Update `docs/metrics/<epic-id>-<date>.json`** snapshot
8. **If trend `off-track` or guardrails breached:** flag to PM via configured channel

### Phase 4 — final measurement

If measurement window closes:
9. **Compute final outcome:**
   - **Won** — primary metric met or exceeded target; no guardrail breached
   - **Learning** — primary metric did not meet target (or guardrail breached); requires "what we learned" entry
   - **Inconclusive** — data quality insufficient (sample too small, confounding factors, etc.)
10. **Flip bet status** to `won` / `learning` / `inconclusive`
11. **Prompt PM** for "what we learned" entry if status is `learning`:
    - Mandatory paragraph
    - Becomes input to surfacing-recent-learnings in `/metrics`
11a. **Soft prompt — stack learnings (for the next Compass project).** When outcome is `learning` OR `won` with notable technical surprises along the way (Architect or Engineer flagged DRI Issues during the bet that turned into hard-won knowledge), ask the PM/Architect/Engineer:

    > *"Any stack / tooling insights from this bet worth capturing as `docs/playbooks/<slug>.md` for future Architects? Examples: tool-combination gotchas you spent hours debugging, version-pin discoveries, configuration patterns that aren't obvious from vendor docs, region / SKU / plan-tier caveats."*

    Soft prompt, **not** a gate — outcome resolves regardless. The point is to capture the learning while it's freshest (the day the bet resolves), not to force a playbook for every bet. If yes, draft using `compass/templates/playbook.md`; tag `stack_combo` so future `/setup-foundation-architecture` signal-consultation runs (category 5) surface it; commit to `docs/playbooks/`. If no, log a DRI Decision: *"no playbook needed — <reason>"* (e.g., "all learnings already captured in existing playbook X" or "no novel tool-combination friction").
12. **DRI log** final decision with rationale (data → outcome)
13. **Notify** stakeholders via configured channel (sprint comms next cycle will surface)
14. **Roll up** to parent bet's metrics (if `parent:` set in frontmatter)

## Output

- Brief updated with check-in log entries OR final outcome
- `docs/metrics/<epic-id>-<date>.{json,md}` snapshot
- Notifications dispatched
- Parent bet metrics updated (rollup)

## DRI logging

- **Decisions:** outcome classification, "what we learned" entry — rationale
- **Risks:** of misclassification (false won/learning), data quality — likelihood + impact
- **Issues:** broken telemetry, missing instrumentation — severity + owner

## Notes

- Cron failures escalate to Enterprise/Solution Architect (cron owner)
- "Learning" is positive language — losses aren't shameful, they're data
- "Inconclusive" is different from "learning" — it means we couldn't tell, not that we tried and didn't win
- Check-in cadence is faster than measurement window — long bets get short check-ins
