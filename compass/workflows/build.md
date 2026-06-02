# Workflow: /build

Engineer implements an approved story. Codex reviews. Architect compliance enforced on every PR (no shortcuts — prevents tech debt). Story may have multiple PRs.

<!-- Role-boundary markers per [role-boundary] (canon.md, v0.3.4). The reference parser
     compass/scripts/token-usage.py reads these to attribute Claude Code session tokens
     to roles. PM-owned. Add markers when introducing new role transitions; remove only
     when restructuring phases. -->


## Trigger

`/build <story-id>`

## Process

### Phase 1 — readiness check

1. **Verify story is `ready`:**
   - AC present (required)
   - Design link present (required if UI work)
   - Tech notes present
   - Bet brief is `approved`, architecture (if required) is `approved`
2. **If missing → refuse and flag to HITL.** Do not proceed.

### Phase 2 — implement

<!-- COMPASS_ROLE_BOUNDARY: enter | role=engineer | workflow=build | step=3 -->

3. **Load Engineer role context** (`compass/roles/engineer.md`)
4. **Engineer reads** in order: AGENTS.md, brief, bet architecture, story, copy doc, foundation architecture, existing code
5. **Engineer plans** smallest viable diff
6. **Engineer implements:**
   - Code in appropriate boundary
   - Unit + API + component tests (co-located with code)
   - Copy verbatim from copy doc
   - All states (default, empty, loading, error, success)
   - Accessibility checks if UI
7. **Engineer runs local checks:** typecheck, lint, all test suites, format, **AND production build** (e.g., `pnpm build`, `npm run build`, or the framework-equivalent production target). Fix anything before opening PR. **The production build is load-bearing** — it catches issues that typecheck + unit tests genuinely can't see: bundling errors, dead-import elimination breaking runtime, env-var requirements, asset pipeline issues, monorepo workspace resolution. Opening a PR without a green production build is the failure mode that ships broken builds to staging.

   **Runtime-config audit (load-bearing).** In addition to the build itself, verify:
   - All public-namespace env vars (`*_PUBLIC_*` / `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` / `VITE_*` / etc.) have **explicit values** for the target deploy environment (`.env.production`, `.env.local` for native, or framework-equivalent).
   - Runtime-config defaults that "just work" in dev (e.g., `localhost`, dev-only feature flags, mock-mode toggles) **fail loudly at module load** when running outside dev — not silently fall back. A `localhost` default that ships and breaks on a real device / deployed function / mobile app is the failure mode this check exists to catch. If a default would only work in dev, throw with a clear error rather than letting the app boot into a broken state.

   **Build-artifact inspection (load-bearing).** Per `[mechanical-output-verification]` (canon.md, v0.3.6). A green build is necessary but not sufficient. **Build SUCCESS ≠ build OUTPUT correct** — the build process can complete cleanly while the runtime configuration silently drops what the source declared. **Inspect the build OUTPUT, not just the process exit code.** Framework-specific anchors:
   - **Next.js 16:** read **`.next/server/functions-config-manifest.json`** — confirm the `/_middleware` entry exists with `runtime: "nodejs"` + matchers; that\'s where Next 16 registers middleware/proxy. Missing entry = middleware silently dropped at build time despite the source declaring it. **Pre-v16 (Next 13–15):** the legacy artifact was `.next/server/middleware-manifest.json`; on Next 16 that file is **empty by design** — checking the legacy file alone gives false negatives. Same OUTPUT vs PROCESS check for `routes-manifest.json` (route definitions), `app-paths-manifest.json` / `pages-manifest.json` (page/route inclusion), and `prerender-manifest.json` (ISR / SSG correctness).
   - **Vercel Functions:** check `.vercel/output/functions/` — confirm declared functions exist in the output directory; missing = function won't deploy.
   - **Expo:** after `expo prebuild` or `eas build`, confirm the generated native config (Info.plist, AndroidManifest.xml, entitlements) matches `app.config.ts` declarations; bundled assets match the expected manifest.
   - **General principle:** when the framework's runtime configuration is data-driven (manifests, bundle indexes, config JSON written by the build), reading source code ≠ reading the runtime config. **Inspect the runtime config.** Source intent and build output can diverge silently; the build output is what actually runs.

   **Named anti-pattern: `polished-but-broken`.** Tests pass, build succeeds, narrative is coherent, principles are cited — and the actual built behavior is wrong. The agent rationalizes ("the build succeeded, surely the manifest is right; the tests cover this; the principle is named in the comment") and ships a fundamentally broken artifact. **Mechanical inspection of the build output is the hardening** — per Principle #14, the soft spec being rationalized is now subtler ("the build succeeded" / "the tests pass") and the fix is reading the actual artifact, not trusting the surrounding signals. First observed: aura-app CB-1.4 dashboard proxy (2026-06-01) — manifest check revealed the gap between source intent and runtime config. A parallel cycle on a Next 16 stack independently surfaced the same pattern and identified that on Next 16 the load-bearing manifest moved from `middleware-manifest.json` to `functions-config-manifest.json` — the subsequent anchor correction in this entry comes from that finding.

