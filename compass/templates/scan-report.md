---
id: SCAN-<BET-ID>
type: scan-report
status: living              # never proposed / approved — re-rendered each scan
bet_id: <BET-ID>
current_phase: <Product | Architecture | Build | Production Ready | GTM | Operate>
scanned_at: YYYY-MM-DD HH:MM UTC
scanner_version: 1
open_findings:
  critical: 0
  high: 0
  medium: 0
  low: 0
suppressed_findings: 0
blocking_advance: false
---

# Scan Report — <BET-ID> (<Bet Title>)

> Continuous quality scanner output. Findings, not failures. Re-render with `/scan <bet-id>`. Never hand-edited — the next `/scan` run will overwrite. Owners triage; the scanner informs.

**Scanned:** YYYY-MM-DD HH:MM UTC · **Current phase:** <phase> · **Mode:** strict | advisory (per `compass/config.yaml`)

## Summary

- **Open findings:** N total (X critical · Y high · Z medium · W low)
- **Suppressed:** N (linked below)
- **Blocking phase advance:** yes | no
- **Top patterns this scan:** <e.g., "missing runbook content", "stale moat analysis">

## Findings by phase

Each finding follows the canonical shape: severity · confidence · location · reason · fix · applies-to · suppressible. Findings are sorted within each phase by severity descending.

### Product

_No open findings in this phase._  OR  list findings below.

#### [CRITICAL] Brief unapproved

- **Phase:** Product
- **Severity:** Critical
- **Confidence:** High
- **Location:** `docs/bets/<BET-ID>/brief.md` (`status: proposed`)
- **Reason:** Brief status is `proposed`; no HITL approval recorded.
- **Fix:** Flip status to `approved` after HITL review, or amend the brief.
- **Applies to bet types:** all
- **Suppressible:** No (foundational gate).

### Architecture

_No open findings in this phase._

### Build

#### [HIGH] AC test coverage incomplete

- **Phase:** Build
- **Severity:** High
- **Confidence:** Medium
- **Location:** `docs/bets/<BET-ID>/stories/<story-id>/story.md` AC items vs. test files in `e2e/`
- **Reason:** 3 of 5 AC items have no matching test reference. Cross-checked against story AC list and Automation E2E commit log.
- **Fix:** Add E2E tests for the unmapped ACs, OR document in story DRI why AC is not test-covered (with risk acceptance).
- **Applies to bet types:** feature, architectural-initiative
- **Suppressible:** Yes (DRI justification required).

### Production Ready

#### [CRITICAL] Rollback not tested

- **Phase:** Production Ready
- **Severity:** Critical
- **Confidence:** High
- **Location:** `docs/bets/<BET-ID>/ops/*` DRI logs
- **Reason:** No DRI entry confirms rollback test in any environment.
- **Fix:** Test rollback in staging; log confirmation in ops DRI with date + outcome.
- **Applies to bet types:** all (except continuous-improvement)
- **Suppressible:** Yes, with HITL approval and risk acceptance.

#### [HIGH] Runbook content minimal

- **Phase:** Production Ready
- **Severity:** High
- **Confidence:** Medium
- **Location:** `docs/bets/<BET-ID>/runbook.md`
- **Reason:** File exists but only 12 lines; missing diagnostic steps section per runbook template.
- **Fix:** Expand runbook with ≥3 common symptoms and a diagnostic flow.
- **Applies to bet types:** all (except continuous-improvement)
- **Suppressible:** Yes (DRI justification required).

### GTM

_No open findings in this phase._

### Operate

_No findings — bet not yet in Operate phase._  OR  list findings.

## Suppressed findings

Findings the owner has accepted as risk or deemed not applicable. Suppression always logged in the bet's DRI with rationale.

| Finding | Severity | Suppressed by | Date | Rationale | DRI link |
|---------|----------|---------------|------|-----------|----------|
| <Title> | <sev> | <name> | YYYY-MM-DD | <justification> | `docs/bets/<BET-ID>/brief.md#DRI` |

If empty: _No suppressions._

## Owner actions

Choose one (and reflect the decision in the bet's DRI):

- [ ] **Resolve all open findings before advancing** (recommended)
- [ ] **Resolve Critical + High; accept Medium/Low as quality debt** (auto-logged in DRI)
- [ ] **Suppress Critical findings with justification** (requires HITL approval + risk-acceptance entry in DRI)

## Scan history

| Date | Version | Open (C / H / M / L) | Suppressed | Blocking | Triggered by |
|------|---------|----------------------|------------|----------|--------------|
| YYYY-MM-DD HH:MM | 1 | 1 / 1 / 0 / 0 | 0 | yes | `/scan <BET-ID>` |

---

_Living artifact — re-run `/scan <BET-ID>` to refresh. Auto-invoked at phase boundaries by `/build`._
