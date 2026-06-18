# Workflow: /scan

Continuous quality scanner for the product lifecycle. Modeled on Snyk / Semgrep / GitHub Advanced Security — produces **findings, not failures**. Severity + confidence + location + reason + fix per finding. Owners decide; the scanner informs.

## Trigger

- `/scan <bet-id>` — scan one bet
- `/scan --all` — aggregate posture across all active bets (one report per bet + aggregate roll-up in chat)
- `/scan --phase <name>` — single-phase scan across all bets (e.g., `/scan --phase production-ready`)
- **Auto-invoked** by `/build` at phase boundaries (Build → Production Ready, → GTM, → Operate)
- **Cron-invoked** per `compass/config.yaml` `scanner.cron`

## State detection

| State                                          | Action                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Bet ID not provided AND no `--all` / `--phase` | **Refuse.** Tell user to specify a bet or use `--all`.                    |
| Bet doesn't exist at `docs/bets/<bet-id>/`     | **Refuse.** Pointer to `/create-brief` or `/create-bet-portfolio`.        |
| Previous scan report exists                    | Preserve existing suppressions; re-render report; bump version.           |
| No previous scan report                        | First scan — seed report with full check sweep.                           |

## Process

1. Verify bet exists (or `--all` mode).
2. **Load Scanner agent context** (`compass/agents/scanner.md`, migrated v0.3.32).
3. **Determine current phase** from bet frontmatter + artifact statuses:
   - Brief exists, status `proposed` → **Product** (in review)
   - Brief `approved`, no architecture → **Architecture** (or Build if arch declined)
   - Architecture `approved`, stories not all shipped → **Build**
   - Stories shipped, runbook/SLO missing → **Production Ready**
   - Production Ready complete, no GTM artifacts → **GTM**
   - GTM complete OR bet `shipped`/`measuring` → **Operate**
4. **Read artifacts + MCP data** per the catalog below.
5. **Run checks for current phase + all prior phases** (later phases not yet entered are reported as "phase not yet active").
6. **Preserve suppressions** from previous report. Flag stale ones (rationale > 90 days old OR underlying check changed).
7. **Compute confidence** per finding using the three signals (content depth, source freshness, cross-artifact corroboration) — state the reasoning briefly in the Reason field.
8. **Write `docs/bets/<bet-id>/scan-report.md`** from `compass/templates/scan-report.md`. Update frontmatter (`scanned_at`, `current_phase`, `open_findings` counts, `suppressed_findings`, `blocking_advance`).
9. **Append a Scan history row** in the report.
10. **Output summary in chat** — open-findings counts by severity, blocking status, link to full report.
11. **Log DRI Issues** on the bet for any Critical / High findings (severity-matched).
12. **Auto-run `/dashboard`** to refresh `docs/dashboard.html` so the latest findings are visible in the browser view. Skip only if `docs/foundation/product.md` is missing (dashboard would refuse anyway).
13. **No HITL gate on the scan itself.** HITL only applies to suppressions of Critical findings.

## Verification (mandatory)

- [ ] Scan report exists at `docs/bets/<bet-id>/scan-report.md` with frontmatter populated
- [ ] Every finding has severity + confidence + location + reason + fix (no blank fields)
- [ ] Reason field states the confidence-derivation reasoning briefly
- [ ] Suppressed findings preserved from previous report (with original metadata + suppressor + rationale)
- [ ] `blocking_advance: true` iff any unresolved Critical exists per `compass/config.yaml` `scanner.per_phase` mode
- [ ] DRI Issues logged on the bet for Critical / High findings
- [ ] Status: `living`
- [ ] Scan history row appended

---

## Check catalog (single source of truth)

Each check has: ID · phase · severity · confidence-derivation hints · suppressibility · applies-to bet types. New checks add here; the Scanner role does not improvise.

### Phase 1: Product (Discovery)

| ID | Title | Severity | Suppressible | Applies to |
|---|---|---|---|---|
| PROD-01 | Brief unapproved | Critical | No | all |
| PROD-02 | Vague user definition | High | Yes (DRI) | all |
| PROD-03 | Scope undefined (out-of-scope placeholder) | High | Yes (DRI) | all |
| PROD-04 | Untestable hypothesis (no metric / baseline / target / source) | Critical | No | feature, okr, architectural-initiative |
| PROD-05 | Insufficient research evidence (<3 cited sources) | Medium | Yes (owner accept) | all |
| PROD-06 | Defensibility unanalyzed (moat section missing) | Medium / High | Yes (DRI) — High for foundational-product | foundational-product (High), feature (Medium) |
| PROD-07 | Approval not recorded (no name + date in DRI) | High | No | all |

### Phase 2: Architecture

