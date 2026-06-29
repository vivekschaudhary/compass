---
id: RETRO-030
type: retro
status: archive
altitude: framework
period_start: 2026-06-26
period_end: 2026-06-28
improvement_count: 10
created: 2026-06-29
author: framework-Architect (Compass-on-Compass)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #030 — framework — improvements #158 to #167

The batch that turned Compass from "an orchestrator that ships code" into the **enterprise delivery control tower** of the strategic thesis: stack-agnostic execution, SOW-conformance + audit provenance, Compass-as-system-of-record projecting one-way to the team's Atlassian, an exec WBS with manage-by-exception, and a coherence floor so the board can't lie — then cross-model-reviewed the whole thing.

## Source entries in scope

#158 full-backlog `/create-story` (not one-at-a-time) · #159 authoring workflows write by default · #160 stack-agnostic delivery agents + pluggable stack profiles + override layer · #161 governance audit export + actor identity + cross-model provenance · #162 SOW-conformance (controls → evidence mapping) · #163 Compass→Jira/Confluence one-way projection · #164 exec control-tower WBS + manage-by-exception · #165 coherence floor (stale-run auto-halt) · #166 projection fires on draft creation, not only approval · #167 cross-model (Codex) review of the batch + fixes.

## Common patterns (positive)

- **DRI-vision-to-capability arc.** A single strategic thesis (the control tower) drove a coherent 5-capability MVP (#160–#165) in one push, each capability mapping to a named part of the vision (vendor-neutrality → #160; governance/audit → #161/#162; Compass-primary → #163/#166; transparency/manage-by-exception → #164; "the board can't lie" → #165). `[goal-driven-high-cadence-arc]` (watch-for since Retro #009) recurs cleanly.
- **Compass-primary, external-as-projection.** #163 + #166 established the durable shape: Compass filesystem is the system of record; Jira/Confluence are one-way projections with an idempotent distribution pointer (`jira_key`/`confluence_page_id`) so a re-push is update-not-create. The deliverable lands in the team's own tools without Compass ceding authorship.
- **Honest degradation as a design default.** Missing creds → filesystem fallback that never lies (#163); an abandoned run self-halts so it can't show in-flight forever (#165); the conformance verdict folds into the WBS only when `controls.md` exists (#164). The framework degrades loudly and truthfully rather than faking success.
- **Cross-model review caught real defects.** #167 ran Codex independently over the Claude-implemented batch — 3 real findings (pre-approval canonical write; unchecked Confluence version-GET; `_list` quote-stripping) + 1 false positive (a "missing import" that was present). The reviewer-≠-implementer invariant earned its keep on its first batch-scale outing.

## Recurring anti-patterns (negative)

- **`embedded-stack-contract`** — #160's *original* draft hardcoded Next.js/TS runtime contracts into the delivery agents. The DRI caught it ("keep it agnostic; the arch can be standardized but the stack selection should be agnostic") → reshaped to stack-neutral agents + pluggable profiles. Agent files encoding a *specific* stack is the same class as `embedded-methodology` (an agent encoding a specific workflow).
- **`pre-approval-canonical-write`** — #166's first cut could project an unapproved draft to the canonical filesystem from step output; #167 fixed it to project only artifacts already on disk, and only to external connectors, never fabricating a canonical copy pre-approval.
- **`silent-vendored-staleness`** — the batch ran against home-app's *copied* `compass/`, which had drifted from `main`; several #168 confounds traced to it. A consumer carrying its own framework copy that silently goes stale is a recurring hazard (addressed later by the `--compass-dir` discipline).

## Convention candidates

- **`[compass-primary-external-projection]`** — system-of-record stays in Compass; externals are idempotent one-way projections with a stored pointer. **2 instances** (#163, #166). Codification-ready; would anchor the "delivery control tower" thesis in canon.
- **`[honest-degradation]`** — missing capability/creds → a truthful fallback or loud halt, never faked success. Multiple instances this batch (#163 filesystem fallback, #165 stale-halt) plus prior (#150). Candidate; likely an observability-class member alongside `[observability-before-trust]`.
- **`[opinionated-defaults-fully-overridable]`** — ship a well-oiled default (stack profile, template, workflow) that any project overrides via `compass-overrides/` without forking. **1 instance** (#160) — wait for a 2nd (templates/workflows override).
- **`[reviewer-scope-separation]`** — distinguish Codex-class external-contract verification from grep-class within-artifact consistency. #167 adds an instance (post-MVP candidate, was at 1). Now **2 instances** — surface for codification.

## Drift signals

- **MVP shipped fast → full-surface drift risk.** Five capabilities in ~3 days; the kind of velocity that leaves doc/count drift behind. (The #031 batch's independent audit is the structural catch.)
- **Vendored-compass staleness** (home-app) — flagged here, untracked-telemetry + `--compass-dir` discipline land in the #031/#032 batches.
- **`controls.md` is opt-in** — SOW-conformance only fires where a controls file exists; silent absence ≠ conformant. Watch that the WBS distinguishes "no controls declared" from "conformant."

## Full-surface audit

Method: **mechanical sweep** (minimum bar for this older batch; the independent context-free agent audit is run against the current surface and recorded in Retro #031, which covers the same live repo state).

- **Dispatch-graph / catalog counts, version self-claims, host list** — `consistency-check.py` reports CONSISTENT as of #167 and at every commit since (git hook + CI). Fixed-in-batch / clean.
- **`compass/roles/` references** — grace-period; the migrated `compass/agents/` are authoritative. Watch-for (removal in v0.4); see Retro #031 audit for the live list.
- **Cross-model independence** — verified structurally: reviewer/security-reviewer agents declare `preferred_hosts: [codex, gemini]` (not claude); #167 exercised it for real. Clean.
- Deeper current-surface findings (design/copy sidecar references, etc.) → deferred to Retro #031's independent audit against the same repo.

## Trigger-origin analysis

- **DRI-direction-originated:** #158 (full backlog), #159 (write-default), #160 (stack-agnostic + override — a direct correction), #161–#165 (the MVP target the DRI scoped from the control-tower thesis). ~80% DRI-originated.
- **Dogfood/consumer-originated:** the confounds that motivated tightening (vendored staleness) surfaced from a live create-brief run.
- **Cross-model-review-originated:** #167's 3 fixes. `[consumer-as-primary-signal]` (Principle #19) and `[user-as-load-bearing-oversight]` both reinforced.

## Watch-for list (next 10 improvements)

- Whether `[compass-primary-external-projection]` gets a 3rd instance (status→Jira transition map, drift detection) → promote.
- Whether the vendored-compass staleness recurs (it did → #175/#178).
- Whether `controls.md` absence is ever misread as conformant in the WBS.
- Whether the MVP's velocity left count/version drift (→ the #031 independent audit).

## Meta-observations

- This batch is where the **strategic thesis became executable surface**: each capability is a thesis claim made testable. The risk it introduces is breadth-without-depth — five new subsystems (`stores.py`, `wbs.py`, conformance, projection, coherence) each shipped in a day. The cross-model review (#167) and the upcoming independent audit are the depth backstops.
- The single most leveraged move was **#160's reshaping under DRI correction**: had the stack stayed hardcoded, every consumer would have forked the agents. `[user-as-load-bearing-oversight]` prevented a structural mistake, not just a bug.

## Promotion candidates to canon

- **`[reviewer-scope-separation]`** (now 2 instances: prior + #167) — recommend codifying: name the two review classes (external-contract verification vs within-artifact consistency) so the orchestrator runs the right one pre-merge.
- **`[honest-degradation]`** — strong multi-instance candidate; recommend as an observability-class canon entry.
- Not auto-promoted — each needs its own improvement entry per the retro contract.
