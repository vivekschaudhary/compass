---
name: controls
engagement: <SOW / engagement id>
---

# Control framework

The controls this engagement must hit — the **SOW's controls**, hand-authored for the
MVP (automated `/ingest-sow` extraction is deferred). `--export-audit` maps each
control to the delivery evidence that satisfies it and reports its status
(**met / unmet / at-risk / exceeded**).

**Format:** each control is a `## <ID> — <title>` heading followed by `- key: value`
fields. `check:` binds the control to evidence Compass verifies automatically:

- `cross-model-review` — an independent reviewer on a different model than the implementer
- `human-approval` — a human approved the gated deliverable
- `security-review` — a security-review step ran
- `tests-present` — a test/automation step ran
- `manual` — not auto-checkable; human-attested via `attest:` (met | pending | exceeded)

Place this file at `docs/controls.md` (engagement-wide) or `docs/bets/<bet-id>/controls.md`
(per bet). Override the shipped defaults via `compass-overrides/templates/controls.md`.

## CTRL-1 — Independent cross-model code review
- category: governance
- requirement: Every change is independently reviewed by a different model than the implementer.
- check: cross-model-review

## CTRL-2 — Human approval gate
- category: governance
- requirement: Every deliverable is human-approved before promotion.
- check: human-approval

## CTRL-3 — Security review on sensitive changes
- category: security
- requirement: Changes touching auth / PII / secrets / external input receive a security review.
- check: security-review

## CTRL-4 — Automated test coverage
- category: quality
- requirement: Each shippable slice has automated tests exercising its acceptance criteria.
- check: tests-present

## CTRL-5 — Data residency (example manual control)
- category: compliance
- requirement: No regulated user data leaves the contracted region.
- check: manual
- attest: pending