<!-- COMPASS_ROLE_BOUNDARY: exit | role=engineer | workflow=build | step=7 -->

### Phase 3 — Codex writes E2E

<!-- COMPASS_ROLE_BOUNDARY: enter | role=reviewer | workflow=build | step=8 -->

8. **Load Reviewer role context** (`compass/roles/reviewer.md`) — Codex
9. **Codex writes E2E tests** for AC user flows (top-level `e2e/` folder)
10. **Codex commits with `test:` prefix**

<!-- COMPASS_ROLE_BOUNDARY: exit | role=reviewer | workflow=build | step=10 -->

### Phase 4 — open PR

<!-- COMPASS_ROLE_BOUNDARY: enter | role=engineer | workflow=build | step=11 -->

11. **Engineer opens PR** via GitHub MCP using `.github/PULL_REQUEST_TEMPLATE.md`
    - Links: brief, architecture, story, copy doc
    - Description: what changed, test plan, AC mapping
    - Auto-labels: `area:*`, `type:*` (feature / tech-debt / continuous-improvement / etc.)
    - Draft or ready — both supported (Codex reviews drafts too)
12. **Story status → `in-build` → `in-review`**

<!-- COMPASS_ROLE_BOUNDARY: exit | role=engineer | workflow=build | step=12 -->

### Phase 5 — review

<!-- COMPASS_ROLE_BOUNDARY: enter | role=reviewer | workflow=build | step=12a -->

12a. **Freshness-check precondition (load-bearing).** Before Codex review begins, verify `compass/roles/reviewer.md` is current. Per `[freshness-check]` (canon.md) — read the file's frontmatter:

   - **If missing `last_verified`:** treat as infinitely stale. **Refuse with:** "compass/roles/reviewer.md is missing freshness markers. Backfill `last_verified`, `freshness_window_days`, and `external_source` after verifying the Codex review format is current."
   - **If `today - last_verified > freshness_window_days`:** **refuse with:** "compass/roles/reviewer.md last verified <last_verified> (>{freshness_window_days} days). The Codex review format may have drifted. Verify against `<external_source>`; update both the 'Expected Codex output shape' section and `last_verified` once confirmed current. Re-invoke `/build` after."
   - **Else:** proceed.

   This is the pull-bridge round-1 defense against external-tool drift (per `[freshness-check]` v0.3.3 → v0.3.4 detection → v0.4 push). Without this gate, Codex format changes silently break the review parsing — exactly the friction that prompted the pattern.