| ID | Title | Severity | Suppressible | Applies to |
|---|---|---|---|---|
| ARCH-01 | Architecture decision undocumented (no arch doc AND no DRI decline) | Critical | No | feature, architectural-initiative, foundational-architecture |
| ARCH-02 | Decision ambiguous (Decision section > 1 paragraph or unclear posture) | High | Yes (DRI) | as above |
| ARCH-03 | Alternatives not considered (<2 real, non-strawman) | High | Yes (DRI) | as above |
| ARCH-04 | Reversibility not assessed (no reversibility tag per decision) | Medium | Yes (owner accept) | as above |
| ARCH-05 | Cross-system review missing (Enterprise Architect sign-off absent) | High | Yes (DRI) — non-suppressible if touches new external service | as above |
| ARCH-06 | Test strategy undefined | Medium | Yes (DRI) | as above |
| ARCH-07 | Rollout plan missing | Medium | Yes (DRI) — High if feature flag / migration / staged rollout implied | as above |

### Phase 3: Build

| ID | Title | Severity | Suppressible | Applies to |
|---|---|---|---|---|
| BUILD-01 | AC test coverage incomplete (AC items without test references) | High | Yes (DRI per AC) | feature, architectural-initiative |
| BUILD-02 | Test layer coverage incomplete (missing unit / API / component per role definition) | High | Yes (DRI) | feature, architectural-initiative |
| BUILD-03 | E2E coverage gap (Automation E2E missing for AC user flows) | High | Yes (DRI) | feature |
| BUILD-04 | Open review BLOCKERs on PRs | Critical | No | all |
| BUILD-05 | Security review skipped (touches auth/PII/payments/secrets/external input/sessions) | Critical | No (non-suppressible) | any bet touching above |
| BUILD-06 | Architecture drift undetected (Architect compliance check absent on PR) | High | Yes (DRI) | feature, architectural-initiative |
| BUILD-07 | Performance budget exceeded (budget defined in arch doc, exceeded in CI) | High | Yes (DRI) | as above |
| BUILD-08 | Per-surface vertical test missing (`[per-surface-vertical-test]`) — a data surface has no test traversing the real auth→authz(RLS)→render vertical on a prod-like build; mocked-auth / service-role / dev-build only | High | Yes (DRI per surface) | feature, architectural-initiative |
| BUILD-09 | Test-data cleanup missing (`orphaned-test-data`) — a data-mutating E2E test has no teardown deleting or soft-deleting the records it creates; story lacks the cleanup AC | Medium | Yes (DRI) | feature, architectural-initiative |

### Phase 4: Production Ready (new — currently silent in Compass)

| ID | Title | Severity | Suppressible | Applies to |
|---|---|---|---|---|
| PROD_READY-01 | Runbook missing or minimal (`docs/bets/<id>/runbook.md` absent or < template threshold) | Critical | Yes (DRI) — non-suppressible for foundational-architecture | all except continuous-improvement |
| PROD_READY-02 | SLO undefined (`docs/bets/<id>/slo.md` missing SLI / target / error budget / alert thresholds) | Critical | Yes (HITL approval) | all except continuous-improvement |
| PROD_READY-03 | Monitoring not wired (observability MCP confirms no dashboards / alerts) | Critical | Yes (HITL approval) | all production-bound bets |
| PROD_READY-04 | Rollback untested (no DRI entry confirming non-prod test) | Critical | Yes (HITL approval) | all except continuous-improvement |
| PROD_READY-05 | On-call unprepared (no DRI ack from on-call on runbook) | High | Yes (DRI) | all production-bound bets |
| PROD_READY-06 | Backup unverified (new data store + no backup/restore test in ops DRI) | Critical | No (non-suppressible) | bets introducing new data stores |
| PROD_READY-07 | Cost monitoring absent (no cost threshold alerts configured) | Medium | Yes (owner accept) — High if cost guardrail in brief | all production-bound bets |
| PROD_READY-08 | Compliance unverified (privacy / security / regulatory check for data category not complete) | Critical | No (non-suppressible) for PII / HIPAA / financial data | bets handling regulated data |
| PROD_READY-09 | Vendor capability claims unverified for deployment context (every vendor feature the architecture depends on — DB extensions, region-specific services, plan-tier features, SDK capabilities — must have a doc citation that confirms availability for the *specific* deployment context: region, SKU, plan-tier, runtime version. Not just "the vendor supports it") | High | Yes (DRI with explicit "verified manually on <date>" rationale) | all bets that rely on vendor features beyond the foundational stack baseline |

### Phase 5: GTM (Go-to-Market)