13. **CI runs.** Codex review begins ONLY after CI is green. **If `.github/workflows/ai-review.yml` is installed in the consuming repo (per `compass/scripts/agent-handoff.yml` template, `[agent-handoff]` v0.3.5), the reviewer fires automatically on CI-green — Engineer does not need to invoke it manually. Otherwise the reviewer is invoked manually** (open terminal, run `codex` against the reviewer prompt referencing the PR number — see `compass/roles/reviewer.md`). Both paths terminate at the same place (structured findings posted as a PR comment); automation removes the tool-switch + manual prompt paste only.
14. **Codex reviews** — posts structured findings on PR (BLOCKER / ISSUE / NIT)
15. **Architect compliance check** is part of Codex review (bet architecture as reference)
16. **Security Reviewer (Codex)** auto-engages if diff touches auth/PII/payments/secrets/external input/sessions
<!-- COMPASS_ROLE_BOUNDARY: exit | role=reviewer | workflow=build | step=16 -->

<!-- COMPASS_ROLE_BOUNDARY: enter | role=engineer | workflow=build | step=17 -->

17. **Engineer addresses findings:**
    - All BLOCKERs and most ISSUEs
    - Disputes → `## Dispute` section in PR, PM arbitrates
    - Pushes fixes as commits → auto re-request review
18. **Loop until no blockers and no unresolved disputes**

<!-- COMPASS_ROLE_BOUNDARY: exit | role=engineer | workflow=build | step=18 -->

### Phase 6 — merge

19. **HITL gate** — human approves merge
20. **Merge mechanically blocked unless:**
    - CI green
    - Zero Codex BLOCKERs
    - Zero security CRITICALs
    - Zero unresolved disputes
    - Human approval recorded
21. **Squash merge** to main (per config)
22. **CI/CD pipeline triggered** automatically (per `compass/config.yaml` ci_cd settings)

### Phase 7 — post-merge

23. **Story status → `merged`** (still under brief's tracking)

<!-- COMPASS_ROLE_BOUNDARY: enter | role=tech-writer | workflow=build | step=24 -->

24. **Tech Writer engages** — updates `docs/changelog.md` accumulator entry for this brief
25. **If deploy succeeds:** story status → `shipped`
26. **If deploy fails:** story status → `deploy-failed`, alert via configured channel
27. **Brief stays `in-build`** until ALL stories of the brief have shipped
28. **When all stories ship:** brief status → `shipped`, Tech Writer finalizes consolidated changelog entry for the brief

<!-- COMPASS_ROLE_BOUNDARY: exit | role=tech-writer | workflow=build | step=28 -->

### Scanner at phase boundaries

Invoke `/scan <bet-id>` at each phase boundary so the bet enters the next phase with a fresh findings snapshot:

- **Build → Production Ready:** triggered when all stories of the brief ship (step 28). Surfaces runbook / SLO / monitoring / rollback / on-call / backup / cost / compliance gaps before the bet is treated as production-bound.
- **Production Ready → GTM:** triggered when the Production Ready findings are resolved or suppressed. Surfaces user-docs / API-docs / sales / support / pricing / launch-comms / customer-comms / legal gaps.
- **GTM → Operate:** triggered when GTM findings are clear. Surfaces measurement-cron / SLO-met / incident-rate / adoption / cost-actuals / defect-rate / outcome-resolved gaps.

If `compass/config.yaml` `scanner.per_phase` is `strict` for the upcoming phase, any open Critical finding blocks the transition (matching the scanner's strict-mode block semantics). The point is to catch missing production-readiness work *before* the bet is treated as shipped, not after an incident reveals it.

## Story → multiple PRs

A story may produce multiple PRs (implementation, tests, defect fixes). Each PR gets the SAME full review treatment. No shortcuts on subsequent PRs.

## Post-merge bugs

If bug found post-merge on this story → reopen story, fix it right. Don't create a separate "fix" story for the same defect.

## DRI logging

Engineer logs:
- **Decisions:** implementation choices, library use — rationale + area tag
- **Risks:** regression, performance, integration — likelihood + impact
- **Issues:** AC ambiguities, missing context — severity + owner

Codex logs:
- **Decisions:** review interpretation
- **Risks:** uncovered gaps
- **Issues:** repeated drift patterns

## Discipline always

No shortcuts under pressure. Full Codex review + Architect compliance + Security review (if applicable) on every PR including drafts and hotfixes.