| ID | Title | Severity | Suppressible | Applies to |
|---|---|---|---|---|
| GTM-01 | User docs missing (no user-facing changelog entry) | High | Yes (DRI) | feature |
| GTM-02 | API docs stale (public API changed without docs update) | High | Yes (DRI) | bets touching public APIs |
| GTM-03 | Sales not enabled (sales enablement absent when bet is revenue-impacting) | Medium | Yes (owner accept) | revenue bets |
| GTM-04 | Support not enabled (FAQ + escalation paths absent) | High | Yes (DRI) | user-facing bets |
| GTM-05 | Pricing not updated (pricing/packaging change implied, no update) | High | Yes (DRI) | pricing bets |
| GTM-06 | Launch comms undrafted (no announcement + channels) | Medium | Yes (owner accept) | user-facing feature bets |
| GTM-07 | Customer comms missing (beta or breaking-change users have no comm) | High | Yes (DRI) — non-suppressible for breaking changes | breaking-change bets |
| GTM-08 | Legal review pending (T&C / privacy / contract changes without sign-off) | Critical | No (non-suppressible) | legal-touching bets |

### Phase 6: Operate

| ID | Title | Severity | Suppressible | Applies to |
|---|---|---|---|---|
| OP-01 | Measurement cron silent (`/measure` not running per cadence) | High | Yes (DRI) | all bets in `measuring` |
| OP-02 | SLO breach (production observability MCP shows SLO violation in window) | Critical | No | all production-bound bets |
| OP-03 | Elevated incident rate (Sentry MCP shows incident rate > threshold) | High | Yes (HITL, with rationale) | all production-bound bets |
| OP-04 | Adoption below target (analytics MCP shows adoption < hypothesis target) | Medium | N/A — informational; feeds outcome decision | feature, okr |
| OP-05 | Cost overrun (cost actuals exceed forecast > 20%) | High | Yes (DRI) | all production-bound bets |
| OP-06 | Elevated defect rate (post-ship bug rate > threshold per story) | High | Yes (DRI) | feature, architectural-initiative |
| OP-07 | Outcome unresolved (past measurement window, no won/learning/inconclusive decision) | High | No | all bets in `measuring` |

---

## Confidence derivation (canonical)

For every check, derive confidence as one of High / Medium / Low using these signals:

1. **Content depth** — file existence vs. file with substance. Compare against the template's required sections. `TODO`, `TBD`, `<placeholder>` strings → reduce confidence one level.
2. **Source freshness** — last update timestamp on the artifact relative to bet's activity. Stale artifacts (last touched > 30 days while bet is active) → reduce confidence one level.
3. **Cross-artifact corroboration** — claims in artifact A verified against MCP or artifact B. Contradiction → finding raised at Low confidence (one source is wrong; flag both).

State the reasoning briefly in the finding's Reason field. Example: *"Runbook exists but only 12 lines; missing diagnostic steps section per template. → Medium confidence (file exists but minimal)."*

## Suppression policy (canonical)

Per `compass/config.yaml` `scanner.suppression_policy`:

| Severity | Policy |
|---|---|
| Critical | HITL approval + DRI risk-acceptance entry. Some Critical findings are **non-suppressible** (see check catalog above — typically PII / regulated data / breaking changes). |
| High | DRI justification required (auto-logged on suppression). |
| Medium | Owner accepts; auto-logged in DRI. |
| Low | Silent dismissal; still logged in DRI for audit. |

Suppressions appear in the **Suppressed findings** section of the scan report with: original finding · suppressor name · date · rationale · DRI link.

## Aggregate roll-up (`--all` mode)

When `/scan --all` runs, in addition to per-bet reports, the chat output includes:

```
🧭 Compass — Open Findings
Total: N across M active bets
• Critical: X · High: Y · Medium: Z · Low: W
Most common findings:
  • <Title> (N bets)
Suppressed (accepted risk): N
Time-to-remediate (median): D days
Trend: critical findings <↑|↓>X% over N sprints
```

(`/metrics` consumes this same roll-up by reading all `docs/bets/*/scan-report.md` files.)

## Auto-trigger contract

- **`/build`** runs `/scan` at phase boundaries (Build → Production Ready, → GTM, → Operate). In `strict` mode (per `compass/config.yaml` `scanner.per_phase`), any open Critical finding blocks the phase transition; in `advisory` mode, Critical findings warn loudly and auto-log as DRI Risks.
- The `blocking_advance` field on scan reports remains for informational purposes (e.g., consumed by `/dashboard` to surface phase-readiness state). No workflow currently *consumes* `blocking_advance` to block on it — phase transitions happen via direct status-field flips by the user, who reads the scan report to decide.
- **Cron** runs `/scan --all` per `scanner.cron`. Posts roll-up to status channel (per config).

## Refusal cases

- No bet ID provided AND no `--all` / `--phase` flag
- Bet doesn't exist
- `compass/config.yaml` missing `scanner:` section

## Notes

- **Derived, not authored.** Scan report is to per-bet artifacts what `/plan` is to phase outputs — a roll-up view. Hand-editing `scan-report.md` is anti-pattern; the next `/scan` run overwrites (except suppressions, which are preserved by ID).
- **No new framework to learn.** Severity + confidence + suppression are the same shapes engineers use in security tooling. That's the point.
- **Check catalog evolves here.** New checks added to this file (with the bet-type filter), not improvised in the role doc or template.
