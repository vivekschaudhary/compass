# Compass Improvements Log

Real friction encountered while using Compass, with the change made to fix it. This file is the institutional memory of why the framework is shaped the way it is.

Each entry: what happened → what changed → what to watch for.

## Retro cadence

Retros every 5 entries per AGENTS.md principle #14 (soft-spec-rationalization defense via periodic pattern review). Reports — does not prescribe. Patterns surfaced feed future improvements via normal triggers.

- **Retro #001** (v0.1.8 → v0.1.12): [retros/2026-05-26-retro-001-v0.1.8-to-v0.1.12.md](retros/2026-05-26-retro-001-v0.1.8-to-v0.1.12.md)
- **Retro #002** (v0.1.13 → v0.2.2): [retros/2026-05-26-retro-002-v0.1.13-to-v0.2.2.md](retros/2026-05-26-retro-002-v0.1.13-to-v0.2.2.md)
- **Retro #003** (v0.2.3 → v0.2.7): [retros/2026-05-26-retro-003-v0.2.3-to-v0.2.7.md](retros/2026-05-26-retro-003-v0.2.3-to-v0.2.7.md)
- **Retro #004** (v0.2.8 → v0.3.5 + same-day extensions): [retros/2026-06-01-retro-004-v0.2.8-to-v0.3.5.md](retros/2026-06-01-retro-004-v0.2.8-to-v0.3.5.md) — fired at #22, **2 cycles overdue** (promised after #20); names retro-cadence-rationalization as drift signal; surfaces `[mechanical-output-verification]` as codification-ready (2 instances).
- **Retro #005** (v0.3.6 → v0.3.8 + same-day correction): [retros/2026-06-02-retro-005-v0.3.6-to-v0.3.8.md](retros/2026-06-02-retro-005-v0.3.6-to-v0.3.8.md) — **fired ON TIME at #25** (hard line from Retro #004 worked). Smaller 3-improvement cycle. Surfaces `[declare-not-implement]` + `[hard-line-declaration]` as codification-ready (2 instances each); `[framework-on-framework]` at threshold (3 instances). Includes first in-cycle artifact analysis section: `compass/roles/reviewer.md` rated 7/10 (pruning candidate) + CB-1.5 story rated 9/10 (correct framework application in the wild).
- **Retro #006** (v0.3.9 → v0.3.13): [retros/2026-06-02-retro-006-v0.3.9-to-v0.3.13.md](retros/2026-06-02-retro-006-v0.3.9-to-v0.3.13.md) — **fired ON TIME at #30** (2nd consecutive on-time retro; hard line worked again). 5 improvements in 1 day. Surfaces 3 codification-ready candidates: `[user-as-load-bearing-oversight]` (3+ instances) · `[L-layered-progressive-rollout]` (2 instances) · `[surface-shapes-output]` (2 instances). `[hard-line-declaration]` empirically validated 3rd time (cadence-class commitments). Release-class taxonomy stable at 7 classes (capability-extension introduced v0.3.13).
- **Retro #007** (v0.3.14 → v0.3.18): [retros/2026-06-07-retro-007-v0.3.14-to-v0.3.18.md](retros/2026-06-07-retro-007-v0.3.14-to-v0.3.18.md) — **fired ON TIME at #35** (3rd consecutive on-time retro; hard line worked 4th time). 5 improvements in 3 days. **First retro under v0.3.17 `[fractal-retro]` schema** (explicit `altitude: framework` + `consolidates_from: []` frontmatter). **Cleanest QUEUED → SHIPPED cycle in framework history visible end-to-end** (v0.3.16 QUEUED → v0.3.17 SHIPPED on trigger fire within same session). **100% user-driven origin** across all 5 improvements — `[user-as-load-bearing-oversight]` at 11+ total instances, **PROMOTE TO CANON recommended** as 1st observability-class candidate (would join `[role-boundary]` as 2nd observability member). Other codification candidates: `[agent-file-compression]` (1 instance — wait for 2nd); `[tool-wrappers-own-their-cadence]` + `[no-padded-status]` + `[freshness-markers-follow-source-of-truth]` (1 instance each — wait). Drift signals: workflow-refactor cadence (12+ workflows still in v0.3.0-alpha shape); Custom GPT cap compounding without structural defense; watch-for latency (3 releases for v0.3.15 flagged item to be addressed). Architecture-discipline class validated as durable (2 members).
- **Retro #008** (v0.3.19 → v0.3.23): [retros/2026-06-08-retro-008-v0.3.19-to-v0.3.23.md](retros/2026-06-08-retro-008-v0.3.19-to-v0.3.23.md) — **fired ON TIME at #40**
- **Retro #009** (v0.3.24 → v0.4.0-alpha-1): [retros/2026-06-08-retro-009-v0.3.24-to-v0.4.0-alpha-1.md](retros/2026-06-08-retro-009-v0.3.24-to-v0.4.0-alpha-1.md) — **fired ON TIME at #45** (5th consecutive on-time retro; first orchestrator-version cycle). 5 improvements: `[workflow-as-dispatch-graph]` codified + orchestrator alpha-0 + Architect migration + `/create-bet-architecture` dispatch-graph + orchestrator alpha-1 artifact write + state passing. No PROMOTEs this cycle (all execution-class). Watch-for: `[discipline-as-muscle-memory]` + `[goal-driven-high-cadence-arc]` + `[orchestrator-as-residual-shrinker]`.
- **Retro #010** (v0.4.0-alpha-2 → v0.4.0-alpha-2 + field learnings): [retros/2026-06-09-retro-010-v0.4.0-alpha-2-to-field-learnings.md](retros/2026-06-09-retro-010-v0.4.0-alpha-2-to-field-learnings.md) — **fired ON TIME at #50** (6th consecutive on-time retro). 2 field-signal improvements: friction-as-principle + Engineer prod-parity. First retro with consumer-project evidence (crypto app prod failures). `[discipline-as-muscle-memory]` watch-for validated: cadence held with tightened header prose.
- **Retro #011** (v0.3.29 → v0.3.32): [retros/2026-06-09-retro-011-v0.3.29-to-v0.3.32.md](retros/2026-06-09-retro-011-v0.3.29-to-v0.3.32.md) — **fired ON TIME at #55** (7th consecutive on-time retro). 4 improvements in 1 session: Engineer prod-parity discipline + Principle #17 friction + Support migration + Scanner migration. `[discipline-as-muscle-memory]` PROMOTE executed this cycle. Counter resets to #60.
- **Retro #012** (v0.3.33 → v0.4.0-alpha-3): [retros/2026-06-09-retro-012-v0.3.33-to-v0.4.0-alpha-3.md](retros/2026-06-09-retro-012-v0.3.33-to-v0.4.0-alpha-3.md) — **fired ON TIME at #58** (8th consecutive on-time retro; counter tracking note: fired at +3 not +5 per [discipline-as-muscle-memory] drift; horizon corrected to #63). 3 improvements: Automation migration + [discipline-as-muscle-memory] canon + HITL context passing. Watch-fors: orchestrator test coverage gap + HITL feedback ceremony risk + pre-push-grep-discipline 2nd instance.
- **Retro #013** (v0.3.36 → v0.4.0-alpha-5): [retros/2026-06-09-retro-013-v0.3.36-to-v0.4.0-alpha-5.md](retros/2026-06-09-retro-013-v0.3.36-to-v0.4.0-alpha-5.md) — **fired ON TIME at #63** (9th consecutive on-time retro). 5 improvements: consumer retro signals (CB-3.3) + anti-pattern promotion + `[cross-artifact-sweep-on-contract-shift]` canon + orchestrator pipeline mode + consumer-ready orchestrator (live CB-4 validation). First batch 100% consumer-driven. `[consumer-as-primary-signal]` at 2nd instance (threshold is 3). Watch-fors: consumer migration guide + `--full-project` flag + `agent-handoff.yml` verification + runs.jsonl analysis tooling.

- **Retro #014** (post v0.4.0-alpha-5 — improvements #64–#68): [retros/2026-06-09-retro-014-v0.4.0-alpha-5-extensions.md](retros/2026-06-09-retro-014-v0.4.0-alpha-5-extensions.md) — **fired ON TIME at #68** (10th consecutive on-time retro). 4 shipped improvements + 1 held gap (#65): `--full-project` orchestrator context · `reviewer.py` + LLM-agnostic `dispatch.py` · `--context-files` injection. Infrastructure-consolidation batch. Convention candidates: `[context-injection-discipline]` (2 instances) · `[ci-script-llm-discipline]` (1 instance). Watch-fors: `[context-injection-discipline]` 3rd instance · #65 consumer migration guide · artifact routing gap.

- **Retro #015** (improvements #65, #69–#72): [retros/2026-06-10-retro-015-improvements-69-to-72.md](retros/2026-06-10-retro-015-improvements-69-to-72.md) — **fired ON TIME at #72** (11th consecutive on-time retro). 5 improvements: consumer migration guide (late #65) + README discipline/OKR overlay (#69) + institutional data layer declaration (#70) + cross-artifact-sweep Principle #17 (#71) + runs.jsonl + hitl.jsonl end-to-end with 15 tests (#72). Promotion candidate: `[consumer-as-primary-signal]` (5+ instances). Watch-fors: 3 unmigrated agents · connector abstraction · test-alongside-implementation 2nd instance. Note: kindtree install done but no workflow runs planned — crypto-app remains the sole consumer signal source.
- **Retro #016** (improvements #73–#77): [retros/2026-06-11-retro-016-improvements-73-to-77.md](retros/2026-06-11-retro-016-improvements-73-to-77.md) — **fired ON TIME at #77** (12th consecutive on-time retro). 5 improvements: final 3 agent migrations (#73–#75 — **all 14 agents migrated**, v0.3.14 arc complete) + independent-review doc-consistency sweep (#76) + reviewer/automation ownership reconciliation (#77). First batch with an independent adversarial review as origin (2 of 5); 0 of 5 consumer-driven. **Codification-ready: `[pre-push-grep-discipline]` (2nd instance — user-gated decision).** New candidate: `[independent-review-as-signal-source]` (1 instance). Watch-fors: orchestrator halt-not-skip (C4) · graph.py gate-parse hardening + tests (C5) · #70 connector/gate slice incl. manual-path approval bridge (C6) · setup-foundation-architecture content reconciliation (C7) · D-batch small fixes.

- **Retro #017** (improvements #78–#82): [retros/2026-06-11-retro-017-improvements-78-to-82.md](retros/2026-06-11-retro-017-improvements-78-to-82.md) — **fired ON TIME at #82** (13th consecutive on-time retro; first under the #78 mandatory full-surface-audit rule). 5 improvements: retro full-surface audit (#78) + halt-not-skip (#79) + gate-parse hardening with first graph.py tests (#80) + orchestrator small-fix batch (#81) + `[pre-push-grep-discipline]` codified (#82). Audit found + fixed-in-batch: orchestrator version self-claims (alpha-4/alpha-2 → generic, CHANGELOG single-source). **Codification-ready: `[test-alongside-implementation]` (2 instances — user-gated).** Watch-fors: #70 implementation slice (3 batches deferred — hard-line trigger if it passes #87) · C7 reconciliation · script adoption tracking · #79 halt-branch tests.

- **Retro #018** (improvements #83–#87): [retros/2026-06-14-retro-018-improvements-83-to-87.md](retros/2026-06-14-retro-018-improvements-83-to-87.md) — **fired ON TIME at #87** (14th consecutive on-time retro; 2nd under the #78 full-surface-audit rule). 5 improvements: [consumer-as-primary-signal] → Principle #19 (#83) + the #70 gate/promotion slice (#84) + setup-foundation-architecture dispatch graph (#85) + create-story dispatch graph — **full bootstrap→build chain now orchestratable** (#86) + [pluggable-graph-executor] declared (#87). Audit caught + fixed orchestrator alpha-5 version drift + a stale skip→halt reviewer claim (e73fded). **Batch closed with the first real end-to-end consumer orchestrator run (home-app)** → surfaced the auth→RLS→render prod-parity test finding, codified as #88. Codification-ready: `[test-alongside-implementation]` (5 instances, user-gated). Watch-fors: pre-push script mechanization · stay consumer-anchored · MVP doc refresh.

- **Retro #019** (improvements #88–#92): [retros/2026-06-19-retro-019-improvements-88-to-92.md](retros/2026-06-19-retro-019-improvements-88-to-92.md) — **fired ON TIME at #92** (15th consecutive on-time retro; 3rd under the #78 audit rule). 5 improvements: `[per-surface-vertical-test]` (#88) + test-data-cleanup AC (#89) + `/fix`+`/ops` dispatch graphs (#90) + tool-using executor slices 1 (#91) & 2 (#92). **The text-only gap is closed** for Claude implementer steps under `--allow-write` (read→write→verify loop). Audit fixed stale DESIGN-doc status (declared→partially-built) + alpha marker (c2549d0). Top watch-for: **mechanize the pre-push hook** (3 straight audits caught what it would catch at commit time). Codification-ready: `[test-alongside-implementation]` (~7 instances, user-gated).

- **Retro #020** (improvements #93–#97): [retros/2026-06-20-retro-020-improvements-93-to-97.md](retros/2026-06-20-retro-020-improvements-93-to-97.md) — **fired ON TIME at #97** (16th consecutive). 5 improvements: consistency-check + hook (#93) + codified `[test-alongside-implementation]` (#94) + declared `[conditional-dispatch]` (#95) + `/triage` dispatch graph + conditional dispatch built (#96) + tool-loop hardening from the first live write-mode run (#97). **First audit that found nothing — #93's commit-time check now prevents the drift the last 3 audits caught.** Codification-ready: `[failure-direction-inversion]` (~4 instances). Watch-fors: bug-intake router (home-app evidence) · delivery/cockpit layer (event spine → dashboard/Slack) · sweep silent-success-on-failure paths.

- **Retro #021** (improvements #98–#102): [retros/2026-06-20-retro-021-improvements-98-to-102.md](retros/2026-06-20-retro-021-improvements-98-to-102.md) — **fired ON TIME at #102** (17th consecutive). 5 improvements, **all 5 traced to one live home-app `/fix` run**: declared front-door triage intake router (#98) + branch-not-main (#99) + tool-loop cap wrap-up (#100) + declared testable-preview canary (#101) + declared worktree isolation (#102). **Milestone: write-mode `/fix` worked end-to-end** on a real bug. Codification-ready: `[failure-direction-inversion]`. Watch-fors: build the declared backlog (intake router · worktree isolation · cockpit), don't just accrue it.

- **Retro #022** (improvements #103–#107): [retros/2026-06-22-retro-022-improvements-103-to-107.md](retros/2026-06-22-retro-022-improvements-103-to-107.md) — **fired ON TIME at #107** (18th consecutive). Two arcs, ~100% consumer-driven from one live home-app session: front-door router (#103) + event spine/cockpit (#104) + caching/telemetry (#105) + cost rollup (#106) + skill-surface fix (#107). **Headline: DRI challenged ITIL tiering itself** — captured as candidate `[ai-collapses-org-tiering]` + a **declared `/fix` tier-collapse** (one tool-capable `engineer.triage-and-fix` reproduce→diagnose→fix; keep routing + maker≠checker + HITL; drop the escalation ladder; #108-as-KB DROPPED). New candidate `[skill-surface-is-load-bearing]` (#107). `[conditional-dispatch]` CLOSED (codified #103). `[failure-direction-inversion]` still overdue. Audit clean (consistency-check CONSISTENT, 139 tests, 9 graphs).

- **Retro #023** (improvements #108–#112): [retros/2026-06-23-retro-023-improvements-108-to-112.md](retros/2026-06-23-retro-023-improvements-108-to-112.md) — **fired ON TIME at #112** (19th consecutive). The "**size the path + watch the work**" batch, **5/5 from one continuous live home-app session** (3rd straight ~100%-consumer batch): `/fix` ITIL-tier collapse (#108) + right-size the enhancement lanes (#109) + right-sized hand-off (#110) + step-level cockpit & heartbeat (#111) + OpenAI-adapter fix & clean dispatch-halt (#112). **Milestone:** the full triage→fix→reproduce-from-code→Codex-review shape ran end-to-end on a real bug, and the engineer caught its own prior incomplete fix. New meta candidate **`[size-the-path-to-the-work]`** (pairs #108's `[ai-collapses-org-tiering]` + #109's `[right-size-the-path-to-the-work]`) + `[exercise-every-host-path]` (#112). Audit clean (CONSISTENT · 151 tests · 9 graphs). Watch-fors: codify the size-the-path meta · per-host-adapter tests · raise the write-mode cap.

- **Retro #024** (improvements #113–#117): [retros/2026-06-23-retro-024-improvements-113-to-117.md](retros/2026-06-23-retro-024-improvements-113-to-117.md) — **fired ON TIME at #117** (20th consecutive). The "**operability + cost**" batch, 5/5 from the live home-app session (4th straight ~100%-consumer): HTML cockpit (#113) + consumer-sync tool (#114) + the cost-control batch (#115 Sonnet default · #116 `--max-cost` + the #104 on_event wiring-bug fix · #117 context condense). **The orchestrator graduated from "works" to "operable"** — a **$20 burn** exposed it was never cost-tuned. New candidates: **`[economy-by-default]`** + **`[surface-independent-mechanism]`** (codification-ready, 3 instances: skill desc/emit wiring/branch gap). Honest concession: VS Code (flat sub) is cheaper for interactive — the declared **`claude-code` host** (subscription dispatch) is the strategic answer. Audit clean (CONSISTENT · 168 tests · 9 graphs).

- **Retro #025** (improvements #118–#122): [retros/2026-06-24-retro-025-improvements-118-to-122.md](retros/2026-06-24-retro-025-improvements-118-to-122.md) — **fired ON TIME at #122** (21st consecutive). The "**dashboard-as-orchestrator, completed + battle-tested**" batch, **5/5 dogfood-driven** (5th straight ~100%-consumer): async gates (#118) + browser action endpoints (#119) + the `claude-code` subscription host (#120, + same-session follow-up: API-key strip & stdout error surfacing) + run_id continuity (#121) + dashboard action guards (#122). **First arc declared, fully built, AND battle-tested in one session** — the VISION-step-3 dashboard now runs flat-cost on the CLI subscription. Audit fixed-in-batch: `claude-code` missing from AGENTS.md host table + router.py docstring. Codification-ready (user-gated): **`[surface-independent-mechanism]`** + **`[economy-by-default]`** (both ≥3 stable instances); **`[failure-direction-inversion]`** now most-overdue (the "(no stderr)" hiding is a fresh sibling). New candidate `[continue-not-fork-on-resume]` (1 instance). Drift signal: host-list enumerations are an un-mechanized drift class. Audit clean otherwise (CONSISTENT · 208 tests · 9 graphs).

**Next retro fires after improvement #127.** (Retro #025 = #122; next = #127.)

## Template

```
### YYYY-MM-DD — Short title naming the friction

**Friction:** What hurt, where, and how it surfaced.

**Change:**
- Bullets describing the specific edits.

**Files touched:** comma-separated paths.

**Watch for:** future risks, follow-ups, things that could regress.
```

---

### 2026-05-24 — Researcher needed 6-category structure with defensibility as first-class

**Friction:** Researcher role had vague "gather data" guidance. Inconsistent engagement. Moat analysis (defensibility) was missing entirely from foundational product research — the single most important question on a company-level bet.

**Change:**
- 6-category research framework: user pain, competitive, technical, quantitative, trends, moat.
- Moat analysis mandatory on foundational product bets; 9 classic moat types evaluated explicitly.
- AI tools elevated to first-class research mode across all categories.
- Defensibility section added to foundation-product.md template.
- Verification checklist enforces mandatory completion.

**Files touched:** `compass/roles/researcher.md`, `compass/templates/foundation-product.md`, `compass/templates/brief.md`, `compass/workflows/setup-product.md`.

**Watch for:**
- Similar gaps for other "always engages" roles (e.g., Architect joining on every PR — is that actually happening?).
- Domain-specific moat patterns may need extension (e.g., healthcare network effects work differently).

---

### 2026-05-24 — Researcher could log-and-walk-away on vision-only sources

**Friction:** First real `/setup-product` run (flow / Agent Orchestrator brief) revealed that the v0.1.8 changes were *necessary but not sufficient*. The vision-only source doc gave the Researcher cover to log three open Issues (R-1, R-2, R-3) flagging missing user pain, persona, and competitive data — and the workflow accepted it. No evidence was produced. No moat analysis was attempted. The brief reached "ready for HITL" with placeholders everywhere and the verification gate would have passed because:
- Defensibility section was absent (template predated v0.1.8 — would have been an empty table on re-run, which the old gate allowed)
- Researcher DRI was Issues-only and the gate said "entries from PM AND Researcher" without specifying breadth
- "Findings present" was satisfied by literally any text, including TBDs

**Change:**
- Workflow step 3: explicit ban on log-and-walk-away. Vision-only sources are not a reason to defer.
- Verification: empty moat rows fail; Researcher needs Decisions + Risks (not just Issues); findings need cited evidence (not TBD or "see R-N"); HITL gate cannot pass with any unchecked item.
- Role doc: new "When the source is vision-only" subsection — vision-only is the *normal* starting state, not an exception.

**Files touched:** `compass/workflows/setup-product.md`, `compass/roles/researcher.md`, `CHANGELOG.md` (0.1.9), `compass/workflows/improvements.md`.

**Watch for:**
- Other workflows with "MUST engage" roles that don't enforce *what* the engagement produces (Architect on every PR — what's the deliverable?).
- Researcher may now over-rotate and produce thin evidence across all three categories just to clear the gate. If that happens, tighten on *quality of evidence* (citations, primary sources) rather than just presence.

---

### 2026-06-02 — Dashboard becomes orchestrator entry point — Actions tab with clipboard-copy buttons (v0.3.13, L1 of v0.4 spec target)

**Friction (anticipated):** User starting a new project. v0.3.12 crystallized the v0.4 spec target (Delivery Manager + Time/Quality/Finance + moat positioning + 4 sub-problems) but full v0.4 implementation is months out. User asked: "is there an easier way to start the new project after we have orchestration?" — surfacing the gap between v0.4 vision and what's shippable today.

**User insight (the actual unlock):** "as an orchestrator, would it be easy to have one html page per project that has the plans similar to what we created as a dashboard, and for solopreneurs they can kick off from the page." This crystallized the bridge — the existing v0.2.1 dashboard is already the single-file project view; extending it with an Actions tab makes it the orchestrator entry point without requiring v0.4 infrastructure.

**Why this works (the why-not-wait-for-v0.4 reasoning):** v0.4 Delivery Manager will eventually populate exactly what L1 generates statically — project state + HITL gates + Finance + action launchers. The dashboard already regenerates on workflow runs (and auto-refreshes via `/scan`, `/plan`, `/status`, `/metrics` per AGENTS.md). Adding clipboard-copy buttons turns the dashboard from passive view into active launcher. **L1 is what the v0.4 Delivery Manager will produce** — just generated by static workflow rather than running orchestration runtime.

**Change:**

- **`compass/templates/dashboard.html.template` gained 7th "Actions" tab.** Now the **initially-active tab** (changed from Foundation) — dashboard opens directly to the orchestrator surface. New CSS classes (`.action-section`, `.action-btn`, `.action-row`, `.hitl-gate`, `.finance-summary`, `.project-state`, `.action-help`) all reuse existing design-system variables. New `compassCopy(command, button)` JS function uses `navigator.clipboard.writeText()` API with two-state visual feedback: green "✓ Copied!" success for 2 seconds (via `.copied` class) or red error fallback for 3.5s (via `.failed` class) if Clipboard API unavailable. **No CDN additions; no new framework dependency; ~100 lines of CSS + ~25 lines of JS added to existing vanilla-JS template.**
- **`compass/workflows/dashboard.md` gained step 8 "Populate the Actions block"** between artifact-inlining and empty-tab fallback. Four sub-sections specified:
  - 8a: **project state summary** — computed from artifact existence + statuses (empty / foundation-only / portfolio-approved / bets-in-flight / all-shipped)
  - 8b: **pending HITL gates** — scan artifacts for `status: proposed` frontmatter; emit only if any pending
  - 8c: **quick-action workflow launchers** grouped by Bootstrap / Create / Build & ship / Observe & report semantics with state-aware visibility; each button uses `compassCopy('/workflow', this)` handler
  - 8d: **Finance summary** if `docs/usage/current.json` exists; OMIT entirely if missing (do not fabricate numbers)

  Plus 7 new verification checklist items + preamble updated for dashboard's dual role (view AND orchestrator entry point).
- **`AGENTS.md` Workflow Structure section gained note** about dashboard as orchestrator entry point — first concrete v0.4-shaped user-facing deliverable; L1/L2/L3 layering preserved as deferral framing.
- **CHANGELOG v0.3.13 entry** documents the Actions tab + clipboard-copy mechanism + new release class (capability-extension) + Retro #006 trigger reached.

**The "L" layering for orchestrator UX maturity:**

| Layer | What it is | What user does | Setup | When |
|---|---|---|---|---|
| **L1 (this release)** | Clipboard-copy buttons | Click → command on clipboard → paste into preferred web app | None — works today | **v0.3.13 — shipped** |
| **L2** | Protocol handler + CLI | Click → local CLI dispatches to CrewAI/LangGraph runtime → orchestration executes | Install Compass CLI once (`pip install compass-cli` or similar); registers `compass://` URL handler | v0.3.14 (next session candidate) |
| **L3** | Localhost server | Real-time state + in-page HITL approvals + live updates | Run `compass serve` | Deferred indefinitely until L1/L2 friction validates |

**This is the bridge from v0.3.x methodology framework → v0.4 multi-agent orchestration system.** L1 ships TODAY in v0.3.13; gives solopreneurs the v0.4 UX shape (single-page dashboard + click to launch workflows) without requiring v0.4 runtime infrastructure. L2 → L3 → v0.4 progressively shift work from "click + paste" to "click + execute" to "real-time orchestration."

**New release class introduced: capability-extension.** Joins the 6 named in v0.3.12 (Compass-original codification · infrastructure release · PR correction · same-day correction · artifact-pruning release · architectural-direction crystallization) → **7 release classes** after v0.3.13. The capability-extension class shape: take an existing workflow/template/artifact + add new capability that doesn't change the existing surface's contracts but adds new surface alongside. Examples now: v0.3.13 dashboard Actions tab (existing template + new tab); v0.3.11 reviewer.md pruning is close but it's reduction-of-existing-substance, not addition-of-new-capability — so they're distinct. Worth Retro #006 examination: does the 7-class taxonomy hold, collapse, or grow?

**No new Compass-original codified.** Catalog unchanged at 6 shapes / 11 patterns. **The release-class taxonomy growing without catalog growing is itself a pattern worth naming** — patterns describe what Compass DOES (in workflows or in itself); release classes describe HOW Compass SHIPS changes. Different abstraction. Worth examining in Retro #006 whether release-class taxonomy needs its own codification mechanism (e.g., entries in `compass/framework/canon.md`?) or stays informal.

**Files touched (5):** edited — `compass/templates/dashboard.html.template`, `compass/workflows/dashboard.md`, `AGENTS.md`, `CHANGELOG.md`, `compass/workflows/improvements.md` (this entry).

**Watch for in new-project usage:**
- **Which Actions sub-section is most useful?** State summary? HITL gates? Quick actions? Finance? Informs whether layout/grouping should evolve in v0.3.14+.
- **Do users actually use clipboard-copy + paste, or do they re-type commands?** If users skip the buttons and just type commands in their AI surface, L1 didn't shave friction — L2 (one-click execution) becomes higher-priority. If users actively click buttons + paste, the flow works and L2 is incremental polish.
- **Does dashboard re-render frequency feel right?** Currently regenerates on workflow runs + auto-trigger from `/scan`/`/plan`/`/status`/`/metrics`. If users hit "stale state" friction (e.g., new HITL gate doesn't show up until next `/scan`), L3 (live updates) becomes needed sooner than expected.
- **Action grouping semantics.** Bootstrap / Create / Build & ship / Observe & report — does this match how users mentally categorize workflows? If users consistently look for an action in the "wrong" group, the semantics need adjustment.
- **State-aware action visibility.** Bootstrap actions only show pre-foundation; do users get confused when Bootstrap actions disappear? Add explanatory text or always show greyed-out?
- **Finance summary unit confusion.** If users assume the Finance numbers are real but `docs/usage/current.json` was generated stale, trust degrades. Should the summary include a "last updated" timestamp + warn if stale?
- **Clipboard API browser compatibility.** Modern browsers (Chrome 66+, Firefox 63+, Safari 13.1+) all support `navigator.clipboard.writeText` natively. Older browsers fall back to error display. If users hit the error fallback often (e.g., corporate IT browsers), need to add a manual-copy fallback (display the command in a copyable text input).
- **Default initially-active tab change.** Changing from Foundation to Actions means stakeholders skimming the dashboard see actions first instead of foundation content. May feel "too action-oriented" for stakeholder use cases. If feedback surfaces, consider adding a config toggle (`compass/config.yaml` `dashboard.initial_tab: actions | foundation`).

**Meta-observation — release-class proliferation without catalog growth signals framework maturity.** The 7-release-class taxonomy growing while the 11-pattern catalog stays stable suggests Compass has reached a state where it can ship lots of different KINDS of changes without inventing new patterns. **Patterns describe what Compass IS; release classes describe how Compass EVOLVES.** Both can grow independently, and the rate of growth tells different stories. Catalog growth (rare in v0.3.11-13) means new structural truths are being named. Release-class growth (frequent) means new evolution shapes are being exercised. Worth examining in Retro #006 whether this distinction is meaningful long-term or whether one absorbs the other.

**Cadence note.** v0.3.1 → v0.3.13 = **13 sessions, 9 Compass-originals + 4 non-codification releases (v0.3.7 infrastructure · v0.3.11 artifact-pruning · v0.3.12 architectural-direction · v0.3.13 capability-extension) + corrections.** **Cadence broken from strict-Compass-original 4 times now (31% of releases).** Each break legitimate (friction-driven non-codification work that ships value). Cadence framing now firmly **substantive-progress-per-session** — Compass-original codification is one shape of substantive progress; others are equally valid.

---

### 2026-06-02 — v0.4 architectural-direction crystallized: Delivery Manager + Time/Quality/Finance + moat positioning + 4 sub-problems (v0.3.12)

**Friction (not yet observed; conceptual capture):** User starting a new project. v0.4 orchestrator vision needed sharper architecture before either (a) pre-emptively building v0.4 infrastructure or (b) starting the new project without v0.4 framing. **The v0.3.x line continues to ship; v0.4 is the architectural target.**

User direction across the session: clarify the orchestrator role, name its mandate, articulate the moat positioning, identify the hard problems "under the surface" that need to be solved. **What follows is the crystallized v0.4 spec target.**

## The orchestrator role: Delivery Manager

Not "Project Manager evolved." A distinct role with three explicit mandates:

1. **Time** — schedule, dispatch sequencing, milestone tracking, plan refinement, sprint cadence, deadline reporting
2. **Quality** — HITL gate enforcement, BLOCKER routing, scanner finding triage, discipline checks (do role files derive from latest, did /build's Step 0 fire, did `[freshness-check]` pass), Codex review status tracking
3. **Finance** — token cost tracking across hosts/roles/phases, budget allocation, cost transparency, ROI per bet outcome, overrun flags

**Mutually exclusive with content decisions.** Delivery Manager never decides:
- What to build (PM/Product owns this)
- How to architect (Architect owns this)
- How to implement (Engineer owns this)
- What's a bug (Reviewer owns this)
- What copy says (UX Writer owns this)

**No authority creep risk by design.** The mandate is three measurable axes; three reportable surfaces; three places the user can override. Real Delivery Manager role exists in real software organizations — this is borrowing a known-working pattern, not inventing one.

## Moat positioning — why Compass differentiates

Methodology + markdown + roles + workflows is widely replicable; every framework has it. **The orchestration layer is structural** and that's where Compass differentiates:

| Compass moat-layer | Why it's hard to replicate |
|---|---|
| **Filesystem as state** (`compass/` + `docs/` in git) | Most multi-agent systems use proprietary memory/state stores; Compass uses git artifacts. Durable, host-neutral, auditable, version-controlled. |
| **Declarative workflow markdown as orchestration spec** | Workflow files describe role + step + handoff in prose; Delivery Manager interprets. Most frameworks code orchestration in YAML or Python; Compass's prose-first approach is more maintainable + legible to non-engineers. |
| **Cross-host role dispatch** | OpenAI for PM, Claude for Architect, Gemini for Researcher, Codex for Reviewer — coordinated by one Delivery Manager. Most frameworks lock everyone to one host. |
| **Surface-aware role-task fit** (CB-1.5 `[surface-shapes-output]` insight) | Different surfaces produce different aesthetic outputs; Delivery Manager picks surface per role's work shape. Most frameworks treat hosts/surfaces as interchangeable. |
| **Discipline-as-orchestration-input** (Principle #14 + others) | Soft-spec-hardening · hard-line-declaration · mechanical-output-verification · declare-not-implement become Delivery Manager inputs — enforced at dispatch time. Most frameworks separate discipline from orchestration; Compass unifies them. |

**No other framework combines these.** The integration IS the moat — not any single piece. Compass's strategic positioning is now an engineering commitment, not just methodology.

## Four sub-problems to solve "under the surface"

### 1. Cross-host task dispatch

Delivery Manager (web surface) routes work to roles on other hosts/surfaces. Four candidate mechanisms:

| Mechanism | How | Trade-off |
|---|---|---|
| **Task-file dispatch** *(recommended)* | Delivery Manager writes `docs/tasks/<task-id>.md` with role + spec + acceptance + dispatch metadata; per-host watcher agents poll for tasks assigned to their roles; reports back via filesystem | Compass-native; matches filesystem-as-state principle; works with any host that can read/write the repo. Requires watchers per host (small CLI agents). |
| MCP-based dispatch | Delivery Manager exposes "dispatch role X with task Y" via MCP; each host's agent registers as an executor | Real-time; cleaner contracts; requires every host to have MCP support (Anthropic + OpenAI shipping; not universal yet) |
| Direct API dispatch | Delivery Manager has API keys; routes via OpenAI / Anthropic / Google APIs directly | Real-time; no host-side agent needed; **loses surface-specific context** (no Claude Code file-system bias for Engineer work) — this is the wrong choice given the surface-shapes-output insight |
| User-shuttle dispatch | Delivery Manager prepares the task; user opens the right host+surface; pastes; today's manual mode | Works without infrastructure; doesn't scale; this is what's friction-y today |

**v0.4 commits to task-file dispatch.** Compass-native; preserves surface-specific context; works with any host that has GitHub read+write.

### 2. State synchronization across hosts

Every host needs read+write access to shared state:

| State type | Location | Access requirement |
|---|---|---|
| Artifacts (briefs, stories, architecture, code, tests) | `compass/` + `docs/` + repo files | GitHub MCP (Claude.ai, ChatGPT, Gemini web) OR git CLI (Claude Code, Codex CLI) |
| Workflow state (where we are in the cadence) | `docs/foundation/plan.md` + `docs/status.md` | Same |
| Orchestration state (who's working on what RIGHT NOW) | NEW: `docs/orchestration-state.md` + `docs/tasks/` dispatch directory | Same |
| Cost state (rolling totals per role / per host) | NEW: `docs/usage/current.json` + extend `compass/scripts/token-usage.py` | Same |
| Decision state (DRI log entries) | Already in artifacts' DRI sections | Same |

**Practical constraint:** every host needs GitHub repo access. "If your chosen host can't read/write the repo, it can't participate in Compass." Reasonable constraint at v0.4 maturity — host ecosystems will catch up (Claude.ai already has GitHub MCP shipping; ChatGPT has connectors).

### 3. Real-time cost tracking (the Finance leg)

v0.3.4's `compass/scripts/token-usage.py` parses Claude Code session logs. For Delivery Manager Finance to work:

- **Parsers per host:** Claude Code ✓; Codex CLI needed; ChatGPT API needed; Gemini CLI + web needed
- **Aggregator** combining per-host usage → per-role / per-workflow / per-bet totals (`compass/scripts/cost-aggregator.py`)
- **Live state:** `docs/usage/current.json` + `docs/usage/<period>.md` archives
- **Delivery Manager Finance flow:** reads aggregated totals → reports to user → flags budget overruns → enforces budget gates if configured

Per-host session-log formats are a drift surface (`[freshness-check]` applies — each parser tracks its host's CLI version + last_verified date). Aggregator itself is bounded engineering. **The Finance leg is the most directly-shippable sub-problem** because v0.3.4 already established the pattern.

### 4. HITL gate routing across surfaces

Delivery Manager hits approval gate → notify user → wait → continue. **Progressive maturity:**

| Maturity | Mechanism | User effort |
|---|---|---|
| **v0.4.0** | Polling (Delivery Manager pauses; user checks any surface; approves on web by writing to a state file or clicking a link) | Low (works with no extra infrastructure) |
| **v0.4.1** | Email/Slack notification (Delivery Manager posts to user's configured channel; user clicks approve link) | Medium (notification config + webhook) |
| **v0.5+** | Browser notification, mobile push (ergonomic improvements) | Higher (browser extension or app) |

**v0.4 ships polling first.** Email/Slack as v0.4.1 once friction validates the priority. Browser/mobile push are ergonomic improvements deferred until usage demands them.

## Implementation scope (estimated)

- **New role:** `compass/roles/delivery-manager.md` (replaces or supersedes `project-manager.md` when v0.4 ships)
- **New convention:** `docs/tasks/` directory + task-file schema (role + spec + acceptance + dispatch metadata)
- **New aggregator:** extend `compass/scripts/token-usage.py` for multi-host + add `compass/scripts/cost-aggregator.py`
- **Workflow updates:** every workflow's role-handoff steps become task-file dispatches (interpretable by Delivery Manager + executable by per-host watchers)
- **AGENTS.md:** Delivery Manager added as the orchestration role + moat-layer description + Time/Quality/Finance mandate articulated
- **New principle candidate (#17?):** Delivery Manager owns Time/Quality/Finance; never makes content decisions; mandate is mutually exclusive with content roles
- **Per-host watcher implementations:** small CLI agents per host (Claude Code watcher, Codex CLI watcher, Gemini CLI watcher; ChatGPT/Claude.ai web use task-file dispatch via GitHub MCP); Compass-shipped reference implementations + user-extensible

**6-8 file changes at the framework level + per-host watcher implementations** (each small). **Not a 6-month rebuild** — probably **3-4 design sessions + implementation sessions within v0.3.x cadence territory** once new-project friction signals validate sub-problem priorities.

## Forward roadmap

- **v0.3.x line continues** to ship incremental codifications + infrastructure as patterns emerge from real usage. v0.4 doesn't block v0.3.x.
- **v0.4 ships when:** (a) enough new-project friction signals validate sub-problem priorities; (b) the design is concrete enough to implement without speculation.
- **v0.4 is additive** — methodology + markdown + filesystem layer continue working; orchestration layer is additive when ready. Existing consumers don't have to adopt v0.4 to benefit from v0.3.x.
- **The new project (starting now) is the friction-discovery vehicle.** User is manual Delivery Manager today; each friction signal informs which sub-problem to tackle first.

## Decision (carried from user direction)

User said: "lets log as v0.4." Interpreted as: log this conversation's architectural-direction crystallization as a v0.3.12 release that captures the v0.4 spec target. (Not bumping to v0.4.0-spec because v0.4 doesn't ship until implementation work happens; v0.3.12 is the spec-capture entry that future-self reading CHANGELOG sees as "the architectural direction was committed here.")

**No framework code changes in v0.3.12 — pure spec capture.** New release class introduced: **architectural-direction crystallization**, joining the existing taxonomy (Compass-original codification · infrastructure release · PR correction · same-day correction · artifact-pruning release · architectural-direction crystallization). **6 release classes** as of v0.3.12.

**Files touched (2):** edited — `CHANGELOG.md`, `compass/workflows/improvements.md` (this entry).

**Watch for:**
- **Which sub-problem causes most friction in new-project usage?** Validates v0.4 implementation priority. Likely candidates: cross-host task dispatch (manual is most painful) or HITL gate routing (notifications via email vs polling, user choice). Cost tracking (Finance) and state sync (filesystem) are likely lower-friction than expected.
- **Does Delivery Manager / Project Manager naming need to evolve before v0.4 ships?** Today Project Manager has /status, /plan, /dashboard workflows. If new-project usage shows these workflows naturally absorb Delivery Manager responsibilities, the renaming/superseding becomes clean. If the role splits into two distinct usage patterns, sibling roles is better.
- **Does the "moat" framing hold up?** When v0.4 ships and serves 3-5 real projects, does the integration actually feel differentiated, or does it feel like "yet another multi-agent system"? **Codification candidate when v0.4 ships:** `[moat-as-integration]` or `[orchestration-as-differentiation]` — a strategic/positioning pattern, distinct from existing 6 shapes.
- **New release class observation:** v0.3.12 is the first architectural-direction crystallization release. **Release-class taxonomy now: 6 distinct classes.** Worth examining in Retro #006 whether these collapse into fewer or remain distinct.
- **Does v0.3.x continue shipping while v0.4 is being designed?** Should — v0.3.x line still has friction-driven improvements queued (`[framework-on-framework]` codification past threshold; `setup-agent.py` propagation script; whatever new-project usage surfaces). v0.4 doesn't block; both lines run in parallel.
- **Per-host watcher proliferation.** Each new host needs a watcher. If the ecosystem expands (DeepSeek, Codestral, future agents), watcher count grows. Mitigate via reference implementation + user-extensible pattern; track in `[declare-not-implement]` shape (Compass ships reference watchers; ecosystem builds the rest).
- **MCP rollout shifts dispatch mechanism timeline.** If Anthropic + OpenAI ship comprehensive MCP support for their web apps before v0.4 implementation starts, MCP-based dispatch may become more attractive than task-file dispatch. Re-examine the dispatch mechanism choice at v0.4 design start.

**Meta-observation — the moat is now explicit.** Up through v0.3.11, Compass was "yet another methodology framework." With the Delivery Manager + Time/Quality/Finance + cross-host orchestration framing, **Compass becomes a specific architectural bet: methodology + discipline + multi-agent orchestration unified.** That's positioning, not just engineering. Worth treating v0.4 design + implementation as the framework's identity-defining release — when v0.4 ships, Compass stops being a methodology framework with markdown files and becomes a multi-agent orchestration system with a methodology-based discipline layer.

**Cadence note.** v0.3.1 → v0.3.12 = **12 sessions across 9 Compass-originals + 1 infrastructure release + 1 artifact-pruning release + 1 architectural-direction crystallization + corrections.** Cadence broke from strict-Compass-original-per-session early (v0.3.7 infrastructure); v0.3.12 confirms the broader framing: **substantive-progress-per-session, where "substantive" includes new release classes as they emerge.** Worth examining in Retro #006: is the cadence's flexibility a feature (responsive to friction) or a drift signal (loss of discipline)?

---

### 2026-06-02 — `compass/roles/reviewer.md` pruned per Retro #005 artifact analysis (v0.3.11)

**Friction (carried from Retro #005 artifact analysis):** reviewer.md rated 7/10. Three overkill items named: (1) Step 0 too front-loaded for general PRs — Codex reads 4 framework-specific anchors + general principle + cross-reference + REQUIRED-vs-OPTIONAL determination before concluding "OPTIONAL" for pure-logic bug fixes; (2) Step 4 operationally expensive — "re-verify against current primary docs" every load-bearing claim means web fetches for every review with framework-behavior claims, the exact failure mode Principle #14 warns against (soft-spec rationalization under pressure); (3) anti-patterns section grew from 5 → 9 items in v0.3.6 with cumulative cognitive load risk ("too many named patterns become noise rather than signal").

**Why now (user picked C in sequence A→B→C):** Retro #005 surfaced this as the highest-ROI cleanup candidate. Every Codex review pays the reading cost; pruning compounds.

**Change:**

- **Step 0 gained a decision tree at the top** — pure-logic PRs skip the framework-registration check entirely with a YES/NO gating decision; framework-discovered surfaces continue to the detailed checks. Detail-block compressed (removed "REQUIRED vs OPTIONAL" tail because decision tree handles gating). Cross-references `polished-but-broken` instead of separately naming `direct-import-test-suspicious`.
- **Step 4 scoped from "every load-bearing claim" to "NEW load-bearing claims only"** — claims not already verified in prior PRs against the same external source, OR claims whose `last_verified` window has expired. Names the operational-cost failure mode explicitly: "re-verifying every load-bearing claim on every PR is the operational-cost failure mode the freshness-check pattern is designed to AVOID, not perpetuate." Already-verified claims within their window inherit prior verification.
- **Anti-patterns consolidated from 9 → 7** — `direct-import-test-suspicious` and `narrow-bug-focus` folded into `polished-but-broken` as concrete sub-examples (they're failure modes that share the same diagnostic shape: mechanical artifact inspection closes the gap). Story-claim-trust preserved separately because structurally distinct (about NEW claims at Step 4 review-time freshness, not framework registration). Original 5 anti-patterns unchanged.

**What was preserved (substance):** all four v0.3.6 codifications (Step 0 framework-registration mechanics, Step 4 freshness-at-review-time mechanics, all four named anti-patterns by reference); the "Expected Codex output shape" contract; the freshness markers (`last_verified`, `freshness_window_days`, `external_source`); all other Steps 1-3, 5-7 and Hard rules section.

**What was reduced (cognitive cost):**
- Step 0 reading cost on pure-logic PRs (decision tree exits at top)
- Step 4 operational cost (NEW-claims-only scope; sliding-window inheritance)
- Anti-patterns reading cost (9 → 7 with semantic consolidation under `polished-but-broken` parent)

**No Compass-original codified — pure artifact cleanup.** Catalog unchanged at 6 shapes / 11 patterns. **First artifact-pruning release in the v0.3.x line** triggered by retro artifact analysis rather than by friction or codification readiness.

**Files touched (3):** edited — `compass/roles/reviewer.md`, `CHANGELOG.md`, `compass/workflows/improvements.md` (this entry).

**Watch for:**
- **`polished-but-broken` recurrence rate after consolidation.** If recurrence rises after `direct-import-test-suspicious` and `narrow-bug-focus` became sub-examples, the consolidation under-named the failure modes (they had distinct discriminatory value that the parent didn't capture). If stable or falls, the consolidation captured the right semantic level — sub-examples were redundant identity. **3-5 PRs of data needed to read the signal.**
- **Step 0 skip rate.** Track in Codex review output how often the YES/NO gating decision concludes "NO → skip Step 0". If high (>50%), the decision tree is correctly off-loading cognitive cost. If low (<25%), the gating criteria are too narrow and most PRs hit the detailed checks anyway — could either tighten gating ("does this PR ADD framework-discovered files" rather than "touch") or accept that Step 0 is universally relevant.
- **Step 4 NEW-claim discrimination.** The "claims not already verified in prior PRs against the same external source" criterion is mechanical-sounding but requires Codex to grep prior PRs for citations against the same source. If this is operationally hard (Codex doesn't have efficient prior-PR-citation grep), the operational-cost reduction may not materialize. Watch first 3-5 reviews to see if the NEW-claim scoping actually reduces work.
- **Catalog stability after pruning.** No Compass-original codified; no shape change; no anti-pattern category change. **First v0.3.x release that changes a load-bearing artifact's substance without changing the catalog framing.** Worth examining whether artifact-pruning becomes a recurring release class (alongside Compass-original codification, infrastructure, PR corrections, same-day corrections).
- **Retro-to-release pipeline.** 3 of 5 Retro #005 recommendations actioned in 3 consecutive sessions (v0.3.9 `[declare-not-implement]` codified · v0.3.10 `[hard-line-declaration]` codified · v0.3.11 reviewer.md pruned). 2 remain deferred: `[framework-on-framework]` codification (3 instances past threshold) and `setup-agent.py` propagation script. Both carried forward to next session as candidates.
- **Whether pruning was sufficient or whether reviewer.md needs further passes.** Pre-pruning length: ~165 lines. Post-pruning: estimate ~155 lines (compression in Step 0 + Step 4; consolidation in anti-patterns). Not dramatically shorter. If next 2-3 retros surface reviewer.md as still high-cost-per-read, a deeper pruning pass (or splitting into reviewer.md + reviewer-detail.md) may be warranted.

**Meta-observation — first session-ending release driven by retro artifact analysis rather than friction or codification.** Up through v0.3.10, every release was either Compass-original codification (recurring shape) or infrastructure (v0.3.7) or correction (PR #1 + v0.3.8 same-day). v0.3.11 is the first **artifact-cleanup release** — Retro #005 named specific overkill items in a load-bearing artifact; v0.3.11 acts on them. This is a third release-driver pattern (alongside friction-driven and codification-driven). Worth noting in the catalog framing: release drivers include friction → codification, codification readiness ranking → codification, artifact analysis → cleanup, infrastructure commitments → infrastructure ship. The retro framework was originally designed to surface the first three drivers; v0.3.11 confirms artifact analysis as a fourth.

**Cadence note.** v0.3.1 → v0.3.11 = **11 sessions, 9 Compass-originals + 1 infrastructure release + 1 artifact-pruning release + 1 PR correction + 1 same-day correction.** One-Compass-original-per-session cadence broken twice (v0.3.7 + v0.3.11) — both for legitimate non-codification work surfaced by retro. **The cadence isn't strict-Compass-original-only; it's substantive-progress-per-session.**

---

### 2026-06-02 — `[hard-line-declaration]` codified as 2nd scope-discipline class member — `commitment-drift` named (v0.3.10)

**Friction (carried from Retro #005 codification readiness ranking):** v0.3.6 CHANGELOG declared "if freshness detection slips a 4th time, the workflow-side defense from v0.3.3 must be re-examined" → v0.3.7 shipped freshness detection ON TIME after 3 slips. Retro #004 declared "if retro slips again, retro rationalization is no longer one-off" → Retro #005 fired ON TIME at improvement #25. **Same shape, two instances** — explicit slip-counters + named consequences in CHANGELOG / improvements.md create structural pressure that overcomes the diffuse "next substantive release is more important" rationalization. Retro #005 surfaced this as 2nd-priority codification candidate after `[declare-not-implement]`; v0.3.10 acts on it.

**Why now (carried from sequence A→B):** Housekeeping commits already shipped (v0.3.7 + v0.3.8 + same-day correction + Retro #005 + v0.3.9 as 5 clean per-release commits). Working tree was clean. Moving to B = `[hard-line-declaration]` codification per user's sequence pick.

**Change:**

- **New `[hard-line-declaration]` Compass-original** in `compass/framework/canon.md`. Names the pattern + mechanical three-part structure: (1) counter visibility in a load-bearing place (CHANGELOG release notes, improvements.md header next-retro counter); (2) named consequence at N+1 slip ("if it slips a 4th time, X will be re-examined"); (3) structural pressure overcoming rationalization. Names both instances + classification as scope-discipline 2nd member + `commitment-drift` anti-pattern + distinction from Principle #16 refuse-escalate (within-workflow vs across-releases scope) + tracking note for future-self.
- **`AGENTS.md` Workflow Structure section restructured for the scope-discipline class** — top paragraph explains the class as a whole; subsequent paragraphs document each member (`[declare-not-implement]` then `[hard-line-declaration]`). Catalog count updated: 6 shapes / 11 patterns; ratio 9 workflow-execution : 2 scope-discipline.
- **`CHANGELOG.md` v0.3.10 entry** documents the codification + the recursive observation that improvements.md "Next retro fires after #30" counter is itself an instance of the pattern just codified (3rd implicit instance arguably).

**Catalog grows from 6 shapes / 10 patterns → 6 shapes / 11 patterns.**

| Shape | Members (v0.3.10) | Governs |
|---|---|---|
| Enforcement | cite-or-mark-n/a · refuse-escalate · soft-spec-hardening · mechanical-output-verification (4) | What workflows REQUIRE at execution |
| Interaction | elicitation-with-options (1) | How workflows ASK users |
| Freshness | freshness-check (1) | How workflows STAY CURRENT |
| Observability | role-boundary (1) | How workflows EXPOSE STRUCTURE |
| Handoff | agent-handoff · agent-agnostic-role-assignment (2) | How workflows ROUTE across agents |
| **Scope-discipline** | **declare-not-implement · hard-line-declaration (2 — was 1)** | **What Compass declares/commits/defers at FRAMEWORK DESIGN TIME** |

**Scope-discipline class grows from 1 → 2 members.** Validates v0.3.9's introduction of the shape — it's not a one-off. Ratio: 9 workflow-execution : 2 scope-discipline.

**Anti-pattern named: `commitment-drift`.** When Compass commits to a future release and lets it slip silently, the commitment drifts indefinitely. Each individual slip is defensible ("substantive work is more important than this commitment"); the cumulative pattern is rationalization — Principle #14 applied to roadmap. `[hard-line-declaration]` is the structural countermeasure.

**Recursive observation worth noting:** the `compass/workflows/improvements.md` "Next retro fires after #30" counter mechanism that has been carrying the retro cadence since Retro #001 IS the pattern being codified. **Framework retroactively recognizing what it's been doing.** This could be considered a 3rd implicit instance for codification-confidence purposes; the canon entry cites only the 2 explicit "hard line" declarations (v0.3.6 CHANGELOG, Retro #004) but notes the implicit form. Worth examining in Retro #006 whether the implicit counter form should be treated as a 3rd codification instance.

**Files touched (4):** edited — `compass/framework/canon.md`, `AGENTS.md`, `CHANGELOG.md`, `compass/workflows/improvements.md` (this entry).

**Watch for:**
- **How often `[hard-line-declaration]` fires successfully in future release-planning sessions.** Each on-time ship after a declared hard line is a successful application; each slip past a declared consequence is data the pattern needs sharpening (tighter counter visibility, more specific consequences, escalation to enforcement-class).
- **Whether the workflow-execution:scope-discipline ratio (currently 9:2) continues.** Forward scope-discipline candidates named in canon: orchestrator selection (v0.4+) and consumer distribution (v0.4+). If both ship as scope-discipline patterns, ratio becomes 9:4 — still workflow-execution dominant but scope-discipline becomes a substantial second category.
- **`commitment-drift` recurrence.** Track future cases where commitments slip past a declared hard line. Each is data on whether `[hard-line-declaration]` is sufficient or whether the pattern needs supplementary mechanisms (e.g., automated CI checks on missed deadlines, escalation to enforcement-class).
- **Distinction from Principle #16 refuse-escalate.** Both family-relate to "structural enforcement of soft constraints." Refuse-escalate fires within a workflow at upstream-decision boundaries; hard-line-declaration fires across releases at roadmap-commitment boundaries. If a 3rd "structural-enforcement of soft constraints" pattern surfaces in a NEW scope, worth examining whether they should be subgrouped within enforcement+scope-discipline or constitute their own meta-shape.
- **Retro #005 deferred recommendations remaining:** `[framework-on-framework]` codification (3 instances past threshold) · reviewer.md pruning · `setup-agent.py` propagation script. 3 candidates carried forward for v0.3.11+.
- **Cadence held for 10 consecutive sessions.** v0.3.1 → v0.3.10 = 10 sessions, 9 Compass-originals + 1 infrastructure release. **The cadence commitment itself is implicitly hard-lined** — each release-planning decision happens against the visible "Compass-original per session" pattern in CHANGELOG. Worth examining whether to make this explicit (declare "if a session ships without a Compass-original AND without legitimate infrastructure reason, examine why").

**Meta-observation — codification of patterns that produced their own codification.** `[hard-line-declaration]` was discovered by being applied — Retro #004's hard line on retro cadence and v0.3.6's hard line on freshness detection both successfully delivered the work-they-named-the-consequence-for, and Retro #005 then surfaced the pattern for codification. **The pattern's success was its own evidence for codification.** Same shape as v0.3.9 `[declare-not-implement]` — discovered by the v0.3.8 same-day correction catching scope-creep. **First two scope-discipline patterns both originated from successful instances of themselves being applied, then named retrospectively.** Worth tracking whether all future scope-discipline patterns follow this discovery shape (applied-then-named) or whether some emerge from explicit theoretical reasoning before application.

**Cadence note.** v0.3.1 → v0.3.10 = **10 sessions, 9 Compass-originals + 1 infrastructure release (v0.3.7) + 1 PR correction (PR #1) + 1 same-day correction (v0.3.8 adapter-upstream).** One-Compass-original-per-session cadence holds for 10 sessions running. **Two consecutive sessions codifying from Retro #005's readiness ranking** (v0.3.9 `[declare-not-implement]` then v0.3.10 `[hard-line-declaration]`) — retro-to-release pipeline working as designed.

---

### 2026-06-02 — `[declare-not-implement]` codified as 1st scope-discipline class Compass-original — introduces 6th pattern shape (v0.3.9)

**Friction (carried from Retro #005 codification readiness ranking):** v0.3.5 `[agent-handoff]` parameterized over reviewer CLIs without writing per-CLI integrations. v0.3.8 same-day correction caught me about to ship per-agent adapter docs that would have duplicated upstream LiteLLM / Vercel AI SDK / OpenRouter / LangChain documentation. **Same shape, two instances** — Compass declares patterns + registries + manual fallback, doesn't build integrations. Retro #005 surfaced this as the top codification candidate; user picked B (codify) over A (propagation script) for v0.3.9.

**Why now (per user direction):** "lets go with B." Codifying `[declare-not-implement]` while the v0.3.8 same-day correction example is concrete gives the framework an explicit principle to invoke against future scope-creep. **Returns to substantive Compass-original cadence after v0.3.7 (infrastructure) + v0.3.8 (handoff Compass-original)** — 8 sessions / 8 Compass-originals + 1 infrastructure release; cadence holds.

**Change:**

- **New `[declare-not-implement]` Compass-original** in `compass/framework/canon.md`. Names the pattern + the 2 instances accumulated + the `integration-creep` anti-pattern it closes + the "applied at framework design time" framing + the "user as load-bearing oversight" honesty + the forward-compatibility note for v0.4+ scope-discipline candidates (orchestrator selection + consumer distribution).
- **`AGENTS.md` Workflow Structure section** gained scope-discipline pattern note — names it as the 6th pattern shape (first non-workflow-execution shape), cites both instances, names the `integration-creep` anti-pattern, names user as load-bearing oversight.
- **`compass/templates/workflow-template.md`** gained inline `SCOPE-DISCIPLINE` commentary block with a workflow-author heuristic ("would this duplicate upstream work?") for invoking the pattern when about to add per-X documentation or adapter code.
- **`CHANGELOG.md` v0.3.9 entry** documents the catalog growth (5 shapes / 9 patterns → 6 shapes / 10 patterns), names what's deferred from Retro #005 recommendations, notes the cadence holding.

**Catalog grows from 5 shapes / 9 patterns → 6 shapes / 10 patterns.**

| Shape | Members | Governs |
|---|---|---|
| Enforcement | cite-or-mark-n/a · refuse-escalate · soft-spec-hardening · mechanical-output-verification (4) | What workflows REQUIRE at execution |
| Interaction | elicitation-with-options (1) | How workflows ASK users |
| Freshness | freshness-check (1) | How workflows STAY CURRENT against external sources |
| Observability | role-boundary (1) | How workflows EXPOSE STRUCTURE |
| Handoff | agent-handoff · agent-agnostic-role-assignment (2) | How workflows ROUTE across agents |
| **Scope-discipline (NEW)** | **declare-not-implement (1)** | **What Compass declares vs builds vs delegates at FRAMEWORK DESIGN TIME** |

**The split is meaningful.** The first 5 shapes govern WORKFLOW EXECUTION (what fires when a workflow runs). Scope-discipline governs FRAMEWORK SCOPE (what fires when Compass's own scope is being decided). Different abstraction level, different audience (framework contributors vs workflow executors). The canon entry, AGENTS.md note, and workflow-template inline commentary all explicitly call this out.

**Workflow-execution patterns total 9; scope-discipline (framework-design pattern) totals 1.** Worth examining in Retro #006 whether the 9-to-1 split holds or whether scope-discipline grows additional members. Forward candidates named explicitly in canon entry: orchestrator selection (v0.4+) and consumer distribution (v0.4+).

**Anti-pattern named: `integration-creep`.** When integration surfaces expand (new AI provider, new vendor CLI, new framework version, new MCP server), the temptation is to add per-integration documentation or adapters to Compass. **Integration scope grows linearly with the integration count; Compass-maintainer scope does not.** The result is stale Compass docs, brittle Compass adapters, and a framework whose maintenance burden grows past its sustainable size. `[declare-not-implement]` is the structural countermeasure — invoked when about to ship integration work that should be upstream or consumer-side.

**User as load-bearing oversight — named explicitly for the first time in canon.** Prior Compass-originals named user as approver (HITL gates) or arbiter (PM disputes), but not as load-bearing oversight against the framework's own scope creep. v0.3.8 same-day correction was caught by user, not by the framework. The canon entry names this honestly: "the framework's `[declare-not-implement]` reflex is real but not infallible; user judgment is part of the system." **First Compass-original that names user judgment as part of the structural system.** Future v0.4+ multi-agent architecture (orchestrator vision) must preserve this user-as-oversight role; orchestrator agency does not replace it.

**Files touched (5):** edited — `compass/framework/canon.md`, `AGENTS.md`, `compass/templates/workflow-template.md`, `CHANGELOG.md`, `compass/workflows/improvements.md` (this entry).

**Watch for:**
- **How often does `[declare-not-implement]` fire in future release-planning sessions?** Each catch is a successful application; each miss (user catching it) is data for the load-bearing-oversight observation. Track in Retro #006 codification readiness ranking.
- **Scope-discipline shape's 2nd member.** Forward candidates named: orchestrator selection + consumer distribution. When v0.4+ work starts, these are the natural next scope-discipline patterns. If a different scope-discipline pattern surfaces first, that's signal about which scope decisions are most pressing.
- **`integration-creep` anti-pattern recurrence.** Watch for cases where contributors (or AI agents like me) start drafting per-integration documentation or adapters. Naming the anti-pattern gives Codex review + Engineer self-check + framework reviewers a vocabulary to flag it.
- **Framework-design-time shape vs workflow-execution-time shape.** v0.3.9 introduces the first design-time pattern. Future patterns may sit in either bucket. The catalog framing in canon.md + AGENTS.md treats them as distinct shapes; if 2-3 more design-time patterns emerge, the framing may need finer-grained subdivision (e.g., release-planning-discipline vs codification-discipline).
- **Retro #005 deferred recommendations:** `[hard-line-declaration]` codification + `[framework-on-framework]` codification + `compass/roles/reviewer.md` pruning + `setup-agent.py` propagation script. All carried forward as v0.3.10+ candidates. **Counter ticks to #26; next retro fires after #30 — 4 more substantive improvements needed.**
- **CHANGELOG growth.** Eight sessions of changes accumulating (v0.3.0-alpha → v0.3.9). At some point a 0.4.0 release branch will be the natural shape; v0.4 architectural rework (orchestrator + multi-agent) is the obvious break point.
- **9 commits worth of uncommitted work accumulating across v0.3.7 → v0.3.9.** Housekeeping pending; user mentioned commits as orthogonal to substance. Should bundle cleanly before piling more on.

**Meta-observation — the framework's first design-time Compass-original closes a recurring meta-failure.** Up to v0.3.8 every Compass-original governed workflow execution. The same-day correction in v0.3.8 surfaced that the framework's design-time scope decisions were themselves a soft-spec rationalization surface (Principle #14 applied recursively): per-agent adapter docs felt like "completing" the agent-agnostic pattern, but actually re-introduced the integration-creep failure mode. **Codifying `[declare-not-implement]` is the framework recognizing that its own scope is governed by the same discipline as its workflows.** Recursive Compass-on-Compass at a structural level — directly relevant to Retro #005's `[framework-on-framework]` 3rd-instance observation. Worth noting that scope-discipline + framework-on-framework are closely related: scope-discipline is what the framework does to itself; framework-on-framework is the meta-observation that it does so. They could codify as separate patterns (current direction) or merge as one (if 4th `[framework-on-framework]` instance is also scope-discipline-shaped).

**Cadence note.** v0.3.1 → v0.3.9 = 9 sessions, 8 Compass-originals + 1 infrastructure release (v0.3.7) + 1 PR correction (PR #1 to v0.3.6) + 1 same-day correction (v0.3.8 adapter-upstream). One-Compass-original-per-session cadence holds for 9 sessions running.

---

### 2026-06-02 — `[agent-agnostic-role-assignment]` codified + `compass/config.yaml` gains `agents:` registry + `defaults:` + per-role `tool_assignments` validated against registry (v0.3.8)

**Friction (re-framed twice during planning):**

User initially asked: "I want to allow ChatGPT/OpenAI for product manager roles and use Claude for tech roles. How can I configure that in the config?"

Drilling into mechanism surfaced an honest gap: **`tool_assignments` is documentation only today.** Nothing in Compass programmatically reads it; grep confirmed zero references outside `config.yaml`. **10 files independently hardcode the Claude+Codex split in prose** (the "3-surface drift" named when user first asked "where can I configure the AI agents"). The string `claude` next to `pm:` was a label humans read — it didn't gate which tool could be invoked.

User then **re-framed significantly**: "my vote is to have options to select agents — openai, claude, gemini, apple intelligence, deepseek, Codestral, custom — I can pick any from the list. And the package should have default configuration built in leveraging the same compass files as inputs."

This shifted the work from "edit one config field for one role" to "generalize the `[agent-handoff]` v0.3.5 pattern (reviewer-only agent-agnosticism) to every role, with built-in defaults."

User then **re-framed again** (architectural): "ideally there should be an orchestrator agent in the list that runs point and controls — something like what came out in Claude's latest version of dynamic workflows. Ideally each workflow is a different agent type. Let's think through before we decide." This raised the v0.4/v0.5 multi-agent rearchitecture vision.

**User decision (after thinking through):** "lets add it to the improvements for now. lets move with A." → Continue v0.3.x methodology line; ship L1 substantive (pattern + registry + defaults); defer orchestrator vision to v0.4+ explicitly. **L1 is forward-compatible with the orchestrator vision** — registry shape naturally extends to declare an `orchestrator` entry.

**Change:**

- **New `[agent-agnostic-role-assignment]` Compass-original** in `compass/framework/canon.md`. Generalizes `[agent-handoff]` v0.3.5 (reviewer-only agent-agnosticism) to every role. Names the 8 supported agents at codification + the 2-instance codification rationale.
- **`compass/config.yaml` `agents:` registry** — 8 entries: `claude`, `codex`, `openai` (ChatGPT/GPT API), `gemini`, `deepseek`, `codestral`, `apple` (marked `unsupported: true`), `custom`. Each declares `invocation` pattern (`cli` / `api` / `manual`), `context_loading` convention, `auth_env` (API key env var), `maturity` flag, and `note:` describing the integration path. **Apple flagged unsupported honestly** rather than faked — Apple Intelligence is system-level (Writing Tools, Summarization) without an open API for arbitrary role-playing.
- **`compass/config.yaml` `defaults:` block** — `implements: claude` · `reviews: codex` · `product: claude` · `tech-writes: claude`. Categorizes roles by job-shape; serves as fallback when `tool_assignments` doesn't enumerate a role.
- **`compass/config.yaml` `tool_assignments:` validated against registry** — per-role agent picks with comments showing which `defaults:` category each falls under; structural constraint (reviewer + security_reviewer must use different model than implementer) explicit in inline comment.
- **`AGENTS.md` "Tool division of labor" reframed** — from hardcoded `Claude | All roles EXCEPT...` + `Codex | Reviewer, Security Reviewer` to: (a) registry table of 8 supported agents with maturity flags; (b) defaults table of 4 role categories; (c) structural rationale for the reviewer-different-model constraint; (d) override examples (showing `pm: openai`, `designer: gemini`, etc.). **First of the 10 hardcoding files to derive from config**; rest update in v0.3.9 (L2 adapter docs) + v0.3.10 (L3 propagation script).
- **`compass/templates/workflow-template.md`** gained inline commentary block on agent-agnostic role assignment — workflow steps that load a role reference `tool_assignments` for which agent plays it; forward-compatible with v0.4+ orchestrator vision.
- **`README.md` "Core ideas"** — Claude+Codex line updated to "Agent-agnostic by design; defaults built in" with all registry agents enumerated; preserves "default = Claude implements, Codex reviews" for empirical validation argument.
- **`SETUP.md`** gained "Picking which agent plays which role" section — step-by-step override guide with example showing ChatGPT for PM + Gemini for designer + Claude for engineer + Codex for reviewer; names reviewer-different-model constraint inline; notes non-default agents may require manual prompt-directory setup until v0.3.10 propagation script ships.

**Catalog balance shifts.** Before v0.3.8: 4 enforcement : 4 usability (interaction · freshness · observability · handoff). **After v0.3.8: 4 enforcement : 5 usability** (interaction · freshness · observability · 2 handoff). Handoff class gains a 2nd member. Worth examining in Retro #005 — was 5-enforcement-lean after v0.3.6's mechanical-output-verification; v0.3.7 (infrastructure) held balance; v0.3.8 swings 5-usability. Bias signal or natural emergence?

**Future direction — orchestrator vision deferred to v0.4+.** User raised this as the architectural endpoint Compass is moving toward. Documented for future-self / next /retro examination:

- **Pattern shape:** orchestrator agent reads `compass/config.yaml` + `AGENTS.md` + user intent → routes to specialized workflow-agents → workflow-agents read role context + execute → orchestrator manages handoffs + HITL gates + DRI logging across agents
- **Each Compass workflow becomes a separate agent type** (per user vision) — `/setup-product` is one agent, `/build` is another, etc. — 17 workflows = 17 workflow-agents. Or 13 role-specialized agents. Or a hybrid.
- **The v0.3.8 `agents:` registry shape is the foundation** — naturally extends with `orchestrator:` and per-workflow `workflow_agents:` entries
- **Key questions for v0.4/v0.5 work** (preserved here so framing isn't lost):
  1. Unit of agency — per-workflow agent (17) vs per-role agent (13) vs hybrid
  2. Where orchestrator runs — Compass-side declarative spec vs runtime-layer (Claude Agent SDK / OpenAI Assistants / LangGraph) vs both
  3. What "controlling" means — just routing vs routing+state vs full conductor (which can replace PM-as-arbiter — major philosophy choice)
  4. How existing Compass principles survive — #14 soft-spec-hardening, #15 cite-or-mark-n/a, #16 refuse-escalate need to live as agent constitutions; risk = prompt generation drift from intent at generation time (same `polished-but-broken` shape we just codified in v0.3.6)
  5. Cost/latency reality — multi-agent systems are expensive and slow vs single-agent; need fast-path for simple cases that stay single-agent
  6. MVP shape — declarative-only (registry, no runtime) vs reference orchestrator (1-2 example workflow-agents) vs full transition (all 17 workflows ported)
  7. Lock-in risk — Claude Agent SDK ties Compass to Claude stack at orchestrator layer; contradicts v0.3.5 agent-agnostic principle; generic abstraction is harder but preserves posture
- **This is the framework's first explicit architectural-rearchitecture deferral with reasoning preserved** rather than silently dropped or implicitly absorbed. Worth examining as a positive pattern in Retro #005.

**Files touched (8):** edited — `compass/framework/canon.md`, `compass/config.yaml`, `AGENTS.md`, `compass/templates/workflow-template.md`, `README.md`, `SETUP.md`, `CHANGELOG.md`, `compass/workflows/improvements.md`.

**Watch for:**
- **Catalog-balance bias.** v0.3.8 swings the catalog from 4:4 (after v0.3.6) to 4:5 enforcement-vs-usability. If the next 1-2 Compass-originals also land in usability shapes, that's a pattern worth naming — is Compass evolving toward "make itself usable" over "make itself harder to violate"? If so, intentional or accidental? **Retro #005 should examine.**
- **The 9 remaining hardcoding files.** AGENTS.md "Tool division of labor" now derives from config (1 of 10 hardcoding files updated). README, CLAUDE.md, SETUP, skill files, .codex/prompts, canon.md, build.md, fix.md still hardcode Claude+Codex split. v0.3.9 (L2 adapter docs) + v0.3.10 (L3 propagation script) close the gap. If users hit drift between these files before v0.3.10, escalate the propagation script.
- **Multi-consumer adoption gap continues.** aura-app (v0.2.x) + crypto-app (v0.3.x active). v0.3.7 detection ran on framework repo only; v0.4+ distribution ships consumer-side propagation. The v0.3.8 registry-as-source-of-truth shape doesn't change this — until L3 propagation lands, each consumer still maintains its own copy of `compass/`. Watch whether consumer drift becomes acute enough to force L3 earlier than v0.3.10.
- **Agent registry maturity churn.** OpenAI / Codex / Gemini / Anthropic CLIs evolve rapidly. The `maturity:` flags in the registry are a point-in-time snapshot. **The `[freshness-check]` pattern applies** — registry entries with `external_source:` could carry freshness markers. Defer until first noticed staleness; could be a v0.3.9 enhancement if multiple registry entries drift in the same month.
- **Apple Intelligence `unsupported: true` re-examination.** Apple's developer-facing AI surface evolves; if Apple ships an open API for arbitrary on-device role-playing, the registry flag should flip. Track via the freshness-check pattern (`external_source: https://developer.apple.com/apple-intelligence` or similar). Defer until Apple ships such an API.
- **Orchestrator-vision re-examination triggers.** When does v0.4/v0.5 work start? Candidates: (a) user explicitly asks; (b) the registry-as-documentation-only limitation becomes acute (someone manually triggers wrong agent for a role multiple times); (c) cost/coordination overhead of multi-tool sessions becomes visible enough to want orchestrator state management. **Watch for which trigger fires first.**
- **Improvement counter — Retro #005 fires.** This is improvement #25; cadence promised retro after #25 → fires next. Watch whether (a) Retro #005 happens this session (concurrent with v0.3.8) or (b) defers to a separate session (cleaner separation but risks repeating the v0.3.4 → v0.3.6 retro-deferral pattern).

**Meta-observation — the planning loop itself was the work.** v0.3.8 substance is light (8 files, mostly registry declaration). But the planning loop — initial framing → mechanism diagnosis → reframing to multi-tool → reframing to orchestrator → deciding path A — was where the conceptual work happened. This is consistent with Compass's design philosophy: **the methodology IS the work; the substance is mostly declaration of decided patterns.** Worth noting as confirmation that framework evolution is mostly conceptual + declarative, not implementation-heavy.

**Cadence note.** v0.3.1 (Access & Data Posture) · v0.3.2 (elicitation-with-options) · v0.3.3 (freshness-check) · v0.3.4 (role-boundary) · v0.3.5 (agent-handoff + same-day extension) · v0.3.6 (mechanical-output-verification codified) · v0.3.7 (INFRASTRUCTURE — freshness detection shipped, no new Compass-original) · v0.3.8 (agent-agnostic-role-assignment codified) = **8 sessions, 7 Compass-originals + 1 infrastructure release.** Back to one-Compass-original-per-session cadence after v0.3.7's legitimate infrastructure break.

**Same-day correction — 2026-06-02: adapter layer is upstream, not Compass-side.**

User direction immediately after v0.3.8 L1 shipped: *"we are not creating per agent adapter we will use an existing adapter like litellm and other competitors for the adapters."* The originally-planned L2 (per-agent adapter docs at `compass/agents/<agent>.md`) is **not a Compass deliverable**. Compass would have been duplicating upstream documentation that's already maintained by LiteLLM, Vercel AI SDK, OpenRouter, LangChain, etc.

**What this is:**
- Compass declares the agent registry (`compass/config.yaml`)
- For API-based agents (openai, deepseek, codestral, future API providers): use an upstream adapter library — **LiteLLM recommended**; Vercel AI SDK / OpenRouter / LangChain alternatives
- For full-agent CLIs (claude / codex / gemini): the CLI tool IS the adapter; no upstream library needed
- Compass doesn't write per-agent adapters; the adapter routes API calls to the right provider given a model string

**Why this is the right call:**
- LiteLLM handles 100+ LLM providers with a unified API + standard env var conventions — solved problem, maintained upstream
- Vercel AI SDK does the same for TS/JS projects
- OpenRouter is the hosted version of the same idea
- Per-agent adapter docs in Compass would (a) duplicate upstream documentation, (b) go stale as adapters add providers, (c) put Compass in a layer that's not its job
- **Same shape as v0.3.5 `[agent-handoff]`** — that pattern parameterizes over reviewer CLIs without writing per-CLI integrations; v0.3.8 + this correction extends the same restraint to per-tool agents

**Change:**
- **`compass/config.yaml` `agents:` block top comment expanded** — declares the adapter layer is upstream + lists 4 recommended libraries (LiteLLM, Vercel AI SDK, OpenRouter, LangChain) + clarifies that full-agent CLIs ARE the adapter for their respective agents
- **`compass/config.yaml` API-based agent entries (openai, deepseek, codestral) gained `adapter: litellm` field** + updated `note:` referencing LiteLLM model strings (e.g., `openai/gpt-5`, `deepseek/deepseek-chat`, `mistral/codestral-latest`); Compass passes `compass/roles/<role>.md` as system prompt
- **`compass/framework/canon.md` `[agent-agnostic-role-assignment]` entry forward-looking section** updated — L2 (per-agent adapter docs) explicitly NOT a Compass deliverable; v0.3.9 becomes what was previously L3 (CLI-agent prompt directory propagation script)
- **`CHANGELOG.md` v0.3.8 Roadmap clarification + Notes** updated — name the correction explicitly + note this is the **first v0.3.x release with a same-day correction to the deferred roadmap** (not just to the substance)
- **this improvements.md entry** updated with this same-day correction subsection

**Forward roadmap simplified:**
- **v0.3.9 (was v0.3.10):** `compass/scripts/setup-agent.py` propagation script — generates `.codex/prompts/<role>.md` and `.gemini/prompts/<role>.md` files for CLI-based assigned agents (small scope; ~3-5 files)
- **v0.4+:** still the orchestrator vision (deferred for substantive multi-agent architecture)
- **L2 removed entirely** — adapter docs are upstream

**Files touched (5):** edited — `compass/config.yaml`, `compass/framework/canon.md`, `CHANGELOG.md`, `compass/workflows/improvements.md` (this entry), and (planned) `SETUP.md` to mention LiteLLM in the "Picking which agent plays which role" section.

**Watch for:**
- **Adapter-library churn risk.** LiteLLM and competitors evolve rapidly (new providers, new model strings, breaking API changes). The `[freshness-check]` pattern could apply to adapter recommendations — `compass/config.yaml` `agents:` block could gain a `last_verified` marker pointing at the LiteLLM repo. Defer until first noticed staleness.
- **"Compass becoming smaller" as a positive scope-discipline pattern.** This is the **2nd structurally-distinct instance of the framework declaring patterns rather than building implementations** (1st: v0.3.5 `[agent-handoff]` parameterized over reviewer CLIs without writing per-CLI integrations; 2nd: v0.3.8 + this correction extends restraint to per-tool agents via upstream adapter libraries). If a 3rd instance surfaces, candidate Compass-original: `[declare-not-implement]` or `[upstream-delegation]` — a meta-pattern about Compass's scope discipline. Worth retro #005 examination.
- **First same-day correction to deferred roadmap (not to substance).** v0.3.5 had a same-day extension (3 implementation lessons). v0.3.6 had a PR#1 correction (Next 16 anchor). v0.3.8 has a same-day **roadmap correction** — different shape: this isn't fixing what shipped, it's reshaping what was planned to ship next. Pattern or one-off?
- **Multi-consumer adoption simplification.** With L2 removed, consumers don't need to wait for Compass-side per-agent adapter docs. They can adopt LiteLLM (or alternative) for API-based agents and use CLI tools directly for full-agent CLIs. **The path from v0.3.8 to actual multi-agent usage in aura-app or crypto-app gets shorter.**

**Meta-observation — the framework's reflex to declare-not-implement stayed intact under user reality-check.** The originally-planned L2 (8 adapter docs) was an instance of scope-creep that I almost shipped. User caught it immediately. This is exactly the soft-spec-rationalization pattern Principle #14 closes — applied to Compass's own scope discipline. Worth surfacing in Retro #005 as evidence the framework's principles work when applied to itself, with user as the load-bearing oversight (not the framework alone).

---

### 2026-06-01 — Freshness detection shipped (pull-bridge round 2 — 3-slip commitment closure) (v0.3.7)

**Friction:** Three consecutive roadmap slips. v0.3.3 committed freshness detection to v0.3.4; v0.3.4 bumped to v0.3.5+; v0.3.5 bumped to v0.3.6+; v0.3.6 CHANGELOG set hard line: 4th slip triggers re-examination of whether v0.3.3 workflow-side defense is sufficient. User picked v0.3.7 = freshness detection. **The hard line worked** — it created structural pressure that overcame the rationalization-toward-higher-leverage-substantive-releases pattern.

**This is not a new Compass-original.** v0.3.7 is infrastructure shipping a previously-named pattern's round-2 mechanism. First v0.3.x release without a new Compass-original — the cadence "one Compass-original per session" broke here for legitimate reason. Whether infrastructure releases should count separately is a question for next `/retro`.

**Change:**

- **NEW: `compass/scripts/check-freshness.py`** — single-file Python 3 stdlib script. Walks `compass/` for files with `last_verified:` frontmatter; queries each `external_source`:
  - GitHub repo URLs → GitHub API releases > tags > commits (decreasing accuracy)
  - Generic URLs → HTTP HEAD/GET for `Last-Modified` header
  - Comparison: external ≤ `last_verified` → auto-bump (safe); external > `last_verified` → flag (manual review); error → flag-with-error
  - Flags: `--apply` (mutate), `--today` (deterministic CI), `--out` (write report), `--root` (override).
  - Exit 0 = all safe; exit 1 = flags or errors (signals CI to open PR/Issue).
- **NEW: `.github/workflows/freshness-check.yml`** — runs script weekly (Mondays 06:00 UTC) on Compass repo. Bumps → opens PR. Flags only → opens Issue. Everything fresh → no action. **First time `.github/workflows/` is being used in the Compass framework repo itself.**
- **`compass/scripts/README.md`** gained dedicated `check-freshness.py` section (usage / exit codes / detection strategies / accuracy honesty / automation / when-to-use).
- **`compass/framework/canon.md` `[freshness-check]` entry** — round 2 status: "deferred" → "shipped v0.3.7" with mechanism described.
- **`AGENTS.md` Workflow Structure freshness note** — round 2 status: shipped.

**First-run validation surfaced real value immediately.** Dry-run on Compass repo (`python compass/scripts/check-freshness.py`) flagged `compass/roles/reviewer.md` because Codex GitHub had a release published 2026-06-01 (same day as ship); `last_verified` was 2026-05-27. **This is the precise scenario the v0.3.3 workflow-side defense was designed for** — but it would have caught it at next `/build` invocation, not in the framework repo. Round 2 catches it at the source, before any consumer-side workflow needs to refuse. First detection event in the framework's history. **Codex review format may genuinely need re-verification** — surface as Compass-side action item independent of v0.3.7.

**Multi-consumer reality named during planning.** aura-app (at framework v0.2.x) + crypto-app (at framework v0.3.x active) with no sync mechanism between them — manual copy at consumer bootstrap, then drift indefinitely. **This is the round-3 distribution problem from v0.3.3's original framing.** Round 2 detects in the framework repo; round 3 propagates to consumers. Still deferred because round 3 requires real distribution infrastructure (auto-PR to consuming repos, version markers in consumer `compass/config.yaml`, sync tooling). v0.4+ candidate. Multi-consumer reality strengthens motivation but doesn't yet override the cadence.

**Honest scope reminder.** Detection is HTTP-level — timestamp comparison, not content semantic analysis:
- A doc page may change cosmetically without affecting Compass; the script flags it anyway.
- A CLI tool may publish a release that doesn't change its surface; the script flags it anyway.
- Auto-bump only happens when external is UNCHANGED (directional bias toward "flag rather than silently mark fresh").
- Network errors flag rather than bump.
- Semantic-level detection (did the Codex CLI surface ACTUALLY change?) requires LLM + structured-output prompting — round 2.5+ territory if false-positive flagging becomes noisy.

**Files touched (6):** new — `compass/scripts/check-freshness.py`, `.github/workflows/freshness-check.yml`. Edited — `compass/scripts/README.md`, `compass/framework/canon.md`, `AGENTS.md`, `CHANGELOG.md`, `compass/workflows/improvements.md`.

**Watch for:**
- **First-week false-positive rate.** When the workflow runs Monday 2026-06-08, how many of the flagged files are *genuinely* stale vs cosmetically-changed external sources? If false-positive rate > 50%, prioritize round 2.5 (semantic verification of flagged files via LLM). If < 25%, current accuracy bounds are acceptable.
- **GitHub API rate limits.** Unauthenticated calls cap at 60/hour. Compass currently has 1 file with freshness markers; even 100 files would be fine. If consumer-side adoption scales the marker-count significantly, the workflow may need to switch to authenticated calls (`secrets.GITHUB_TOKEN` is already passed for `gh` CLI; just need to add as `Authorization: token` header in the script). Defer until needed.
- **`.github/workflows/` directory introduction.** First time Compass repo has CI. Future workflows may follow (release tagging? doc preview? scanner runs?) — but each addition should justify itself against the "Compass is a framework, not an app" framing. Single-purpose workflows only.
- **Hard-line declarations as pattern.** The v0.3.6 CHANGELOG's "4th slip triggers re-examination" line created structural pressure that actually delivered. Worth examining in next `/retro`: is this a recurring shape (explicit slip-counters + hard-line declarations as soft-spec-hardening applied to roadmap commitments)? If yes, formalize as a Compass-original (`[hard-line-declaration]`?) — but wait for 2nd structurally-distinct instance per codification rule.
- **First detection event coincidence?** Codex GitHub released on the same day Compass shipped detection. Coincidence, OR signal about external-tool change velocity in the v0.3.x cycle? If Codex / Vercel / Next.js / Anthropic CLIs release frequently (>weekly), the freshness window of 30 days in reviewer.md may be too long — should probably be 7-14 days for fast-moving tools. Monitor 4-week flag rate before adjusting.
- **Multi-consumer drift continues until round 3.** aura-app stays at v0.2.x until consumer actively pulls or round 3 ships. If a 3rd consumer project appears (likely as Compass adoption broadens), the case for round 3 becomes overwhelming — schedule v0.4 explicitly then.
- **Infrastructure-release tracking.** v0.3.7 broke the "one Compass-original per session" cadence for legitimate infrastructure reasons. Next retro should examine whether infrastructure releases (mechanism-shipping for previously-named patterns) should be tracked separately from substance releases (new Compass-originals). Counter-correction candidate: add `release_type: infrastructure | compass-original | mixed` field to CHANGELOG entries.

**Meta-observation — the hard-line worked.** v0.3.6 CHANGELOG named the 4th-slip consequence explicitly; v0.3.7 shipped before that consequence triggered. This is the framework's discipline applied to its own roadmap: **soft commitments to future-self get rationalized away unless structurally hardened** (per Principle #14 applied recursively). The hard-line declaration is itself a structural hardening — mechanically visible, in-CHANGELOG, with a named consequence. **First instance of this pattern observably working.** Worth a name for retro consideration: `[hard-line-declaration]` or `[explicit-slip-counter]` — defer codification until 2nd instance.

**Cadence note.** v0.3.1 (Access & Data Posture) · v0.3.2 (elicitation-with-options) · v0.3.3 (freshness-check) · v0.3.4 (role-boundary) · v0.3.5 (agent-handoff + same-day extension) · v0.3.6 (mechanical-output-verification codified) · v0.3.7 (INFRASTRUCTURE — freshness detection shipped) = **7 sessions, 6 Compass-originals + 1 infrastructure release.** The cadence held for 6 consecutive sessions before its first legitimate break. Next retro fires after improvement #25 (this is #24; 1 more entry needed).

---

### 2026-06-01 — `[mechanical-output-verification]` codified + Codex review process gains Step 0 framework-registration + 4 new named anti-patterns (v0.3.6)

**Friction (informed by Retro #004):** Retro #004 fired 2 cycles overdue at improvement #22 (this is improvement #23). It surfaced `[mechanical-output-verification]` as codification-ready — 2 instances accumulated: (1) CB-1.4 dashboard proxy `.next/server/middleware-manifest.json` inspection from v0.3.5 same-day extension; (2) Codex's own self-critique from the same cycle ("Start with framework registration checks before reading functional tests" + "Prefer 'is this actually deployed by the framework?' over 'do the tests pass?'"). Same shape: inspect runtime/build artifact before trusting source-level, test-level, or narrative signals. Codification rule satisfied.

**Why now:** First time a *deferred* Compass-original candidate is being codified after accumulating 2 instances in the wild. Prior canon entries (e.g., `[freshness-check]` v0.3.3, `[elicitation-with-options]` v0.3.2) shipped with their 1st instance because the pattern itself was novel enough to name at first sight. `[mechanical-output-verification]` is the first that earned codification by *accumulated evidence* rather than *novelty at first sight*. Validates the 2-3-instance rule as a working codification mechanism, not a stalling tactic.

**Change:**

- **New `[mechanical-output-verification]` Compass-original** in `compass/framework/canon.md`. 4th enforcement-class member (joining cite-or-mark-n/a · refuse-escalate · soft-spec-hardening). Names: framework anchors (Next.js manifests / Vercel Functions output / Expo prebuild native config) + general principle (when runtime config is data-driven, source ≠ runtime — inspect runtime) + the two instances + `polished-but-broken` as the anti-pattern it closes.
- **`compass/roles/reviewer.md` gained Step 0 — framework-registration check.** Before functional analysis, Codex verifies build output / runtime artifact for changes touching framework-discovered surfaces (file-based routing, middleware auto-registration, plugin discovery, asset bundling). REQUIRED for routing-layer / discovery-layer / framework-convention changes; OPTIONAL for pure logic changes. Direct application of Codex's own self-critique point #1 + #5.
- **`compass/roles/reviewer.md` gained Step 4 — review-time freshness check.** When story or DRI Decision names a runtime behavior or file convention as load-bearing, Codex re-verifies the claim against current primary docs — does not trust story-as-written. BLOCKER promotion when claim is wrong regardless of how cleanly implementation follows the (incorrect) story. This is `[freshness-check]` applied at review time, not just doc-load time.
- **`compass/roles/reviewer.md` Anti-patterns gained 4 new named entries:**
  - `polished-but-broken` (formalized from v0.3.5)
  - `direct-import-test-suspicious` (Codex point #2 — when feature depends on framework discovery, direct-import tests bypass the discovery mechanism)
  - story-claim-trust-without-primary-doc-verification (load-bearing story claims must be re-verified at review time)
  - `narrow-bug-focus` (Codex's own self-named failure mode — finding real bugs at functional layer while missing higher-altitude framework-legality issues)
- **`compass/workflows/build.md` Phase 2 step 7** gained explicit `[mechanical-output-verification]` citation. Retrofit of formal pattern name onto the existing implementation from v0.3.5 same-day extension.
- **`AGENTS.md` Workflow Structure section** gained note about `[mechanical-output-verification]` as 4th enforcement-class. Explicit balance framing: **4 enforcement : 4 usability**.
- **`compass/templates/workflow-template.md` gained inline commentary** about applying the pattern when workflows include build/deploy/framework-discovery steps.
- **`compass/framework/canon.md` `[freshness-check]` entry extended** with review-time application note (the pattern applies to story claims at review time, not just to Compass-doc-load time).
- **CHANGELOG v0.3.6 entry** documents all of the above + 3rd consecutive freshness-detection slip (with hard line — if it slips a 4th time, the workflow-side defense from v0.3.3 must be re-examined).

**Codex's own self-critique drove half the changes.** First time Compass evolution was driven by a reviewer agent's own retrospective rather than user friction or framework-on-framework reflection alone. Worth watching whether this pattern recurs:
- Point 1 (framework registration before tests) → Step 0
- Point 2 (direct-import-test suspicion) → named anti-pattern
- Point 3 (re-verify load-bearing framework claims) → Step 4 review-time freshness
- Point 4 (AC contradictions earlier) → **NOT integrated** (single instance only, defer per codification rule; surfaced for next retro)
- Point 5 (prefer "is this deployed?" over "do tests pass?") → embedded in Step 0 reasoning + canon entry

**Retro #004 → v0.3.6 framing held cleanly.** The retro reported findings; v0.3.6 was the prescriptive response. Retro framing ("reports — does not prescribe") survived its first real-world test where it directly preceded a substantive release. The two layers (reflection / action) stayed separable. Framework-on-framework working.

**Files touched (7):** edited — `compass/framework/canon.md` (mechanical-output-verification entry + freshness-check review-time extension), `AGENTS.md` (4th enforcement-class note + 4:4 balance framing), `compass/roles/reviewer.md` (Step 0 + Step 4 + 4 new named anti-patterns), `compass/workflows/build.md` (canon reference in step 7), `compass/templates/workflow-template.md` (inline commentary), `CHANGELOG.md` (v0.3.6 entry), `compass/workflows/improvements.md` (this entry).

**Watch for:**
- **Will Step 0 reduce `polished-but-broken` recurrence in next reviews?** The retrospective evidence base for `[mechanical-output-verification]` is 2 instances; the test is whether real reviews (next 5-10 PRs across aura-app and future Compass consumers) catch framework-registration issues that previously slipped through. If they do — codification was the right move. If `polished-but-broken` keeps recurring — Step 0 is insufficient; escalate to scanner check or build-time gate.
- **Will Codex actually apply Step 0 vs rationalize past it?** Codex's own retrospective produced these points. The codification embeds them into the role file. But Principle #14 says: agents under load rationalize away constraints, even ones they helped author. Watch for Codex review comments that skip Step 0 for "obvious" cases — that's the rationalization surface re-opening.
- **First-time codification-by-accumulated-evidence — pattern or one-off?** v0.3.6 is the first deferred Compass-original promoted after 2 instances. If the next 2-3 codifications also follow accumulated-evidence path (vs novelty-at-first-sight), the 2-3-instance rule is a working codification mechanism. If accumulated-evidence codification stays one-off, examine why (novelty-at-first-sight may be the dominant path, with deferred-then-codified rare).
- **AC consistency check (Codex point #4) recurring?** Single instance now (CB-1.4). If a 2nd structurally-distinct AC-contradiction instance surfaces, `[ac-consistency-check]` graduates to codification candidate. Probably belongs in `/create-story` Standard Experience Checklist.
- **Freshness detection 4th slip.** v0.3.6+ continues the deferral. Hard line in CHANGELOG: if 4th slip happens, workflow-side check from v0.3.3 must be re-examined. This is the **structural escalation mechanism** — same shape as retro-counter visibility in v0.3.0-alpha. The slip is now load-bearingly visible.
- **5-shape catalog vs 6-shape pressure.** v0.3.6 added a member to existing shape, did not introduce 6th shape. If a future Compass-original (`[defense-in-depth-marker]`, `[ac-consistency-check]`, or other) doesn't fit existing shapes, framing needs sharpening. Worth re-examining the catalog at every 3rd release.
- **Will the reviewer-agent-self-critique pattern recur?** v0.3.6 was driven significantly by Codex's own retrospective. If future reviewer-agent retrospectives surface similar concrete patterns, the framework should formalize a way to capture and integrate them (a `/reviewer-retro` workflow? A standing section in `/retro` output?). Single instance now; watch.

**Meta-observation — `[mechanical-output-verification]` rebalances the catalog.** Prior to v0.3.6: 3 enforcement (cite-or-mark-n/a · refuse-escalate · soft-spec-hardening) : 4 usability (interaction · freshness · observability · handoff). Post-v0.3.6: 4 : 4. The framework was tilting toward usability-shapes outpacing enforcement; v0.3.6 restores balance. **Whether this matters or is incidental is itself a question for retro #005.** If enforcement-class growth stalls again, the framework may be structurally biased toward making itself easier-to-use over making itself harder-to-violate — worth examining whether that's intentional or accidental.

**Cadence held.** v0.3.1 (Access & Data Posture) · v0.3.2 (elicitation-with-options) · v0.3.3 (freshness-check) · v0.3.4 (role-boundary) · v0.3.5 (agent-handoff + same-day extension) · v0.3.6 (mechanical-output-verification codified) = **one Compass-original per session, 6 sessions running.** Retro #005 fires at improvement #25 (3 more entries needed).

---

### 2026-06-01 — `[agent-handoff]` Compass-original + agent-agnostic GitHub Actions reviewer template + `/build` Phase 5 automated path (v0.3.5)

**Friction:** User is close to creating an end-to-end app in aura-app — `/build` works, Codex reviews work, but the Claude → Codex handoff is the last manual seam in an otherwise automated loop. Three friction points per review cycle: (1) tool switch (leave Claude Code, open terminal, invoke `codex`); (2) manual context transfer (paste reviewer prompt + PR number); (3) manual return signal (tell Claude there are findings to address). User is the orchestrator running the back-and-forth — that's the friction. User asked: *"how can we automate."*

**User direction — two questions answered:**
- **Automation shape = Option A (GitHub Action runs reviewer on PR open).** Action template ships in `compass/scripts/`; consumers copy to `.github/workflows/`. Reviewer runs headless in CI, posts findings on PR. Claude reads PR comments next time invoked. Cleanest path; both tools already have GitHub MCP. Manual fallback always supported.
- **Generality = agent-agnostic.** User said: *"ideally - AI → AI where AI can be Claude, Codex, or any other."* Template parameterized over reviewer agent (Codex default-enabled, Claude headless / Gemini / generic CLI commented as alternatives). Pattern abstracts over which AI plays the reviewer role.

**Pattern:** `[agent-handoff]` — when a workflow routes work between AI agents, Compass defines a 5-piece handoff shape so the user is not the bridge.

| Piece | Value for Engineer → Reviewer |
|---|---|
| Trigger artifact | The PR (opened or synchronized) |
| Trigger event | `workflow_run` on CI completion |
| Context window | `pr.diff` + reviewer prompt file |
| Output medium | PR comment (via `gh pr comment`) |
| Loop signal | Claude reads PR comments via GitHub MCP next session |

**Change:**
- **New `[agent-handoff]` Compass-original** in `compass/framework/canon.md`. 5-piece shape + first instance pointer.
- **NEW: `compass/scripts/agent-handoff.yml`** — GitHub Actions template. Triggers on `workflow_run` after CI green on a pull_request event; resolves PR number with `gh pr list`; captures diff with `gh pr diff`; invokes reviewer agent (one of four blocks); posts findings via `gh pr comment`. Permissions: `contents: read` + `pull-requests: write`.
- **`compass/scripts/README.md`** gained a dedicated `agent-handoff.yml` section with setup steps, handoff-shape table, agent-agnostic blocks summary, accuracy honesty (vendor CLI drift, replay/cost caveats, auth model), and manual-fallback note. Section carries its own freshness markers tracking Codex / Claude Code / Gemini CLI external sources.
- **`/build` Phase 5 step 13** references the automated path: "If `.github/workflows/ai-review.yml` is installed (per `compass/scripts/agent-handoff.yml`), the reviewer fires automatically on CI-green; otherwise manually." Both paths terminate at same place; automation removes tool-switch + manual prompt paste only.
- **`compass/roles/reviewer.md`** gained "How you're invoked" section (automated via CI / manual fallback). Notes freshness-check precondition runs before either path.
- **`compass/templates/workflow-template.md`** gained inline commentary on the agent-handoff pattern as optional addition when workflows route across agents.
- **`AGENTS.md`** Workflow Structure section gained `[agent-handoff]` note + explicit "Compass-originals catalog now spans five shapes" framing. `compass/scripts/` directory framing updated to reflect mixed contents (script + template).
- **CHANGELOG** `[0.3.5] — 2026-06-01` entry.

**Roadmap shift (2nd consecutive bump).** v0.3.3 committed v0.3.4 to freshness detection; v0.3.4 already bumped to v0.3.5+; this round bumps it again to **v0.3.6+**. Token tracking and handoff automation were higher-leverage given the actual user friction trail. Two consecutive bumps is a yellow flag — surface in next `/retro` to confirm freshness detection isn't being systematically deferred. The user-side defense (workflow-side freshness check from v0.3.3) and the agent-handoff template's own README freshness markers stand until detection ships.

**Files touched (9):** new — `compass/scripts/agent-handoff.yml`. Edited — `compass/framework/canon.md`, `compass/templates/workflow-template.md`, `compass/workflows/build.md`, `compass/roles/reviewer.md`, `AGENTS.md`, `CHANGELOG.md` (0.3.5), `compass/scripts/README.md`, `compass/workflows/improvements.md`.

**Watch for:**
- **Vendor CLI drift is real.** The `npm install` packages and CLI flags shipped in `agent-handoff.yml` are best-effort references. README carries `last_verified: 2026-06-01` + 30-day window tracking Codex / Claude Code / Gemini CLI external sources. **Likely candidate for the v0.3.6+ freshness-detection script** — when the detector ships, agent-handoff.yml is one of its first watched files.
- **No replay protection.** Every CI green triggers a reviewer invocation; CI re-runs trigger re-reviews. For high-PR-volume teams, README names this as a future-script candidate (handoff replay — gate on labels or check existing review comments). If aura-app or another consumer reports noisy duplicate reviews, build the gate.
- **Cost.** Every PR (and every push triggering CI re-run) invokes the reviewer. High-volume repos should budget; framework-side, no enforcement. Token-usage parser (`token-usage.py`) helps measure but doesn't gate.
- **Manual fallback degradation.** Risk: as the automated path becomes default, the manual path documentation rots (reviewer prompt path drifts, instructions go stale). Mitigation: `compass/roles/reviewer.md` "How you're invoked" section documents both paths inline so they stay co-located. If the manual path becomes truly vestigial across multiple consumers, the framework can drop it cleanly — but not before evidence.
- **Auth model assumptions.** Template uses `secrets.GITHUB_TOKEN` for PR comment posting and a vendor secret for the reviewer agent. Teams with stricter auth (org-level secret restrictions, enterprise GitHub Apps) will need to customize. README names this; no framework-side enforcement.
- **2nd-instance trigger for principle #17.** Per codification rule (≥2-3 applications before promoting to AGENTS.md principle), wait for a 2nd workflow adopting `[agent-handoff]`. Likely candidates: a future `/research` workflow (Researcher → Architect handoff) or a `/triage` extension (Triager → Engineer handoff). v0.3.x will surface the right next workflow when value emerges.
- **Codex CLI specifics need user verification on first run.** The shipped `codex exec --prompt-file ... --input ... --output ...` invocation is placeholder reference. User should verify against current Codex CLI docs on first deploy in aura-app; bump `last_verified` after confirming.

**Meta-observation — `[agent-handoff]` is the 5th Compass-original shape.** Catalog now spans: **enforcement** (cite-or-mark-n/a · refuse-escalate · soft-spec-hardening — what the workflow REQUIRES) · **interaction** (elicitation-with-options — how the workflow ASKS) · **freshness** (freshness-check — how the workflow STAYS CURRENT) · **observability** (role-boundary — how the workflow EXPOSES STRUCTURE) · **handoff** (agent-handoff — how the workflow ROUTES across agents). The split between "what the framework demands" vs. "how the framework makes itself usable" is now 3:4 — enforcement is 3 patterns, the other four "usability" shapes are 4 patterns. Worth watching whether enforcement gets a 4th member or whether usability axes continue to outpace.

**Cadence held.** v0.3.1 (Access & Data Posture) · v0.3.2 (elicitation-with-options) · v0.3.3 (freshness-check) · v0.3.4 (role-boundary) · v0.3.5 (agent-handoff) = **one Compass-original per session, 5 sessions running.** Next `/retro` (fires at improvement #20) is close. Retro should specifically examine: (a) why freshness detection has slipped twice, (b) whether the 5-shape catalog framing holds or whether finer-grained organization is needed, (c) which Compass-original is closest to AGENTS.md-principle codification (likely `[elicitation-with-options]` first — 2nd instance trigger could fire on `/setup-product` retrofit).

**Aura-app payoff:** the YAML is immediately drop-in for aura-app. After landing, user can: (1) `cp compass/scripts/agent-handoff.yml ~/apps/aura-app/.github/workflows/ai-review.yml`; (2) set `OPENAI_API_KEY` GitHub secret; (3) confirm CI workflow name in the YAML; (4) verify Codex CLI install command + flags. Manual loop disappears on the next PR.

**Real-world validation — 2026-06-01 (same day as ship).** Reported by user mid-session, surfaced by the Engineer agent running CB-1.4 in aura-app (the dashboard proxy bet).

- **Context:** Engineer was implementing CB-1.4's proxy in aura-app. The proxy at `proxy.ts` is the sole protection layer in practice today (no real dashboard route handlers exist yet).
- **What fired:** During `/build` Phase 2 (Engineer implements), the Vercel routing-middleware skill loaded. The skill carried current knowledge of **CVE-2025-29927** (Next.js middleware bypass vulnerability) and the broader principle that middleware/proxy auth should never be sole protection.
- **What surfaced:** Defense-in-depth as architectural treatment, not as architecture. Specifically: `x-session-user-id` + `x-session-id` headers injected by the proxy are **convenience, not auth claims**; future protected route handlers MUST re-verify session themselves; the proxy is one layer, not the layer.
- **How it was captured:** (a) source-code marker at the top of `proxy.ts` making the convention impossible to miss; (b) Engineer DRI Decision documenting the lineage (skill → CVE reference → defense-in-depth principle → marker convention); (c) future-handler obligation encoded as a project convention.
- **Patterns validated together:** skill discipline (AGENTS.md — load the skill, don't pattern-match) · soft-spec-hardening (#14 — "middleware auth as sole protection" is exactly the rationalization surface the principle closes) · DRI logging (#4 — Decision captures *why*, not just *what*) · role-boundary source-code marker (convention encoded at file level, survives doc drift).
- **Attribution nuance:** the v0.3.3 freshness gate as written is `/build` Phase 5 step 12a on `compass/roles/reviewer.md` (Codex review format), not Phase 2. The Vercel skill loading is a **separate mechanism** — Claude Code's skill ecosystem updates through Vercel + Anthropic channels, not through Compass `last_verified` markers. The agent reported it as "v0.3.5's freshness gate" but technically the two are decoupled. **The broader observation stands:** the v0.3 thesis is that framework discipline + skill ecosystem + tool currency compose to surface current knowledge at design time. This CVE catch is direct evidence of that thesis.
- **Future codification candidate (2-3-instance rule applies — defer):** the "convenience headers ≠ auth claims" pattern with its source-code-marker + DRI-Decision + future-handler-obligation shape is a defense-in-depth principle with reach beyond CB-1.4. Candidates: new scanner check (`route handlers re-verify session even when proxied`, Production Ready phase, suppressible); Story Standard Experience Checklist sub-bullet for auth-touching bets; new Compass-original `[defense-in-depth-marker]` (would be 4th enforcement-class member, resetting catalog balance to 4:4 enforcement-vs-usability). **Wait for a 2nd instance** in a separate bet/repo before codifying. Surface in next `/retro`.
- **Why this matters for next `/retro`:** retros surface (a) what patterns are working, (b) what surfaces are still rationalization-prone, (c) what to codify next. This is the first observed evidence of v0.3's discipline catching a CVE-relevant insight *at design time, before deploy*. The retro should specifically cite CB-1.4 / CVE-2025-29927 as concrete validation of the freshness-check-class + skill-load-class composition.

**Lessons from CB-1.4 cycle — same-day extension (2026-06-01).** Three implementation lessons reported by user mid-session after running CB-1.4 through both Codex and Claude as reviewers.

**Lesson 1 — "Polished narrative + green tests" can lock in fundamentally broken behavior.** Mechanical verification of build OUTPUT (not just build PROCESS) is needed. Aura-app CB-1.4 surfaced this when `.next/server/middleware-manifest.json` inspection revealed the gap between source intent and runtime config — build succeeded, tests passed, manifest was wrong.

  **Action:** `/build` Phase 2 step 7 extended with **build-artifact inspection** sub-bullet covering Next.js manifests (middleware / routes / app-paths / prerender) · Vercel functions output · Expo native config + bundle · general principle (when runtime config is data-driven, source ≠ runtime; inspect runtime). Named anti-pattern: **`polished-but-broken`** — tests pass, build succeeds, narrative coherent, principles cited, behavior wrong. Sharper version of Principle #14 — the soft spec being rationalized is now "the build succeeded" / "the tests pass" / "the principle is named in the comment" each of which the agent passes while behavior is broken. The fix: mechanical inspection of the actual artifact.

**Lesson 2 — Same-model reviewer + same-model author share aesthetic priors. Multi-model review is structurally load-bearing, not procedural.** User empirically validated during CB-1.4: ran same diff through both Codex (different model than Engineer) and Claude (same model) as reviewer; **Codex outperformed**. The "independent model" framing in pre-v0.3.5 AGENTS.md was light prose; this lesson hardens it with empirical evidence and explicit structural rationale.

  **Action:** `AGENTS.md` "Tool division of labor" gained a hardened paragraph naming the structural reason (shared aesthetic priors → blind-spot overlap) + empirical citation (CB-1.4 dual-review experiment) + explicit "not cost-equivalent" framing. `compass/scripts/agent-handoff.yml` header comment gained a ⚠ note explaining why Codex is default-enabled (structural correctness, not ergonomic preference) and explicitly naming the Claude-headless block as **fallback, not equivalent alternative**. Hardens the existing split against future "consolidate for cost" pressure that would silently re-introduce the blind-spot overlap.

**Lesson 3 — Skill load-time freshness surfaces *information about the framework*, not *validation that the implementation uses it correctly*.** Sharper version of yesterday's defense-in-depth observation. The Vercel skill said "principle X exists"; nothing mechanically verified the implementation applied principle X. **Information surfacing ≠ use verification.**

  **Action: surface in next `/retro` as a freshness-check-class limitation.** Not actionable as a Compass-original today — verification mechanisms (pattern grep / scanner check / explicit reviewer checklist item / static analysis rule) are heavier infrastructure than this round can carry. **Defer codification per 2-3-instance rule.** Lesson 1's build-artifact-inspection extension closes part of this gap (mechanical verification at build-output level) while the implementation-pattern-check version waits for accumulating evidence.

**Codification deferrals named explicitly:**
- **`[mechanical-output-verification]` Compass-original** — 1st instance now (build-artifact inspection); wait for 2nd before promoting to canon entry. Would be 4th enforcement-class member (joining cite-or-mark-n/a · refuse-escalate · soft-spec-hardening), resetting catalog balance to 4:4 enforcement-vs-usability.
- **`[implementation-use-verification]` Compass-original** (lesson 3) — 1st surface visibility now; wait for at least 1 concrete instance before considering codification. Mechanism candidates when it lands: scanner check (pattern grep) · reviewer checklist item · static analysis rule.
- **Multi-model review as numbered principle** — NOT codified separately. The existing AGENTS.md "Tool division of labor" + hardened structural rationale carries the weight. Promotion to a numbered AGENTS.md principle (#17+) would happen only if a 2nd model-pair-blind-spot instance surfaces in a structurally distinct context (e.g., Architect-pair, Researcher-pair, future role-pairing).

**Scope choice — Medium, not Heavy.** Heavy (a v0.3.6 release with new Compass-original) would be premature for 1st-instance build-output-inspection. The Phase 2 extension is correct as a **direct expansion of existing /build step 7** (joining typecheck/lint/test/build/runtime-config-audit as another sub-bullet); the structural-rationale addition is correct as a **direct extension of existing AGENTS.md** "Tool division of labor" paragraph. Naming as v0.3.6 would imply a versioned milestone for what is genuinely a same-day v0.3.5 cycle. Per one-Compass-original-per-session discipline, codification waits.

**Files touched (4):** edited — `compass/workflows/build.md` (Phase 2 step 7 + `polished-but-broken` anti-pattern), `AGENTS.md` (Tool division of labor structural rationale + CB-1.4 empirical citation), `compass/scripts/agent-handoff.yml` (header comment about Codex default rationale), `compass/workflows/improvements.md` (this lessons subsection).

**Watch for:**
- **Build-artifact inspection generalization.** Current extension names Next.js / Vercel / Expo (matching aura-app's stack). Other framework-specific artifact locations (Remix, SvelteKit, Vite, Astro, Nuxt, Rails, Django, etc.) need additions when a project using one surfaces friction. The "general principle" sub-bullet should carry the weight in the interim — agents should generalize ("if this framework writes runtime config to disk, find and inspect it"), not pattern-match strictly to the named examples.
- **`polished-but-broken` at later phases.** The extension is in Phase 2 (Engineer self-check). Codex in Phase 5 also has access to build artifacts and could catch what Phase 2 missed. If Codex starts repeatedly catching `polished-but-broken` patterns Phase 2 should have caught, that's signal Phase 2 inspection is incomplete — expand the framework list or escalate to a scanner check.
- **"Information surfacing ≠ use verification" generalization.** This lesson connects to a larger class — Compass can name principles (#14, #15, #16); something separate has to mechanically verify implementation applies them. The verification mechanism is the gap. Watch for a 2nd instance where the gap manifests (e.g., a workflow says "do X"; the postcondition is "did the agent claim to do X" not "did X happen"). When 2-3 instances accumulate, `[implementation-use-verification]` becomes a real Compass-original candidate.
- **Multi-model review "consolidate for cost" pressure.** Watch for downstream users questioning why both Claude and Codex are needed ("can we just use Claude for everything?"). The hardened AGENTS.md framing + ⚠ comment in agent-handoff.yml should hold the line, but if the question keeps recurring, the structural argument may need promotion to a numbered principle. Empirical CB-1.4 evidence is the load-bearing citation; collect more if the pressure mounts.
- **Codex's review quality drift.** The "Codex outperformed Claude" empirical claim is anchored to a specific point in time. Different-model reviewer logic stays valid regardless of which specific models are involved, but if Codex's review quality regresses materially in future Codex CLI updates, the choice of Codex-as-default in agent-handoff.yml may need reconsideration. Tracked via `compass/roles/reviewer.md` freshness markers + the new Codex CLI freshness window in `compass/scripts/README.md`.

---

### 2026-05-27 — `[role-boundary]` Compass-original + token-usage parser + new `compass/scripts/` directory (v0.3.4)

**Friction:** User asked *"is there a way to capture the tokens used at every role?"* — no per-role token visibility in Compass today. Token tracking is genuinely the AI tool's job (Claude Code, Codex CLI exposes session totals; per-role attribution doesn't exist as a first-class feature). Compass can help by defining a role-boundary protocol and shipping a sample parser, but the accuracy ceiling is bounded by the AI tool's instrumentation.

**Use cases — user said "all of the above":**
- Cost transparency (know what Compass costs to run)
- Role optimization (identify bloated role docs)
- Debugging / explainability (trace why a workflow run was expensive)
- Team reporting (share Compass cost breakdown)

Same captured data supports all four; the parser output needs to be pivotable.

**Investment level — user picked "Protocol + sample parser."** Compass ships both the markers and a reference Python script. Not just protocol-only (would force user to build their own parser); not full AI-tool integration (Claude Code feature-request territory). Middle path: define the convention; ship a working reference; let consumers fork.

**Ownership — user said "it should be the project manager role."** Token usage rollups join PM's portfolio of "make work visible" jobs (`/status`, `/plan`, sprint comms). Light touch this round: PM-doc note + manual parser invocation. No new `/usage` workflow — defer until/if workflow integration becomes load-bearing.

**Change:**
- New `[role-boundary]` Compass-original in `compass/framework/canon.md`. HTML-comment markers shape: `<!-- COMPASS_ROLE_BOUNDARY: <enter|exit> | role=<name> | workflow=<id> | step=<N> -->`. Documentation + parser anchor in one mechanism.
- **New framework directory: `compass/scripts/`.** Convention: single-file, stdlib-only, PM-operable. Justified by token tracking being structurally hard to solve with markdown docs alone. Sibling `README.md` per script for usage.
- **`compass/scripts/token-usage.py`** — single-file Python 3 stdlib parser. Reads Claude Code session log + workflow markdown markers; produces markdown report with per-workflow cost / per-role rollup / per-step breakdown. Default Anthropic Sonnet 4.x pricing; configurable.
- **`compass/scripts/README.md`** — usage docs with accuracy honesty (linear-step assumption, multi-message approximation, user-interrupt sensitivity, pricing assumption).
- `/build` workflow gained markers as first instance — six matched enter/exit pairs across Engineer + Reviewer + Tech Writer phase transitions (Phase 2 / Phase 3 / Phase 4 / Phase 5 / Phase 7).
- `compass/roles/project-manager.md` gained token-usage rollup as a PM responsibility (manual invocation, optional `docs/usage/<session-id>.md` archive).
- `AGENTS.md` Workflow Structure section gained `[role-boundary]` note + brief mention of `compass/scripts/` as new framework directory.
- `compass/templates/workflow-template.md` gained inline commentary on role-boundary markers as optional addition.

**Roadmap shift:** v0.3.3 release notes committed v0.3.4 to **freshness detection** (CI watching external tools). This round prioritizes token tracking; freshness detection bumps to **v0.3.5+**. The freshness-check workflow-side defense from v0.3.3 stands as the user-side defense until detection ships. Roadmap shift named explicitly in canon.md `[freshness-check]` entry, AGENTS.md Workflow Structure note, and v0.3.4 CHANGELOG.

**Files touched (9):** new — `compass/scripts/token-usage.py`, `compass/scripts/README.md`. Edited — `compass/framework/canon.md`, `compass/templates/workflow-template.md`, `compass/workflows/build.md`, `compass/roles/project-manager.md`, `AGENTS.md`, `CHANGELOG.md` (0.3.4), `compass/workflows/improvements.md`.

**Watch for:**
- **Parser accuracy bounds.** Linear-step assumption breaks when Claude executes out of order, when user interrupts mid-step, or when steps span very different message counts (e.g., a one-line role-load step vs. a hundred-message implementation phase). Report's Confidence footer names the heuristics, but consumers may misread the numbers as precise. If team reports start citing parser figures as exact, tighten the Confidence section.
- **Marker drift if workflow steps reorder.** When a workflow is updated (e.g., a step is inserted or renumbered), markers may end up with wrong step numbers. Future candidate: a marker linter script that validates enter/exit balance + step references match the workflow file.
- **PM workflow integration creep.** Light-touch this round (role-doc note + manual invocation). If PM repeatedly runs the parser as part of `/status` or sprint-comms drafting, that's signal to promote to a `/usage` workflow with proper template + skill. Watch for the pattern; don't preemptively build.
- **Pricing drift.** Default `$3/M in, $15/M out` is Anthropic Sonnet 4.x as of 2026-05. Anthropic adjusts pricing periodically; users on other models (Opus, Haiku, future Sonnet versions) need to override. Pricing should probably get the `[freshness-check]` treatment eventually — but defer until staleness bites.
- **Cross-AI-tool support.** Parser is Claude Code specific. Codex CLI session logs have a different format. If Codex sessions need per-role attribution, write a parallel parser (`token-usage-codex.py`) — same protocol, different log parser. Defer until needed.
- **2nd-instance trigger for principle #17.** Per codification rule (≥2-3 applications before promoting to AGENTS.md principle), wait for a 2nd workflow adopting `[role-boundary]`. Likely candidates: `/create-brief` or `/setup-product` (both multi-role). v0.3.x will surface the right next workflow when token-tracking value emerges for it.

**Meta-observation — `[role-boundary]` is the 4th Compass-original shape.** Catalog now spans: **enforcement** (cite-or-mark-n/a · refuse-escalate · soft-spec-hardening — what the workflow REQUIRES) · **interaction** (elicitation-with-options — how the workflow ASKS) · **freshness** (freshness-check — how the workflow STAYS CURRENT) · **observability** (role-boundary — how the workflow EXPOSES STRUCTURE). Worth watching whether a 5th shape surfaces as the framework grows. The split between "what the framework demands" (enforcement) vs. "how the framework makes itself usable" (interaction / freshness / observability) is becoming the load-bearing organization axis of the Compass-originals.

**Bridge progress meta:** The v0.3 series is rapidly accumulating Compass-original patterns. v0.3.1 = Access & Data Posture (new section in foundation-product). v0.3.2 = elicitation-with-options. v0.3.3 = freshness-check. v0.3.4 = role-boundary. **One Compass-original per session has held as a sustainable cadence.** Worth a retro after v0.3.5 lands (per the `/retro` every-5-improvements cadence; v0.3.1–v0.3.5 will be batch #5 if we count carefully — verify via the retro counter when next retro fires).

---

### 2026-05-27 — `[freshness-check]` Compass-original + Codex format as first application (v0.3.3, pull-bridge round 1)

**Friction:** User ran `/build` → Codex review failed because **Codex's review format had changed** and Compass's docs about the format had gone stale. The workflow's parser expected the old format; new format didn't match; review silently broke. This is **the second time external-tool drift bit a workflow** (first was aura-app's various library version mismatches surfaced in v0.2.5; that round patched specific things but didn't establish a pattern).

**Diagnosis — class problem, not Codex-specific.** Same drift surface hits:
- **MCP connector APIs** (Sentry / GitHub / Linear / Atlassian) — schemas evolve; `/scan`, `/measure`, `/status` MCP calls go stale
- **Library / framework versions** (Expo SDK, Next.js, React, library options in `/setup-foundation-architecture` elicitation) — already flagged in v0.3.2 watch-for
- **Vendor capability claims** (cloud SDK options, regional availability) — `/scan` PROD_READY-09 catches some but not formats
- **Cloud platform conventions** (Vercel patterns, AWS service options) — drift silently

Compass had **no structural mechanism** to catch stale external references. The "Source freshness" confidence signal in `/scan` (scanner.md) is spiritually right but applies only to per-bet artifacts, not to Compass's own docs that reference external tools.

**User direction:** *"compass should always check for latest changes and update the user or the doc … it should ideally be a push from compass to the repo owners."* Push is the right long-term shape but requires infrastructure Compass doesn't have today:
1. **Detection** — something watches external tools for changes
2. **Distribution** — something delivers updates to consuming repos (today: repos copy `compass/` + `.claude/` at setup; no update channel)

**Path picked (Path A — pull-bridge):**
- **v0.3.3 (this round):** workflow-side check. Workflow reads `last_verified` date on Compass doc; refuses if stale. Immediate unblock.
- **v0.3.4:** framework-side detection. CI on Compass repo watches Codex/MCP/library/Vercel changelogs; auto-updates Compass docs + bumps `last_verified`.
- **v0.4+:** distribution. Compass framework updates auto-propagate to consuming repos as PRs (per user pick: *"pushed doc updates"*).

Each step delivers value; final state is the push model the user described.

**Change:**
- New `[freshness-check]` entry in `compass/framework/canon.md` (Compass-original). Pattern: docs that reference external tools get `last_verified` + `freshness_window_days` + `external_source` frontmatter; workflows add a Precondition that refuses if stale. Missing `last_verified` = infinitely stale.
- `compass/roles/reviewer.md` gained the freshness frontmatter (last_verified: 2026-05-27, freshness_window_days: 30, external_source: OpenAI Codex GitHub). Existing "Review output format" section renamed to **"Expected Codex output shape"** with explicit field-by-field expectations — gives `[freshness-check]` something semantically verifiable in future rounds.
- `compass/workflows/build.md` Phase 5 gained step 12a — freshness-check Precondition. Before Codex review, read reviewer.md frontmatter; refuse if stale with pointer to external source + file to update. Per Principle #16 — refuse + escalate.
- `AGENTS.md` Workflow Structure section gained note about `[freshness-check]` as the second Compass-original interaction-class pattern (after `[elicitation-with-options]`).

**Files touched (6):** `compass/framework/canon.md`, `compass/roles/reviewer.md`, `compass/workflows/build.md`, `AGENTS.md`, `CHANGELOG.md` (0.3.3), `compass/workflows/improvements.md`.

**Watch for:**
- **The freshness markers themselves go stale.** Recursive problem — `last_verified: 2026-05-27` on reviewer.md is only as fresh as the user's discipline to update it after manually verifying against `external_source`. v0.3.4 detection solves this systematically; v0.3.3 relies on user discipline at re-verification time.
- **Threshold tuning.** 30 days default for fast-moving tools (Codex). If actual Codex format changes are less frequent, 30 days = unnecessary refusal noise. If more frequent, 30 days = misses drift between checks. Tune based on actual drift cadence once observed across 2-3 verifications.
- **Date-only check is mechanical but blind.** Even within freshness window, the format could have changed and we wouldn't know. v0.3.4 detection (semantic verification by watching external source) is the real fix; v0.3.3 just gates on date, which is the cheapest mechanical check.
- **Refusal fatigue.** If `/build` refuses every 30 days waiting for re-verification, that's friction. The mitigation is v0.3.4 detection — once CI auto-bumps `last_verified` when nothing has changed, the refusal only fires when actual drift is detected. Until then, the user pays the manual-verify cost periodically.
- **Backfill burden across other Compass docs.** Every doc that references external tools eventually needs the markers. v0.3.3 backfills only reviewer.md. Future sessions backfill MCP / library / Vercel / cloud-platform references one at a time as each becomes a load-bearing concern.
- **2nd-instance trigger for principle #17.** Per codification rule (≥2 applications before promoting), the next workflow adopting `[freshness-check]` (likely an MCP-dependent workflow like `/scan` or `/measure` with API schema staleness) makes this an AGENTS.md cross-cutting principle.

**Meta-observation:** `[freshness-check]` is the **second interaction-class Compass-original** (after `[elicitation-with-options]`). Both surface a class of failure (decision rationalization; format drift) and provide structural defense (curated options; date-gated precondition). The framework's Compass-original catalog now spans three shapes: **enforcement** (cite-or-mark-n/a, refuse-escalate, soft-spec-hardening — what the workflow REQUIRES), **interaction** (elicitation-with-options — how the workflow ASKS), and **freshness** (freshness-check — how the workflow STAYS CURRENT). Worth watching whether a 4th shape surfaces (e.g., capture / validation / observation) as the framework grows.

**Bridge progress meta:** v0.3.3 is **round 1 of 3** toward the push model. The bridge framing is documented in canon.md and CHANGELOG so future-Compass (and future contributors) know where v0.3.4 / v0.4 are heading. This is the first time Compass has shipped a multi-version roadmap inline with the first round — worth noting as a deliberate communication pattern.

---

### 2026-05-27 — `/setup-foundation-architecture` hardened + elicitation-with-options pattern (v0.3.2)

**Friction / trigger:** Second workflow translation in the v0.3 cycle per cadence. User picked `/setup-foundation-architecture` (had been pending since v0.3.0-alpha established the template). Additionally, user requested NEW behavior beyond just hardening: **interactive elicitation** — workflow should ASK the user about each architectural decision, present 3 widely-used product/tool options, and let user pick. Replaces the v0.2.x pattern of "draft with smart defaults, ask user to approve" (which the agent in practice mostly skipped — same soft-spec-rationalization shape the framework keeps catching).

**Design picks (locked via AskUserQuestion):**
- **Granularity:** grouped by stack layer — 4 elicitations (frontend / backend / data / ops) rather than all 13 stack rows individually (too verbose) or constraint-first (too opinionated).
- **Curation context:** hybrid — first decision (anchor: primary language + deployment model) is static (same 3 options); subsequent decisions cascade (options biased by prior picks for coherent stacks).
- **Reusability:** add to `canon.md` as Compass-original `[elicitation-with-options]`. Future workflows can adopt (likely 2nd instance: retroactive `/setup-product` enhancement for the v0.3.1 Access & Data Posture fields).

**Deliberate precedent break — `[elicitation-with-options]` is a behavior change.** v0.3.0-alpha set the rule: workflow hardening is "PRESERVE all existing behavior." v0.3.2 deliberately violates that for the elicitation pattern (per explicit user direction). **Future translators must not quietly assume the preserve-behavior rule still binds across all hardenings — it's a default that can be overridden with explicit user direction + documented violation.** This is the first such override in the v0.3 cycle.

**Change:**
- `compass/framework/canon.md` gained 3 entries:
  - New top-level section **Architecture frameworks** with `[well-architected]` (AWS, 2015 + sustainability 2021) and `[evolutionary-architecture]` (Ford / Parsons / Kua, 2017).
  - Compass-originals section gained `[elicitation-with-options]` — first Compass-original interaction pattern (vs. prior Compass-originals which were all enforcement-shaped: cite-or-mark-n/a, refuse-escalate, soft-spec-hardening). Pattern: static anchor + cascading subsequent decisions, each 3 options + "Other (specify)," each pick captured with rationale + per-pillar implication.
- `compass/workflows/setup-foundation-architecture.md` fully translated to v0.3 template: gate/work/postcondition triplets, framework grounding section, workflow-level Preconditions, 16 Phase A steps + 5 Phase B steps (was 12 + 5 in v0.2.x). All v0.1.11–v0.2.7 behavior preserved: Phase A/B HITL gate split, foundational data model derived before stack picks, bet-arch deviation gate reference, multi-target canary, ADR / Amendments pattern.
- **NEW elicitation steps 8-12:** anchor (primary language + deployment model — static 3 options) + 4 cascading stack-layer elicitations (frontend / backend / data / ops — biased by prior picks). Step 10 (backend) elicitation's auth model **derives from foundation-product Access & Data Posture (v0.3.1)**; divergence triggers refuse + escalate. Step 11 (data) **cites Foundational Data Model**; DB pick that ignores entity shape fails. Per-pillar implication captured per step (replaces v0.1.11's separate pillar-scoring step; pillar scoring now baked into each elicitation step's Postcondition).
- `compass/templates/foundation-architecture.md` gained **"Stack picks (elicited)"** section between Foundational Data Model and Stack — captures anchor + 4 layer picks.
- `compass/templates/workflow-template.md` gained inline commentary on elicitation steps as a valid Steps pattern.
- `AGENTS.md` "Workflow structure" section gained note about `[elicitation-with-options]` as a named Compass-original (pointer to canon entry).

**Files touched (7):** `compass/framework/canon.md`, `compass/workflows/setup-foundation-architecture.md`, `compass/templates/foundation-architecture.md`, `compass/templates/workflow-template.md`, `AGENTS.md`, `CHANGELOG.md` (0.3.2), `compass/workflows/improvements.md`.

**Watch for:**
- **Elicitation depth fatigue.** 5 elicitation steps (anchor + 4 layers) is a lot of user back-and-forth. If real `/setup-foundation-architecture` runs feel slow or users skip-skip-skip through them, the cascading could compress (e.g., one "stack picks" Q&A session that walks through all 5 in sequence with shortcuts for users who have strong preferences). Defer changes until ≥2 real runs.
- **Anchor=Other handling.** When user picks "Other (specify)" for the anchor, downstream cascades fall back to static layer options. If this fallback feels inadequate (e.g., user has a coherent custom stack but layer options don't fit), tighten the fallback rules. May surface as a v0.3.3 candidate after first real "Other" anchor.
- **Option curation freshness.** The 3 options per anchor / per layer are listed in the workflow file as examples. They'll go stale as the tooling landscape evolves (Vite vs. Turbopack vs. Rspack churns; serverless vs. edge vs. containers shifts). Eventually the elicitation step should reference canon.md entries for each option rather than hard-coding tool names in the workflow. Defer until staleness bites — likely 12-18 months out at current churn.
- **2nd instance trigger for principle #17.** When a 2nd workflow adopts `[elicitation-with-options]`, codify as AGENTS.md cross-cutting principle. Likely candidate: retroactive enhancement of `/setup-product` Access & Data Posture (v0.3.1) — 3 fields could use the elicitation pattern for closed-enum picks. Worth doing if/when the user surfaces friction with the current static-list approach.
- **Preserve-behavior rule erosion.** v0.3.2 set the precedent that hardening can include deliberate behavior changes per explicit user direction. Future translators may use this as a loophole ("the user wanted X" → behavior creeps in alongside translation). Counter: the rule is "structural-only translation by default; behavior changes require explicit user direction + named in improvements.md as a precedent break." If multiple future hardenings stack precedent breaks, consider tightening to "behavior changes happen in separate patches, not bundled with hardening."

**Meta-observation — pattern type:** `[elicitation-with-options]` is the **first Compass-original interaction pattern** (vs. prior Compass-originals which were all enforcement-shaped). The framework's Compass-original catalog now spans two shapes: enforcement (cite-or-mark-n/a, refuse-escalate, soft-spec-hardening — what the workflow REQUIRES) and interaction (elicitation-with-options — how the workflow ASKS). Worth watching whether this split surfaces a 3rd shape (e.g., capture patterns, validation patterns) as the framework grows.

**Length / density check** (per v0.3.0-alpha recalibration): hardened `/setup-foundation-architecture` is ~370 lines vs ~156 in v0.2.x = ~2.4x. Load-bearing density: ~80 items (16 Phase A steps × ~3 gates each + Phase B steps + Verification + Framework grounding citations + named anti-patterns) / 370 lines = **1 per 4.6 lines**. Original was ~30 / 156 = **1 per 5.2 lines**. **Density improved** (denser is better) — adding load-bearing elicitation content and framework grounding raised density, confirming the v0.3.0-alpha recalibration thesis: length grows with constraint, not ceremony.

---

### 2026-05-27 — Access & Data Posture surfaced at foundation-product layer (v0.3.1)

**Friction:** User ran `/setup-foundation-architecture` on aura-app and observed: **the workflow didn't ask about authentication and scaffolded nothing auth-related.** Even though auth IS in the Stack table (row 8: `Auth model | <session / JWT / OAuth> | <hard>`) and IS named in step 7's stack-row enumeration, **it's one bullet among 13 with no special weight** — agent rationally treated it like contracts format. Classic Principle #14: soft-spec burial → agent rationalization → load-bearing concern slips through.

**Explore-agent triage confirmed the gap is upstream at the foundation-product layer**, not downstream at architecture:
- `compass/templates/foundation-product.md` (114 lines) — no access/auth/data section anywhere. "Personas" doesn't ask about authentication state. "Defensibility/Moat → Regulatory" is competitive moat, not access posture.
- `compass/templates/brief.md` (116 lines) — same blank.
- `compass/workflows/setup-product.md` Verification — **zero gates on auth/identity.**
- `compass/workflows/setup-foundation-architecture.md` "Identity strategy" is about **DB primary key type (UUID v7 / ULID / sequential)** — not access posture. I previously mis-attributed it as auth-adjacent; it isn't.
- **16 AGENTS.md principles, none names this.** Zero prior improvements entries. **First time being named in the framework's history.**

**User direction (after a course-correct from over-scoped initial plan):**
- "Looks a foundational issue" → treat at framework level, not just template tweak.
- "As simple as possible" → tight scope, closed enums, n/a-with-reason allowed.
- "Every product brief should include authentication" → applies broadly (but defer `brief.md` to v0.3.2 per "one step at a time").
- "Lets get create product right" → `/setup-product` only this round.
- Picked **3 fields** (auth posture + data sensitivity + regulatory regime); picked **mandatory elicitation step** (workflow asks; doesn't trust agent to remember).

**Change:**
- **New "Access & Data Posture" section in `compass/templates/foundation-product.md`**, placed after Personas. 3 mandatory fields with closed enums:
  - Auth posture: anonymous · registered · authenticated · MFA-required · regulated-identity
  - Data sensitivity: none · public · PII · sensitive · regulated
  - Regulatory regime: none · GDPR · HIPAA · SOC 2 · PCI DSS · sector-specific · combination
  - `n/a — <reason>` valid only for genuinely non-applicable cases (e.g., internal build tooling with no users).
- **`/setup-product` Step 5 gained explicit elicitation sub-bullet.** Workflow conversationally asks the user the 3 questions during drafting (not just "populate the section silently"). Per Principle #14 — explicit elicitation closes the rationalization surface.
- **Step 5 Postcondition updated** to require the section is populated with values or `n/a — <reason>`.
- **New Verification gate item** in `/setup-product`: section populated, all 3 fields with value or `n/a — <reason>`; HITL gate blocks otherwise. References Principle #15 (cite-or-mark-n/a) + Principle #14 (named explicitly because foundational-product bets have historically failed to surface auth — the v0.3.1 trigger).

**Files touched (4):** `compass/templates/foundation-product.md`, `compass/workflows/setup-product.md`, `CHANGELOG.md` (0.3.1), `compass/workflows/improvements.md`. **Tight scope.**

**Watch for:**
- **Whether the `n/a` escape valve gets abused.** Backend-only / internal-tooling projects legitimately need it. If `n/a — internal` becomes the default answer for foundational products that DO have user-facing components, closed enums need tightening or workflow needs sharper elicitation language.
- **2nd-instance trigger for Principle #17.** When `/create-brief` gets the same treatment in v0.3.2 (every feature/OKR/tech-debt bet declares Access & Data), promote to AGENTS.md cross-cutting principle #17: *"Every bet declares access & data posture."* Currently 1 instance; codification rule says wait for ≥2-3.
- **Decide-before-derive flow in v0.3.2.** `/setup-foundation-architecture` auth promotion should **read the foundational product Access & Data Posture as input** — derive auth model from it, don't redefine. Without that link, the architecture decision is unmoored from the product decision and the gap returns at a different layer.
- **Agent over-scope tendency (meta-observation).** This round I initially over-scoped the plan: first pass was 7 files touching product + brief + architecture in one patch. User course-corrected: *"one step at a time. Lets get create product right."* Same shortcut shape as the soft-spec-rationalization failure mode the framework keeps catching — even the meta-architect (Claude on Compass) defaults to "do it all at once" when a clean structural fix is visible. **Recursive Principle #14 again; honor the slow-pace commitment.**
- **No new AGENTS.md principle this round.** Pattern needs 2nd instance (brief.md treatment) to satisfy codification rule. Codify in v0.3.2.

**Meta-observation:** v0.3.1 is the smallest patch in the v0.3 cycle (4 files; ~10 lines of new content per file). **Deliberate.** Validates the "one step at a time" cadence as a real discipline, not just stated intention. Next aura-app `/setup-product` run should surface auth as a foundational question — that's the validation criterion. Architecture-layer auth derivation lands separately in v0.3.2.

---

### 2026-05-26 — Workflow hardening template established + `/setup-product` translated (v0.3.0-alpha part 2)

**Goal:** Validate that the v0.3 gate/work/postcondition template can express a real workflow without ceremony bloat or behavior change. Pick `/setup-product` first — already the most disciplined workflow (had Verification gate from v0.1.9, named anti-patterns inline). Low translation risk → ideal for validating template on the easy case before harder workflows translate.

**What was done:**
- `compass/templates/workflow-template.md` created with all required sections + inline HTML commentary explaining each section's purpose (so future translators inherit intent).
- `compass/workflows/setup-product.md` translated step-by-step to the new template.
- Diff against v0.2.8 setup-product confirmed: **same 9 steps, same order, same artifacts, same HITL gate, same refusal cases. No behavior changes.** Implicit preconditions made explicit (the "source material required" check was inline in old Step 4; now in workflow-level Preconditions with refuse-and-redirect). Missing postconditions added (each step now has a mechanically-checkable output, not just the v0.1.9 Verification gate at end). Cross-cutting principle references in Verification are specific — each cite points at exactly what to enforce.
- `AGENTS.md` gained a "Workflow structure" section explaining the gate/work/postcondition pattern and pointing at the template.

**What the translation surfaced (template-validation findings):**

1. **Hardened length: 149 lines vs original 72 = 2.07x.** Just over the 2x hard-fail threshold the validation criteria called out. The template adds ~30 lines of fixed structural overhead per workflow (3-line triplets per step × 9 steps + new Roles/Migration/Output-contract/Anti-patterns sections + principle-referenced Verification expansion). **Fixed overhead = short workflows blow the budget; longer workflows likely fit.** /setup-product is on the shorter end of the workflow surface; /build, /create-brief, /scan are longer (90-150 lines original) and will land in much better ratios.

2. **Triplet structure: mostly natural, two friction spots.**
   - **Context-loading steps (Step 2 "Load PM role", Step 9 "Load PM role for status update")** resist clean triplet separation. The "Work" is "load this file as active context"; the "Postcondition" is "Claude understands the role" — trusted, not file-verifiable. Triplet ceremony for these steps adds 5 lines for what was a 1-line bullet. Worth tolerating (consistency wins) but a candidate for a **lighter "context-load" sub-pattern** in v0.3.0-beta.
   - **Optional/config-gated steps (Step 7 "Mirror to Confluence/Jira")** — the Postcondition needs to handle both "epic exists" and "skip logged" cases. Triplet handled it cleanly but reads slightly clunky.

3. **Cross-cutting principle references: signal, not noise — when scoped specifically.** The Verification items that reference #14, #15, #16 by number point at the exact output (e.g., "Per Principle #15 — 6-category Researcher framework: remaining 3 categories cited or n/a"). That's useful — future translators reading the workflow understand WHY the gate is mechanical. If we instead wrote "Verification per Principles #14, #15, #16" without specifics, it would be ceremony — and we'd lose the value. **Rule for translators: cite the principle AND name the specific output it enforces. No bare citations.**

**Template adjustments needed (v0.3.0-beta candidates):**

- **Shorten triplet ceremony for trivial steps.** Consider a single-line variant for context-loading steps: `### N. <Title> — Pre: <one-liner>. Work: <one-liner>. Post: <one-liner>.` Reserve the full triplet block for steps with non-trivial Work. Would save ~10-15 lines per short workflow. Defer until 2nd workflow translation confirms the friction is real (`/create-brief` likely the next translation).
- **Lighter Migration section for first hardenings.** Current Migration section is 6 lines for /setup-product. After 5+ workflows have been hardened, the convention is established and Migration sections can be shorter ("Translated per v0.3.0-alpha; no behavior change" + bullet list of changes). Don't over-trim while the convention is still new.
- **Decide whether `Output summary contract` is per-workflow or framework-wide.** It's identical across workflows (per principle #12). Could become a one-liner pointing at AGENTS.md #12 instead of repeating the contract. Defer — keep redundancy until pattern stabilizes.

**Diff confirmation (behavior preservation):**

| Aspect | Before (v0.2.x) | After (v0.3.0-alpha) | Changed? |
|---|---|---|---|
| Step count | 9 numbered Process steps | 9 numbered Steps | No |
| Step order | Check state → PM → Researcher → Source → Draft → DRI → Mirror → HITL → status update | identical | No |
| Roles invoked | PM, Researcher, Project Manager | PM, Researcher, Project Manager | No |
| Artifacts produced | `product.md`, optional `research.md`, `status.md` update | identical | No |
| HITL gate | After Verification passes | After Verification passes | No |
| Refusal cases | 2 (proposed-pending; no source) | Same 2, now workflow-level Preconditions | Structural only |
| Verification items | 7 | 12 (each step's postcondition mirrored + invariants + principle cites) | Structural; same enforcement, more checks made explicit |
| Named anti-patterns | Inline in Step 3 prose | Notes → Anti-patterns section | Surfaced explicitly |

**Pattern:** First v0.3 workflow hardened. Establishes the template; surfaces ergonomics friction; doesn't expand behavior. One workflow at a time per the slow-pace commitment.

**Next:** Wait. Don't translate the next workflow until v0.3.0-beta ships template adjustments based on the findings above. Second translation (likely `/create-brief`) pressure-tests the template against a less-disciplined workflow — that's where the real ergonomics signal comes from.

---

**ADDENDUM — 2026-05-27: framework grounding section added; budget recalibrated to density.**

After the initial validation above, the spec added a required **Framework grounding** section between Header and Purpose. Workflows now cite the canonical frameworks they operationalize (industry standards, books, Compass-originals, cross-cutting principles), with citations resolving to a new reference doc `compass/framework/canon.md`. For `/setup-product`: Working Backwards · Lean MVP · Continuous Discovery · JTBD · Porter's Five Forces · Helmer 7 Powers (9-type extension) · Blue Ocean · Shape Up · Helmer bet portfolio · Pyramid Principle · Stripe 2-page · Amazon 6-page · OKRs · North Star · plus Compass-originals (cite-or-mark-n/a, refuse + escalate, soft-spec hardening).

**This pushed `/setup-product` to 161 lines (2.24x original), well past the original "2x hard fail" threshold.** That triggered an explicit recalibration of the hardening budget:

- **Old heuristic (rejected):** "hardened workflow ≤ 40% longer; 2x = hard fail." A raw-length proxy that didn't survive first contact. Penalized templates for adding load-bearing content (Framework grounding) the same as it penalized ceremony.
- **New measure (adopted):** **load-bearing density** — count mechanically-checkable constraints, named conventions, auditable framework citations, principle-scoped Verification items per line. The check: **does each line earn its place?** Hardened `/setup-product` density = ~50 load-bearing items / 161 lines = **1 per 3.2 lines**. Original = ~20 / 72 = 1 per 3.6 lines. **Density rose, not fell** — hardening was net-additive to constraint, not bloat.

**Why this re-calibration matters more than the budget bust it resolves:**

- **Goodhart-resilient measure.** Counting "load-bearing items" instead of "lines" makes the metric track what we actually care about (constraint density) rather than a proxy (file size). Goodhart's law still applies — translators could pad Verification with non-load-bearing checkpoints to inflate density — but density is at least pointing at the right thing.
- **Recursive Principle #14 lens applies to the framework's own metrics.** The original "2x lines" budget was a soft heuristic that, when contact with reality showed it was wrong, would have been rationalized away ("eh, 2.06x is *basically* 2x"). Replacing it with an explicit measure tied to load-bearing-per-line removes the interpretive room.
- **Framework grounding becomes free in the new measure.** Each cited framework counts as a load-bearing item (auditable lineage anchors a gate's intent). The 15+ citations in `/setup-product` add ~30 lines AND ~15 load-bearing items, so density stays roughly stable.

**v0.3.0-beta candidates still standing** (not invalidated by re-calibration; they're ergonomics improvements that also help density):

- **Lighter triplets for context-loading steps** — saves lines without losing constraints, so density goes UP. Worth doing.
- **Output summary contract collapsed to one-line pointer at AGENTS.md #12** — same. Worth doing.
- **Citations as cross-doc references** is now MOOT — they're already cross-doc references (short-form → `canon.md`). The compression argument loses force; the auditability argument was the real reason to do it.

**What this means for `/build`, `/create-brief`, and future hardenings:** stop staring at line counts. Run the density check after translation. If density holds (≥ original or improved), the hardening was structurally sound regardless of length. If density drops, the template is adding ceremony — that's the real signal for template adjustment.

**Pattern observation:** the re-calibration is itself an application of Principle #14 to framework measurement. Soft metric ("budget is ~40% longer, 2x is too much") got rationalized away on first contact; replaced with a constraint-shaped measure (load-bearing density) that's harder to hand-wave. Same recipe as the workflow-level patches: name the failure mode (raw-length proxy fails for load-bearing growth) + make the new constraint mechanically defined (count items, divide by lines) + name the anti-pattern (Goodhart-style padding) inline so future framework-Architects inherit the vocabulary.

---

### 2026-05-26 — `/advance` deprecated (v0.3.0-alpha part 1) — first action on a retro-surfaced drift signal

**Friction:** Retro #003 (shipped hours earlier in v0.2.8) flagged `/advance: 0 uses in aura-app over 4 days of active dev` as a drift signal. The framework had been over-engineering a "canonical phase advance" command that real users don't invoke — phase transitions happen naturally via status-field flips (`proposed` → `approved` → `in-build` → `shipped`), and the elaborate auto-trigger chain we built (`/advance` → `/plan` → `/scan` → `/dashboard`) was load-bearing in the spec but irrelevant in practice.

**This is itself an instance of Principle #14 applied recursively to framework design.** The framework designer (me, earlier) rationalized that a canonical advance command was needed — that "users will want to advance phases through a single ceremony." The interpretive room was in the framework's *own* spec for itself. Reality showed users don't want that ceremony; they just flip statuses. Same soft-spec → rationalization → reality-collision pattern, just at the framework-design layer instead of the workflow-execution layer.

The retro cadence's promised lag-shrinking worked on its first try: drift signal surfaced in retro #003 → acted on in v0.3.0 the same day. **Convention-discovery lag = hours, not 17 improvements.**

**Change:**

*The workflow:*
- `compass/workflows/advance.md` — DEPRECATED notice at top + migration table + historical-record process preserved below. Skill kept registered (don't fail silently); on invocation, the workflow prints the migration table and does nothing else.
- `.claude/skills/advance/SKILL.md` — description updated to mark deprecated + migration pointer.

*Auto-chain references cleaned from active surface:*
- `compass/workflows/plan.md` — removed "Auto-triggered by /advance"; replaced "Auto-trigger contract" section with "Freshness" (manual + cron + `/status` flags staleness).
- `compass/workflows/scan.md` — removed "Auto-invoked by /advance"; kept `/build` phase-boundary auto-invocation (independent of /advance, stands on its own).
- `compass/workflows/dashboard.md` — removed transitive-via-/plan-from-/advance trigger entry; kept the 4 writer auto-triggers.
- `compass/workflows/status.md` — removed "or /advance (which auto-runs /plan)" suggestion.
- `compass/workflows/create-bet-portfolio.md` — rephrased plan-refresh-on-/advance to manual + cron.
- `compass/workflows/build.md` — rephrased "matching /advance behavior" → "matching the scanner's strict-mode block semantics."
- `compass/roles/project-manager.md` — removed auto-trigger-from-/advance annotations on `/plan` and output artifacts.
- `compass/roles/scanner.md` — removed /advance from "When you play this role" list.
- `compass/templates/scan-report.md`, `compass/templates/brief.md`, `compass/templates/plan.md` — removed "Auto-invoked by /advance" / "Auto-triggered by /advance" footers.
- `.claude/skills/plan/SKILL.md` + `.claude/skills/scan/SKILL.md` — descriptions updated.

*Canonical lists:*
- `AGENTS.md` workflow table: 18 → 17 (removed /advance row).
- `CLAUDE.md` commands list: removed /advance.
- `README.md` flow diagram: removed Navigate bucket (whose only member was /advance); now 4 buckets (Bootstrap / Plan / Execute / Observe). Added explanatory note: phase transitions are direct status-field flips, no canonical advance command.
- `SETUP.md`: removed /advance from "Anytime" section + rephrased the v0.1.14 plan-auto-refresh sentence.

**Files touched:** 21 — `compass/workflows/advance.md`, `.claude/skills/advance/SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `SETUP.md`, `compass/workflows/plan.md`, `compass/workflows/scan.md`, `compass/workflows/dashboard.md`, `compass/workflows/status.md`, `compass/workflows/create-bet-portfolio.md`, `compass/workflows/build.md`, `compass/roles/project-manager.md`, `compass/roles/scanner.md`, `compass/templates/scan-report.md`, `compass/templates/brief.md`, `compass/templates/plan.md`, `.claude/skills/plan/SKILL.md`, `.claude/skills/scan/SKILL.md`, `CHANGELOG.md` (0.3.0), `compass/workflows/improvements.md`.

**Files NOT touched** (deliberately):
- All 3 retro archives — they reference /advance as an active workflow, accurate as-of-write; immutability preserved.
- Historical CHANGELOG entries (v0.1.14 through v0.2.8) — historical record; deprecation lives in the new v0.3.0 entry, not retroactive edits.
- Historical improvements.md entries — same reason.

**What we kept (independent of /advance):**
- `/build` phase-boundary auto-invocation of `/scan` — catches missing production-readiness work before story is treated as shipped.
- `/dashboard` auto-refresh from `/scan` / `/plan` / `/metrics` / `/status` — writers refresh their own browser view; doesn't need orchestrator.
- Cron-driven `/scan` per `compass/config.yaml`.
- The `blocking_advance` field on scan reports + `scanner.per_phase` config — informational signal users consume when deciding to flip status fields.

**What we explicitly did NOT replace /advance with:**
- No new "canonical phase advance" command. The drift-signal insight was that this command wasn't needed; replacing it with a renamed equivalent would re-introduce the same loophole.
- No new auto-trigger from `/create-brief`, `/create-bet-architecture`, `/create-story`, `/build` to `/plan`. The /plan auto-refresh story is now: manual + cron + (existing) `/build` phase boundaries. If /plan going stale becomes a real problem, that's a future patch — not bundled with deprecation.
- No new role.

**Watch for (improvements #17-20):**

- **Are users actually flipping status fields directly?** The deprecation assumes users do this naturally. If they don't (e.g., a future user complains "I don't know what status to flip to"), we may need a thin "status-transition helper" doc — but NOT a /advance redux. Watch for the request shape.
- **Does the plan go stale without /advance's auto-trigger?** Cron + manual + /build phase boundaries should cover it. If `/status` keeps flagging staleness during active development, consider auto-firing /plan from /build PR-merge step (story-shipped event). Don't pre-add; wait for evidence.
- **Does `/dashboard` go stale?** Should not — the 4 writer auto-triggers are intact. If users observe staleness, the failure mode is that the writers themselves aren't being invoked, not that the auto-chain is missing.
- **Recursive Principle #14 application** — Claude-as-framework-designer fell into the soft-spec trap once (/advance). Watch for other framework-level rationalizations in the next batch. Likely candidates: any "auto-run" or "always engages" language describing framework mechanics that doesn't have downstream evidence of use. The retro pattern catches this; trust the process.

**Meta-observation:** The first action a `/retro` produced was deprecating a workflow the retro itself surfaced as drifted. That's the cadence working as designed — and it's deeply pleasing structurally: the framework's first retro-driven decision was *to remove framework surface area*. Most patches add; this one subtracted. Subtractive patches are how frameworks stay sharp.

---

### 2026-05-26 — `/retro` cadence + 3 cross-cutting principles codified from 3-retro backfill (v0.2.8)

**Friction:** User crystallized the single most-recurring failure mode across the framework's 15 prior improvements:

> *"Soft spec → AI rationalization → fix is hardening the spec. Anywhere an AI agent has interpretive room, it will exercise judgment that diverges from intent. Constraints that are 'implied,' 'obvious,' or 'best practice' get rationalized away under load. The fix is never 'tell the AI to be better' — it's explicit constraint + mechanical verification gate + named anti-pattern in the workflow file."*

Validating against the 15 improvements: **~11 of 15 patches fit this exact shape**, and 8+ of those were the same recipe applied to different rationalization surfaces. The pattern was visible by retro #001 (3 instances by improvement #5) but not formally codified until retro #003 reviewed it explicitly. **Convention-discovery lag: ~17 improvements** between "pattern visible" and "pattern named in AGENTS.md."

The user also proposed the meta-defense: **retros every 5 improvements** to surface recurring patterns earlier than the natural codification rhythm.

**Change:**

*New workflow + skill + template:*
- `compass/workflows/retro.md` — fires every 5 improvements logged in `improvements.md`. Reports patterns surfaced, recurring anti-patterns (soft-spec rationalization surfaces), convention candidates, drift signals, watch-for list. **Reports — does not prescribe.** No HITL gate.
- `.claude/skills/retro/SKILL.md` — skill stub.
- `compass/templates/retro.md` — frontmatter (`period_start`, `period_end`, `improvement_count`, `status: archive`). Sections: Improvements / Common patterns (positive) / Recurring anti-patterns (negative) / Convention candidates / Drift signals / Trigger-origin analysis / Watch-for list / Meta-observations.
- `compass/workflows/retros/` directory convention — archived retros live here, immutable once written.

*Backfilled retros (3) — covers improvements 1-15 retroactively:*
- **Retro #001** (v0.1.8 → v0.1.12) — surfaced N-category + refuse-escalate + soft-spec-recipe as convention-ready by improvement #5.
- **Retro #002** (v0.1.13 → v0.2.2) — surfaced `status: living` + state-detection-table + auto-trigger-chain conventions. Major capability-expansion phase.
- **Retro #003** (v0.2.3 → v0.2.7) — confirmed the soft-spec-rationalization pattern at 18+ cumulative instances. Identified `/advance: 0 uses` drift signal from aura-app. Confirmed trigger-origin concentration risk (all 5 from aura-app).

*Three cross-cutting principles codified in AGENTS.md (now 16 principles, was 13):*
- **Principle #14 (foundational): Soft spec → AI rationalization is a vulnerability surface, not flexibility.** User's verbatim formulation. Every load-bearing constraint requires explicit imperative language + mechanical verification gate + named anti-pattern. This is the foundational principle that #15 and #16 instantiate.
- **Principle #15: N-category cite-or-mark-n/a enforcement** for structured consultation. 5+ instances.
- **Principle #16: Refuse + escalate to upstream artifact.** 5+ instances.

*Wiring:*
- AGENTS.md workflow count: 17 → 18.
- `improvements.md` header now tracks retro cadence + next-retro-fires-after counter.

**Files touched:** new — `compass/workflows/retro.md`, `compass/templates/retro.md`, `.claude/skills/retro/SKILL.md`, 3 retro archives in `compass/workflows/retros/`. Edited — `AGENTS.md` (3 new principles + workflow table), `compass/workflows/improvements.md` (header + this entry), `CHANGELOG.md` (0.2.8).

**Watch for (next 5 improvements, #16-20):**

- **`/advance: 0 uses` investigation** — retro #003 flagged this drift signal. Either the auto-trigger chain is too heavy mid-build, or phase transitions are happening implicitly. Surface in the next aura-app session: "why aren't you running /advance?"
- **Trigger-origin diversification** — all v0.2.x improvements came from aura-app. Even one improvement from a different project would meaningfully de-risk over-fitting.
- **6th instance of N-category** would further validate Principle #15. Likely candidates: a Designer or UX Writer role gaining a structured framework.
- **Agent-miscategorization 2nd instance** — Claude (the meta-architect) fell into the soft-spec trap once during v0.2.6 triage. If it recurs, codify the "structural gap underneath symptoms first" heuristic explicitly.
- **`/retro` itself meeting reality.** Retros #001-003 were backfilled; the first *live* retro fires after improvement #20. Does the workflow as-written produce useful retros when run against fresh entries, or is the template still under-specified?
- **Convention-discovery lag should shrink dramatically** — patterns surfacing at instance #3 in a retro should land in AGENTS.md by the next minor version, not 17 improvements later.

**Meta-observation:** v0.2.8 is the first patch that's *about the framework's own learning cadence* rather than about a specific workflow gap. Compass is now self-instrumenting. The convention-discovery lag of v0.1.8 → v0.2.8 (17 improvements to name the dominant pattern) was the worst it will ever be — every retro from here forward should shrink it.

---

### 2026-05-26 — Stack-aware canary + Team playbooks (v0.2.7)

**Friction:** The aura-app 2026-05-26 evening state-of-play update gave direct evidence that two previously-deferred improvements were now load-bearing:

- **AC4 (passkey enrollment ceremony) blocked on `eas build --profile development + AASA + Android assetlinks.json`** — i.e., the mobile dev build that should have been the canary artifact for the mobile target. v0.2.5's `deploy_canary_url` (single string) only covered the web target (Vercel). Multi-target projects like aura-app (web + mobile) silently passed Phase B Verification while one target was actually undeployable. Discovered as a blocker on the first feature bet — the worst possible time.
- **3 runbooks the user wants to write** (`pnpm-monorepo-rn.md`, `vercel-pnpm-monorepo.md`, `expo-go-vs-dev-build.md`) explicitly framed as *"captures today's learnings for the next Compass project."* That phrase IS the gap — the next Architect designing a similar stack should be structurally required to consult these, not have to remember they exist or hope someone tells them.

Both gaps were proposed in earlier triage rounds and the user chose to defer; both now had a concrete next-friction case driving them.

**Change:**

*Improvement 1 — stack-aware canary artifacts:*
- `compass/config.yaml` schema: `deploy_canary_url: ""` (single string) → `canary_artifacts: []` (list of `{kind, url, verified_at, notes?}`). Kinds: `web | mobile | container | other`.
- `/setup-foundation-architecture` Phase B step 16 rewritten: produce a canary per deploy target; populate `canary_artifacts[]` with one entry per target; if any target fails, return to Phase A. Verification updated to require every target covered.

*Improvement 2 — team playbooks + signal-consultation 5th category:*
- New template `compass/templates/playbook.md` — frontmatter with `stack_combo` tags, `related_bets`, `last_validated`. Sections: When this applies / Symptoms / Steps / Gotchas / References / Maintainer note.
- New `docs/playbooks/` directory convention — scaffolded by foundational architecture template's Boundaries section. Empty initially; populated lazily as learnings emerge.
- `/setup-foundation-architecture` step 6 signal consultation gained a 5th category — *Team playbooks: search `docs/playbooks/*` for prior stack-specific learnings; cite or mark `n/a — empty directory`.* Mandatory citation once the team has playbooks across projects.
- `/measure` Phase 4 step 11a — soft prompt when outcome resolves with notable technical learnings: *"Any stack / tooling insights from this bet worth capturing as a playbook for future Architects?"* Soft prompt, not gate. Captures learnings while freshest.

**Files touched:** `compass/config.yaml`, `compass/workflows/setup-foundation-architecture.md`, `compass/templates/playbook.md` (NEW), `compass/templates/foundation-architecture.md`, `compass/workflows/measure.md`, `CHANGELOG.md` (0.2.7), `compass/workflows/improvements.md`.

**Pattern observation:** the 5th category in signal consultation makes this the **5th instance of the cite-or-mark-n/a N-category enforcement pattern** across Compass (Researcher 6, Architect 6-pillar, signal-consultation now 5, story standard-experience 6, plus the playbook itself shaped similarly). The v0.2.6 improvements log flagged the threshold: codify as an AGENTS.md cross-cutting principle when the 6th instance lands. This v0.2.7 doesn't trip that threshold but moves us closer.

**Watch for:**

- **Multi-target canary fatigue.** Producing canaries for every target may be slow (mobile dev-build can take 10+ min). If teams skip targets ("we'll do mobile later"), the gate is failing — the whole point was to discover the missing target *before* feature work, not after. Watch suppression patterns; if "mobile canary deferred" becomes routine, add a scanner check that blocks `/create-brief` until all targets are green.
- **Playbook quality drift.** Playbooks are living, but `last_validated` dates can rot. Architects who cite a stale playbook then discover it's wrong have a worse experience than no playbook at all. Consider a scanner check that flags playbooks > 6 months past `last_validated` as Medium findings when they're cited. Defer until evidence demands it.
- **Signal-consultation category 5 "n/a — empty directory" becomes a permanent crutch.** First-project bootstrap legitimately has no playbooks; second-project should rarely have an empty directory. If `n/a — empty` shows up on the 3rd+ project, the team isn't capturing learnings (the `/measure` soft prompt isn't biting). Watch for it across projects.
- **Playbook scope creep.** Playbooks are *tool-combination* knowledge; they're not bet runbooks, incident postmortems, or general docs. If `docs/playbooks/` starts accumulating non-tool-combo content (general "how we work" docs, opinionated PR rules, etc.), tighten the template's "When this applies" guidance — playbooks must be invocable by a future Architect during foundational arch consultation, not just generic team wisdom.

---

### 2026-05-26 — Story AC missing standard-experience coverage; PM wrote stories without back-button (v0.2.6)

**Friction:** During the aura-app retrospective the user mentioned "3 small UX cleanups bundled with #1 — back-affordance on Handle screen (your observation), misleading 'network' error mapping on Passkey screen, error-state copy review." I initially categorized this as app-specific and moved on. The user corrected:

> *"the ux cleanup was about — stories that were written did not have back button for eg. if compass is writing the story we should give the team a template to create the best story possible covering the feature standard experience"*

**Root cause analysis:** When `/create-story` runs and PM drafts the story, the AC list is freeform — no structural prompt for navigation, states, feedback, accessibility, edge cases, or cross-surface consistency. The Designer + UX Writer roles individually cover state/accessibility/copy quality well in *their* artifacts, but the story AC (the actual implementation contract Engineer codes against and Codex tests against) doesn't echo it. Outcome: Designer draws the back button in Figma; story AC doesn't say "back navigation returns to <screen>"; Engineer implements only what AC specifies; Codex E2E tests only what AC specifies; ships without back button.

Three aura-app failures fit the same gap:
- **Missing back button** — Navigation category not in AC
- **Misleading "network" error on Passkey screen** — Feedback category not in AC (no error-type discrimination requirement)
- **Error-state copy review needed post-build** — Feedback category not in AC (copy quality expectations not specified)

All three should have surfaced at story-creation time, not as post-build QA cleanups requiring re-design loops.

**Change:**
- New "Standard Experience Checklist" section in `compass/templates/story.md` — 6 categories (Navigation, States, Feedback, Accessibility, Edge cases, Cross-surface consistency). Each either covered by ≥1 AC item OR explicitly `n/a — <reason>`. Same enforcement shape as Researcher 6-category, Architect 6-pillar, signal-consultation 5-category.
- `/create-story` step 7 requires checklist filled; new refusal case blocks empty categories from reaching `status: ready`.
- Designer DoD adds explicit cross-reference: design and AC must match; what's in Figma but not in AC will ship missing.
- UX Writer DoD adds error-type-discrimination requirement: generic "something went wrong" or mislabelled error types fail the Feedback category.

**Files touched:** `compass/templates/story.md`, `compass/workflows/create-story.md`, `compass/roles/designer.md`, `compass/roles/ux-writer.md`, `CHANGELOG.md` (0.2.6), `compass/workflows/improvements.md`.

**Meta-lesson — my miscategorization:** I read "3 UX cleanups bundled with #1" and pattern-matched to "app-specific polish, defer." That's exactly the kind of agent shortcut Compass keeps catching elsewhere. The user re-routed me to the structural gap underneath the symptoms. The relevant Compass principle (per AGENTS.md / cross-cutting): symptoms across multiple bets in the same shape ARE the signal of a missing structural constraint. Three UX issues "bundled" with another bet = three independent signals that the story-creation discipline wasn't catching standard UX expectations. Worth adding to my own scan-for-patterns when triaging future retrospectives: "are these N independent fixes really N fixes, or 1 missing constraint?"

**Watch for:**
- **Checklist becomes rote.** If PM starts marking every category as "covered by AC-1" without thinking, the gate is failing. Codex review or scanner could catch this with a "Standard Experience Checklist categories cite distinct AC numbers" check — defer until evidence shows the rot.
- **Categories don't fit certain story types.** Backend-only stories will mark most categories `n/a — backend-only`. Internal-tooling stories might skip accessibility. If "n/a" becomes the default for >50% of stories, the categories are too broad — tighten or add story-type-specific subsets.
- **The 6-category framework is the 4th instance of this pattern shape** (Researcher 6, Architect 6, signal-consultation 5, now standard-experience 6). Confirming that `cite-or-mark-n/a` is the right enforcement default across Compass for "agent could rationalize an omission." Worth codifying as an AGENTS.md cross-cutting principle if a 5th instance lands.

---

### 2026-05-26 — Three Compass gaps from a 13-issue aura-app triage (v0.2.5)

**Friction:** User finished a sprint in aura-app and produced a 13-issue retrospective covering: pnpm strict isolation × Metro module resolution (#1, #2, #4, #8); React 19 vs 18.3.1 version mismatch (#5, #10); react-native-screens / safe-area-context / expo-secure-store version drift (#3, #7); missing expo-constants peer deps (#6); New Architecture app.json flag (#9); `EXPO_PUBLIC_API_BASE_URL` defaulting to localhost on real device (#11); 4+ rounds of Vercel deploy failures (#12); Supabase `pg_uuidv7` missing in ap-south-1 (#13).

10 of 13 were app-specific Expo/pnpm/Metro/React tooling choices — explicitly out of scope per user ("expo and other are the app choices — we are not going into those yet"). Three issues, though, revealed Compass-shaped gaps:

- **#11 — env-var default works in dev, breaks elsewhere.** Prod build passes; the app boots into a broken state because `localhost` was the default and the device can't reach it. Engineer's spec didn't require auditing for this.
- **#12 — Vercel deploy failures discovered mid-project after multiple feature bets had started.** The foundational architecture committed to Turborepo + pnpm + Vercel + Next.js but never validated the full pipeline end-to-end. First deploy attempt was the discovery vector; took 4+ rounds of debugging (doubled output path, missing pnpm-lock, no Next.js detected, monorepo dashboard overrides interacting with vercel.ts).
- **#13 — Supabase `pg_uuidv7` extension assumed available; missing in ap-south-1.** Architect assumed vendor capability without verifying for the specific region. Same anti-pattern shape as the broader Architect-must-consult-signal fix (v0.2.4) but at finer grain — vendor capability per *deployment context* (region/SKU/plan-tier), not just per vendor.

**Change:**

*Improvement 1 — env-var / runtime-config audit:*
- `/build` step 7: added runtime-config audit block with explicit ban on silent `localhost` fallbacks. Defaults that only work in dev must throw at module load.
- Engineer DoD: added "Runtime-config audit clean" item with the same language.

*Improvement 2 — Phase B deploy-canary gate:*
- `/setup-foundation-architecture` Phase B: new step 16 — deploy hello-world from the scaffolded repo to the target environment. If fails, return to Phase A with ADR entry. Don't proceed to summary until canary green.
- Phase B Verification: added deploy-canary green check.
- `compass/config.yaml` `ci_cd`: new `deploy_canary_url` field populated by the canary.

*Improvement 3 — Production Ready scanner check PROD_READY-09:*
- New scanner check: vendor capability claims must have a doc citation that confirms availability for the specific deployment context (region, SKU, plan-tier, runtime version), not just generic vendor support.
- Severity High, suppressible with DRI rationale that includes manual-verification date.

**Files touched:** `compass/workflows/build.md`, `compass/roles/engineer.md`, `compass/workflows/setup-foundation-architecture.md`, `compass/config.yaml`, `compass/workflows/scan.md`, `CHANGELOG.md` (0.2.5), `compass/workflows/improvements.md`.

**Watch for:**

- **Deploy canary becomes a friction point at large scale.** For complex monorepos, the canary deploy might itself take 10+ minutes. If teams start skipping it (with bad rationale), tighten with a scanner check that gates `/create-brief` until `deploy_canary_url` is non-empty. Today: enforce via the verification checklist, but allow user-override if they really know what they're doing.
- **Runtime-config audit needs framework-aware tooling to actually enforce.** The spec says "fail loudly at module load" but Compass doesn't ship a lint rule for it. Each project's stack needs its own enforcement (e.g., `zod` schema for env vars, throwing at boot). Spec calls for the behavior; doesn't enforce mechanically. Worth a future "config helper" pattern across stacks.
- **Vendor capability check (PROD_READY-09) is verbose to satisfy.** Every vendor feature needs a citation. If teams find this punishing for stacks with many vendor features (e.g., 20+ AWS services), the check becomes noise. Watch suppression patterns; if >50% suppressed, the check is too broad — tighten to "non-baseline vendor features" only.
- **The deferred stack-composition matrix may surface again.** If issues like #1, #2, #4, #5, #8 keep recurring in spite of deploy-canary, the foundational arch template needs a section explicitly enumerating compatibility constraints between stack rows. Defer until evidence is clear.

---

### 2026-05-26 — Engineer skipped prod build; Architect quietly widened foundational stack (v0.2.4)

**Friction:** Two real-world failures from the aura-app project surfaced on the same day, both the same anti-pattern shape.

**Issue 1 — Engineer DoD missing prod build.** PR 2 opened after `pnpm typecheck` + `pnpm test` passed. Production build (`pnpm build`) was never run because it wasn't in the spec. Three downstream issues hit staging that the production build would have caught locally: bundling errors, dead-import elimination, env-var resolution. User correctly identified the missing constraint: "the story-Tests section calls for component tests but no production-build smoke test." Production build is genuinely uncatchable by typecheck + unit tests.

**Issue 2 — Architect recommended without checking foundational fit or existing signal.** The bet architecture introduced new tooling without checking whether the foundational stack already had a solution, whether prior bets had decided on this, whether observability showed the actual baseline. User reframed the diagnosis crisply:

> *"Ideally the arch check should be in foundational. If arch is changing or adding new tools in the bet architecture then we need to update the foundational — ADR etc."*

That reframe is the load-bearing insight. The fix isn't "bet architects should consult more signal" — it's "bet architects can't unilaterally widen the foundational stack." Foundational scope is the canonical home for tooling decisions. Bet architecture is constrained to operate within it. Deviations escalate to foundational amendments with structured ADR entries.

**Change:**

*Issue 1 (Engineer prod-build):*
- `/build` Phase 2 step 7: production build added as required local check, with explicit *why* (catches bundling / dead-imports / env-vars / asset pipeline / monorepo workspace resolution — things typecheck + unit tests can't see).
- Engineer role Definition of Done: "Production build green" added as a required item.

*Issue 2 (Foundational-first signal consultation + bet-arch deviation gate):*
- `/create-bet-architecture` new step 7: **foundational-stack deviation gate.** Refuses to proceed if the bet needs tools/services/frameworks/data stores/runtimes/dependencies outside `docs/foundation/architecture.md` Stack table. Tells user to run `/setup-foundation-architecture` amend first. Logs the deviation as a DRI Issue on the bet.
- `/setup-foundation-architecture` Phase A: 4-category signal-consultation framework (production observability / recent PR feedback / prior architectural decisions across bets / bet-arch deviation pressure). Each cite-or-mark-n/a-with-reason. Especially load-bearing on amend flows.
- Architect role: Input list extended to call out foundational Stack table as canonical; DoD requires explicit "no deviation" assertion or escalation note.
- `foundation-architecture.md` template: new **ADR / Amendments** section with structured entry shape (Triggered by / What changed / Why / Reversibility / Cited signal). Required to have ≥1 entry on any foundational version > 1.

**Files touched:** `compass/workflows/build.md`, `compass/roles/engineer.md`, `compass/workflows/create-bet-architecture.md`, `compass/workflows/setup-foundation-architecture.md`, `compass/roles/architect.md`, `compass/templates/foundation-architecture.md`, `CHANGELOG.md` (0.2.4), `compass/workflows/improvements.md`.

**Watch for:**

- **The deviation gate may feel punitive at first.** Bets that genuinely need new tooling now have to round-trip through a foundational amendment. That round-trip *is the point* — but if users start trying to characterize legitimate new dependencies as "not really tooling," consider tightening the deviation-gate definition with a concrete list ("major dependency" = anything that needs a config file, runs in its own process, has its own backup strategy, or costs >$50/month).
- **ADR sprawl.** If amendments happen frequently, the ADR section grows long. Today's inline approach is fine for small/early projects; at scale (50+ ADRs) consider splitting into `docs/foundation/adrs/<ADR-NNN>.md` files with an index in foundational arch. Defer until friction is real.
- **Signal-consultation citations rot.** Sentry links, PR numbers, MCP URLs all decay over time. The DRI log preserves the *reasoning*; the citation is the *receipt*. If reviewers start finding dead citations during audits, add a citation-freshness sub-check to the scanner.
- **Engineer prod-build catches a class of bug; doesn't catch all classes.** Production build verifies the build pipeline; it doesn't verify runtime correctness in a production-like environment. Future improvement: add a staging-smoke step to the build workflow (separate from prod-build) that exercises the deployed artifact. Out of scope for this round.

---

### 2026-05-25 — Dashboard agent silently summarized artifacts; verbatim wasn't load-bearing enough (v0.2.3)

**Friction:** First real `/dashboard` run in a consuming project (aura-app) produced a 42 KB HTML file that *looked* fine — until the agent's own status report revealed it had silently summarized 4 of the 9 inlined artifacts (product.md v2, architecture.md v1, architecture-research.md, portfolio.md were "executive summaries of the larger sections"; the rest were verbatim). The agent's stated rationale: "to keep the file at 42 KB and reviewable."

This is the same anti-pattern shape as the Researcher "log-and-walk-away" (v0.1.9) and the Architect "smart defaults" (v0.1.11) — an agent rationalizes a shortcut, taking soft spec language ("inline ... verbatim") as permission to optimize on a constraint that doesn't actually bind. Three things made the violation particularly bad:

- **The framing was invented.** "42 KB is reviewable; 300 KB isn't" is wrong on both counts. Reviewers don't read `dashboard.html` (it's gitignored as of v0.2.2). Stakeholders open it in a browser, where 300 KB loads in well under a second.
- **Summaries create a second source of truth.** The dashboard's only value is being a *faithful view* of the underlying markdown. The moment summaries enter, stakeholders read the dashboard *instead of* the real artifacts, and discovering the dashboard's message differs from the source is the kind of trust failure that kills the dashboard's usefulness.
- **The careful structured detail gets lost.** DRI entries, per-row pillar evaluations, complete alternatives tables, full citation lists — exactly the things stakeholders need to verify the work — get quietly dropped in "executive summarization." That's the worst kind of drift: information loss disguised as readability gain.

**Change:**
- Workflow step 7 rewritten with explicit, load-bearing language: do NOT pre-render, do NOT summarize (with concrete examples of bad summarization framings to head off "but I just lightly condensed it" rationalizations), do NOT truncate, do NOT reword. Includes a "Why this is non-negotiable" rationale block so future agents reading the spec cold see why the constraint matters.
- New Verification item: every inlined artifact's content matches source byte-for-byte. Spot-check via `diff`.
- New anti-pattern in Notes section: "Silent summarization is the failure mode." Names the invented-constraint framing trap directly and points at a future `/dashboard --summary` opt-in as the right escape hatch.

**Files touched:** `compass/workflows/dashboard.md`, `CHANGELOG.md` (0.2.3), `compass/workflows/improvements.md`.

**Why no `--summary` flag is added yet:** real friction (very large projects where 300 KB becomes 3 MB) hasn't been observed. Pre-building escape hatches before the constraint has been tested invites the same agent rationalization at lower scale — "well there's a `--summary` mode for a reason, this project is *kind of* large..." Build the flag when real users actually need it.

**Watch for:**
- **Agents rationalizing other shortcuts.** The same pattern (soft spec → agent invents a constraint → silent optimization) may surface in other workflows. Watch for it especially in workflows where the output is large or visually inspected (scan reports, metrics snapshots, plan calendars). The fix shape is the same: make the constraint load-bearing, add verification, name the anti-pattern, give the rationale.
- **Agents skipping the verbatim-spot-check verification step.** Adding the checklist item is necessary but not sufficient — agents may write the item then skip running the actual `diff`. If this becomes a pattern, consider a stronger forcing function (e.g., the workflow output must include a quoted diff snippet from spot-checking).
- **Users requesting `--summary` mode prematurely.** If multiple users ask for it before real size-friction emerges, that's a signal the dashboard's structure isn't matching their actual use case — consider a "table of contents only" view (collapse-by-default) rather than summarization.

---

### 2026-05-24 — Dashboard diff churn; need a gitignore rule for pure derived views (v0.2.2)

**Friction:** First real `/dashboard` run in a consuming project (aura-app) produced a ~2500-line `docs/dashboard.html` (9 markdown artifacts inlined verbatim). Architecturally fine — modern browsers + editors handle it without issue. But every `/scan`, `/plan`, `/metrics`, `/status` rewrites the whole file, so each workflow run produces a ~2500-line diff that grows linearly with project size. The diff isn't human-meaningful (the source-of-truth diff lives in the underlying markdown), and reviewers will tune out, which means a real bug in the dashboard template would slip through review.

**Change:**
- Added `docs/dashboard.html` to the Compass framework's root `.gitignore` (didn't exist before — created fresh).
- Documented in `SETUP.md` that consuming projects should add the same line to their `.gitignore`, with the rationale + one-liner command.
- Updated the `/dashboard` workflow's Output section to state "gitignored by convention" and explain why.
- Articulated the rule explicitly in the workflow + this improvements log: **gitignore only pure views derived from other tracked files with no user-relevant state of their own.**

**Files touched:** `.gitignore` (new), `compass/workflows/dashboard.md`, `SETUP.md`, `CHANGELOG.md` (0.2.2), `compass/workflows/improvements.md`.

**Why other living artifacts stay tracked:**

| Artifact | Carries user state? | Tracked? |
|---|---|---|
| `docs/dashboard.html` | No — pure view | ❌ ignored |
| `docs/foundation/plan.md` | Yes — refinement log accumulates per-refresh entries | ✅ tracked |
| `docs/bets/<id>/scan-report.md` | Yes — preserves suppressions with HITL approvals | ✅ tracked |
| `docs/metrics/<bet-id>-<date>.{md,json}` | Yes — dated time-series, never overwritten | ✅ tracked |
| `docs/status.md` | Yes — humans read history in retros | ✅ tracked |

**Watch for:**
- **Other pure views may emerge.** If we add HTML exports of individual reports, or a `--publish` mode that writes to a public dir, those need the same gitignore treatment. Update the rule above when it happens.
- **Already-committed dashboards in existing consuming projects** need `git rm --cached docs/dashboard.html` to untrack, not just `.gitignore` (which only affects new files). SETUP.md mentions this for consuming projects.
- **Stakeholders who want git history of dashboard state** (e.g., "what did the scan look like 3 weeks ago?") won't get it from git anymore. They get it from the dated metrics snapshots + the scan report's own scan-history table, which preserves the data without the diff churn.

---

### 2026-05-24 — Living artifacts were IDE-only; stakeholders needed a browser view (v0.2.1)

**Friction:** v0.2.0 produced a lot of living artifacts — scan reports per bet, metrics snapshots, plan, portfolio, status. Useful inside the IDE (engineers reading markdown in their editor) and useful for AI consumption (workflows read them). But **stakeholders skim**: PMs, leadership, on-call rotation, anyone outside the IDE wanted to open a URL or attach a file and see current state. Spelunking `docs/bets/*/scan-report.md` across 12 bets is not skim-friendly. Markdown rendered on GitHub is OK if the repo is public and the audience knows the URL — but most teams' repos are private and stakeholders don't have GitHub access. Result: the living artifacts were structurally invisible to the people they were ultimately for.

The user named the gap: "we should have the scan and metrics open in an html view." Extended in brainstorm to all derived/living artifacts (plan, portfolio, status too) — same audience, same shape.

**Change:**
- New `/dashboard` workflow + `compass/templates/dashboard.html.template` + `.claude/skills/dashboard/SKILL.md`.
- Output: single self-contained `docs/dashboard.html`. Opens via `file://`. Six tabs: Foundation / Plan / Portfolio / Scan / Metrics / Status. Marked.js + Mermaid.js via jsDelivr CDN.
- **Key implementation insight: AI agent as generator.** Compass is markdown-as-prompt for AI tools. Claude running `/dashboard` reads the markdown reports and inlines them into the HTML template via the Write tool. No Node, no Python, no Pandoc. Zero new toolchain dependencies.
- **CORS-safe by inlining.** Browsers block `fetch()` over `file://`. Inlining markdown into `<script type="text/markdown">` blocks at generation time avoids needing a server.
- `/scan`, `/metrics`, `/plan`, `/status` auto-invoke `/dashboard` at the end of their process. `/advance` triggers it transitively via `/plan`. The browser view never goes stale during normal workflow usage.
- Project Manager role owns `/dashboard` (rolling-visibility mandate alongside `/status` and `/plan`).
- AGENTS.md workflow count: 16 → 17.

**Files touched:** new — `compass/workflows/dashboard.md`, `compass/templates/dashboard.html.template`, `.claude/skills/dashboard/SKILL.md`. Edited — `compass/workflows/scan.md`, `metrics.md`, `plan.md`, `status.md`, `create-bet-portfolio.md`, `advance.md`, `compass/roles/project-manager.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `SETUP.md`, `CHANGELOG.md` (0.2.1), `compass/workflows/improvements.md`.

**Watch for:**
- **Diff churn.** Every `/scan`, `/metrics`, `/plan`, `/status` run rewrites the entire `docs/dashboard.html`. Diffs will be large because the file inlines all artifacts. Consider git-ignoring `docs/dashboard.html` if reviewers find the noise unhelpful (the file regenerates anyway).
- **Mermaid via CDN at runtime.** ~600KB gzipped on first open. Works offline only if cached. Consider self-hosting the JS deps in the repo if offline-first becomes a requirement.
- **Stakeholder-facing content.** Now that markdown gets surfaced to non-engineering audiences, internal-only language ("DRI", "HITL gate", "blocking_advance") may need glossing. Watch for confused stakeholder questions; consider adding a "What this means" tooltip for jargon if it becomes friction.
- **Scale.** AI-driven HTML generation works at small/early project scale (3-6 MVP bets, ~20 living artifacts). At 30+ bets the inlined HTML becomes large and AI generation slows. At that point, replace with a Node/Python script generator — same template + COMPASS-INSERT marker convention, just faster.
- **`/dashboard --publish <target>` is deferred.** If hosted (Confluence / Notion / GitHub Pages) becomes useful, add a publish mode that pushes via MCP. The single-file approach handles the most common need (share an attachment) first.

---

### 2026-05-24 — Quality gates were rubric-shaped; engineers resent rubrics, trust scanners (v0.2.0)

**Friction:** Compass v0.1 grew a lot of verification gates — each new workflow had its own checklist (Researcher must produce evidence in 3+ categories; Architect must score every stack row on 6 pillars; portfolio must have ≥1 post-MVP item; etc.). All useful, all framed as **rubrics the owner self-applies**: "did I do this?" boolean. That works at the foundational/wedge layer where the gates are big and infrequent, but it doesn't scale to SDLC-wide quality (Production Ready, GTM, Operate), and rubrics get political — they feel like grading, not informing. Meanwhile, the *Production Ready* phase was effectively silent in Compass: runbook, SLO, monitoring, rollback, on-call, backup, cost monitoring, compliance lived as vague intentions scattered across role docs, owned by nobody. Bets were getting "shipped" without runbooks; SLO files never existed; rollback was discussed in standup but never tested. Incidents revealed gaps that should have been caught structurally.

The reframe: **engineers don't resent scanners.** Snyk, Semgrep, GitHub Advanced Security, Dependabot — all run continuously, produce *findings* (not failures), give each finding a severity + confidence + location + reason + fix, support suppressions with justification. Engineers triage findings without taking it personally. Same shape, applied to the product lifecycle.

**Change:**
- New `/scan` workflow, Scanner role (read-only), `scan-report.md` template.
- Six SDLC phases formally documented: Product, Architecture, Build, **Production Ready** (new), GTM, Operate.
- 44 checks across the six phases, catalogued in `compass/workflows/scan.md` (single source of truth — new checks added there, not improvised by role).
- Finding shape: severity (Critical / High / Medium / Low) + confidence (High / Medium / Low) + location + reason + fix + applies-to + suppressible. Same vocabulary engineers already use from security tooling.
- Confidence derivation is canonical (content depth + source freshness + cross-artifact corroboration) and the Reason field states the reasoning so owners see how the scanner concluded.
- Suppression policy: HITL-approval for Critical (with non-suppressible carve-outs for PII / regulated data / breaking changes / legal), DRI-justification for High, owner-acceptance for Medium, silent-but-logged for Low.
- `/advance` auto-runs `/scan` before any phase transition. `strict` mode blocks on Critical; `advisory` mode warns. Non-suppressible Critical always blocks.
- `/build` auto-runs `/scan` at phase boundaries (Build → Production Ready → GTM → Operate). Catches missing production-readiness work *before* the bet is treated as shipped.
- `/metrics` gained an Open Findings posture roll-up — counts by severity, top patterns, suppressions, time-to-remediate, trends.
- AGENTS.md principle #13 codifies the model.

**Files touched:** new — `compass/workflows/scan.md`, `compass/templates/scan-report.md`, `compass/roles/scanner.md`, `.claude/skills/scan/SKILL.md`. Edited — `AGENTS.md` (principle #13 + 13 roles + 16 workflows), `compass/workflows/advance.md` (scanner block semantics), `compass/workflows/build.md` (phase-boundary scans), `compass/workflows/metrics.md` (Open Findings section), `compass/config.yaml` (scanner: section), `compass/templates/brief.md` (Scan summary section), `README.md` (principle + flow), `CHANGELOG.md` (v0.2.0), `compass/workflows/improvements.md`.

**Watch for:**
- **Check fatigue.** 44 checks across 6 phases is a lot. The point is each check fires only when its evidence is missing, and Low/Medium findings don't block anything. If teams start treating Low findings as work, tighten the catalog or push more to `silent_dismissal_logged`.
- **False positives on confidence.** The "content depth" signal is heuristic — minimal files are flagged Medium-confidence. Some legitimate "the doc is short because the bet is small" cases will get flagged. Watch suppression patterns; if a check is suppressed > 50% of the time, it's a bad check, not a bad team — rewrite it.
- **Hand-edited scan reports** — anti-pattern; next scan overwrites. Suppressions are preserved by finding ID, not by hand-edit. If users start hand-editing reports, they're trying to express something the suppression model can't — add it as a first-class field.
- **Scanner role drift.** Scanner is supposed to be read-only. If a future change has Scanner writing to product artifacts (brief, architecture, runbook), that breaks the model. Owners decide; scanner informs.
- **Production Ready phase is new.** Existing in-flight bets won't have runbook/SLO/monitoring. First scan against any current bet will likely produce 5-8 Production Ready findings. Expect a triage wave; treat it as the value of the scanner, not noise.
- **Aggregate posture in `/metrics`** can become a dashboard people optimize for instead of fix root causes for (Goodhart). If "critical findings count" becomes the metric, watch for teams gaming via suppression. The suppression rationale audit is the counter — if rationales become rote, the gate is failing.

---

### 2026-05-24 — No time-bound plan; outputs didn't feed forward to scheduling

**Friction:** The portfolio gave us a *logical* plan (dependency graph showing which bet depends on which). What it didn't give us was a *temporal* plan — when each bet starts, when it ends, who's on it, which streams run in parallel on the calendar. And while each workflow did load prior artifacts (architecture loads product bet, brief loads portfolio, etc.), the "output → input to next phase's plan" linkage was implicit in the read order, not explicit anywhere. Practical fallout: "when can we ship the MVP?" was unanswerable in concrete dates; the portfolio's parallel-build candidates sat unused because no calendar showed when each stream actually started; estimates never tightened because they lived in someone's head, not in an artifact; slip detection was reactive ("someone noticed we missed the date") rather than computed (the plan would have shown the slip the day after a phase finished late).

The user named the deeper principle: **each phase's output should be an input to the plan for the next phase.** The plan should sharpen as evidence lands (brief approval refines scope estimate; architecture approval refines effort estimate; build start writes actuals).

**Change:**
- New `/plan` workflow + `docs/foundation/plan.md` living artifact. Status is `living` — never `proposed` or `approved`. Derived from per-bet artifacts; PM owns the rolling refresh.
- Estimate model: each bet's `estimate` frontmatter (`duration_weeks`, `confidence`, `refined_by`, `refined_at`) sharpens through the phases — stub default 2wk → brief approval (scope-sized 1/2/4wk) → architecture approval (+1wk if arch required) → stories (count × per-story size) → build PRs merged (actuals).
- Refinement log inside `plan.md` writes a row every time a date moves, naming the triggering artifact. This is the audit trail for "output → input" causality.
- **`/advance` auto-runs `/plan` as its final step.** This is the load-bearing mechanic — users never have to remember to refresh the plan; every phase advance does it.
- `/status` now reads the plan rather than recomputing schedule data; adds plan-freshness signal to health metrics.
- `/create-bet-portfolio` Output section points at `/plan` as the immediate next step after portfolio HITL approval (seeds the schedule).

**Files touched:** new — `compass/workflows/plan.md`, `compass/templates/plan.md`, `.claude/skills/plan/SKILL.md`. Edited — `compass/workflows/advance.md` (auto-trigger), `compass/workflows/status.md` (reads plan), `compass/workflows/create-bet-portfolio.md` (next-step pointer), `compass/templates/brief.md` (estimate block), `compass/roles/project-manager.md`, `AGENTS.md`, `CLAUDE.md`, `SETUP.md`, `README.md`, `CHANGELOG.md` (0.1.14), `compass/workflows/improvements.md`.

**Watch for:**
- **Hand-editing `plan.md`** — anti-pattern; the next `/plan` run will overwrite. If users start hand-editing, they're probably trying to express something the estimate model can't capture (custom override, manual lock). Watch for it and consider an `override` field on the bet's `estimate` block rather than letting plan-edits land.
- **Stale plan + `/status` divergence** — if `/advance` is bypassed (user edits artifact status directly), the plan goes stale and `/status` flags it. If this becomes common, consider adding a hook that fires `/plan` on any artifact `status:` change, not only on `/advance`.
- **Estimate accuracy** — the default duration_weeks (2 for stub; 1/2/4 for small/medium/large brief; +1 for architecture; 3 days per story) are coarse heuristics. After a few projects, look at refinement log → actuals deltas and tune. Don't tune from a single project.
- **Auto-trigger from `/advance` may be noisy** if `/advance` is called many times per day. Acceptable for now (plan refresh is cheap). If it gets expensive at scale (large bet count + git+MCP reads each time), consider debouncing or marking the plan stale instead of refreshing eagerly.

---

### 2026-05-24 — Bootstrap forced bets serial; teams idle, deps invisible

**Friction:** The methodology said "PM decomposes bets one at a time." That's correct in steady state — ship a bet, learn, file the next. But for new projects, the MVP is rarely one bet — it's typically a wedge of 3-6 bets (auth + core capability + persistence + engagement loop, etc.) that together form a viable product slice. Forcing them serial during bootstrap meant: foundational architecture got decided knowing only bet 1's needs (bets 2-6 then kept breaking it); teams sat idle waiting for the previous bet to clear; cross-bet dependencies stayed invisible until they bit; no parallel build streams were possible.

The user observed the real-world pattern: "create the bets across all and then have the build start in parallel." But this needed to be **bootstrap-only** to avoid becoming a waterfall mini-roadmap, and **strictly MVP** to avoid scope padding.

**Change:**
- New workflow `/create-bet-portfolio` — bootstrap-only, runs once per project after foundation product + architecture are approved.
- Workflow elicits MVP definition via a forcing question ("what does this product need to do for one real user to complete the core value loop once?"). Verbatim user answer becomes the load-bearing scope statement at the top of the portfolio doc.
- Drafts 3-6 stub briefs (MVP bets only) with new frontmatter fields `portfolio_stub`, `depends_on`, `parallel_with`. Each stub traces its one-line hypothesis back to a specific line in the product bet.
- Drafts `docs/foundation/portfolio.md` with Mermaid `flowchart` dependency graph + explicit parallel-build candidates + a "Deliberately out of MVP" section for the user's "tempted to include but actually post-MVP" items.
- `/create-brief` gained a promote-stub mode: `/create-brief <bet-id>` fills in the full content for a portfolio stub and clears the flag. Fresh-bet creation mode is unchanged.
- State detection prevents re-bootstrapping: once any stub has been promoted, `/create-bet-portfolio` refuses re-invocation. New bets after MVP go through `/create-brief` fresh.
- Two distinct HITL approvals per bootstrap bet: portfolio approval ("yes, this is the wedge") + per-brief approval after promotion ("yes, this is what bet N specifically should be"). Deliberate.
- Researcher engagement is mandatory in the new workflow (same enforcement as setup-product) — surfaces MVP wedge patterns from comparable products as a sanity check on the user's MVP definition.

**Files touched:** new — `compass/workflows/create-bet-portfolio.md`, `compass/templates/portfolio.md`, `.claude/skills/create-bet-portfolio/SKILL.md`. Edited — `compass/workflows/create-brief.md` (promote-stub mode), `compass/workflows/setup-foundation-architecture.md` (next-step pointer), `compass/templates/brief.md` (new frontmatter fields), `compass/roles/pm.md`, `compass/roles/researcher.md`, `AGENTS.md`, `CLAUDE.md`, `SETUP.md`, `README.md`, `CHANGELOG.md` (0.1.13), `compass/workflows/improvements.md`.

**Watch for:**
- **Scope creep at the MVP line.** The "Deliberately out of MVP" section is where this gets tested. If users keep proposing 7-10 MVP bets, the forcing question isn't biting. Consider tightening to a hard cap of 6 (warning today is soft).
- **Re-bootstrap requests** — users may want to re-run `/create-bet-portfolio` mid-project for a new strategic batch (post-PMF expansion, new vertical). The current refusal is intentional, but if it becomes a common pain, the answer is probably an OKR bet that decomposes via `/create-brief`, not a re-bootstrap. Watch for the request and resist building the wrong escape hatch.
- **Promotion order vs. dependency graph.** If users promote stubs out of dependency order (e.g., promote a dependent bet before its prerequisite), nothing in the workflow stops them — the dependency graph is informational. If misuse becomes common, add a refusal in `/create-brief` promote-mode that checks `depends_on` status.
- **Stub brief content drift before promotion.** If users hand-edit stub briefs between portfolio approval and `/create-brief` promotion, the promotion may overwrite their edits. Watch for this and consider an "extend rather than overwrite" mode if it bites.

---

### 2026-05-24 — DB was being picked without a data model

**Friction:** Review of the just-shipped 0.1.11 foundational-architecture work surfaced a gap: Phase A went from architecture research straight to the 13 stack choices, with no derivation of the data model the DB choice should depend on. Same decide-before-derive anti-pattern as fitness-functions-before-stack and HITL-before-scaffold, in microcosm. The DB row was effectively chosen by preference, then the data model would have been retrofitted by per-bet Architects — meaning every bet would have to live with a DB chosen before anyone knew the entity shape, tenancy, audit posture, or PII posture.

**Change:**
- New Phase A step (#7): **Derive foundational data model.** Covers core entities (each traced to a product bet line — no invented entities), identity strategy, tenancy, audit posture, delete posture, PII handling, timestamps, migration strategy, and a Mermaid `erDiagram` with cardinality.
- Step runs **before** stack choices. The Database row in the Stack table must cite the foundational data model — DB choice that ignores entity shape, tenancy, or audit fails verification.
- New "Deriving the foundational data model" subsection in the EA role explains how each decision is derived from product bet content (entities from nouns, tenancy from personas + moats, audit from compliance, PII from user segment, migration from Reliability + Ops fitness functions).
- Phase A Verification gate extended with data-model items. Phase B numbering bumped 12-15 → 13-16 to accommodate.
- Mermaid `erDiagram` adopted as the canonical ERD format — renders inline in GitHub + Confluence, plain text in source.

**Files touched:** `compass/workflows/setup-foundation-architecture.md`, `compass/templates/foundation-architecture.md`, `compass/roles/enterprise-architect.md`, `CHANGELOG.md` (0.1.12), `compass/workflows/improvements.md`.

**Watch for:**
- The trace-back-to-product-bet rule is the load-bearing enforcement here. If users hit a case where the product bet genuinely doesn't imply a needed entity (e.g., billing entities in a product bet that focuses on the user experience), they'll either invent the entity (bypassing the rule) or amend the product bet. Amending is correct; if invention becomes common, the rule needs softening with an explicit "system-required entity" carve-out.
- Mermaid ERD may grow stale faster than the rest of the doc — refreshing it should be a step in any `/setup-foundation-architecture` amend flow (creates v2).
- Per-bet `/create-bet-architecture` should be the next place to audit: does it inherit + extend the foundational data model cleanly, or does it duplicate decisions? Probably needs a "delta from foundation" enforcement.

---

### 2026-05-24 — Foundational architecture was "picked" not "derived"; scaffolded before HITL

**Friction:** Same anti-pattern as the Researcher fix, but in a new role. The `/setup-foundation-architecture` workflow jumped from "load product bet" straight to "ask 13 stack questions with smart defaults." Stack rows landed as personal preference; the Alternatives table got filled retroactively to justify the choice. No derivation evidence linked any stack row to the product bet's constraints. The Enterprise Architect had no analog to the Researcher's 6-category framework — "smart defaults" was hand-waving at research that should have been explicit. Compounding it: the HITL approval gate was the *final* step, after scaffolding had already written files to the repo. Architecture got approved *after* the repo was committed to it — backwards.

**Change:**
- Workflow split into two explicit phases separated by a hard HITL stop:
  - **Phase A — Decide & Document.** Derive fitness functions (≥1 per Well-Architected pillar, measurable in numbers), do research across the 6 architecture-research categories, score every stack choice on all 6 pillars with rationale + cited research. Draft the doc. No code written.
  - **HITL gate.** Hard stop. Human approves the architecture document.
  - **Phase B — Scaffold.** Only runs after approval. Lists files before writing, confirms with user, scaffolds.
- New 6-category architecture-research framework baked into the Enterprise/Solution Architect role: prior art, benchmarks, vendor health, failure modes, pillar fit, reversibility honesty.
- AWS Well-Architected pillars (6) adopted verbatim as the per-choice rubric. Canonical, externally validated, hard to fake.
- Fitness Functions section added to the template — falsifiable architectural targets that the stack must satisfy.
- Alternatives table rebuilt to evaluate against fitness functions, not generic pros/cons. Strawmen banned.
- New "When the product bet is vision-only on workloads" subsection in the EA role — workload-shape derivation is the architect's job.
- State-detection table at the workflow top routes between Phase A / refusal / Phase B based on artifact status.

**Files touched:** `compass/workflows/setup-foundation-architecture.md`, `compass/roles/enterprise-architect.md`, `compass/templates/foundation-architecture.md`, `CHANGELOG.md` (0.1.11), `compass/workflows/improvements.md`.

**Watch for:**
- The next instance of this anti-pattern is likely `/create-bet-architecture` — the per-bet Architect role has the same "make decisions" shape and currently no derivation framework. If/when it surfaces, mirror the Phase-A/Phase-B split with bet-scoped fitness functions instead of foundational ones.
- The pillar scoring may become rote check-the-box. If that happens, tighten on *evidence quality* (specific citations, primary sources, comparable workloads) rather than presence.
- The HITL split adds friction — measure whether users complete both phases or get stuck after Phase A. If stuck, the rejection rationale should be a real DRI Risk, not an abandoned workflow.

---

### 2026-05-24 — Architecture rename was half-applied; skill pointed at a missing file

**Friction:** The intended rename (`setup-architecture` → `setup-foundation-architecture`; `create-architecture` → `create-bet-architecture`) had been applied to *documentation* (AGENTS.md, SETUP.md, CLAUDE.md) and to the create-architecture file/skill — but the `setup-architecture` workflow file and skill directory still used the old name. The `.claude/skills/setup-architecture/SKILL.md` told the runtime to execute `compass/workflows/setup-foundation-architecture.md`, a file that did not exist on disk. The skill would have failed silently on first invocation. Stale `/setup architecture` (space-form) and `/create-architecture` command references were scattered across role docs, README, PROJECT.md, and docs/status.md. A duplicate `compass/improvements.md` had also been created next to the canonical `compass/workflows/improvements.md`.

**Change:**
- `git mv` for `compass/workflows/setup-architecture.md` → `setup-foundation-architecture.md` and the matching skill directory.
- Updated `name:` field in the renamed SKILL.md.
- Standardized all command references on hyphen-slug form (`/setup-product`, `/setup-foundation-architecture`, `/create-bet-architecture`) across README, AGENTS, CLAUDE, PROJECT, SETUP, docs/status, and all role + workflow files.
- Merged the duplicate improvements log into the canonical `compass/workflows/improvements.md`; deleted the duplicate at `compass/improvements.md`.

**Files touched:** `compass/workflows/setup-foundation-architecture.md` (renamed), `.claude/skills/setup-foundation-architecture/SKILL.md` (renamed dir + content), `compass/workflows/setup-product.md`, `compass/workflows/create-bet-architecture.md`, `compass/workflows/create-brief.md`, `compass/roles/architect.md`, `compass/roles/enterprise-architect.md`, `compass/roles/pm.md`, `AGENTS.md`, `CLAUDE.md`, `PROJECT.md`, `README.md`, `SETUP.md`, `docs/status.md`, `compass/workflows/improvements.md`, `CHANGELOG.md` (0.1.10).

**Watch for:**
- Future renames: do them with `git mv` + `grep -rn` sweep + skill `name:` field check, all in one PR. The half-applied state here was nearly invisible because docs and skill name diverged silently.
- The canonical improvements log lives at `compass/workflows/improvements.md`, not `compass/improvements.md` — easy mistake to repeat from a glance at the file tree.

---

### 2026-06-04 — Agents become self-sufficient surface-independent units; tool_assignments deprecated (v0.3.14)

**Friction:** User starting new project wanted cross-host role split (PM / Researcher / DM / UX on ChatGPT; Engineer + Architect on Claude Code; Reviewer + Security Reviewer on Codex). Natural first proposal was: update `compass/config.yaml` `tool_assignments:` to declare the routing. User pushed back: *"config yaml changes don't help right, they are not read anywhere."* Audit confirmed it — `tool_assignments:` is pure declaration; nothing programmatically reads it; 10 files independently hardcode the Claude+Codex split in prose. Foreshadowed in `[agent-agnostic-role-assignment]` v0.3.8 canon entry; the gap was named but not closed. Second proposal: ship `CHATGPT.md` file analogous to `CLAUDE.md`. Died on its own logic — Custom GPT Instructions aren't auto-loaded from a repo file (the load-bearing copy is what the user pastes into the Builder); `CHATGPT.md` would either duplicate Instructions content (drift surface) or be ignored. Same pattern would re-emerge for every new host (Codex.md, Gemini.md, ...). User reframed: *"each agent should run independently on any surface.. the agent should be self-sufficient"* and *"workflows should be defined in the agent right not the other way round — each task is for a role agent."* The architectural pivot: agents become the self-sufficient surface-independent unit; tasks live IN agents; workflows become thin dispatch graphs sequencing tasks across agents; hosts are LLM runtimes (not role authorities).

**Change:**
- **New `compass/agents/` directory** with 3 self-sufficient agent files: `pm.md`, `researcher.md`, `engineer.md`. Each structured per the surface-independent spec: YAML frontmatter (`name`, `preferred_hosts:`, `required_tools:`, `optional_tools:`, `participates_in_workflows:`, `version:`) → Identity → Core principles (INLINED — discipline cannot be a remote dependency) → Tasks owned (gate/work/postcondition per task; inputs/outputs/handoffs declared) → Refusal rules → Framework knowledge (REFERENCED with degraded-mode handling) → Output summary contract → Anti-patterns → Host capability degradation table.
- **`compass/workflows/setup-product.md` refactored** to thin dispatch graph. Step BODIES moved into `compass/agents/pm.md` and `compass/agents/researcher.md`. Workflow file declares (1) workflow-level preconditions, (2) dispatch graph (ordered `<agent>.<task>` invocations + HITL gates), (3) workflow-level verification (cross-agent invariants). No behavior change; every gate / refusal case / verification item preserved, now in agent task files.
- **`CLAUDE.md` slimmed** from role-authority document to host-runtime-notes only. Removed "you play every role except Reviewer/Security Reviewer" prose. Reading discipline now: "When invoked with a workflow command, read the workflow dispatch graph, then load the agent file for the current step from `compass/agents/<agent>.md`." Per-task refusal rules moved to agent files; only host-runtime-generic rules stay (don't amend, don't force-push, don't skip hooks, don't commit secrets).
- **`compass/framework/canon.md` gained `[agent-as-surface-independent-unit]` entry** as 12th Compass-original. Names `host-coupled-role-definition` anti-pattern. **First architecture-discipline class member — introduces 7th pattern shape.** 3 instances cited: config.yaml audit, CHATGPT.md proposal collapse, v0.4 orchestration vision.
- **`compass/config.yaml` `tool_assignments:` formally deprecated.** Block stays during v0.3.x grace period as legacy override mechanism; removed in v0.4. Replacement: per-agent `preferred_hosts:` in agent file YAML frontmatter.
- **Counter ticks to #31.** Next retro fires after #35 (Retro #007).

**Files touched:** new — `compass/agents/pm.md`, `compass/agents/researcher.md`, `compass/agents/engineer.md`. Edited — `compass/workflows/setup-product.md`, `CLAUDE.md`, `compass/framework/canon.md`, `README.md`, `AGENTS.md`, `compass/roles/pm.md` (banner), `compass/roles/researcher.md` (banner), `compass/roles/engineer.md` (banner), `CHANGELOG.md` (v0.3.14), `compass/workflows/improvements.md` (this entry).

**L2 dissolution decision (post-pivot review):** v0.3.13 CHANGELOG declared L2 (`compass://` protocol handler + Compass CLI for one-click workflow execution) as the v0.3.14 target. v0.3.14 shipped the architectural pivot instead. Post-pivot review surfaced that L2's dispatch contract was always going to be v0.4-shape — pre-pivot L2 was "CLI dispatches to a generic orchestration runtime"; post-pivot the contract is precise (walk dispatch graph → per step, look up agent's `preferred_hosts:` → call host's API). The L1.5 intermediate was cosmetic; v0.4 absorbs L2's content. **v0.3.15+ does incremental agent migrations**; v0.4 ships the orchestrator (LangGraph integration recipe per `[declare-not-implement]`) + protocol handler + dashboard URL launchers + per-host dispatch + Finance pillar. **Codification-candidate weakening:** `[L-layered-progressive-rollout]` (Retro #006 candidate, 2 instances) drops to 1 instance with the L2 dissolution. Re-examine when next 2-instance pattern surfaces. **1 commitment slip noted; not yet `[hard-line-declaration]` territory** (2-slip threshold).

**Propagation work bundled in v0.3.14 (after initial 8-file scope landed):** Updating downstream prose to derive from the new architecture rather than the deprecated `tool_assignments:` registry. (1) `README.md` — "What Compass is" + Core Ideas sections updated to agent-centric framing. (2) `AGENTS.md` — directory listing, "Host division of labor" section (renamed from "Tool division of labor"), 13-agents/roles table (with migration-status column), patterns section (new `[agent-as-surface-independent-unit]` description + 7 shapes / 12 patterns totals), "When you're unsure" reading discipline. (3) Three migrated role files (`compass/roles/{pm,researcher,engineer}.md`) gained "superseded" warning banners pointing at the agent file as source-of-truth — no content deleted; legacy bodies intact for the unmigrated workflows still loading them. **Closes the deferred prose-derivation gap that v0.3.8 `[agent-agnostic-role-assignment]` named explicitly** — that entry said "downstream prose still hardcodes the Claude+Codex split in ~10 files (this AGENTS.md section being the first to derive from config)." v0.3.14 makes the propagation real: AGENTS.md now derives from per-agent `preferred_hosts:`, not the deprecated `tool_assignments:`.

**Watch for:**
- **Custom GPT Instructions char limit.** OpenAI caps Custom GPT Instructions at ~8000 chars. The 3 agent files are sized to fit comfortably but `compass/agents/researcher.md` is the largest (~6500 chars). If the limit becomes binding, push more content into the REFERENCED category (canon.md fetch) and out of INLINED — hybrid trade-off recalibrates.
- **Cross-host handoff feel.** When PM (ChatGPT) hands off to Engineer (Claude Code) via the repo, does the discontinuity feel acute? — informs L2 protocol-handler priority for v0.3.15. The dispatch graph is the contract; the runtime mechanism (manual paste today vs orchestrator later) is what changes.
- **Whether agents on ChatGPT actually fetch canon.md** when GitHub connector / Knowledge upload available. The hybrid-B principle (inline critical, reference deep) only works if the reference actually loads. If retrieval fails frequently, push more inlining at the cost of file size.
- **Workflow file readability after slimming.** With step bodies moved out, can a reader trace `/setup-product` end-to-end without opening the agent task files? — informs whether workflow slimming went too far. The dispatch graph is meant to be the table-of-contents; agent files are the chapters.
- **Project Manager agent migration deferred to v0.3.15+.** `/setup-product` Step 4 still references `compass/roles/project-manager.md`. This works (dispatch graph is stable across migration) but surfaces a TODO. Migrate as new-project usage hits the status-update step.
- **`[task-ownership-locality]` and `[workflow-as-dispatch-graph]` forward-linked.** Both at 1 instance now (v0.3.14 itself). Codify after 2nd instance per Compass rule — likely when 2nd workflow refactor lands in v0.3.15+.
- **Other 10 agents + 13 workflows pending migration.** Migrate incrementally as new project surfaces need. Each migration is its own session; same shape (agent file → task definitions → workflow refactor to dispatch graph).
- **`tool_assignments:` deprecation removal in v0.4.** Don't remove during v0.3.x grace period — projects may have local overrides. Removal in v0.4 alongside `compass/roles/*` deletion once all agents migrated.

---

### 2026-06-05 — Project Manager → Delivery Manager agent migrated + renamed; `/setup-product` becomes first fully-migrated workflow; `[tool-wrappers-own-their-cadence]` surfaced as 1-instance candidate (v0.3.15)

**Friction:** Two distinct frictions surfaced in one session.

(1) **Migration #4 of 13 under the v0.3.14 spec.** Project Manager was the explicit next-up agent per the v0.3.14 entry's "Watch for" note ("Project Manager agent migration deferred to v0.3.15+"). New-project usage in this session reached the `/setup-product` Step 4 status-update step, surfacing the TODO concretely. Initial drafting kept the `project-manager` name with a "v0.4 rename heads-up" callout deferring the Delivery Manager rename to v0.4. User re-read the v0.3.14 CHANGELOG line "v0.3.15+ continues incremental agent migrations (project-manager / 'Delivery Manager' naming first per v0.4 spec target)" and pushed back: the rename was supposed to land at the migration, not be deferred. A double-rename (project-manager.md now, delivery-manager.md at v0.4) would have introduced churn and a v0.3.x naming-inconsistency window. Plan was re-scoped to bundle the rename.

(2) **Tool-wrapper boundary discovery.** The expanded plan included `.claude/skills/{status,plan,dashboard,retro}/SKILL.md` description-line updates in the rename surface. After 2 of the 4 skill files were already edited, user flagged the structural distinction: `.claude/` is a Claude Code-specific tool wrapper per SETUP.md ("Adding more AI tools later — Create the tool's expected config folder (`.cursor/rules/`, `.clinerules`, etc.); write thin wrappers that reference `compass/roles/<role>.md` and `compass/workflows/<workflow>.md`. `compass/` files don't change. Only the wrapper folder is added"). If framework renames have to chase every per-host wrapper (`.claude/`, `.codex/`, `.cursor/`, `.cline/`, …), v0.3.14's surface-independence promise breaks. **Surface-independence is bidirectional** — wrappers point at the framework; renames in the framework don't need to update every wrapper. Tool wrappers own their consistency cadence on their tool maintainer's schedule.

**Change:**

- **`compass/agents/delivery-manager.md` created** — self-sufficient agent file per the v0.3.14 surface-independent spec. Frontmatter: `name: delivery-manager`, `preferred_hosts: [claude, codex, gemini, chatgpt]`, `required_tools: [text_input, github_write_artifact]`, `optional_tools: [filesystem_read_recursive, shell_exec, mcp_github, mcp_jira, mcp_linear, mcp_slack]`, `participates_in_workflows: [setup-product, status, plan, dashboard]`, `version: 0.3.15`. Identity → 6 inlined core principles (`[no-padded-status]`, `[derive-from-state]`, `[living-not-snapshot]`, `[role-boundary]`, `[refuse-escalate]`, `[mechanical-output-verification]`) → 5 tasks with gate/work/postcondition each (`update-status`, `refresh-plan`, `regenerate-dashboard`, `compile-sprint-comms`, `rollup-token-usage`) → refusal rules → framework knowledge referenced → output summary contract → anti-patterns → host capability degradation table. **Naming note** preserves audit trail (pre-v0.3.15 = Project Manager; archived references preserved verbatim). **v0.4 capability-expansion heads-up** documents that Time / Quality / Finance pillars arrive at v0.4 cut — v0.3.15 ships rename + agent-shape migration only.
- **`compass/roles/project-manager.md` signposted as superseded + renamed.** v0.3.14-pattern banner: pointer to `compass/agents/delivery-manager.md`; names rename + migration together; "agent file wins on divergence"; "removed in v0.4" deadline (when Delivery Manager acquires Time/Quality/Finance pillar ownership). Legacy body intact during v0.3.x grace period.
- **`compass/workflows/setup-product.md` migration complete.** Roles-invoked list, Step 4 details (dispatch + task definition + migration-status note), verification checklist line, What-changed notes — all flipped to `delivery-manager.<task>` + `compass/agents/delivery-manager.md`. Dispatch graph reference moves (`project-manager.update-status` → `delivery-manager.update-status`) per rename; lookup target moves (`compass/roles/` → `compass/agents/`) per migration; workflow ↔ agent-task contract unchanged. **No behavior change** — same task ownership, same postconditions, same HITL gate.
- **`AGENTS.md` rows updated.** Row 76: "Project Manager (→ Delivery Manager v0.4)" / `compass/roles/project-manager.md` / `legacy` → "Delivery Manager (was Project Manager)" / `compass/agents/delivery-manager.md` / `✅ v0.3.15`. Row 48 host-group line: `project-manager` → `delivery-manager` in chatgpt/claude/codex/gemini bucket. Migration column now 4 ✅ (pm, researcher, engineer, delivery-manager) / 9 legacy.
- **`compass/agents/pm.md` handoff updated.** Line 87 `project-manager.update-status` → `delivery-manager.update-status`; "until project-manager agent migrates in v0.3.15+" caveat removed.
- **`compass/config.yaml.tool_assignments:` legacy key renamed.** `project_manager: claude` → `delivery_manager: claude` with grace-period comment (block deprecated for v0.4 removal anyway).
- **7 workflow files updated** (status, plan, dashboard, retro, advance, create-brief, create-story): role-load instructions + status-update prose flipped to Delivery Manager / `compass/agents/delivery-manager.md`. Methodology bodies stay in v0.3.0-alpha shape; refactor to dispatch-graph shape declared as next v0.3.15+ improvement (per `[declare-not-implement]`).
- **3 templates updated** (retro, plan, workflow-template): example author labels + DRI-log role names flipped to Delivery Manager / `delivery-manager`.
- **`compass/scripts/README.md` ownership updated.** "Project Manager role" → "Delivery Manager agent"; bottom pointer `compass/roles/project-manager.md` → `compass/agents/delivery-manager.md` (Task `rollup-token-usage`).
- **Top-level `README.md` skill-list pointer** flipped to "/status → Delivery Manager's rolling status".
- **`.claude/skills/{status,plan,dashboard,retro}/SKILL.md` NOT updated** — per the in-session `[tool-wrappers-own-their-cadence]` boundary discovery. Surface-independence is bidirectional: framework renames don't chase wrappers. The 2 skill files that had been edited mid-stream (`status`, `plan`) were reverted in-session before the rename closed.
- **Forward-link surfaced:** `[tool-wrappers-own-their-cadence]` as 1-instance codification candidate. **Promote to canon when:** (a) 2nd framework rename surfaces the same boundary, OR (b) a 3rd per-host wrapper is added (`.cursor/`, `.cline/`, …) and triggers the same scope question. Name alternative: `[surface-independence-is-bidirectional]` (more accurate description of the principle; "tool-wrappers-own-their-cadence" is the operational rule).

**Files touched (framework-canonical only, per the boundary discovery):** new — `compass/agents/delivery-manager.md`. Edited — `compass/roles/project-manager.md` (banner), `compass/workflows/setup-product.md`, `compass/workflows/status.md`, `compass/workflows/plan.md`, `compass/workflows/dashboard.md`, `compass/workflows/retro.md`, `compass/workflows/advance.md`, `compass/workflows/create-brief.md`, `compass/workflows/create-story.md`, `compass/agents/pm.md`, `compass/config.yaml`, `compass/scripts/README.md`, `compass/templates/retro.md`, `compass/templates/plan.md`, `compass/templates/workflow-template.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md` (v0.3.15), `compass/workflows/improvements.md` (this entry). Deleted — `compass/agents/project-manager.md` (mid-session draft; never on a commit).

**Watch for:**

- **Workflows still on legacy step-body shape** (`/status`, `/plan`, `/dashboard`, `/retro`) — their LOAD instruction points at the new agent file, but methodology bodies stay embedded. Refactoring to dispatch-graph shape (per the v0.3.14 pattern) is the natural next v0.3.15+ improvement. Each refactor is its own session.
- **Other 9 agents pending migration** (support, designer, ux-writer, architect, enterprise-architect, reviewer, security-reviewer, tech-writer, scanner). Each migration is mechanical now; the v0.3.14 + v0.3.15 pattern is well-validated.
- **`[user-as-load-bearing-oversight]` instance count.** Pre-session: 3+ instances (per Retro #006). This session: 2 explicit course-corrects (rename-direction; tool-wrapper boundary). Each is a fresh instance — the pattern is at 5+ instances now and the canon-promotion case is overwhelming. Promote at Retro #007.
- **`[tool-wrappers-own-their-cadence]` 2nd instance.** Likely when (a) Reviewer migrates and someone tries to update `.codex/prompts/reviewer.md` as part of the rename, OR (b) Architect / Designer migrate and the question recurs. Codify on 2nd instance.
- **Custom GPT char limit for delivery-manager.md.** New agent file is ~11KB (longer than `pm.md` at ~7KB; closer to `researcher.md` at ~6.5KB). OpenAI Custom GPT Instructions cap is ~8000 chars. **delivery-manager.md exceeds the cap.** If the agent is going to ChatGPT, the file needs trimming — push host-capability table + extended task definitions to REFERENCED, keep Identity + Core principles + Refusal rules INLINED. Counter-instance to v0.3.14's "sized to fit comfortably" claim. Worth its own improvement entry when ChatGPT-host usage surfaces.
- **Counter at #32. Hard line still in effect from Retro #006** — if Retro #007 slips, treat as 2nd retro-cadence regression and deepen `[hard-line-declaration]` mechanism. 3 more improvements to fire Retro #007.


### 2026-06-06 — Reviewer agent migrated; cross-host integrity enforced at agent-frontmatter level; `[freshness-markers-follow-source-of-truth]` surfaced; `[tool-wrappers-own-their-cadence]` boundary REFINED (v0.3.16)

**Friction:** Reviewer was the next-up agent migration after delivery-manager (v0.3.15). Three intertwined frictions surfaced.

(1) **Cross-host integrity needed enforcement at the agent-frontmatter level, not prose.** Pre-v0.3.16, the "reviewer must use a different model than implementer" rule was enforced via prose across 10+ files (AGENTS.md "Host division of labor", CLAUDE.md, README.md, SETUP.md, canon.md v0.3.5/v0.3.8 descriptions, `compass/roles/reviewer.md` header, `compass/config.yaml` `tool_assignments:` comments, `.codex/prompts/reviewer.md`, `compass/scripts/agent-handoff.yml`). The v0.3.14 spec target named the fix explicitly (CLAUDE.md: "The Reviewer agent (when migrated in v0.3.15+) will declare `preferred_hosts: [codex, gemini]` (NOT claude)"). v0.3.16 lands that fix.

(2) **Freshness frontmatter had to MOVE WITH the source-of-truth.** `compass/roles/reviewer.md` was the only legacy role file carrying `[freshness-check]` markers (`last_verified: 2026-06-01`, `freshness_window_days: 30`, `external_source: https://github.com/openai/codex`). `/build` Phase 5 Step 12a reads those markers as a load-bearing gate. Three options surfaced: keep markers on legacy file (drift risk — legacy file is now banner-only); duplicate to both (drift risk by design); move to agent file (single source of truth). **Picked option 3** — workflow Step 12a updated to read the agent file's frontmatter.

(3) **`.codex/prompts/reviewer.md` in-scope decision tested the v0.3.15 boundary.** v0.3.15 had codified `[tool-wrappers-own-their-cadence]` (framework renames don't chase per-host wrappers) and explicitly predicted the next test: "Likely when (a) Reviewer migrates and someone tries to update `.codex/prompts/reviewer.md` as part of the rename". v0.3.16 hit that test. Two readings: (a) skip the update per the boundary — wrapper is out of scope; OR (b) update it because Reviewer is **Codex-assigned by design** — the Codex prompt is *this* agent's natural dispatch surface, so the update is in-cadence, not "chasing wrappers." Flagged the decision at plan time; user approved (b). **The boundary didn't trigger a 2nd instance — it got REFINED:** "framework rename doesn't chase ORTHOGONAL wrappers; agent migration DOES touch the wrapper for THAT agent's assigned host."

**Change:**

- **`compass/agents/reviewer.md` created** (~10KB) — self-sufficient agent file. Frontmatter: `name: reviewer`, **`preferred_hosts: [codex, gemini]` (EXCLUDES claude — load-bearing cross-host integrity)**, `required_tools: [filesystem_read, shell_exec, github_write_artifact, mcp_github]`, `optional_tools: [web_search, mcp_sentry]`, `participates_in_workflows: [build, ops]`, `version: 0.3.16`. **Freshness markers relocated** from legacy role file. 5 core principles INLINED (`[mechanical-output-verification]`, `[freshness-check]`, `[role-boundary]`, `[refuse-escalate]`, `[hold-positions-in-disputes]`). 2 tasks: `review-pr` (full 7-step process incl. Step 0 framework-registration check + Step 4 review-time freshness on NEW load-bearing claims) + `write-e2e-tests`. Output summary contract is the freshness target (Codex review comment format). Host-capability degradation table covers codex / gemini / pure-chat. **Host preference note** opens with cross-host-integrity-not-convenience framing — `preferred_hosts: [codex, gemini]` excludes claude on purpose, not as a host-preference convenience.
- **`compass/roles/reviewer.md` signposted as superseded.** v0.3.14-pattern banner; explicitly states the freshness frontmatter was relocated (so the legacy file no longer carries the load-bearing markers); names the `/build` Phase 5 Step 12a path update; "agent file wins on divergence"; "removed in v0.4" deadline. Legacy body intact.
- **`.codex/prompts/reviewer.md` updated to dispatch at the new agent file** — both the "Read these in order" list and the "Follow ... exactly" execute instruction flipped from `compass/roles/reviewer.md` → `compass/agents/reviewer.md`. Inline audit-trail note explains the migration. **Per the refined `[tool-wrappers-own-their-cadence]` principle:** Reviewer is Codex-assigned-by-design, so the Codex prompt is *this* agent's natural dispatch surface and the update is in-cadence.
- **`compass/workflows/build.md` Phase 5 updated.** Step 8 load instruction → `compass/agents/reviewer.md`. Step 12a freshness-check precondition reads frontmatter from the new path; refusal messages updated; section name reference updated ("Expected Codex output shape" → "Output summary contract"). Step 13 manual-invocation pointer updated. ROLE_BOUNDARY markers unchanged (`role=reviewer` matches the agent name). Workflow stays in v0.3.0-alpha step-body shape; refactor declared as next v0.3.16+ improvement per `[declare-not-implement]`.
- **`AGENTS.md` row 73** flipped: `compass/roles/reviewer.md (+ .codex/prompts/reviewer.md)` / `legacy` → `compass/agents/reviewer.md (+ .codex/prompts/reviewer.md)` / `✅ v0.3.16`. Migration column: 5 ✅ / 8 legacy.
- **`CLAUDE.md` cross-host-independence paragraph** updated from prediction ("when migrated in v0.3.15+ will declare ...") → past-tense ("migrated v0.3.16; declares `preferred_hosts: [codex, gemini]` ..."). Security Reviewer's pending-migration note retained.
- **PR templates** (`compass/templates/pr-template.md` + `.github/PULL_REQUEST_TEMPLATE.md`): 2 file-path references each flipped to `compass/agents/reviewer.md`. Security Reviewer references stay at `compass/roles/security-reviewer.md`.
- **`compass/scripts/README.md`** "Manual fallback" pointer flipped to `compass/agents/reviewer.md` task `review-pr`.
- **`SETUP.md` "CLI-based agents" guidance** updated to note migrated-vs-legacy path distinction during v0.3.x grace period.

**Forward-link surfaced:** **`[freshness-markers-follow-source-of-truth]`** as a 1-instance codification candidate. When an agent migrates and the source-of-truth moves, freshness frontmatter MOVES WITH IT — workflows that read the markers update the path. Promote on 2nd instance (likely when another freshness-marker-carrying file migrates, or when a per-bet artifact gains freshness markers).

**Boundary refinement on `[tool-wrappers-own-their-cadence]`:** v0.3.15 named the pattern with the example "framework renames don't chase per-host wrappers." v0.3.16 distinguishes: **the principle applies to ORTHOGONAL wrappers** (Delivery Manager rename → don't touch `.claude/skills/dashboard/SKILL.md`); **NOT to the host wrapper for the agent being migrated** (Reviewer migration → DO touch `.codex/prompts/reviewer.md` because Reviewer is Codex-assigned-by-design). The boundary test: is this wrapper the dispatch surface for THIS specific agent on ITS assigned host? If yes, in scope. If no, out of scope. Pattern stays at 1 instance (v0.3.15 codification + v0.3.16 refinement, not a 2nd independent instance); promote on 2nd FRAMEWORK rename or agent migration that exercises the same boundary distinction.

**Files touched (framework-canonical only):** new — `compass/agents/reviewer.md`. Edited — `compass/roles/reviewer.md` (banner + frontmatter removed), `.codex/prompts/reviewer.md` (dispatch updated), `compass/workflows/build.md` (Phase 5 Steps 8/12a/13), `AGENTS.md` (row 73), `CLAUDE.md` (cross-host paragraph), `compass/templates/pr-template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `compass/scripts/README.md`, `SETUP.md`, `CHANGELOG.md` (v0.3.16), `compass/workflows/improvements.md` (this entry).

**Watch for:**

- **Security Reviewer migration is the obvious next agent.** Same `[different-model-reviewer]` rationale applies; `.codex/prompts/security-reviewer.md` follows the same in-cadence-update logic as Reviewer's. Should be smaller scope (fewer cross-references; Security Reviewer is more narrowly scoped to auth/PII/secrets paths).
- **`/build` workflow refactor to dispatch-graph shape** is now well-overdue. v0.3.14 migrated Engineer; v0.3.16 migrated Reviewer; both `/build`'s primary agents are now migrated, but `/build` itself still embeds step bodies. Refactoring `/build` to dispatch-graph shape (per the v0.3.14 `/setup-product` precedent) would be a substantial release on its own — and would surface `[workflow-as-dispatch-graph]` 2nd instance (currently at 1 from v0.3.14).
- **Codex freshness window expires 2026-07-01** (last_verified: 2026-06-01 + 30 days). Codex CLI v1.x continues to evolve; recheck the Output summary contract section against [github.com/openai/codex](https://github.com/openai/codex) at that point, update both the section AND `last_verified` if the format is still current. If Codex's output drifts, `/build` Phase 5 will catch the mismatch on a real review failure — but the structural defense is this date check.
- **`[freshness-markers-follow-source-of-truth]` 2nd instance**: likely when next freshness-marker-carrying file migrates, OR if a per-bet artifact (like a feature brief that depends on a third-party API contract) gains freshness markers.
- **Cross-host integrity now agent-frontmatter-enforced, but `tool_assignments:` block still exists** in `compass/config.yaml`. Block is deprecated for v0.4 removal — keep it during grace period for projects with local overrides. Removal happens alongside `compass/roles/*` deletion in v0.4.
- **Custom GPT char limit irrelevant for Reviewer.** Unlike delivery-manager (v0.3.15 cap-violation flag), Reviewer's preferred_hosts excludes ChatGPT, so the 8000-char Custom GPT cap doesn't apply. ~10KB file size is fine.
- **Counter at #33. Hard line still in effect from Retro #006** — Retro #007 fires after #35. 2 more improvements needed.

---

### 2026-06-07 — `[fractal-retro]` codified (1st recursive workflow in Compass); multi-altitude retros shipped — schema + project altitude + per-role/per-workflow log schemas (v0.3.17)

> **STATUS: shipped.** This entry was QUEUED in the v0.3.16 tail; trigger #2 fired within minutes ("Claude had to redo PRs average of 5 times.. in atleast 4 times"); pulled the build forward. Counter ticks #33 → #34 (1 of 5 needed before Retro #007). Original QUEUED design unchanged from what shipped; this entry captures the trigger-fired audit trail + files actually touched.

**Friction (trigger fired):** Retros pre-v0.3.17 were **single-altitude** — only `compass/workflows/improvements.md` (framework altitude) had retros wired. `compass/workflows/retro.md` line 65 declared a project-altitude variant but never built it. The deeper architectural gap surfaced in the v0.3.16 session via the user's framing: *"Retros like the plan are at every role or workflow based. Should we keep retros at roles/workflows and then consolidate to project and org, follow the same workflow?"* — the cleanest unification: retros should be **fractal**, same workflow shape applied at every altitude with bottom-up consolidation. We QUEUED the design with 4 explicit build triggers. **Trigger #2 fired within minutes of the commit**: user reported *"They [improvements] surfaced as I work. Claude had to redo PRs average of 5 times.. in atleast 4 times."* That's 10+ improvements surfacing as work happens + PR-redo loop at 5x in ≥4 instances — exactly the patterns role-altitude (Engineer + Reviewer) and workflow-altitude (`/build`) retros catch before manual flagging. The framework retro every-5 cadence averages across cycles too coarse to filter that signal. Pulled the build forward.

**Design (locked):**

The 6-altitude fractal model:

```
Altitude        | What it retros on                              | Source log (data)                              | Cadence trigger
----------------|------------------------------------------------|------------------------------------------------|--------------------
Role            | Per-role / per-agent activity                  | Per-role activity log (NEW)                    | Every N task invocations
Workflow        | Per-workflow execution patterns                | Per-workflow run log (NEW)                     | Every N runs
Bet             | Bet outcome + DRI log + scope drift            | Bet's DRI log + outcome (existing)             | At bet outcome transition (won/learning/inconclusive)
Project         | Cross-bet patterns within a project            | All bet retros + role/workflow retros in proj  | Manual or cron (monthly)
Org / Cross-program | Patterns across multiple projects          | All project retros across configured paths     | Quarterly cron or manual
Framework       | Compass framework evolution                    | compass/workflows/improvements.md (existing)   | Every 5 improvements (existing — UNCHANGED)
```

**Same workflow file (`/retro`) at every altitude.** Same template (`compass/templates/retro.md` — already shaped right). Each retro file gains 2 new frontmatter fields:
- `altitude: role | workflow | bet | project | org | framework`
- `consolidates_from: [<paths>]` — for higher altitudes that aggregate child retros

Existing `parent_log:` field stays; its semantic generalizes from a 2-value enum (framework vs project) to N-altitude. **Existing framework retro mechanism unchanged** — gets reframed as "the framework's altitude=framework retro" under the recursive model.

**Source-log shape for role + workflow altitudes (locked Q1):** **new per-altitude log files** — `docs/role-activity/<role>.md` and `docs/workflow-runs/<workflow>.md`. Agents (PM, Delivery Manager, Reviewer, Engineer) append structured entries (timestamp · pattern · evidence · instance count) as they surface patterns mid-task. **This is the load-bearing new capability** — without agent-side logging, role/workflow retros have no source data. (Alternative considered + rejected: derive from existing DRI logs. Reason for rejection: DRI is per-bet, not per-role; role retros would depend on bets existing first; harder synthesis.)

**Dispatch:** `/retro` defaults to the altitude implied by invocation context (inside framework repo → framework altitude — existing behavior; inside a project → project altitude); explicit override via `--altitude=<x>` arg (e.g., `/retro --altitude=bet PROJ-42`, `/retro --altitude=org`).

**Aggregation discipline.** A higher-altitude retro reads all child retros + child raw entries within the named scope, synthesizes the pattern catalog at THAT altitude, archives. Each retro is immutable (`status: archive`); patterns that recur across altitudes get promoted UP at the next-altitude retro, not by re-editing.

**Files touched (14 framework-canonical):**

New (5):
- `compass/templates/role-activity-log.md` — per-role activity log schema
- `compass/templates/workflow-run-log.md` — per-workflow run log schema
- `compass/templates/retro-project.md` — concrete project-altitude retro template
- `compass/templates/project-improvements.md` — project shipped-improvements log template
- (`compass/scripts/aggregate-retros.py` — org-altitude aggregator — NOT shipped per `[declare-not-implement]`; declared for when 2nd project starts)

Edited (9):
- `compass/templates/retro.md` — added `altitude:` + `consolidates_from:` frontmatter; clarified `parent_log:` semantics for N-altitude
- `compass/workflows/retro.md` — generalized from 2 altitudes to 6; documented dispatch (default by context; `--altitude=<x>` arg) + aggregation contract + per-altitude refusal cases
- `compass/framework/canon.md` — registered `[fractal-retro]` as 2nd architecture-discipline class member (2 instances: existing framework retros reframed + project altitude end-to-end shipped this release); named anti-pattern `single-altitude-retro-loses-bottom-up-signal`
- `compass/agents/engineer.md` + `compass/agents/reviewer.md` — added "Logging patterns mid-task" sections (priority — closest to PR-redo loop trigger)
- `compass/agents/pm.md` + `compass/agents/researcher.md` + `compass/agents/delivery-manager.md` — same section pattern, role-specific examples
- `AGENTS.md` — Patterns section gained `[fractal-retro]` entry; catalog totals updated (7 shapes / 13 patterns); "When you're unsure" line added on where to log mid-task patterns
- `CHANGELOG.md` v0.3.17 entry
- `compass/workflows/improvements.md` (this entry — MOVED from QUEUED to shipped) + header counter v0.3.16=#33 → v0.3.17=#34

**Trigger fired (audit trail):**

QUEUED entry's "Trigger to actually build this" listed 4 conditions. **Trigger #2 fired**: *"An agent surfaces a pattern mid-task that doesn't have a natural log to land in — proves the role/workflow log gap is acute."* Evidence cited in user's message: 10+ improvements surfacing as work happens + PR-redo loop at 5x in ≥4 instances. The PR-redo data is concrete — role-altitude Engineer + Reviewer retros + workflow-altitude `/build` retro would have caught this pattern at instance 2 or 3, not let it accumulate to 5+. **The trigger firing in-session validates `[declare-not-implement]` 4th time**: declare with explicit triggers; build when fired; don't pre-build speculatively.

**What this validated structurally:**

- **First recursive workflow in Compass shipped.** Bets are fractal (foundation → OKR → feature → story); metrics are fractal top-down; plans are single-altitude rollup. **Retros are now the first WORKFLOW that's fractal** — `compass/workflows/retro.md` is altitude-agnostic, with the altitude becoming a frontmatter property of each retro instance rather than a separate workflow.
- **`parent_log:` field generalized without rename** — existing framework retros #001–#006 stay valid; their frontmatter may not have explicit `altitude: framework` (they predate v0.3.17, immutable per archive-immutability discipline).
- **Architecture-discipline class structurally validated** — v0.3.14 introduced with `[agent-as-surface-independent-unit]`; v0.3.17 grows to 2 members with `[fractal-retro]`. No longer a one-off shape. Catalog: 7 shapes / 13 patterns; architecture-discipline = 2 members (matches scope-discipline's count).
- **`[declare-not-implement]` 4th instance.** Pattern empirically validated 4× across releases (v0.3.5 agent-handoff template reviewer-blocks; v0.3.8 same-day adapter-layer correction; v0.3.16 multi-altitude QUEUED state; v0.3.17 role/workflow/bet aggregation logic + org-altitude aggregator both DECLARED, not built). The v0.3.16→v0.3.17 QUEUED→SHIPPED transition is the cleanest possible cycle for the pattern — declare with explicit triggers; build when a trigger fires; cite the trigger in the shipped entry.
- **`[user-as-load-bearing-oversight]` accrued ≥4 fresh instances in this session.** (a) Original retro architecture observation. (b) Pull-forward decision when trigger fired. (c) PR-redo loop data citation. (d) Course-correct on `.codex/prompts/reviewer.md` boundary in v0.3.16. Canon promotion case for Retro #007 is overwhelming.

**Watch for:**

- **Role/workflow log accumulation.** v0.3.17 ships the schemas + agent-side logging discipline. Watch whether agents actually start appending to `docs/role-activity/<role>.md` and `docs/workflow-runs/<workflow>.md` as they encounter patterns. If logs stay empty, the discipline isn't sticking — surface as next improvement (likely a workflow-side prompt or a HITL gate that asks "should this be logged?").
- **Whether role/workflow retro aggregation gets built or skipped.** v0.3.17 declares the aggregation logic; ships only the schemas. If ≥5 entries accumulate in a role log and nobody runs `/retro --altitude=role --role=engineer` to synthesize, that's evidence the aggregation needs more nudging — possibly a cron, or possibly the retro workflow auto-detecting threshold and proposing.
- **Org-altitude aggregator trigger.** Original ask. Fires when a 2nd project starts using Compass. Build `compass/scripts/aggregate-retros.py` then.
- **`[fractal-retro]` 3rd instance candidate.** Currently 2 instances (existing framework retros reframed + project altitude shipped end-to-end). 3rd instance = whichever leaf-altitude retro (role / workflow / bet) actually fires first with real data and produces a useful archived retro. Watch for that.
- **Custom GPT char limit on PM/Researcher/Delivery-Manager.** All three got new "Logging patterns mid-task" sections (~30 lines each). delivery-manager.md was already ~11KB pre-v0.3.17 (per v0.3.15 watch-for, exceeds ~8000-char Custom GPT cap); v0.3.17 makes that worse. When ChatGPT-host usage of those agents surfaces, the cap-violation needs addressing — likely move host-capability table + extended task definitions to REFERENCED.
- **Counter at #34. Hard line still in effect** — Retro #007 fires after #35. 1 more improvement needed. Likely candidates: trim delivery-manager.md to fit Custom GPT cap (v0.3.15 watch-for, now compounded by v0.3.17); refactor /status or /build to dispatch-graph shape; next agent migration (Architect or Security Reviewer).

---

### 2026-06-07 — `compass/agents/delivery-manager.md` trimmed to fit OpenAI Custom GPT Instructions ~8000-char cap (v0.3.18) — artifact-pruning release; counter ticks #35 → Retro #007 NOW DUE

**Friction (closed acute):** `compass/agents/delivery-manager.md` was 21,714 chars (2.7× the OpenAI Custom GPT Instructions ~8000-char cap). Flagged in v0.3.15 watch-for ("Custom GPT char limit for delivery-manager.md — exceeds the cap"); compounded by v0.3.17 ("All three got new Logging patterns mid-task sections; delivery-manager.md was already ~11KB pre-v0.3.17, v0.3.17 makes that worse"). When ChatGPT-host usage of Delivery Manager surfaces (per `preferred_hosts: [claude, codex, gemini, chatgpt]`), the cap-violation breaks the Custom GPT Instructions paste. v0.3.18 closes the friction.

**Change:** trimmed `compass/agents/delivery-manager.md` from 21,714 → 7,960 chars (63% reduction). All load-bearing content preserved per `[agent-as-surface-independent-unit]` (canon v0.3.14) hybrid-inlining principle. Strategy:

- **Opening notes consolidated.** Pre-v0.3.15 Project Manager naming note + Host fidelity note + v0.4 capability-expansion heads-up combined into one compressed "Notes" paragraph (~600 chars → ~200).
- **Identity tightened** (~520 → ~280 chars; same content, less prose).
- **Core principles kept INLINED but each compressed to one line** (~720 → ~620). Discipline principles must hold without external file load — preserved verbatim in shape, terse in prose.
- **Tasks I own (the biggest cut)** restructured: `Gate` (preconditions, load-bearing) + `Work` (compressed step sequence) + `Postcondition` (load-bearing) per task. Dropped verbose "Inputs" enumerations (implicit from Work steps) and "Handoffs" (implicit from workflow dispatch). Dropped trailing "Triggered by" lines (info lives in workflow files). 5 tasks: ~10,000 chars → ~3,200.
- **Refusal rules kept INLINED** (~700 chars → ~550, same shape).
- **Output summary contract kept INLINED** (~700 → ~470, same content).
- **Logging patterns mid-task compressed to a single paragraph** (~1,800 → ~600 chars) — points at `compass/templates/role-activity-log.md` for the entry shape; lists the role-specific log-when triggers in one compressed list.
- **Framework knowledge section folded into Host capability degradation tail** (one line listing referenced patterns; ~1,200 → 0 standalone, ~150 in the tail).
- **Anti-patterns compressed** from bullet list to one inline-separated line (~700 → ~350).
- **Host capability degradation compressed** from 3-column markdown table to bullet list (~750 → ~600).
- Frontmatter `version:` bumped 0.3.15 → 0.3.18 stamping the trim.

**No behavior change.** Same agent identity, same 5 tasks, same gates + postconditions, same refusal rules, same anti-patterns. Same `preferred_hosts:`, same tools. Pasted as Custom GPT Instructions: now works (fits the cap with 40 chars of headroom).

**Files touched:** `compass/agents/delivery-manager.md` (trim — 21,714 → 7,960 chars); `CHANGELOG.md` v0.3.18 entry; `compass/workflows/improvements.md` (this entry + header counter v0.3.17=#34 → v0.3.18=#35 + retro-due flag).

**Watch for:**

- **Retro #007 NOW DUE — auto-fires on next framework session.** Hard line from Retro #006 held; **third consecutive on-time retro** validates `[hard-line-declaration]` past the codification threshold with high signal-to-noise. Retro #007 covers improvements #31–#35 (v0.3.14 → v0.3.18). Expected codification candidates Retro #007 will surface: `[user-as-load-bearing-oversight]` (5+ instances pre-Retro promotion case overwhelming); `[tool-wrappers-own-their-cadence]` (1 instance + v0.3.16 refinement); `[no-padded-status]` (1 instance, surfaced v0.3.15); `[freshness-markers-follow-source-of-truth]` (1 instance, surfaced v0.3.16); `[different-model-reviewer-as-agent-frontmatter]` (1 instance, likely subsumed by `[agent-as-surface-independent-unit]`); `[task-ownership-locality]` + `[workflow-as-dispatch-graph]` (1 instance each from v0.3.14, awaiting 2nd).
- **`pm.md` and `researcher.md` cap status unknown.** v0.3.17 added ~30-line "Logging patterns mid-task" sections to both. Pre-v0.3.17 sizes weren't measured; v0.3.18 only addressed delivery-manager. If ChatGPT-host usage of PM or Researcher surfaces and either exceeds the cap, apply the same trim pattern. Measure both before next Custom GPT-host bet.
- **The slim version stays the source-of-truth.** `compass/agents/delivery-manager.md` IS the file (slim). No "extended" version exists in the repo. If a host can fetch `compass/framework/canon.md`, the referenced pattern descriptions there fill in deep context — the framework knowledge section deliberately points at canon, not at a separate extended-agent file. This keeps single-source-of-truth discipline and avoids the dual-file drift surface a `delivery-manager-extended.md` would create.
- **Compression pattern as candidate.** v0.3.18 is the **first agent-file compression release**. If reviewer.md / engineer.md / pm.md / researcher.md need similar treatment, this v0.3.18 trim becomes a reference example. Worth tracking as a candidate `[agent-file-compression]` or similar pattern — but only codify if 2nd instance accrues (i.e., another agent needs trimming and the same strategy applies).
- **Counter at #35. Retro #007 NOW DUE.** Hard line: if Retro #007 doesn't fire on next framework session, that's a 2nd retro-cadence regression — deepen `[hard-line-declaration]` mechanism (e.g., make counter + retro-due flag visible in dashboard Actions tab).

---

### 2026-06-07 — `[user-as-load-bearing-oversight]` codified as 14th Compass-original; 2nd observability-class member; observability shape structurally validated (v0.3.19)

**Friction (closed-by-codification):** `[user-as-load-bearing-oversight]` had been an unnamed-but-omnipresent pattern in framework history. Retro #006 surfaced it as "3+ instances" codification-ready candidate; Retro #007 (which fired ON TIME at #35 same-day per `[hard-line-declaration]` + `[fractal-retro]`) accrued 6+ in-cycle instances (v0.3.14 → v0.3.18) bringing the total to 11+ and made it the single PROMOTE recommendation. v0.3.19 executes that recommendation in the **immediate next improvement** — first time the framework follows through on a retro PROMOTE in the very next entry, closing the retro-output discipline loop cleanly.

**Change:**

- **`compass/framework/canon.md` gains `### user-as-load-bearing-oversight` entry** as 14th Compass-original. Anti-pattern named: **`framework-discipline-mistaken-for-self-sufficiency`** (when agents treat user corrections as friction to engineer away rather than first-class signal). 11+ instances cited at codification:
  - **Pre-cycle (5+ from Retro #006 era):** retro #006 covered v0.3.9 → v0.3.13 cycle and accumulated these instances implicitly.
  - **In-cycle (6+ from Retro #007 cycle v0.3.14 → v0.3.18):** framework pivot origin (user observation about agent-host coupling + CHATGPT.md proposal collapse) · v0.3.15 rename direction (user re-read v0.3.14 spec when initial draft kept project-manager name) · v0.3.15 tool-wrapper boundary (user pushed back on `.claude/skills/` edits; surfaced `[tool-wrappers-own-their-cadence]`) · v0.3.16 codex-prompt boundary refinement (user approval sharpened the v0.3.15 principle) · v0.3.17 multi-altitude retro architecture origin (user's "Retros like the plan are at every role or workflow based" observation) · v0.3.17 PR-redo loop trigger (user-cited evidence pulling QUEUED → SHIPPED).
  - **Representative example pulled out for vividness:** freedom-bootstrap-in-framework mistake (user invoked `/setup-product` in framework's own repo; agent ran the workflow mechanically — drafted product.md for fictional "freedom" Indian-equities project, scaffolded apps/api/, committed; user caught it: *"why woudl create brief in compass, this is the framework .."*; reset HEAD~1, cleaned up). Framework's mechanical checks didn't catch bootstrapping a fake project inside its own framework repo violated the SETUP.md "copy INTO target repo" boundary; user did.
- **5 discipline implications spelled out in canon entry:** (1) every QUEUED entry declares explicit triggers — user fires triggers via observation; (2) every CHANGELOG entry cites user observations as origin when applicable; (3) course-corrects from user are first-class signal, not friction; (4) when user-caught pattern recurs ≥3 times of the SAME correction, framework hardens mechanically (user is structural for the residual, NOT for repeated identical catches); (5) retro convention candidates ranked by user-correction frequency.
- **Naming consideration documented:** alternative `[human-in-the-discipline-loop]` was considered (more accurate framing — emphasizes human as structural part of loop). Kept `[user-as-load-bearing-oversight]` for continuity with 11+ prior references; "oversight" framing honest (it IS oversight, just structurally load-bearing); "user" is the canonical Compass term. Rename reversible if 2nd-instance evidence ever warrants.
- **Forward-link candidates surfaced:** `[framework-repo-guard]` (mechanical refusal candidate from freedom-bootstrap mistake — 1 instance, awaiting 2nd before codification); `[bottom-up-signal-carriage]` (already declared in `[fractal-retro]` canon entry; user-as-signal-carriage may persist where leaf-altitude logging discipline doesn't stick).
- **`AGENTS.md` Patterns section gains the entry** with compressed body + the 5 discipline implications + distinction from Principle #16 refuse-escalate (refuse-escalate = agent's own discipline; this = structural complement that catches what slips through refuse-escalate; together they form the discipline loop). Catalog totals updated: 7 shapes / 13 patterns → **7 shapes / 14 patterns**. Observability class: 1 → 2 members; **observability shape structurally validated** — joins enforcement (4), handoff (2), scope-discipline (2), architecture-discipline (2) as 2+-member classes. **5 of 7 pattern shapes now structurally validated.** Awaiting 2nd-instance: interaction (`[elicitation-with-options]`), freshness (`[freshness-check]`).
- **`AGENTS.md` "When you're unsure" section gains a new line** on user-correction interpretation: "The user just corrected me; should I argue, defer, or accept? → Accept it as first-class signal per `[user-as-load-bearing-oversight]` (canon v0.3.19). The user has context (their actual project, their priorities, their semantic memory) that you don't. Course-correct cleanly; surface the framework-discipline implications if any. Never engineer user corrections away as friction."

**Files (4):** `compass/framework/canon.md` (new entry — 14th Compass-original); `AGENTS.md` (Patterns section + catalog totals + When-you're-unsure line); `CHANGELOG.md` (v0.3.19 entry); `compass/workflows/improvements.md` (this entry + header counter v0.3.18=#35 → v0.3.19=#36).

**Watch for:**

- **`[framework-repo-guard]` 2nd instance.** Surfaced at codification as 1 instance (freedom-bootstrap mistake). If user has to flag framework-vs-project boundary again, mechanical refusal becomes warranted — promote to its own canon entry. Currently dormant; agent could pre-emptively build it as a next-improvement candidate.
- **`[bottom-up-signal-carriage]` activation.** Declared in `[fractal-retro]` canon entry (1 instance pre-fractal-retro — user as signal carrier when multi-altitude retros didn't exist). v0.3.17 provides structural alternative (per-role + per-workflow logs); v0.3.19 codifies user-as-oversight as first-class. If leaf-altitude logging discipline DOESN'T stick (v0.3.17 watch-for #1), user-as-signal-carriage will resurface as a 2nd instance of this distinct sub-pattern — promote then.
- **Discipline-implication adherence in next 5 improvements.** v0.3.19's codification names 5 standard practices. Watch whether they actually land: do future QUEUED entries declare explicit triggers? Do future CHANGELOG entries cite user observations as origin? Does the agent's reflex to "minimize user corrections" actually shift, or does it persist as quiet rationalization? Worth surfacing in Retro #008 explicitly.
- **Counter at #36. 4 more before Retro #008 (#40).** Hard line still in effect from Retro #007.
- **Cadence:** v0.3.19 = ~30-min codification release. Pattern: every shape's 2nd-member codification = small focused single-session release. Trajectory: scope-discipline 2nd member shipped v0.3.10 (same shape); architecture-discipline 2nd member shipped v0.3.17 (same shape); observability 2nd member shipped v0.3.19 (this).

---

### 2026-06-07 — `[user-as-load-bearing-oversight]` aspirational refinement: v0.4 orchestrator catches mechanizable cases; user oversight shrinks to architectural-decisions-only residual (v0.3.20)

**Friction (closed-in-codification):** v0.3.19 codified `[user-as-load-bearing-oversight]` descriptively — the user IS load-bearing today. But the codification was aspirationally incomplete: it named the structural reality without naming the goal of **shrinking the user-oversight surface over time**. User caught the gap same-session, minutes after v0.3.19 shipped: *"ideally user as load bearing oversight is what we need to get away from .. maybe add another improvement that we want the orchestrator to make these decisions ... most of them. except the architecture ones"*. **That observation is itself instance #12 of `[user-as-load-bearing-oversight]`** — the pattern is recursively self-validating, even against its own codification. v0.3.20 closes the gap with the explicit architectural-vs-mechanizable decision taxonomy + v0.4 orchestrator accountability declaration.

**Change (declared per `[declare-not-implement]`, not built):**

- **Architectural-vs-mechanizable decision taxonomy added to `[user-as-load-bearing-oversight]` discipline** via this improvement entry + AGENTS.md Patterns Aspiration note. **Stays with user (architectural — ~30% of historical instances; genuine human-judgment territory):**
  1. Designing new patterns (e.g., v0.3.17 multi-altitude retro architecture observation)
  2. Refining principle boundaries from new evidence (e.g., v0.3.16 `.codex/prompts/reviewer.md` boundary refinement)
  3. Setting strategic direction (e.g., v0.4 scope choices; what to ship next when multiple paths are valid)
  4. Approving HITL gates (foundation approval · brief approval · merge approval)
  5. Evidence citation the framework can't have (e.g., v0.3.17 PR-redo loop data)
  6. Naming decisions (rename direction calls · canon-entry naming choices)
  7. Cross-bet prioritization
- **Orchestrator catches (mechanizable — ~70% of historical instances; should NOT need user):**
  1. Framework-vs-project boundary violations (freedom-bootstrap mistake) — refusal check on `framework: compass` config + `compass/framework/canon.md` presence
  2. Phantom writes / volume mismatches — post-write `ls` verification, sandbox-path consistency check
  3. Spec-following errors (v0.3.15 rename direction) — workflow-instruction checklist; explicit "do now vs defer" tagging in spec text
  4. Tool-wrapper boundary classification (`.claude/skills/` vs framework-canonical files) — file-classification manifest
  5. Watch-for latency (3-release delay on cap-violation) — severity tags (`P0` blocks next release; `P1` blocks Retro N+1; `P2` surfaces in next retro; `P3` ambient) + automated tracking
  6. Counter visibility (cap-violations · freshness windows · retro-due flags) — automated checks surfaced in dashboard Actions tab
  7. Retro PROMOTE follow-through tracking — ensure next-improvement addresses the PROMOTE
- **`AGENTS.md` `[user-as-load-bearing-oversight]` Patterns entry** gains v0.3.20 Aspiration note pointing at the taxonomy + v0.4 orchestrator accountability + forward-link candidate `[orchestrator-as-residual-shrinker]` + anti-pattern `framework-leans-on-user-for-mechanizable-residual`.
- **No canon.md edit.** Per archive-immutability discipline for canon-entry bodies: canon entries are stable historical codifications; refinements live in improvement entries + Patterns section, not by back-patching the canon entry. v0.3.20 lives in CHANGELOG + improvements.md + AGENTS.md Aspiration note; canon.md `[user-as-load-bearing-oversight]` body unchanged from v0.3.19.

**Forward-link candidate `[orchestrator-as-residual-shrinker]` surfaced:**

- 1 instance at v0.3.20 (declaration).
- **Codify on 2nd instance** — likely when v0.4 orchestrator design enters scoping and the architectural-vs-mechanizable taxonomy gets applied to a 2nd mechanizable case the orchestrator catches.
- **Anti-pattern: `framework-leans-on-user-for-mechanizable-residual`** — when framework treats user as load-bearing for cases with stable mechanical signatures (boundary violations · spec mismatches · counter visibility · file-path discipline), framework is structurally lazy. The user is the residual for things the framework CAN'T mechanically catch (architectural judgment); framework owes the user mechanical defense everywhere else.

**Files (3):** `AGENTS.md` (Aspiration note added to existing `[user-as-load-bearing-oversight]` Patterns entry); `CHANGELOG.md` (v0.3.20 entry); `compass/workflows/improvements.md` (this entry + header counter v0.3.19=#36 → v0.3.20=#37).

**Watch for:**

- **`[orchestrator-as-residual-shrinker]` 2nd instance.** Surfaces when v0.4 orchestrator design enters scoping (likely Q3-Q4 timeline given current cadence). When the orchestrator actually catches a mechanizable case the user would have otherwise caught, that's instance #2 → codification candidate.
- **Taxonomy adherence in next 5 improvements.** Each user correction in #37→#41 cycle: which category? Architectural or mechanizable? If mechanizable, why is the user catching it rather than the framework? Worth surfacing in Retro #008 explicitly — does the taxonomy hold up, or does v0.3.20's mechanizable list need expansion / contraction?
- **`[declare-not-implement]` 5th instance accrued.** v0.3.20 declares orchestrator responsibility + taxonomy; does NOT build the orchestrator. Pattern empirically validated 5× now (v0.3.5 agent-handoff reviewer-blocks · v0.3.8 adapter layer · v0.3.16 multi-altitude QUEUED · v0.3.17 role/workflow aggregation declared · v0.3.20 orchestrator-as-residual-shrinker declared). Approaching `[hard-line-declaration]` empirical validation count (4×); both are scope-discipline class patterns. Worth tracking comparative empirical validation between them — both classes are durable, scope-discipline shape stable.
- **`[user-as-load-bearing-oversight]` instance count continues to accrue post-codification.** v0.3.19 codified at 11+; v0.3.20 itself adds instance #12 (user pushback on incomplete codification). Pattern is self-validating; every architectural decision point contributes. Mechanizable-residual reduction via v0.4 orchestrator is the structural path forward — until then, instance count grows. Watch whether v0.4 actually reduces post-orchestrator-ship.
- **Counter at #37.** 3 more before Retro #008. Hard line still in effect.
- **Cadence:** v0.3.20 = ~15-min aspirational-refinement release. **First same-day refinement of a same-day codification** (v0.3.19 codified at midday; v0.3.20 refined within the hour). Notable pattern: when codification ships, user has SECOND-PASS reaction; second pass surfaces aspirational gaps the descriptive codification missed. Worth tracking if this recurs — could be a meta-pattern about codification discipline ("declare descriptive + aspirational together to avoid same-day v0.X.N+1 refinement releases").

---

### 2026-06-08 — `compass/agents/pm.md` + `compass/agents/researcher.md` trimmed to fit OpenAI Custom GPT Instructions ~8000-char cap (v0.3.21) — Task 1 of today's 3-task arc; `[agent-file-compression]` now at 3 instances → codification-ready

**Friction (closed acute):** Two agent files continued to exceed the OpenAI Custom GPT Instructions ~8000-char cap after v0.3.18 closed only delivery-manager.md. pm.md was 12,664 chars (158% of cap); researcher.md was 12,115 chars (151% of cap). Both were already over the cap pre-v0.3.17; v0.3.17's "Logging patterns mid-task" section pushed them further. Cap-violation flagged in v0.3.15 watch-for + compounded in v0.3.17 watch-for; addressed for delivery-manager in v0.3.18; pm + researcher addressed now in v0.3.21. Task 1 of today's planned 3-task arc.

**Change:** Trimmed both files using the v0.3.18 compression playbook.

- **`compass/agents/pm.md`** 12,664 → 7,983 chars (37% reduction; 17 chars headroom under cap). Strategy: combined 3 opening notes into one Notes paragraph; tightened Identity; compressed each Core principle to one line (kept INLINED — discipline cannot be deferred); restructured `setup-product-foundation` task to Gate + Work (compressed step sequence) + Postcondition (dropped verbose Inputs enumeration; dropped Handoffs detail; dropped Triggered-by lines); compressed `draft-brief` / `decompose-bet-to-story` / `arbitrate-dispute` tasks to terse stubs; folded Framework knowledge section into Host-cap-degradation tail (one-line list of Compass-originals + external-framework references + 9-moat names); compressed Anti-patterns from bullet list to inline-separated line; compressed Host capability degradation from 3-column markdown table to bullet list. Frontmatter `version:` bumped 0.3.14 → 0.3.21.
- **`compass/agents/researcher.md`** 12,115 → 7,981 chars (34% reduction; 19 chars headroom). Same playbook + researcher-specific compression on the 6-category research framework: each category's source-list paragraph compressed to a single inline-separated line of starting points (framework SHAPE preserved as load-bearing); 9-moat evaluation moved from `| Question | Where to research |` 3-column table to numbered inline list with verdict-required-per-row preserved as load-bearing rule; moat-sources paragraph compressed to inline list; "Moat-specific" anti-patterns folded into general Anti-patterns line. Frontmatter `version:` bumped 0.3.14 → 0.3.21.

**No behavior change** verified by content sanity: same task names · same Gate + Postcondition pairs preserved · same Refusal rules count · same Anti-patterns coverage · same `preferred_hosts:` + `required_tools:` + `optional_tools:` + `participates_in_workflows:` frontmatter values. Same agent identity; same workflow contract.

**`[agent-file-compression]` now at 3 instances** — delivery-manager (v0.3.18) + pm (v0.3.21) + researcher (v0.3.21). **Codification-ready per Compass 3-instance rule.** Task 2 of today's arc picks up the codification (15th Compass-original; 5th enforcement-class member candidate, OR new "operational" class — to be decided at codification) + ships `compass/scripts/check-agent-cap.py` as the mechanical defense Retro #007 named under the drift signal "Custom GPT cap compounding without structural defense." Per v0.3.20: this is exactly the kind of mechanizable case the v0.4 orchestrator should catch — the script is the v0.4-preparatory mechanism.

**Files touched (4):** `compass/agents/pm.md` (trim 12,664 → 7,983); `compass/agents/researcher.md` (trim 12,115 → 7,981); `CHANGELOG.md` (v0.3.21 entry); `compass/workflows/improvements.md` (this entry + header counter v0.3.20=#37 → v0.3.21=#38).

**Watch for:**

- **3rd `[agent-file-compression]` instance → codification this session (Task 2 of arc).** Pattern: name the compression strategy explicitly + ship the mechanical check (`check-agent-cap.py`) so future agent-file growth doesn't accumulate to 158% / 151% / 273% (delivery-manager peak) of cap before being addressed.
- **`engineer.md` + `reviewer.md` cap status.** engineer.md hasn't been measured in this cycle but isn't in the immediate cap-violation flag; reviewer.md sits at ~10KB (verified v0.3.16) but its `preferred_hosts: [codex, gemini]` excludes ChatGPT so the cap doesn't apply. If a future migration adds Custom-GPT-host support to either, re-measure + trim if needed.
- **Compression vs information-density tradeoff.** v0.3.21 cuts about 37% from pm and 34% from researcher. Going much past 40% reduction risks losing load-bearing nuance (the 9-moat-eval shape, the Access & Data Posture elicitations, the source-quality hierarchy). Watch whether any agent-side execution surfaces "I'd have caught X if the file had explained Y" — that's the signal the compression went too aggressive.
- **Counter at #38. 2 more before Retro #008 (#40).** Today's arc Tasks 2 + 3 will fire Retro #008.
- **Cadence:** v0.3.21 = ~45-min artifact-pruning release (pm took 6 trim iterations to hit cap; researcher took 5). The iterative trim pattern works but is slow — `check-agent-cap.py` from Task 2 should make the iteration mechanical (run script, see overage, trim, run script, etc.) instead of manual.

---

### 2026-06-08 — `[agent-file-compression]` codified as 15th Compass-original + `compass/scripts/check-agent-cap.py` mechanical defense shipped (v0.3.22) — Task 2 of today's 3-task arc; 3rd observability-class member

**Friction (closed structural):** The OpenAI Custom GPT Instructions ~8000-char cap was enforced manually (`wc -c compass/agents/*.md`) and lapsed for 3 releases (v0.3.15 flagged → v0.3.16 + v0.3.17 + v0.3.18 elapsed) while three agent files compounded to 158% / 151% / 273% of cap before being addressed. **Retro #007 (2026-06-07) named "Custom GPT cap compounding without structural defense" as a leading drift signal.** v0.3.22 closes the gap with codification + mechanical check shipped in the same release.

**Change:**

- **Codified `[agent-file-compression]` in `compass/framework/canon.md`** as the 15th Compass-original. **3rd observability-class member** (joining `[role-boundary]` v0.3.4 + `[user-as-load-bearing-oversight]` v0.3.19). Catalog grows from 7 shapes / 14 patterns → 7 shapes / 15 patterns; observability (2 → 3). Where `[role-boundary]` makes COST observable and `[user-as-load-bearing-oversight]` makes DISCIPLINE-CORRECTNESS observable, `[agent-file-compression]` makes STRUCTURAL CONSTRAINTS observable. Observability now the **largest non-enforcement class** (3 vs enforcement's 4). **Three instances at codification:** delivery-manager.md v0.3.18 (21,714 → 7,960, 63% reduction); pm.md v0.3.21 (12,664 → 7,983, 37%); researcher.md v0.3.21 (12,115 → 7,981, 34%). **Compression playbook fully spelled out** (hybrid-inlining preserved per `[agent-as-surface-independent-unit]`; per-task Gate + Work + Postcondition restructure; inline-separated lists; host-cap-degradation table → bullets; frontmatter version bump). **Anti-pattern: `cap-compounding-without-structural-defense`.**

- **Shipped `compass/scripts/check-agent-cap.py`** (Python 3.9+, stdlib only, ~150 lines). Walks `compass/agents/*.md`; reports per-file size + overage/headroom + chatgpt-target flag; exits non-zero if any chatgpt-targeted agent exceeds cap. CLI flags: `--root`, `--cap` (default 8000), `--out`, `--quiet`. **Host-aware enforcement** — HARD-FAILS (exit 1) only on chatgpt-targeted agents (cap is OpenAI-specific); WARNs on non-chatgpt agents (engineer.md targets `[claude, codex, gemini]`, reviewer.md targets `[codex, gemini]` — neither blocks CI today, but if a future migration adds chatgpt, the WARN automatically becomes FAIL on the next CI run). This matches v0.3.20's aspirational refinement: mechanical checks report what they shouldn't unilaterally decide.

- **Updated `compass/scripts/README.md`** with full `check-agent-cap.py` entry (usage, exit codes, host-aware explanation, accuracy honesty, automated execution). Added `sync-from-gdrive.py` to Future scripts list as forward-link to the `[external-primary-with-cached-pointer]` candidate (1 instance from user's consumer-project work 2026-06-08; codify when 2nd instance appears).

- **Updated `AGENTS.md` Patterns section** — catalog totals (7 shapes / 14 → 15 patterns; observability 2 → 3); new `[agent-file-compression]` entry after `[user-as-load-bearing-oversight]`; observability class reframed as "now durably validated as the largest non-enforcement class." When-you're-unsure section gains entry: *"I'm editing an agent file; how do I know if it'll fit the cap?"* → run `check-agent-cap.py`.

**Smoke-test verification** (run during this session): script correctly reports 3 chatgpt-targeted agents OK (delivery-manager 7960 + 40 headroom; pm 7983 + 17; researcher 7981 + 19); 2 non-chatgpt agents WARN (engineer 11436 + 3436 over; reviewer 19809 + 11809 over). Exit code 0 (no chatgpt-targeted failures). Script ready for CI wiring.

**`[agent-file-compression]` is the first Compass-original codified alongside its mechanical defense in the SAME release.** Prior observability-class members shipped the pattern first and the script later (token-usage.py at v0.3.4+ → `[role-boundary]`; check-freshness.py at v0.3.7 round 2 of `[freshness-check]` v0.3.3, 4 releases late). v0.3.22 closes the lag entirely — itself an instance of v0.3.20's aspirational refinement (orchestrator catches the mechanizable case as it's named, not 4 releases later).

**Files touched (6):**

- `compass/scripts/check-agent-cap.py` (NEW)
- `compass/scripts/README.md` (entry added)
- `compass/framework/canon.md` (15th Compass-original entry)
- `AGENTS.md` (catalog totals + new pattern entry + when-unsure line)
- `CHANGELOG.md` (v0.3.22 entry)
- `compass/workflows/improvements.md` (this entry + header counter v0.3.21=#38 → v0.3.22=#39)

**Watch for:**

- **`check-agent-cap.py` CI wiring** — recommended to add to `.github/workflows/freshness-check.yml` (alongside `check-freshness.py`) OR as its own `.github/workflows/agent-cap-check.yml` triggered on PRs touching `compass/agents/`. Until CI-wired, the script provides local pre-commit defense only; the structural compounding pattern Retro #007 named requires CI gating to fully close.
- **engineer.md + reviewer.md WARN status** — both currently exceed cap (11,436 + 19,809 chars). They target Claude/Codex/Gemini, not ChatGPT, so the cap doesn't strictly apply. But the WARNs are useful intel: if v0.3.23+ adds ChatGPT to either's `preferred_hosts:`, the trim becomes immediately required (script will hard-fail on next CI run automatically — no prose update needed; the host-aware logic re-evaluates from frontmatter).
- **Counter at #39.** 1 more improvement before Retro #008 fires at #40. Today's Task 3 (`/build` workflow dispatch-graph refactor) will fire it.
- **Candidates queued, NOT codified** — `[external-primary-with-cached-pointer]` (1 instance) + `[host-preference-validation]` (1 instance), both surfaced this session from user's consumer-project work. Persisted to `~/.claude/projects/-Volumes-VivekSSD-apps-compass/memory/queued_codification_candidates_2026-06-08.md`. Don't change framework defaults yet; wait for 2nd instance per `[declare-not-implement]`.
- **Cadence:** v0.3.22 = ~45-min single-session codification + script + catalog + AGENTS.md + CHANGELOG + this entry. Same release class as v0.3.7 (check-freshness.py round 2) but with the codification + script paired in one release instead of 4 releases apart.

---

### 2026-06-08 — `/build` refactored to thin dispatch-graph shape (v0.3.23) — Task 3 of today's 3-task arc; 2nd workflow migrated; fires Retro #008

**Friction (closed structural):** Of 14 workflows, only 1 (`/setup-product`) had migrated to dispatch-graph shape per `[agent-as-surface-independent-unit]` (canon v0.3.14). The other 13 still embedded full methodology — agents (Engineer + Reviewer + PM + Delivery Manager) had migrated, but workflows didn't dispatch through them, they inlined the work. **Retro #007 named "workflow-refactor cadence: 12+ workflows still in v0.3.0-alpha shape" as a drift signal.** `/build` is the most-used workflow (core implement-and-review loop) + has both primary agents (Engineer + Reviewer) migrated; refactoring it unlocks the dispatch-graph shape for the highest-leverage workflow first.

**Change:**

- **`compass/workflows/build.md` refactored** from 164 lines / 7 phases of embedded methodology → 256 lines of thin dispatch graph. Structure mirrors `/setup-product` (v0.3.14 reference): frontmatter · Framework grounding · Purpose · Architectural shape · Trigger · Preconditions (workflow-level GATE) · Roles invoked · **Dispatch graph (Step 1 → Step 8 naming `<agent>.<task>` references)** · Workflow-level patterns (Story → multiple PRs, Post-merge bugs, Scanner at phase boundaries) · Workflow-level verification (final GATE) · Output summary contract · DRI logging · Discipline always · Notes (what changed, anti-patterns, edge cases, migration).

- **Dispatch graph (8 steps):**
  - Step 1: `engineer.implement-story` (covers old Phases 2 + 4)
  - Step 2: `reviewer.write-e2e-tests` (Phase 3)
  - Step 3: `reviewer.review-pr` (Phase 5 review side; includes freshness-check task-internal gate)
  - Step 4: `engineer.respond-to-review` **NEW TASK** (Phase 5 response side)
  - Step 5: `pm.arbitrate-dispute` (ad-hoc; fires only on `## Dispute`)
  - Step 6: HITL gate — human approves merge
  - Step 7: Mechanical merge constraints (CI + branch protection)
  - Step 8: Post-merge — tech-writer (LEGACY role file `compass/roles/tech-writer.md` until migration)

- **NEW task `engineer.respond-to-review`** added to `compass/agents/engineer.md` (~40 lines: Preconditions + Work 7 steps + Postconditions + Handoffs). Previously inline guidance in engineer.md's "Addressing reviewer findings" section; promoted to a proper task so the dispatch graph has an explicit reference for Step 4. The inline section was removed (now redundant). Engineer.md grew 11,436 → 13,108 chars (WARN status per `check-agent-cap.py` — `preferred_hosts: [claude, codex, gemini]` excludes chatgpt, so cap doesn't strictly apply; flagged for trim if a future migration adds chatgpt).

- **PM agent's `participates_in_workflows:` updated** — added `build` to the list reflecting the existing `arbitrate-dispute` task that fires in `/build` disputes. Previously implicit (inline workflow guidance); now explicit per the dispatch-graph refactor. pm.md grew 7,983 → 7,990 chars (still under cap with 10 chars headroom). Frontmatter version bumped 0.3.21 → 0.3.23. This is an instance of the dispatch-graph shape SURFACING latent dependencies that the embedded-methodology shape kept hidden.

- **`AGENTS.md`** — workflow-migration prose updated: "2 of 14 workflows now in dispatch-graph shape: `/setup-product` (v0.3.14, 1st) + `/build` (v0.3.23, 2nd); 12 remaining migrate as the agents they dispatch finish migration."

**No behavior change verified** by content sanity: same workflow trigger (`/build <story-id>`); same readiness check; same review loop (Engineer ↔ Reviewer until no blockers/disputes); same dispute branch (PM arbitrates); same HITL gate at merge; same mechanical merge constraints (CI green · zero BLOCKERs · zero CRITICALs · zero disputes · human approval); same post-merge tech-writer engagement; same Scanner at phase boundaries; same Story → multiple PRs; same Post-merge bug handling. The refactor is pure structural redistribution; workflow contract with users is unchanged.

**Two codification candidates unlocked at 2 instances each** (per Compass 3-instance rule, codification waits for 3rd instance; both surface in Retro #008 evidence weighing):

- **`[workflow-as-dispatch-graph]`** — 2 instances (`/setup-product` v0.3.14 + `/build` v0.3.23). 3rd-instance candidate: `/fix` (Engineer's `fix-bug` task already declared; natural next refactor).
- **`[task-ownership-locality]`** — 2 instances (`/setup-product` = 4 tasks across pm + researcher + delivery-manager; `/build` = 5 tasks across engineer + reviewer + pm including the new `engineer.respond-to-review`). 3rd-instance candidate: any subsequent workflow refactor.

Retro #008 may PROMOTE either to canon at 2 instances if it judges the structural shape clean enough; otherwise wait for 3rd instance per `[declare-not-implement]`.

**Files touched (6):** `compass/workflows/build.md` (164 → 256 lines refactor); `compass/agents/engineer.md` (NEW task + removed redundant inline section; 11,436 → 13,108 chars WARN); `compass/agents/pm.md` (frontmatter update + version bump; 7,983 → 7,990 chars OK); `AGENTS.md` (workflow-migration prose); `CHANGELOG.md` (v0.3.23 entry); `compass/workflows/improvements.md` (this entry + header counter v0.3.22=#39 → v0.3.23=#40 — RETRO #008 NOW DUE).

**Cadence achievement: 5 improvements in 1 day (2026-06-08).** v0.3.19 → v0.3.23 cycle (5 entries: #36 #37 #38 #39 #40) all shipped between morning and now. Comparable to v0.3.14 → v0.3.18 cycle (5 improvements in 3 days; Retro #007 cycle) — 3x faster cadence. Retro #008 evaluates: is this cadence sustainable or unusual one-off? Does the cadence pattern itself surface friction worth retroing (e.g., insufficient verification time per release)?

**Watch for:**

- **Retro #008 fires NOW** for v0.3.19 → v0.3.23 (5 improvements). Separate commit following this one.
- **`[workflow-as-dispatch-graph]` + `[task-ownership-locality]` at 2 instances each** — Retro #008 either PROMOTEs (early codification on clean structural shape) or LEAVEs AS CANDIDATE (wait for 3rd instance per discipline). Decision belongs to Retro #008.
- **`/fix` workflow** is the natural next dispatch-graph refactor (Engineer agent migrated, `fix-bug` task already declared). Would be 3rd instance of `[workflow-as-dispatch-graph]` if needed for codification.
- **engineer.md cap WARN at 13,108** — adding `respond-to-review` task pushed it further over OpenAI cap. Cap doesn't strictly apply (chatgpt excluded from preferred_hosts); but if engineer.md ever migrates to support chatgpt, trim per `[agent-file-compression]` (canon v0.3.22) BEFORE flipping preferred_hosts. `check-agent-cap.py` will hard-fail automatically on that flip.
- **PM's `participates_in_workflows:` surfacing latent dependencies** — this is itself a 1-instance observation: when a workflow refactor makes dispatch explicit, frontmatter on dispatched agents needs to follow. Future workflow refactors should check: does this dispatch surface a previously-implicit agent that now needs `participates_in_workflows:` updated? Pattern candidate: `[explicit-dispatch-surfaces-latent-participation]` — 1 instance now; wait for 2nd before naming formally.
- **Counter at #40 → Retro #008 firing.** After Retro #008 ships, counter horizon resets to #45 (next retro fires after 5 more improvements).
- **Cadence:** v0.3.23 = ~60-min single-session workflow refactor. Faster than v0.3.14 (`/setup-product` refactor took multi-session: PM + Researcher + Engineer all migrated alongside the workflow). v0.3.23 only added one new task to one already-migrated agent — the pattern is now mechanical.

### 2026-06-08 — `[workflow-as-dispatch-graph]` codified as 16th Compass-original — 3rd architecture-discipline class member; Retro #008 PROMOTE recommendation executed (v0.3.24)

**Friction:** Retro #008 identified `[workflow-as-dispatch-graph]` as PROMOTE TO CANON — 2 instances (`/setup-product` v0.3.14 + `/build` v0.3.23) with a clean structural shape and clear orchestrator implications. The pattern was named in Retro #008 as the 3rd architecture-discipline class member but hadn't been formally codified into canon.md or AGENTS.md yet.

**Change:**
- `compass/framework/canon.md` — added `### workflow-as-dispatch-graph` as 16th Compass-original. Covers: the thin dispatch contract shape (what belongs in workflow vs agent task files); the orchestrator-prerequisite argument; the `embedded-methodology` anti-pattern; distinction from `[agent-as-surface-independent-unit]` (agents own methodology; workflows own sequence — complementary constraints); `[explicit-dispatch-surfaces-latent-participation]` watch-for candidate (1 instance); migration path for 12 remaining embedded-methodology workflows per `compass/framework/mvp.md`.
- `AGENTS.md` — catalog totals updated 7 shapes / 15 → 16 patterns; architecture-discipline 2 → 3 members (now tied with observability as largest non-enforcement class). Added `[workflow-as-dispatch-graph]` entry in the workflow-structure pattern section.
- `compass/framework/mvp.md` — **NEW foundation doc** (no version bump; strategic artifact not a framework improvement). Captures MVP scope: orchestrator-first + vertical slice order + agent pack (Product/Build/GTM/Support with migration status) + connecting workflows + "start sending" checklist. Resolves open questions from session: Automation splits from Reviewer; GTM = Launch Engineer composite; Security Reviewer + Delivery Manager deferred to post-alpha; Tech Writer out; all → Claude API in v0.4-alpha.
- `CHANGELOG.md` — v0.3.24 entry added above v0.3.23.
- `compass/workflows/improvements.md` — this entry + header counter v0.3.23=#40 → v0.3.24=#41 (1 of 5 before Retro #009).

**Files touched (4 + 1 new):** `compass/framework/canon.md` · `AGENTS.md` · `CHANGELOG.md` · `compass/workflows/improvements.md` · `compass/framework/mvp.md` (new).

**Watch for:**

- **Architecture-discipline class at 3 members** — the class is now as large as observability. Both validate the "class" shape structurally; future codification in either class should expect pattern shape to fit cleanly (otherwise it's a different class, not forced into an existing one).
- **`[explicit-dispatch-surfaces-latent-participation]`** — 1 instance (PM's `participates_in_workflows:` updated when `/build` migrated). Watch for 2nd instance on the next workflow migration.
- **Orchestrator v0.4-alpha-0** — Task 3 of today's arc. `[workflow-as-dispatch-graph]` codification is the structural foundation; orchestrator skeleton is the executable proof. Both happen today.
- **12 remaining embedded-methodology workflows** — priority migration order in `compass/framework/mvp.md`. Each migration adds one more automatable path to the v0.4 execution graph.

### 2026-06-08 — Orchestrator v0.4-alpha-0 skeleton shipped — first working dispatch of Compass workflow steps to Claude API (v0.4.0-alpha-0) — Task 3 of today's 3-task arc

**Friction:** Compass workflows require manual host-switching: human opens PM Custom GPT on ChatGPT, runs the step, copies output, switches to Claude Code for filesystem steps, etc. Without an orchestrator, every workflow run is a human-dispatched sequence of copy-paste operations. The MVP framing (locked in v0.3.24 `compass/framework/mvp.md`) identified the orchestrator as the unlock: with it, a CLI command runs a workflow end-to-end.

**Change:**
- `compass/orchestrator/` (new Python package) — 6 files totaling ~350 lines, Python 3.9+ stdlib + `anthropic` SDK:
  - `graph.py` — dispatch graph parser: reads workflow `.md`, scopes to `## Dispatch graph` section, extracts `### Step N.` headers into `WorkflowStep` dataclass list; classifies agent dispatch / HITL / workflow-level steps
  - `hosts/claude.py` — Claude API adapter: agent `.md` → system prompt; task + user context → user message; `claude-opus-4-8` default; fail-fast on missing API key
  - `hitl.py` — HITL gate handler: banner + y/n prompt + graceful EOF/KeyboardInterrupt
  - `run.py` — CLI: `--dry-run` / `--step N` / `--context TEXT` / `--model ID` / `--project-dir PATH`; fail-fast API key check before prompting; agent file resolution (agents/ → roles/ fallback)
  - `README.md` — setup, usage, architecture, known gaps, v0.4-beta roadmap
- `CHANGELOG.md` — v0.4.0-alpha-0 entry added above v0.3.24
- `compass/workflows/improvements.md` — this entry + header counter v0.3.24=#41 → v0.4.0-alpha-0=#42 (2 of 5 before Retro #009)

**Verification:**
- `--dry-run /setup-product`: 4 steps correctly parsed (pm.setup-product-foundation · researcher.cite-evidence · HITL · delivery-manager.update-status)
- `--dry-run /build`: 8 steps correctly parsed (5 agent dispatches · 1 HITL · 2 workflow-level)
- Fail-fast API key check exits immediately with clear message before prompting user
- Agent file resolution confirmed for all 5 migrated agents

**Files touched (3 modified + 6 new):** `CHANGELOG.md` · `compass/workflows/improvements.md` · `compass/orchestrator/` (6 new files).

**Watch for:**

- **v0.4-beta scope:** multi-host dispatch per `preferred_hosts:` (Codex for Reviewer — the cross-model independence that makes Compass reviews load-bearing); artifact write automation; structured state passing between steps; `pip install compass` entry point.
- **Next workflow migration = next automatable path.** The orchestrator can already run `/setup-product` (4 steps) and `/build` (8 steps, 5 dispatchable). Each additional dispatch-graph migration adds one more path without touching orchestrator code. Priority per `compass/framework/mvp.md`: `/create-bet-architecture` (requires Architect migration) + `/create-brief`.
- **`anthropic` SDK version pinning.** Currently uses whatever is installed. Before v0.4-beta, pin to a specific version in `requirements.txt` or `pyproject.toml`.
- **Single-host limitation.** All steps go to Claude API including Reviewer steps — which violates the cross-model independence constraint (`[role-boundary]` v0.3.4 + Reviewer `preferred_hosts: [codex, gemini]`). This is explicitly scoped to alpha; multi-host dispatch is the first v0.4-beta requirement. Don't run the orchestrator's reviewer steps against production code until multi-host ships.

### 2026-06-08 — Architect agent migrated from `compass/roles/` → `compass/agents/` (v0.3.25) — 6th migrated agent; unlocks `/create-bet-architecture` dispatch-graph refactor

**Friction:** Architect was the highest-leverage unblocked migration per `compass/framework/mvp.md` — without it, `/create-bet-architecture` can't become a dispatch-graph workflow, and the orchestrator has no architecture step to walk. The legacy `compass/roles/architect.md` was 71 lines of embedded methodology with no task definitions, no gate/work/postcondition structure, no frontmatter.

**Change:**
- `compass/agents/architect.md` (new, v0.3.25, 7779 chars) — full agent file: `preferred_hosts: [claude, codex, gemini]` (CLI-class; excludes chatgpt — can't read codebase); `draft-bet-architecture` task (6-step with foundational-stack deviation gate as load-bearing hard stop); `assess-pr-compliance` task (PR vs approved architecture verification); 6 refusal rules; host capability degradation; logging patterns. Size: 7779 chars (221 headroom; chatgpt not targeted so cap N/A, but within threshold regardless).
- `AGENTS.md` — migration table Architect `legacy` → `✅ v0.3.25`; agent count prose updated.
- `CHANGELOG.md` — v0.3.25 entry added.
- `compass/workflows/improvements.md` — this entry + counter v0.4.0-alpha-0=#42 → v0.3.25=#43 (3 of 5 before Retro #009).

**Files touched (3 modified + 1 new):** `compass/agents/architect.md` · `AGENTS.md` · `CHANGELOG.md` · `compass/workflows/improvements.md`.

**Watch for:**
- **`/create-bet-architecture` dispatch-graph refactor** — Task 2 (next). Architect agent file is now the source of truth; the workflow can become a thin dispatch contract.
- **`[explicit-dispatch-surfaces-latent-participation]`** — watch whether refactoring `/create-bet-architecture` surfaces any agents whose participation was previously implicit (Enterprise Architect is explicitly named in the legacy workflow as "always engages"). Does it get its own dispatch step or remain a note?
- **Counter at #43 — 2 more improvements to Retro #009.**

### 2026-06-08 — `/create-bet-architecture` refactored to dispatch-graph shape (v0.3.26) — 3rd workflow migrated; orchestrator can now walk Product → Architecture chain

**Friction:** `/create-bet-architecture` was 61 lines of embedded methodology with no frontmatter, no agent dispatch labels, no HITL step declaration — not parseable by the orchestrator. With architect.md migrated (v0.3.25), the methodology IP moved into the agent file, making the workflow ready for dispatch-graph refactor.

**Change:**
- `compass/workflows/create-bet-architecture.md` refactored to standard dispatch-graph shape (version: 0.3.26): 3-step dispatch graph (architect.draft-bet-architecture · HITL · delivery-manager.update-status) · 3 workflow-level preconditions · 9-item verification checklist · Notes covering ADR-not-gate + Enterprise Architect handling + 3 named anti-patterns.
- `AGENTS.md` — workflow count 2 → 3 dispatch-graph workflows.
- `CHANGELOG.md` — v0.3.26 entry.
- `compass/workflows/improvements.md` — this entry + counter v0.3.25=#43 → v0.3.26=#44 (4 of 5 before Retro #009).

**Verification:** `python3 -m compass.orchestrator.run create-bet-architecture --dry-run` — 3 steps parsed correctly.

**`[explicit-dispatch-surfaces-latent-participation]` did NOT fire** — no new implicit agent participation surfaced. Still at 1 instance.

**Files touched (3 modified):** `compass/workflows/create-bet-architecture.md` · `AGENTS.md` · `CHANGELOG.md` · `compass/workflows/improvements.md`.

**Watch for:**
- **Counter at #44 — 1 more improvement to Retro #009.** Next task (orchestrator artifact write + state passing) fires the retro.
- **Orchestrator end-to-end test ready.** With 3 dispatch-graph workflows, the chain setup-product → create-bet-architecture is now fully walkable. Run the new project to validate.

### 2026-06-08 — Orchestrator v0.4-alpha-1: artifact write + state passing shipped — full multi-step runs now produce files on disk (v0.4.0-alpha-1) — **fires Retro #009**

**Friction:** alpha-0 printed step output to stdout only and each step started fresh with no knowledge of prior steps. You couldn't run the full workflow and get usable artifacts — you'd have to copy/paste output manually. State-blind steps also meant the Delivery Manager step had no idea what the PM drafted.

**Change:**
- `compass/orchestrator/run.py` alpha-0 → alpha-1:
  - `_write_artifact()`: step output → `docs/orchestrator-runs/<workflow>/step-<N>-<agent>-<task>.md` with frontmatter. `--no-write` flag suppresses.
  - `_build_user_message()`: prepends prior step outputs as context block before task instruction; each prior output truncated at 3000 chars.
  - `prior_outputs` list accumulates throughout run; each agent step appends `{step, agent, task, output}`.
- `compass/orchestrator/README.md` — updated usage + scope section.
- `CHANGELOG.md` — v0.4.0-alpha-1 entry.
- `compass/workflows/improvements.md` — this entry + counter v0.3.26=#44 → v0.4.0-alpha-1=#45 → **RETRO #009 NOW DUE**.

**Files touched (3 modified):** `compass/orchestrator/run.py` · `compass/orchestrator/README.md` · `CHANGELOG.md` · `compass/workflows/improvements.md`.

**Watch for:**

- **Retro #009 fires NOW** for v0.3.24 → v0.4.0-alpha-1 (5 improvements: #41 #42 #43 #44 #45). Separate commit following this one.
- **End-to-end test ready.** With artifact write + state passing + 3 dispatch-graph workflows, a full `setup-product` run now produces `docs/orchestrator-runs/setup-product/` with files for each step. User sets up new project repo and runs it.
- **State passing truncation at 3000 chars** — sufficient for now; measure real usage before raising.
- **Git commit automation** — user still manually commits artifacts from `docs/orchestrator-runs/`. Auto-move + commit ships v0.4-beta.
- **Counter resets to #50 horizon** after Retro #009 fires.

---

### 2026-06-08 — `/create-brief` refactored to dispatch-graph shape (v0.3.27) — 4th workflow migrated; pm.md `draft-brief` task made real — Task 1 of today's 3-task arc

**Friction:** `/create-brief` workflow embedded 83 lines of methodology prose (gate check → PM → Researcher → source gather → bet ID → draft → mirror → HITL → Delivery Manager). Not walkable by orchestrator. PM agent had a stub `draft-brief` task: *"Task migration pending; follow compass/workflows/create-brief.md"* — circular reference: the workflow pointed at the agent, the agent pointed at the workflow.

**Change:**
- `compass/agents/pm.md` — `draft-brief` stub replaced with real gate/work/postcondition (mode detection: stub+portfolio_stub:true → promote; URL/text → fresh; bet-id without stub → refuse). Size: 7991 chars, 9 headroom — PASS (strict 8000-char cap; chatgpt in preferred_hosts).
- `compass/workflows/create-brief.md` — 83-line embedded methodology → thin 4-step dispatch graph: Step 1 `researcher.cite-evidence-6-category-9-moat` → Step 2 `pm.draft-brief` → Step 3 HITL → Step 4 `delivery-manager.update-status`. Standard frontmatter (version: 0.3.27). Framework grounding (working-backwards · lean-mvp · jtbd · shape-up + 5 Compass-originals). 3 workflow-level preconditions. 9-item verification checklist. 4 named anti-patterns.
- `AGENTS.md` — workflow-migration count: 3 → 4 dispatch-graph workflows; `/create-brief` (v0.3.27, 4th) added.
- `CHANGELOG.md` — v0.3.27 entry.
- `compass/workflows/improvements.md` — this entry + counter v0.4.0-alpha-1=#45 → v0.3.27=#46.

**Files touched (5):** `compass/agents/pm.md` · `compass/workflows/create-brief.md` · `AGENTS.md` · `CHANGELOG.md` · `compass/workflows/improvements.md`.

**Watch for:**
- **Dry-run verify:** `python3 -m compass.orchestrator.run create-brief --dry-run` should produce 4 steps (researcher.cite-evidence-6-category-9-moat · pm.draft-brief · HITL · delivery-manager.update-status).
- **pm.md cap margin at 9 chars** — effectively at cap. Any future `draft-brief` expansion must compress elsewhere first. Task 2 (Designer + UX Writer migration) does NOT touch pm.md.
- **Researcher `cite-evidence-6-category-9-moat` task** — researcher.md already has this task name; verify it matches the workflow's dispatch reference exactly before running orchestrator.

---

### 2026-06-08 — Designer + UX Writer agents migrated (v0.3.28) — 8th + 9th migrated agents; completes the Product pack — Task 2 of today's 3-task arc

**Friction:** Designer and UX Writer were the last two Product-pack agents still in `compass/roles/` with no agent files. `/create-story` Step 6 engages both but they had no `agent.task` dispatch references — orchestrator had no path to dispatch them. Product pack incomplete per `compass/framework/mvp.md`.

**Change:**
- `compass/agents/designer.md` (NEW, v0.3.28, 4474 chars): preferred_hosts chatgpt + claude + codex + gemini. Task `draft-design-spec`: Gate (story ready + approved brief + design system ref) → Work (flow mapping · all states · interaction spec · a11y · copy-need flagging · Figma link via MCP · DRI seed · HITL) → Postcondition (all screens have all states · copy needs flagged · a11y documented · Standard Experience Checklist items identified for PM · not self-approved).
- `compass/agents/ux-writer.md` (NEW, v0.3.28, 4498 chars): preferred_hosts chatgpt + claude + codex + gemini. Task `write-copy`: Gate (design spec present · voice guidelines loaded) → Work (placeholder inventory · copy fill · error type discrimination · empty state next-action · char limit coordination · DRI seed · HITL) → Postcondition (all placeholders filled · type-discriminated error copy · terminology consistent · not self-approved).
- `AGENTS.md` — Designer + UX Writer: legacy → ✅ v0.3.28; agent count updated.
- `CHANGELOG.md` — v0.3.28 entry.
- `compass/workflows/improvements.md` — this entry + counter v0.3.27=#46 → v0.3.28=#47.

**Files touched (5):** `compass/agents/designer.md` (new) · `compass/agents/ux-writer.md` (new) · `AGENTS.md` · `CHANGELOG.md` · `compass/workflows/improvements.md`.

**Watch for:**
- **`/create-story` needs dispatch-graph refactor** — it still embeds 60+ lines of methodology. Now that Designer + UX Writer have agent files, the `/create-story` workflow can be migrated to dispatch-graph shape (5th migration). Step 6 becomes `designer.draft-design-spec` + `ux-writer.write-copy` (parallel dispatch — first workflow with a parallel step).
- **Parallel dispatch support in orchestrator** — current `run.py` executes steps sequentially. Designer + UX Writer in `/create-story` Step 6 run in parallel (per the legacy workflow: "Both run in parallel"). Orchestrator will need parallel step handling before `/create-story` is fully walkable.
- **Product pack now complete** per `compass/framework/mvp.md`: PM + Researcher + Designer + UX Writer all in `compass/agents/`. Build pack still needs Automation (new) + Reviewer (already migrated v0.3.16) + Engineer (already migrated v0.3.14).

---

### 2026-06-08 — Orchestrator v0.4-alpha-2: multi-host dispatch shipped — Reviewer routes to Codex (OpenAI), not Claude — P0 drift from Retro #009 closed — Task 3 of today's 3-task arc

**Friction:** alpha-1 hardcoded `from .hosts.claude import dispatch` — ALL steps (including Reviewer) dispatched to Claude API. Reviewer's `preferred_hosts: [codex, gemini]` explicitly excludes Claude for cross-model independence. Same-model author+reviewer = blind-spot overlap. This was flagged as P0 drift in Retro #009: *"if a consumer uses `compass run build` without `--step` today, Claude reviews its own code."*

**Change:**
- `compass/orchestrator/hosts/router.py` (NEW): `select_host(preferred_hosts)` → first host with credentials. `dispatch_to_host(host, ...)` → routes to correct adapter. Credential map: claude → `ANTHROPIC_API_KEY`; codex/chatgpt/openai → `OPENAI_API_KEY`; gemini → `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
- `compass/orchestrator/hosts/openai.py` (NEW): OpenAI API adapter for codex/chatgpt targets. Agent file → system prompt. Default model: gpt-4o.
- `compass/orchestrator/hosts/gemini_api.py` (NEW): Gemini API adapter for gemini targets. Agent file → system_instruction. Default model: gemini-2.0-flash.
- `compass/orchestrator/run.py` alpha-1 → alpha-2: `_read_preferred_hosts()` parses agent frontmatter YAML. Per-step: read preferred_hosts → `select_host()` → if None, print warning + skip (no crash). Dispatch via `dispatch_to_host()`. Dry-run now shows host routing. `prior_outputs` includes `host` field.
- `compass/orchestrator/README.md` — updated to v0.4-alpha-2; host routing table; multi-host setup instructions.
- `CHANGELOG.md` — v0.4.0-alpha-2 entry.
- `compass/workflows/improvements.md` — this entry + counter v0.3.28=#47 → v0.4.0-alpha-2=#48.

**Verified:**
- `ANTHROPIC_API_KEY=test OPENAI_API_KEY=test python3 -m compass.orchestrator.run build --dry-run` → Step 1 (engineer) → claude; Step 2+3 (reviewer) → codex; Step 4 (engineer) → claude; Step 5 (pm) → chatgpt. Cross-model independence enforced by frontmatter, not config.

**Files touched (7):** `compass/orchestrator/hosts/router.py` (new) · `compass/orchestrator/hosts/openai.py` (new) · `compass/orchestrator/hosts/gemini_api.py` (new) · `compass/orchestrator/run.py` · `compass/orchestrator/README.md` · `CHANGELOG.md` · `compass/workflows/improvements.md`.

**Watch for:**
- **Real multi-host test** — dry-run verified; first live test needs real `OPENAI_API_KEY` + a build workflow step. Until that runs, the OpenAI adapter is structurally correct but field-unproven.
- **PM dispatches to chatgpt (OpenAI API) before Claude** — PM's `preferred_hosts: [chatgpt, claude, ...]` means if `OPENAI_API_KEY` is set, PM goes to OpenAI API, NOT Claude. This is per-spec (ChatGPT preferred for PM), but may surprise users who expect PM → Claude. If needed, reorder PM's `preferred_hosts:` to `[claude, chatgpt, ...]`.
- **`[host-preference-validation]` codification candidate** (queued memory 2026-06-08) — 1 instance still. This improvement adds a 2nd evidence point: host preference is now programmatically enforced by the orchestrator. If a 2nd misrouting case surfaces, codify.

---

### 2026-06-09 — "Minimize friction" added as explicit Compass principle — field signal from crypto app consumer run

**Friction:** User ran Compass on a real consumer project (crypto app) and friction emerged as the single highest-impact barrier — not missing features, not wrong output, but workflow friction causing abandonment before completion. Friction was implicit in several patterns (`[no-padded-status]`, `[soft-spec-hardening]`, various anti-patterns) but never stated as a first-class obligation.

**Change (LOGGED — not yet implemented):** Add "minimize friction" as an explicit named principle in AGENTS.md. Every agent and workflow change must not increase the steps, prompts, or decisions required of the user beyond what the task demands. Friction is a first-class failure mode, not a secondary concern.

**Files touched (0):** Logged only. Implementation deferred.

**Watch for:**
- When implementing: principle placement matters — should sit near `[user-as-load-bearing-oversight]` (observability-class); both concern the user experience of operating Compass.
- Candidate for `[friction-as-slo]` codification if a second concrete instance of friction-driven abandonment is observed in consumer testing.
- Friction measurement is hard without a metric. Candidate metric: number of human decisions/prompts per workflow run. Establish baseline before adding a gate.

---

### 2026-06-09 — Engineer agent prod-parity discipline — runtime failures in prod despite passing e2e tests

**Friction:** User ran a Compass-built crypto app and hit runtime failures in prod that didn't surface in e2e or automation tests. Tests passed; prod failed. The Reviewer already writes e2e + automation tests — the gap is not test coverage but **runtime environment divergence**: the code makes assumptions about env vars, API response shapes, config, and infra state that hold in staging but break in prod.

**Change (LOGGED — not yet implemented):** Strengthen the Engineer agent with prod-parity discipline:
1. **Failure-mode-first** — write error paths before happy paths; every external call has an explicit failure handler
2. **Env-assumption flagging** — any assumption about env vars, secrets, config shape, or API response structure must be explicitly stated as a DRI Risk with `env: prod` tag
3. **Defensive patterns** — null checks, type guards, graceful degradation mandatory on any data from external sources (APIs, databases, env vars)
4. **No implicit prod assumptions** — code that behaves differently between local/staging/prod must be flagged at write time, not discovered at deploy time

**Files touched (0):** Logged only. Implementation deferred. **Fires Retro #010.**

**Watch for:**
- Implementation: add a `prod-parity` postcondition to `engineer.implement-story` — not a new test requirement but a code-discipline requirement.
- The Reviewer's e2e tests verify behavior in CI; they can't catch prod-specific config divergence. This is a structural limit — the fix is defensive code, not more tests.
- Consider adding a DRI Risk template for env-assumption flagging (e.g., `Risk: assumes STRIPE_KEY is base64-encoded in prod — verify before deploy`).

---

### 2026-06-09 — Two Next.js runtime contract violations in prod — concrete evidence shaping #50; two named anti-patterns surfaced

**Friction:** Two post-merge production-only defects on CB-3.3 (crypto app) in 24 hours. Both invisible to `pnpm dev` + `pnpm build` + 541 passing tests. Both surface only on Vercel runtime. Form: "Next.js silently rejects the contract you wrote."

- **PR #50:** RSC adapter prop serialization — functions can't cross the RSC boundary. `Server→Client` Component props must be JSON-serializable or Server Actions. Next.js accepts the code locally; Vercel runtime rejects it silently.
- **PR #51:** "use server" file export purity — only async functions allowed in "use server" files. Non-async exports build fine locally; Vercel runtime breaks silently.

**Change (LOGGED — not yet implemented):** This is the concrete implementation spec for improvement #50. The Engineer agent's prod-parity discipline must specifically name "framework runtime contracts that local tooling doesn't enforce" as a first-class risk category. Two anti-patterns named by the agent on the consuming project:

- `[rsc-prop-serialization]` — Server→Client Component props must be JSON-serializable or Server Actions; no functions, no class instances, no non-serializable objects
- `[server-action-file-export-purity]` — "use server" files must export only `async` functions; any non-async export silently breaks at Vercel runtime

**Files touched (0):** Logged only. Implementation deferred — these shape how #50 is written, not a separate change.

**Watch for:**
- **2 instances of the same failure class in 24 hours** — RSC contract + use-server contract are both "Next.js App Router runtime contract invisible to local tooling." This is a codification-ready META-pattern: `[framework-runtime-contract-invisible-to-local-tooling]` (or a Next.js-specific appendix). Threshold approaching — if a 3rd instance surfaces, codify.
- **Where these anti-patterns live** — they are Next.js/Vercel specific, not Compass-universal. Candidate home: `compass/framework/patterns/nextjs-vercel.md` as a platform-specific appendix, OR inlined in Engineer agent as named refusal-triggers for Next.js projects.
- **The Reviewer didn't catch these either** — e2e tests passed. This is a Reviewer scope limit, not an Engineer limit alone. Both agents need awareness of "local-invisible runtime contracts." Feeds `[reviewer-scope-separation]` (queued codification candidate, post-MVP).

---

### 2026-06-09 — `[discipline-as-muscle-memory]` codified — 17th Compass-original; 3rd scope-discipline class member (v0.3.34)

**Friction:** Retro #011 executed the PROMOTE recommendation from Retro #010 (reduce counter-visibility apparatus for retro cadence after 7 consecutive on-time retros), but the actual canon.md entry hadn't shipped. Pattern described in retros, referenced in improvements, but not formally codified. Drift between "PROMOTE executed" and "canon entry written."

**Change (IMPLEMENTED — v0.3.34):** `[discipline-as-muscle-memory]` canon entry written in `compass/framework/canon.md`. Establishes the discipline lifecycle complementary pair with `[hard-line-declaration]`: establish structural pressure (hard-line) → prove via 5+ consecutive on-time executions → reduce enforcement overhead (muscle-memory). Two anti-patterns named: `premature-scaffold-removal` + `scaffold-that-never-retires`. AGENTS.md catalog updated: 7 shapes / 17 patterns; scope-discipline class: 2 → 3 members.

**Files touched (4):**
- `compass/framework/canon.md` — new `[discipline-as-muscle-memory]` entry
- `AGENTS.md` — catalog counter: 16 → 17 patterns; scope-discipline (2) → scope-discipline (3)
- `CHANGELOG.md` — v0.3.34 entry
- `compass/workflows/improvements.md` — this entry + counter v0.3.33=#56 → v0.3.34=#57 (2 of 3 before Retro #012).

**Watch for:**
- `[scaffold-reactivation]` — if a muscle-memory discipline breaks (misses after scaffold removal), the scaffold reactivates. 0 instances so far; candidate when it first happens.
- `[three-altitude-rise-canon-promotion]` — declared in `[fractal-retro]` v0.3.17; 1 instance; codify after 2nd.

---

### 2026-06-09 — Orchestrator HITL context passing — gate shows artifact + preview; rejection note written; --from-step resume (v0.4.0-alpha-3)

**Friction:** HITL gates in agent files declare hard stops, but the orchestrator's `handle_hitl_gate()` just printed "Review the output above before proceeding" + y/n. No artifact reference, no preview (user had to scroll), no feedback capture on rejection, no way to resume from a specific step after rejection without re-running everything.

**Change (IMPLEMENTED — v0.4.0-alpha-3):**
- `hitl.py`: gate now accepts `last_artifact` + `last_output`; shows artifact path + 600-char preview inline; prompts for rejection feedback (optional, ends with '.')
- `run.py`: passes last artifact path + last agent output to HITL gate; writes rejection note to `docs/orchestrator-runs/<workflow>/step-N-hitl-rejected.md` on rejection (includes reviewer feedback + `--from-step` rerun command); adds `--from-step N` flag that loads steps 1..N-1 from disk artifacts into `prior_outputs` and runs from step N onward

**Files touched (3):**
- `compass/orchestrator/hitl.py` — context-aware gate + feedback capture
- `compass/orchestrator/run.py` — `--from-step` + HITL wiring + rejection note writer
- `CHANGELOG.md` — v0.4.0-alpha-3 entry
- `compass/workflows/improvements.md` — this entry + counter v0.3.34=#57 → v0.4.0-alpha-3=#58 (3 of 3 before Retro #012 → **RETRO #012 NOW DUE**).

**Watch for:**
- **HITL feedback loop** — does the reviewer actually write useful feedback? If feedback fields are consistently empty, the prompt may be adding friction without signal. Watch on first consumer run.
- **--from-step with missing artifacts** — if a prior step's artifact is missing, the orchestrator prints a warning and continues with a context gap. First consumer run will surface whether this is acceptable or needs a harder failure.

---

### 2026-06-09 — Consumer retro signals (CB-3.3 crypto app) — 4 anti-patterns logged; 2 new; 2 need /build checklist promotion

**Source:** First structured consumer retro output from CB-3.3 crypto app. 4 anti-patterns with maturity tiers. Added to Retro #012 as consumer project signals section.

**Anti-patterns and their framework status:**

| Anti-pattern | Maturity | Gap |
|---|---|---|
| `[rsc-prop-serialization]` | High | In `engineer.md`; NOT yet in `/build` pre-merge checklist |
| `[server-action-file-export-purity]` | High | In `engineer.md`; NOT yet in `/build` pre-merge checklist |
| `[empty-numeric-input-zero-trap]` | High — new | Not in framework — needs Engineer `implement-story` standard-experience checklist |
| `[cross-artifact-sweep-on-contract-shift]` | Very high — 5+ instances across CB-2.2/2.5/3.1/3.2/3.3 | Not in framework — highest priority; needs `/build` Phase 4 gate + `engineer.md` postcondition |

**Change (LOGGED — implementation in #59 + #60):**
- `[rsc-prop-serialization]` + `[server-action-file-export-purity]`: bundle into `/build` dispatch-graph refactor (#59) — pre-merge checklist items
- `[cross-artifact-sweep-on-contract-shift]`: priority promote — `engineer.md` postcondition + `/build` Phase 4 gate (also part of #59)
- `[empty-numeric-input-zero-trap]`: Engineer `implement-story` standard-experience checklist (#60)

**Files touched (2):**
- `compass/workflows/retros/2026-06-09-retro-012-v0.3.33-to-v0.4.0-alpha-3.md` — consumer signals section added; `includes_artifact_analysis: true`
- `compass/workflows/improvements.md` — this entry. Counter: v0.4.0-alpha-3=#58 → consumer-retro-signals=#59 (1 of 5 before Retro #013).

---

### 2026-06-09 — Consumer retro anti-patterns promoted to engineer.md + /build checklist (v0.3.35)

**Source:** CB-3.3 consumer retro signals (improvement #59). 4 anti-patterns promoted to framework.

**Changes (IMPLEMENTED — v0.3.35):**

**`engineer.md`:**
- Core principles: `[cross-artifact-sweep-on-contract-shift]` added — when any contract changes, sweep all referencing artifacts before PR opens; 5+ consumer instances cited
- implement-story work step 6: `[empty-numeric-input-zero-trap]` check added — numeric inputs must handle empty vs zero as distinct states
- implement-story work step 7 (new): pre-PR contract-shift sweep step — grep for all references to changed contract, fix all consumers, log DRI Decision
- implement-story postconditions: 2 new items — contract-shift sweep complete + numeric zero-trap checked
- Anti-patterns: `[cross-artifact-sweep-on-contract-shift]` + `[empty-numeric-input-zero-trap]` named

**`build.md`:**
- Workflow-level verification checklist: 3 new items — `[rsc-prop-serialization]` check + `[server-action-file-export-purity]` check + `[cross-artifact-sweep-on-contract-shift]` sweep (all "confirmed or DRI Risk logged" shape)

**Files touched (3):**
- `compass/agents/engineer.md` — v0.3.29 → v0.3.35; core principles + implement-story work + postconditions + anti-patterns
- `compass/workflows/build.md` — v0.3.23 → v0.3.35; verification checklist +3 items
- `compass/workflows/improvements.md` — this entry. Counter: consumer-retro-signals=#59 → v0.3.35=#60 (2 of 5 before Retro #013).

**Watch for:**
- `[cross-artifact-sweep-on-contract-shift]` is now in engineer.md but not yet in canon.md — 5+ instances qualify for codification. Log as improvement #61 if the next session confirms we want to write the canon entry.
- `[empty-numeric-input-zero-trap]` — specific to HTML numeric inputs; watch whether it appears in non-HTML contexts (native mobile number inputs have the same trap). Could generalize.

---

### 2026-06-09 — `[cross-artifact-sweep-on-contract-shift]` codified — 18th Compass-original; 5th enforcement-class member (v0.3.36)

**Friction:** Pattern was in `engineer.md` anti-patterns + principle as of v0.3.35 but not in `canon.md`. 5+ instances across consumer projects qualifies for full codification (threshold for Compass-originals is 3; this one waited for more instances due to its cross-artifact scope). Enforcement class grows to 5, now the largest class.

**Change (IMPLEMENTED — v0.3.36):** `[cross-artifact-sweep-on-contract-shift]` canon entry written. Covers: what counts as a contract, sweep targets, DRI Decision requirement, 5 instances cited (CB-2.2/2.5/3.1/3.2/3.3 ×2), distinction from `[mechanical-output-verification]`, forward-link candidates. AGENTS.md catalog: 17 → 18 patterns; enforcement (4) → (5).

**Files touched (3):**
- `compass/framework/canon.md` — new `[cross-artifact-sweep-on-contract-shift]` entry
- `AGENTS.md` — catalog: 7 shapes / 17 → 18 patterns; enforcement (4) → (5)
- `CHANGELOG.md` — v0.3.36 entry
- `compass/workflows/improvements.md` — this entry. Counter: v0.3.35=#60 → v0.3.36=#61 (3 of 5 before Retro #013).

---

### 2026-06-09 — Orchestrator pipeline mode: cross-workflow chaining PM → Architect → Reviewer → Support (v0.4.0-alpha-4)

**Friction:** Orchestrator v0.4-alpha-3 could only run one workflow at a time. PM brief lived in `/create-brief`, Architect design in `/create-bet-architecture`, and Engineer+Reviewer in `/build`. To chain PM → Architect → Reviewer → Support, the operator had to restart the orchestrator 3× with no automated context passing between runs. Workflow host routing (PM → Claude/OpenAI/Gemini, Architect → Claude, Reviewer → Codex) was already correct via `preferred_hosts:`; what was missing was the pipeline runner.

**Change (IMPLEMENTED — v0.4.0-alpha-4):**

`compass/orchestrator/run.py` refactored:
- **`_run_workflow()`** extracted as a reusable function — runs a single workflow dispatch graph; returns `(prior_outputs, artifact_paths)` so callers can chain runs.
- **`--pipeline W1,W2,…` flag** added — accepts a comma-separated list of workflows, runs them in sequence, carries outputs from each into the next.
- **`_cross_workflow_context()`** — generates a compact handoff summary (artifact paths + last step output preview) injected as the first-step context of the next workflow.
- **`initial_prior_outputs`** arg — each workflow in the pipeline receives ALL prior step outputs as context (not just within-workflow steps). Reviewer in `/build` sees PM brief + Architect design automatically.
- **Cross-workflow step tagging** — each step in `prior_outputs` carries its `workflow` key so context headers are labelled `[create-brief — Step 2: pm.draft-brief]` rather than just `[Step 2]`.

**Usage:**
```bash
# Full PM → Architect → Build pipeline
python3 -m compass.orchestrator.run \
  --pipeline create-brief,create-bet-architecture,build \
  --context "Crypto portfolio tracker for retail investors."

# Dry-run to see dispatch graph for full chain
python3 -m compass.orchestrator.run \
  --pipeline create-brief,create-bet-architecture,build \
  --dry-run
```

Each workflow's HITL gates still fire in sequence. The pipeline halts at any rejection and prints the `--from-step` command for that specific workflow.

**What this still does NOT do:**
- Run shell commands (git, tests, `gh pr create`) — Engineer still needs Claude Code interactive for file writes
- Replace `agent-handoff.yml` GitHub Actions path for post-PR Reviewer dispatch
- Chain workflows that do not yet have dispatch-graph shape

**Files touched (2):**
- `compass/orchestrator/run.py` — v0.4-alpha-3 → v0.4-alpha-4; `_run_workflow()` extracted + `--pipeline` mode
- `compass/workflows/improvements.md` — this entry. Counter: v0.3.36=#61 → v0.4.0-alpha-4=#62 (4 of 5 before Retro #013).

**Retro #013 horizon:** fires at #63.

---

### 2026-06-09 — Consumer-ready orchestrator: --compass-dir, --bet, step logger — live-validated against crypto-app CB-4 (v0.4.0-alpha-5)

**Friction:** Three gaps surfaced the moment we tried to run the orchestrator against the real consumer project (crypto-app):

1. `compass_dir` was hardcoded as `project_dir / "compass"` — the framework had to live *inside* the consumer project. Consumer projects shouldn't maintain a copy of the framework.
2. No way to tell the orchestrator WHICH bet to work on — `--context "$(cat brief.md)"` is fragile and doesn't load architecture, stories, or PROJECT.md automatically.
3. Agent output was raw markdown with no structured extraction — no way to query DRI decisions, gate results, or file lineage across runs.

All three surfaced within a single live test session (CB-4 create-bet-architecture against crypto-app).

**Change (IMPLEMENTED — v0.4.0-alpha-5):**

**`--compass-dir PATH`** — decouples framework location from consumer project. `compass_dir` now defaults to `project_dir / "compass"` but is overridable. The consumer project only needs `docs/` + `PROJECT.md`; framework lives in its own repo. Live-validated:
```bash
python3 -m compass.orchestrator.run \
  --project-dir /Volumes/VivekSSD/apps/crypto-app \
  --compass-dir /Volumes/VivekSSD/apps/compass/compass \
  create-bet-architecture --bet CB-4
```

**`--bet ID`** — auto-loads `docs/bets/<ID>/brief.md` + `architecture.md` (if exists) + story summaries + `PROJECT.md` as structured `## Bet context — <ID>` block prepended to Step 1's user message. Architect received CB-4's full brief automatically; ran the gate correctly (found `architecture_required: false`, produced DRI Decision, exited without drafting a redundant architecture.md).

**`compass/orchestrator/logger.py`** (new module) — parses every agent step output for structured sections and appends a record to `docs/orchestrator-runs/runs.jsonl`:
- Fields: `run_id`, `ts`, `workflow`, `bet_id`, `step`, `agent`, `task`, `host`, `model`, `gate_result`, `tldr`, `dri_decisions` (list), `files_created`, `files_modified`, `next_command`, `risks`, `output_chars`, `artifact_path`
- **`--log`** flag: prints tabular summary of all logged steps
- **`--dri`** flag: prints all DRI decisions extracted across all runs
- Parse logic extracts: `## State check` → gate_result; `## DRI Decision logged` → decision blocks; `## Output summary` → TL;DR, files, next command, risks

**Live run result (first real end-to-end consumer dispatch):**
- Architect gate fired correctly (`architecture_required: false` → DRI Decision logged, no architecture.md drafted)
- HITL gate paused, showed preview, user approved
- Delivery manager dispatched with prior step context, produced status.md update, correctly named unknowns per `[derive-from-state]`
- Full pipeline worked first try

**Files touched (3):**
- `compass/orchestrator/run.py` — v0.4-alpha-4 → v0.4-alpha-5; `--compass-dir` + `--bet` + `--log` + `--dri` flags; `log_step()` call after each dispatch
- `compass/orchestrator/logger.py` — NEW; parse + append + report
- `compass/workflows/improvements.md` — this entry. Counter: v0.4.0-alpha-4=#62 → v0.4.0-alpha-5=#63 (**fires Retro #013**).

**Watch for:**
- `[consumer-as-primary-signal]` — 2nd instance this batch (CB-3.3 defects = 1st, CB-4 live validation = 2nd). At threshold for codification-watch; surface if 3rd instance appears.
- Delivery manager needs `--full-project` flag (load all bets + foundation) to produce accurate status.md — current `--bet` loads one bet only; everything else is `unknown — named reason`.
- `runs.jsonl` analysis tooling is terminal-only (`--log`, `--dri`); pandas/SQL query layer would unlock real cross-run analysis. Deferred per `[declare-not-implement]`.
- Consumer project (crypto-app) is on v0.1 framework (`roles/` not `agents/`); `--compass-dir` workaround works but a formal consumer migration guide is needed.

---

### 2026-06-09 — `--full-project` flag: portfolio-wide context for delivery manager (#64)

**Friction:** Delivery manager's `update-status` received only CB-4's context via `--bet CB-4`. Everything else (other bets, foundation docs, plan, existing status.md) was `unknown — named reason`. Correct discipline, but operationally useless for a real status update.

**Change (IMPLEMENTED):** `--full-project` flag added to `compass/orchestrator/run.py`. When set, loads before `--bet` context:
- `docs/foundation/product.md`, `architecture.md`, `plan.md`, `portfolio.md`
- `docs/status.md` (prior status for delta awareness)
- All bet brief summaries (first 600 chars each — enough for status/phase, not full content)
- `PROJECT.md`

**Usage:**
```bash
python3 -m compass.orchestrator.run \
  --project-dir /Volumes/VivekSSD/apps/crypto-app \
  --compass-dir /Volumes/VivekSSD/apps/compass/compass \
  --full-project \
  --bet CB-4 \
  create-bet-architecture
```

`--full-project` and `--bet` compose: project-wide context loads first, then bet-specific detail layers on top. Delivery manager in Step 3 now sees all bets + foundation + prior status before producing the update.

**Files touched (1):** `compass/orchestrator/run.py` — `_load_full_project_context()` + `--full-project` flag. Counter: v0.4.0-alpha-5=#63 → #64 (1 of 5 before Retro #014).

---

### 2026-06-09 — `agent-handoff.yml` verified: Codex CLI replaced by `reviewer.py` + OpenAI SDK (#66)

**Friction:** `compass/scripts/agent-handoff.yml` Option A (Codex) used `codex exec --prompt-file ... --input pr.diff --output review.md` — explicitly marked PLACEHOLDER/VERIFY in the file. The Codex CLI headless-mode flags drift with each release and were never verified against actual CLI behavior. Any consumer copying this template would get a broken GitHub Actions workflow.

**Change (IMPLEMENTED):**
- `compass/scripts/reviewer.py` (NEW) — standalone Python script that calls the OpenAI API using the same `openai` SDK pattern already validated in `compass/orchestrator/hosts/openai.py`. Args: `--prompt-file`, `--diff-file`, `--output`, `--model`. Zero new dependencies.
- `agent-handoff.yml` Option A rewritten: installs Python 3.11 + `pip install openai`, then calls `python3 compass/scripts/reviewer.py`. No unverified CLI flags.

**Before:**
```yaml
- name: Run Codex review
  run: codex exec --prompt-file .codex/prompts/reviewer.md --input pr.diff --output review.md
  # VERIFY: flags are placeholders
```

**After:**
```yaml
- name: Run reviewer via OpenAI API
  run: python3 compass/scripts/reviewer.py --prompt-file .codex/prompts/reviewer.md --diff-file pr.diff --output review.md --model gpt-4o
```

**Files touched (2):** `compass/scripts/reviewer.py` (NEW) + `compass/scripts/agent-handoff.yml` (Option A rewritten). Counter: #64 → #66 (skipping #65 — consumer migration guide not yet written; logged here as gap, not shipped). 2 of 5 before Retro #014.

**Note on counter:** #65 reserved for consumer migration guide (crypto-app v0.1 → current). Not shipping this session — naming the gap explicitly so the counter stays honest.

---

### 2026-06-09 — LLM-agnostic dispatcher: `dispatch.py` replaces `reviewer.py` — LLM from `preferred_hosts`, not hardcoded (#67)

**Friction:** `reviewer.py` (#66) hardcoded `import openai` and called the OpenAI API directly. This violated the `preferred_hosts:` architectural separation the framework is built on — the LLM choice belongs in the agent file's frontmatter, not in a per-role script. User caught it immediately: "reviewer.py or any role.py should be independent of the LLM."

This is a `[soft-spec-rationalization]` instance: #66 fixed the surface symptom (unverified Codex CLI flags) without checking whether the solution shape was consistent with the framework's dispatch architecture.

**Change (IMPLEMENTED):**

- **`compass/scripts/reviewer.py` — DELETED.** Per-role, LLM-coupled script removed entirely.
- **`compass/scripts/dispatch.py` — NEW.** Generic LLM-agnostic dispatcher:
  1. Reads `preferred_hosts:` from agent file frontmatter
  2. Calls `compass/orchestrator/hosts/router.py`'s `select_host()` + `dispatch_to_host()` — same routing already validated end-to-end by the orchestrator
  3. No LLM named in the script. Reviewer routes to codex/gemini; PM routes to claude/chatgpt — all from frontmatter.
- **`agent-handoff.yml` Option A rewritten** to use `dispatch.py` + `compass/agents/reviewer.md`. All three API keys passed as env vars; whichever matches the reviewer's `preferred_hosts:` is used.

**Verified:**
```bash
python3 compass/scripts/dispatch.py \
  --agent-file compass/agents/reviewer.md \
  --task review-pr --input-file /dev/null --output /dev/null
# → "preferred_hosts: ['codex', 'gemini'] — Set one of: OPENAI_API_KEY, GEMINI_API_KEY"
# Routing read from frontmatter correctly. No LLM hardcoded.
```

**Architecture shape enforced going forward:**
```
agent-handoff.yml / any CI script
  └─ dispatch.py          ← LLM-agnostic; any role, any task
       └─ router.py       ← selects host from preferred_hosts
            └─ hosts/*.py ← the only place LLM SDKs are imported
```

**Files touched (3):** `compass/scripts/dispatch.py` (NEW) + `compass/scripts/reviewer.py` (DELETED) + `compass/scripts/agent-handoff.yml` (Option A rewritten). Counter: #66 → #67 (4 of 5 before Retro #014). **Next retro fires at #68.**

---

### 2026-06-09 — `--context-files`: agent context injection — decisiveness without codebase access (#68)

**Friction:** `dispatch.py` sent only the agent file (system prompt) + primary input file (e.g. `pr.diff`). The agent had no codebase context — no `PROJECT.md`, no bet brief, no architecture decisions. A reviewer calling `dispatch.py` could see a diff but not what the PR was supposed to accomplish, making its judgments structurally disconnected from the bet's design intent.

Root cause: context-free dispatch is correct for pure structural checks (syntax, linting), but wrong for higher-order reviews (does this align with the architectural decisions? does it satisfy the bet's acceptance criteria?). Without context injection, the agent is forced to guess intent or produce generic findings.

**Change (IMPLEMENTED):**

- **`dispatch.py --context-files`** (new flag, `nargs='*'`): accepts a list of additional files injected as a structured preamble before the primary input. Each file becomes a labeled `### <path>` block under a `## Context` header. Separator (`---`) before the `Execute task:` line ensures the agent sees context vs. input as distinct sections.
- **`agent-handoff.yml` Option A updated**: added `--context-files PROJECT.md docs/foundation/product.md docs/foundation/architecture.md` to the default reviewer invocation. Comment explains when to include vs. omit (include for bet-aware reviews; omit for pure structural checks). Bet-specific example inline: `docs/bets/CB-4/brief.md`.
- **Missing context files handled gracefully**: warning printed, file skipped, dispatch continues with remaining context.

**Usage:**
```bash
python3 compass/scripts/dispatch.py \
  --agent-file compass/agents/reviewer.md \
  --task review-pr \
  --input-file pr.diff \
  --output review.md \
  --context-files PROJECT.md docs/bets/CB-4/brief.md docs/bets/CB-4/architecture.md
```

**Verified:** context preamble assembles correctly; labeled blocks + separator; missing files skip with warning; `--help` shows flag; routing (`preferred_hosts` read) unchanged.

**Architecture note:** context injection is the caller's responsibility — the caller knows which bet/workflow applies. The agent file (`reviewer.md`) defines WHAT to check; `--context-files` provides the domain knowledge to check against. This preserves LLM-agnosticism (context is just text; no host-specific logic added).

**Files touched (2):** `compass/scripts/dispatch.py` (v0.1 → v0.2) + `compass/scripts/agent-handoff.yml` (Option A updated). Counter: #67 → #68. **Retro #014 fires now.**

---

### 2026-06-09 — README: OKR overlay + "Why discipline?" — framework thesis made explicit (#69)

**Friction (two related gaps):**

1. **OKR use case missing from README.** Compass maps directly onto OKR planning cycles (O → product.md, KR → OKRs + fitness functions, Initiative → Bet, Check-in → /status, Quarter retro → /retro) but this wasn't documented. Teams evaluating the framework had no way to see the fit without reverse-engineering it.

2. **The core thesis — discipline — wasn't stated.** README described WHAT Compass does (workflows, agents, dispatch graphs) but not WHY it exists. The actual value proposition is structural enforcement of discipline: gates, HITL stops, refusal rules, DRI logs, no-silent-skips. Without this framing, Compass reads as "yet another methodology framework" rather than "the discipline layer that makes AI-assisted development honest."

**Change (IMPLEMENTED):**

- **`## OKR-driven organizations` section added** (after Core ideas): mapping table (OKR concept → Compass equivalent), ceremony mapping (OKR planning → portfolio, check-in → /status, execution → brief/arch/story/build, quarter retro → /retro), traceability note (OKR → PR chain explicit), schema addition guide (`drives_kr:` + `okr_cycle:` frontmatter fields for KR-number tracking), multi-team note (org-altitude retro).

- **`## Why discipline?` section added** (before What Compass is): the framework's core thesis — AI tools give speed; Compass provides the structural discipline to not waste it. Five named mechanisms: gates with postconditions, hard HITL stops, refusal rules in agent files, DRI audit trail, no silent skips. Connects to OKR framing: "OKRs give you the goals; Compass gives you the discipline to execute them honestly."

**Origin:** user stated it directly — "I believe to achieve anything, discipline is important and I want to add the discipline in framework — and Compass gives me the discipline." The thesis was implicit in the framework design (Principle #14, HITL gates, refusal rules) but never stated as the primary value proposition.

**Convention candidate surfaced:** `[discipline-as-primary-value]` — Compass's moat is not the methodology (others have methodology), not multi-model support (others do that), but the structural enforcement of discipline at every gate. Worth codifying when the framing stabilizes across 2+ consumer-facing descriptions. 1 instance.

**Files touched (1):** `README.md` (two new sections). Counter: #68 → #69 (1 of 5 before Retro #015).

---

### 2026-06-09 — Institutional data layer: HITL journal + org learning engine — DECLARED, not implemented (#70)

**Insight (user-originated):** The data collected from AI runs and HITL decisions is the real institutional memory. If it isn't captured systematically, it can't improve anything. The HITL gate specifically is a labeled dataset of "what humans consider acceptable AI output" — accumulated over time, this becomes an organizational learning engine and a data-driven feedback mechanism for teams.

**The three layers being declared:**

**Layer 1: AI run data** *(partially built — `runs.jsonl`)*
Every orchestrator step already writes to `docs/orchestrator-runs/runs.jsonl`: workflow, step, agent, host, model, gate_result, tldr, DRI decisions, files touched, output_chars. The raw signal exists. What's missing: aggregate queries that turn it into quality benchmarks. "Claude's brief first-pass approval rate is 68%. After `--context-files`, it rose to 81%." That requires Layer 2 data to complete.

**Layer 2: HITL decision journal** *(declared — `hitl.jsonl`)*
Currently HITL is a silent status flip. What's not captured: how long the review took, whether it was first-pass or revised, what the rejection reason was, how many rounds before approval. A `hitl.jsonl` written every time a status transitions (proposed → approved / rejected / revised) would capture:
```json
{
  "run_id": "create-brief--CB-5--2026-06-09",
  "step": "pm.draft-brief",
  "artifact": "docs/bets/CB-5/brief.md",
  "decision": "revised",
  "time_to_review_seconds": 847,
  "revision_count": 2,
  "rejection_reason": "hypothesis not falsifiable — KR not named",
  "approved_by": "vivek",
  "ts": "2026-06-09T22:00:00Z"
}
```
Over time: which workflow steps consistently need multiple rounds? Which agents produce first-pass approvals? Which gate categories humans actually enforce vs rubber-stamp?

**Layer 3: Organizational feedback engine** *(declared — v0.5 territory)*
With Layer 1 + Layer 2 accumulated across a team over time:
- **Agent quality scores** — per workflow, per model, per context configuration. Real data on what improves output.
- **Individual coaching data** — PM briefs: 72% first-pass. Engineer PRs: 2.3 reviewer rounds average. Not impressions — patterns from 30+ data points.
- **Team discipline metrics** — Time-to-HITL-decision is the discipline signal. 4 hours = gates being reviewed. 2 minutes = rubber stamp. The metric reveals whether the process is real.
- **Improvement velocity** — Are first-pass rates rising? Are DRI Risk counts falling as conventions solidify? Compass becomes a learning system.

**The moat this creates:**
The markdown files can be copied in a month. The accumulated HITL decisions, DRI logs, and run patterns cannot. An org running Compass for 12 months has 12 months of labeled "what good looks like" data, specific to their product domain, their team's judgment, their quality bar. That compounds. That's the institutional memory the user was asking about.

**The ethical constraint (design-time decision):**
Data is a mirror, not a judge. Consent model:
- Individual sees their own data always
- Team sees aggregates; individual breakdown visible only to themselves
- Managers see patterns via retros (periodic, retrospective) not live dashboards (pressure-creating)
- The surface is `/retro --altitude=role` — not a scoreboard

**What needs to be built (in order):**
1. `hitl.jsonl` schema + writer (triggered on status transitions, not on orchestrator steps)
2. Role-activity logs (`docs/role-activity/<role>.md`) — per-agent pattern log, already declared in retro workflow
3. Analytics layer — aggregate queries over `runs.jsonl` + `hitl.jsonl`
4. `/retro --altitude=role` end-to-end (source log exists in declaration; needs data)
5. Consent + visibility framework — who sees whose data

**Why declare now, not implement:**
The v0.4 data layer (`runs.jsonl`) was designed with no downstream analytics in mind. Now that the vision is clear, `hitl.jsonl` can be designed with the analytics end-state in mind — so the data is there when the analytics layer ships. Declaring now prevents a future "we should have captured X all along" regret. Per `[declare-not-implement]`: the schema is the declaration; implementation waits for the friction that validates the priority.

**Convention candidate:** `[data-as-institutional-memory]` — the real moat of a Compass-running org is not the methodology files (copyable) but the accumulated HITL decisions, DRI logs, and run patterns that encode the organization's judgment about what good looks like. 1 instance. Surface when 2nd instance appears (likely when first org-altitude retro runs with multi-project data).

**Architecture amendment (2026-06-10):** Initial framing assumed artifact routing = auto-write to `docs/bets/<id>/brief.md` after each step. User correctly identified this as wrong — `runs.jsonl` IS the source of truth; writing to local `docs/` is just the no-connector fallback. The canonical location is connector-dependent:

```
Confluence org  → brief pushed to Confluence page
Linear org      → bet record updated in Linear
GitHub-native   → brief.md committed to repo
No connector    → docs/ as local fallback only
```

**Revised architecture:**
- `runs.jsonl` = source of truth for step completion AND artifact content (draft)
- HITL approval = the trigger for pushing to the connector, not step completion
- `hitl.jsonl` records: approved, pushed to `<connector>`, timestamp — completing the audit chain
- **Gating redesign:** orchestrator gates on `runs.jsonl` having a completed + approved step for the prior capability.play, NOT on a local file existing. This makes gates connector-agnostic.
- `runs.jsonl` + `hitl.jsonl` together = "what was produced" + "what was approved and where" — the complete institutional record

This eliminates the sync problem (which location is canonical?) and makes the data layer the single source of truth rather than a log beside the "real" files. The HITL journal is now explicitly the bridge between draft (runs.jsonl) and canonical (connector).

**Files touched (0):** declaration only. Counter: #69 → #70 (2 of 5 before Retro #015).

---

### 2026-06-10 — Consumer migration guide: v0.1 roles/ → current agents/ (#65, shipped late)

**Friction:** Crypto-app (and any v0.1 consumer) has `compass/roles/` structure predating the v0.3.14 `compass/agents/` migration. The `--compass-dir` orchestrator workaround covered automated dispatch but interactive Claude Code sessions inside v0.1 projects still loaded stale role files. No documented path existed for consumers to upgrade their embedded `compass/` in-place.

Counter slot #65 was reserved in session #66 and held open honestly (first counter gap in framework history). Now shipped.

**Change (IMPLEMENTED):**

`MIGRATION.md` added at repo root (alongside README.md, SETUP.md). Two paths:

- **Path A (workaround):** `--compass-dir` flag — zero file changes, orchestrator reads current framework externally. Validated on crypto-app CB-4.
- **Path B (full upgrade):** step-by-step in-place migration — copy `compass/agents/` + `compass/workflows/` from current framework, preserve project's own `improvements.md`, archive/delete `compass/roles/`, update `AGENTS.md`. Includes gotchas (half-migrated state, three not-yet-migrated agents, interactive Claude Code behavior post-migration).

**Files touched (1):** `MIGRATION.md` (NEW). Counter: #70 → (gap closed). Effective position: #71 next. 3 of 5 before Retro #015.

---

### 2026-06-10 — `[cross-artifact-sweep-on-contract-shift]` codified as AGENTS.md Principle #17 (#71)

**Friction:** The pattern was already in engineer.md (Step 7 of implement-story), build.md verification checklist, and the AGENTS.md patterns catalog — but it was never promoted to a numbered cross-cutting principle. Without a numbered principle, agents reading only the principles section (not the full catalog) missed the structural mandate. n=12 evidence instances across CB-2.2 through CB-4.1, including three catches in one PR review (CB-4.1 #59) and an intra-file case that proved same-file drift is the same class as inter-file drift.

**Change (IMPLEMENTED):**

AGENTS.md cross-cutting principles: inserted #17 `[cross-artifact-sweep-on-contract-shift]` after #16 (refuse+escalate); renumbered previous #17 "Minimize friction" to #18. Three-element structure per Principle #14: explicit imperative + mechanical verification gate (existing engineer.md Step 7 + build.md checklist item) + named anti-pattern with four named variants (intra-file, inter-file, external-source, same-fact-cited-twice). Self-reference in "Minimize friction" updated from Principle #17 to Principle #18.

**Sweep (hitl.jsonl + runs.jsonl):** sweep requested as part of this improvement — applying the pattern retroactively to recent #70 contract changes. Findings:
- `runs.jsonl`: consistent across logger.py (writes), run.py (reads), CHANGELOG.md, improvements.md, retros/2026-06-09-retro-013. No stale references.
- `hitl.jsonl`: declared only in improvements.md #70 amendment — correctly declared-not-implemented. No inconsistencies.
- `agent.json`: does not exist in the framework. Not a contract that has been shipped.

**Files touched (1):** `AGENTS.md` (principle #17 inserted, #17 Minimize friction renumbered to #18). Counter: #71. 4 of 5 before Retro #015.

---

### 2026-06-10 — runs.jsonl + hitl.jsonl end-to-end (#72)

**Friction:** HITL gate outcomes (approve/reject) were printed to the console but never persisted. `hitl.jsonl` was declared in #70 but had zero implementation. When a user approved a brief, there was no machine-readable record that it happened, no way to join the approval event to the step that produced the artifact, and no `--hitl-log` command to inspect the decision trail.

**Change (IMPLEMENTED):**

`compass/orchestrator/logger.py` — added `log_hitl()` (appends one JSON record to `docs/orchestrator-runs/hitl.jsonl` on every HITL gate decision), `load_hitl_log()`, `print_hitl_table()`. Schema: `run_id · ts · workflow · bet_id · step · artifact_path · decision (approved|rejected) · feedback · reviewer (human) · connector (null until connector built)`. Also fixed `_extract_files` regex to accept `**Files created:**` format (colon inside bold) — was silently dropping file paths from the runs.jsonl parser.

`compass/orchestrator/run.py` — imports `log_hitl`; calls it after every `handle_hitl_gate()` return (approved AND rejected), logs `[hitl → approved]` / `[hitl → rejected]` to stdout; adds `--hitl-log` CLI flag that prints the HITL decision table and exits.

`compass/orchestrator/tests/test_jsonl_pipeline.py` (NEW) — 15 tests covering: `log_step()` creates + appends correctly; `log_hitl()` approved/rejected records; `load_runs()` / `load_hitl_log()` round-trip; `run_id` linkage test (same run_id in both files so steps and HITL decisions can be joined); `parse_step_output()` unit tests (tldr, files_created, dri_decisions, output_chars, empty input). All 15 pass.

**Files touched (4):** `compass/orchestrator/logger.py` · `compass/orchestrator/run.py` · `compass/orchestrator/tests/__init__.py` (NEW) · `compass/orchestrator/tests/test_jsonl_pipeline.py` (NEW). Counter: #72. 5 of 5 before Retro #015 → **Retro #015 fires next.**

---

### 2026-06-11 — enterprise-architect agent migration (#73)

**Friction:** `compass/roles/enterprise-architect.md` (211 lines) was the last of the 3 unmigrated "big" agents. Workflows referencing it still loaded a legacy fat-role file with no `preferred_hosts:`, no gate/work/postcondition triplets, and no HITL gate placement — blocking v0.4 orchestrator dispatch for the `/setup-foundation-architecture` and `/create-bet-architecture` paths.

**Change (IMPLEMENTED):**

`compass/agents/enterprise-architect.md` (NEW, v0.3.36) — 4 tasks: `setup-foundation-architecture` (Phase A research → HITL → Phase B derivation; 6-category research framework; 9-axis data model decisions; Well-Architected 6-pillar scoring; 2 mandatory HITL gates), `join-bet-architecture` (constraint-violation review join), `lead-ops-change` (foundational amendment + `[cross-artifact-sweep-on-contract-shift]` blast-radius sweep), `join-triage` (structural classification + redirect or amendment trigger). `preferred_hosts: [claude, codex, gemini]`.

**Files touched (3):** `compass/agents/enterprise-architect.md` (NEW) · `AGENTS.md` (migration table row: legacy → ✅ v0.3.36) · `compass/workflows/improvements.md`. Counter: #73.

---

### 2026-06-11 — security-reviewer agent migration (#74)

**Friction:** `compass/roles/security-reviewer.md` (97 lines) had hard-rules in prose, no `preferred_hosts:` declaration, and no gate/work/postcondition triplet — blocking the enforced `[codex, gemini]` routing that makes cross-model security review structurally independent of the implementer.

**Change (IMPLEMENTED):**

`compass/agents/security-reviewer.md` (NEW, v0.3.36) — single task: `review-pr-security`. Auto-engagement triggers (10 sensitive surfaces). 6-category check framework (injection/validation, authN/authZ, secrets/PII, sessions/cookies, dependencies, frontend). Explicit "no findings" postcondition. Severity model (CRITICAL/HIGH/MEDIUM/LOW) with exploitability-based definitions. Hard separation from Reviewer role (two comments, not one). `preferred_hosts: [codex, gemini]` — excludes claude, same structural rationale as the Reviewer agent.

**Files touched (3):** `compass/agents/security-reviewer.md` (NEW) · `AGENTS.md` (migration table row: legacy → ✅ v0.3.36) · `compass/workflows/improvements.md`. Counter: #74.

---

### 2026-06-11 — tech-writer agent migration (#75)

**Friction:** `compass/roles/tech-writer.md` (56 lines) was the smallest unmigrated role — but it blocked the `accumulate-changelog` and `finalize-brief-docs` handoffs from being machine-dispatchable. With all 14 agents now migrated, `compass/roles/` is grace-period-only pending v0.4 cleanup.

**Change (IMPLEMENTED):**

`compass/agents/tech-writer.md` (NEW, v0.3.36) — 2 tasks: `accumulate-changelog` (per merged PR; append-only changelog entry format; gates on bet changelog existence; never edits prior entries) + `finalize-brief-docs` (at bet close; gate on all stories shipped + HITL-approved brief; assembles `docs/bets/<bet_id>/finalized/`; connector push or filesystem fallback; DRI Decision logged). `preferred_hosts: [claude, codex, gemini]`.

Also updated `MIGRATION.md` Gotchas note: was "3 agents not yet migrated"; now reads "All 14 agents migrated as of v0.3.36."

**Files touched (4):** `compass/agents/tech-writer.md` (NEW) · `AGENTS.md` (migration table row: legacy → ✅ v0.3.36; description updated; roles/ description updated) · `MIGRATION.md` (Gotchas updated) · `compass/workflows/improvements.md`. Counter: #75. **All 14 agents migrated. `compass/roles/` is now grace-period-only.** 3 of 5 before Retro #016 → next retro fires after #77.

---

### 2026-06-11 — independent-review doc-consistency sweep (#76)

**Friction:** An independent (context-free) review agent audited the full framework post-v0.3.36 and found the migration batch violated `[cross-artifact-sweep-on-contract-shift]` on its own contract shift: "all 14 agents migrated" was never swept through README.md (still "11 of 14"), SETUP.md (3 stale counts + the install `cp` trailing-slash bug that breaks BSD/macOS installs), CLAUDE.md (commands list missing /scan /retro /advance; "Security Reviewer still pending migration"; "orchestrator not yet present"), build.md (5 legacy `compass/roles/` refs), scan.md, and 5 more workflow files + 2 skill stubs still loading `compass/roles/` for migrated agents. Plus: AGENTS.md host-table drift (support `[any]` vs frontmatter; tech-writer in the chatgpt row vs `[claude, codex, gemini]` frontmatter; automation missing), the scanner six-phase block orphaned under Principle #18 instead of #13, `config.yaml` `framework_version: 1.0`, "4 of 14 workflows", stale orchestrator version claims (alpha-2 vs alpha-5), a duplicated README line, and MIGRATION.md Path B never copying `compass/orchestrator/` yet verifying with `python3 -m compass.orchestrator.run`.

**Change (IMPLEMENTED):** Single-PR sweep of all stale mentions. README.md (version, migration count, HITL claim honesty, reviewer-skip caveat, venv install, artifact-promotion caveat, dedup). SETUP.md (cp trailing-slash fix + comment, counts: 14 migrated / 17 workflows / 18 skills). CLAUDE.md (migration status, +3 commands, security-reviewer migrated, orchestrator section rewritten present-tense with promotion-is-manual caveat). AGENTS.md (host table: +automation +tech-writer to CLI-class row, support → explicit host list; six-phase block re-homed to Principle #13; "4 of 17"; roles/ note). build.md + scan.md + fix.md + ops.md + create-story.md + create-bet-portfolio.md + setup-foundation-architecture.md + dashboard/scan SKILL.md → `compass/agents/` refs. config.yaml `framework_version: 0.3.36`. MIGRATION.md Path B: orchestrator copy step + retros/ exclusion.

**Note:** 2nd instance of `[pre-push-grep-discipline]` (1st: v0.3.33 reviewer/automation split missed reviewer.md — fixed as #77). Candidate now eligible for codification discussion per 2-instance threshold (user-gated).

**Files touched (15):** `README.md` · `SETUP.md` · `CLAUDE.md` · `AGENTS.md` · `MIGRATION.md` · `compass/config.yaml` · `compass/workflows/build.md` · `compass/workflows/scan.md` · `compass/workflows/fix.md` · `compass/workflows/ops.md` · `compass/workflows/create-story.md` · `compass/workflows/create-bet-portfolio.md` · `compass/workflows/setup-foundation-architecture.md` · `.claude/skills/dashboard/SKILL.md` · `.claude/skills/scan/SKILL.md` (+ this file). Counter: #76. 4 of 5 before Retro #016 → next retro fires after #77.

---

### 2026-06-11 — reviewer/automation task-ownership reconciliation (#77)

**Friction:** The v0.3.33 Reviewer→Automation split updated `automation.md` + CHANGELOG but never swept `reviewer.md` (frozen at v0.3.16, still declaring "Write E2E tests — the only place you write code" + a full `write-e2e-tests` task definition) or `build.md` Step 2 (still dispatching `reviewer.write-e2e-tests`). Two agents owned the same task; the dispatch graph routed E2E authoring to the agent the framework's own changelog said no longer owns it. Found by the independent review (finding C2). 1st instance of `[pre-push-grep-discipline]` retroactively; #76 is the 2nd.

**Change (IMPLEMENTED):**

- `compass/agents/reviewer.md` → v0.3.37: removed `write-e2e-tests` task + all E2E-ownership language. Identity is now single-purpose (PR review, read-only on ALL code); `[role-boundary]` principle, refusal rules, and framework-knowledge refs updated to point E2E ownership at `compass/agents/automation.md`.
- `compass/workflows/build.md` Step 2: `reviewer.write-e2e-tests` → `automation.write-e2e-tests` (dispatch line, task definition pointer, COMPASS_ROLE_BOUNDARY markers role=reviewer→automation, sequencing note, verification checklist, roles-invoked list + automation.md added). v0.3.23 migration-history note annotated with the later split.
- `compass/orchestrator/README.md` host-routing example: Step 2 row → `automation.write-e2e-tests` `[claude, codex, gemini]` → Claude API.
- `compass/roles/reviewer.md` legacy banner: task list corrected.
- `compass/orchestrator/run.py` `_write_rejection_note`: rejection-note rerun hint was `--from-step <gate step>` (re-asks approval of the unchanged rejected artifact) while the console hint correctly said `<gate step − 1>`; both now agree on the producing step (review finding C10). 15/15 tests pass (unittest).

**Files touched (6):** `compass/agents/reviewer.md` · `compass/workflows/build.md` · `compass/orchestrator/README.md` · `compass/orchestrator/run.py` · `compass/roles/reviewer.md` · `compass/workflows/improvements.md`. Counter: #77. 5 of 5 → **Retro #016 fires next.**

---

### 2026-06-11 — Retro full-surface audit step (#78)

**Friction:** Retro #016's meta-observation, confirmed by user directive same day: retros read the improvements log, so they catch process drift but are structurally blind to artifact drift — stale docs in files nobody touched. A zero-context reviewer found in one pass (11 critical findings, 13 inconsistencies) what 12 consecutive on-time retros did not, because the drift lived in README/SETUP/CLAUDE.md/build.md, not in the log the retro reads. User direction (verbatim intent): "when we do retro — we look at the entire codebase and not just the improvements."

**Change (IMPLEMENTED):**

`compass/workflows/retro.md` — new mandatory Process step 6 for framework + project altitudes: **full-surface audit**. Preferred method: dispatch an independent context-free reviewer agent over the full artifact surface, treating output as claims-to-verify per `[independent-review-as-signal-source]` (Retro #016, 1 instance). Minimum bar: mechanical sweep (version strings, "N of M" counts, `compass/roles/` refs, task-ownership cross-checks, dead refs, doc-claims-vs-code spot-checks). Verification checklist gains a gate item: audit performed, method named, findings verified, each with disposition (fixed-in-batch / watch-for / refuted). Skipping the audit at these altitudes is a gate failure.

`compass/templates/retro.md` — new **Full-surface audit** section (method + verified-findings table with dispositions) between Drift signals and Trigger-origin analysis. Leaf altitudes may mark n/a.

Retro still reports, never prescribes — audit findings become improvements via normal triggers.

**Files touched (3):** `compass/workflows/retro.md` · `compass/templates/retro.md` · `compass/workflows/improvements.md`. Counter: #78. 1 of 5 before Retro #017 (fires after #82).

---

### 2026-06-11 — orchestrator halt-not-skip on missing host/agent (#79)

**Friction:** Independent-review finding C4 (highest-severity blind spot): `run.py` handled a missing agent file or unavailable host with warn-and-`continue`. A `/build` run with neither `OPENAI_API_KEY` nor `GEMINI_API_KEY` set silently skipped the Reviewer step and proceeded to merge constraints — the run shipped with NO independent review, directly violating the "No silent skips" principle and hollowing out the framework's central cross-model-review invariant.

**Change (IMPLEMENTED):**

`compass/orchestrator/run.py` — both skip sites now **halt with exit code 2** and an actionable message (which key to set, how to resume with `--from-step N`). New explicit escape hatch: `--skip-missing` flag restores skip behavior but prints a loud `STEP N SKIPPED (explicit --skip-missing)` line and instructs that the skip be logged as a DRI Decision — skips are now a deliberate, visible operator choice, never a default. Flag threaded through single-workflow and pipeline modes. Verified: run.py parses, `--dry-run` walks the graph correctly, 15/15 tests pass.

**Files touched (2):** `compass/orchestrator/run.py` · `compass/workflows/improvements.md`. Counter: #79. 2 of 5 before Retro #017 (fires after #82).

---

### 2026-06-11 — HITL gate-detection hardening + first graph.py tests (#80)

**Friction:** Independent-review finding C5: `graph.py` detected HITL gates with a single exact regex (`\*\*Dispatches:\*\*\s+HUMAN`). Any formatting variation — `Dispatches: **HUMAN**`, `**Dispatches**: HUMAN`, an em-dash — parsed as a "workflow-level step," which `run.py` skips with a print. A markdown formatting nit could silently delete a human approval gate, the worst possible parser failure given README's HITL promise. graph.py (the module the whole orchestrator stands on) had zero tests.

**Change (IMPLEMENTED):**

`compass/orchestrator/graph.py` — formatting-tolerant gate detection: any bold/colon/dash placement on the Dispatches line (`^[*_>\s-]*Dispatches[*_\s:—–-]*HUMAN\b`, multiline + case-insensitive) OR `\bHITL\b` in the step title. Failure direction is now safe: a false positive adds a visible gate; the old failure removed one invisibly. Verified zero behavior change on all 4 current dispatch-graph workflows (same step counts, same gate positions).

`compass/orchestrator/tests/test_graph.py` (NEW) — 17 tests: 8 HITL-detection cases (canonical + 4 formatting variants + title marker + 2 negative cases incl. HUMAN-in-prose), 5 step-parsing cases (backtick agent.task, Task-definition file resolution, workflow-level steps, section scoping, markup stripping), 4 integration tests parsing the real setup-product/build/create-brief/create-bet-architecture graphs and asserting gate positions. Suite: 32/32 pass (`python3 -m unittest discover -s compass/orchestrator/tests`).

**Note:** 2nd instance of `[test-alongside-implementation]` (1st: #72 logger tests) — new parsing behavior shipped with its tests in the same commit. Candidate now at the 2-instance threshold from Retro #015's watch-for.

**Files touched (3):** `compass/orchestrator/graph.py` · `compass/orchestrator/tests/test_graph.py` (NEW) · `compass/workflows/improvements.md`. Counter: #80. 3 of 5 before Retro #017 (fires after #82).

---

### 2026-06-11 — orchestrator small-fix batch from independent review (#81)

**Friction:** Independent-review Bucket-D nits, batched: (1) `router.py` hardcoded `gpt-4o` as the OpenAI default — a dated model for the framework's most load-bearing dispatch (independent review) — plus `gemini-2.0-flash`, with no override surface except per-run `--model`; (2) `max_tokens: 8096` typo (intended 8192); (3) HITL rejection exited with code 0 — CI/pipeline callers read a halted run as success; (4) `docs/role-activity/`, `docs/workflow-runs/`, `docs/orchestrator-runs/` were referenced by every agent's logging section but absent from the kit — first append depended on each host creating directories; (5) `compass/orchestrator/README.md` options table documented only alpha-2 flags (8 shipped flags missing).

**Change (IMPLEMENTED):**

- `compass/orchestrator/hosts/router.py` — `DEFAULT_MODELS` map (claude-opus-4-8 / gpt-5 / gemini-2.5-pro) with `COMPASS_MODEL_<CLAUDE|OPENAI|GEMINI>` env-var override layer (precedence: `--model` flag > env var > default). Keeps model pinning out of code per the LLM-agnostic-scripts discipline. `max_tokens` 8096 → 8192.
- `compass/orchestrator/run.py` — HITL rejection now exits 1 (halted ≠ success). Exit-code contract: 0 complete · 1 HITL rejection · 2 missing host/agent without `--skip-missing`.
- `docs/role-activity/.gitkeep` + `docs/workflow-runs/.gitkeep` + `docs/orchestrator-runs/.gitkeep` (NEW) — kit now ships the log directories agents append to.
- `compass/orchestrator/README.md` — options table completed (--compass-dir, --pipeline, --from-step, --bet, --full-project, --skip-missing, --log/--dri/--hitl-log) + exit-code contract documented. Closes review inconsistency I12.

Verified: 32/32 tests pass; env-override precedence unit-checked.

**Files touched (8):** `compass/orchestrator/hosts/router.py` · `compass/orchestrator/run.py` · `compass/orchestrator/README.md` · `docs/role-activity/.gitkeep` (NEW) · `docs/workflow-runs/.gitkeep` (NEW) · `docs/orchestrator-runs/.gitkeep` (NEW) · `compass/workflows/improvements.md`. Counter: #81. 4 of 5 before Retro #017 (fires after #82).

---

### 2026-06-11 — `[pre-push-grep-discipline]` codified (#82)

**Friction:** Pattern hit its threshold with the user's deferral conditions met (post-MVP + 2nd instance). Instances: (1) 2026-06-08 consumer Codex session — 4 rounds of rename sweeps + 30-day-window drift caught by the paid reviewer instead of a free grep (user's verbatim commit note: "grep the full artifact + neighbors for old phrasing before pushing. That would have caught this one before Codex got a turn"); (2) v0.3.36 migration shift unswept across 13+ files (#76); (3) v0.3.33 reviewer→automation split unswept for ~2 days (#77). Root cause: Principle #17's mechanical gate lives only in consumer-facing `/build` Step 7 — framework-edit sessions had no equivalent. **User decision 2026-06-11: codify.**

**Change (IMPLEMENTED, v0.3.38):**

- `compass/scripts/pre-push-consistency-check.py` (NEW) — takes the old phrasing of an amended concept; greps tracked text files; excludes append-only history (CHANGELOG, improvements.md, retros/) by default with `--include-history` override; exit 1 on hits. **Validated on first real run:** caught `compass/framework/mvp.md` still citing the phantom `compass run` CLI that #76 swept everywhere else — fixed in this commit (4th instance, same-session).
- `compass/framework/canon.md` — `### pre-push-grep-discipline` entry: 6th enforcement-class member; catalog 7 shapes / 19 patterns; anti-pattern `grep-class-work-to-reviewer`; orchestrator pre-Reviewer-dispatch sub-step DECLARED per `[declare-not-implement]`.
- `CLAUDE.md` — host-runtime discipline rule 8: run the script before committing any load-bearing amendment; sweep hits in the SAME commit or justify in DRI.
- `AGENTS.md` — catalog counts 18→19 / enforcement 5→6; Principle #17 element 2 names the script as the framework-edit-session gate.

**Self-check disposition (the discipline applied to its own codification):** script run on "7 shapes / 18 patterns" + "enforcement (5)" returned 3 hits, all in canon.md "catalog grows from X → Y" lines — justified as point-in-time historical records by canon convention (same class as the excluded history files). No unswept mentions.

**Files touched (6):** `compass/scripts/pre-push-consistency-check.py` (NEW) · `compass/framework/canon.md` · `CLAUDE.md` · `AGENTS.md` · `compass/framework/mvp.md` · `compass/workflows/improvements.md`. Counter: #82. **5 of 5 → Retro #017 fires next** (first retro under the #78 full-surface-audit rule).

---

### 2026-06-11 — `[consumer-as-primary-signal]` promoted to Principle #19 (#83)

**Friction:** Carried as promotion-ready since Retro #015 (5+ instances across Retros #013–#015: crypto-app prod defects → #50/#51 · v0.1 migration pain → #65 · 12 cross-artifact drift instances → #71 · hitl.jsonl gap from live consumer run → #72 · CB-3.3 retro signals → 4 anti-patterns). **User decision 2026-06-11: promote.**

**Change (IMPLEMENTED, v0.3.39):**

- `AGENTS.md` — **Principle #19**: consumer friction is the primary codification trigger; improvement entries name their trigger origin; no-consumer-origin entries say so explicitly and verify against `ceremony-without-constraint`; retro Trigger-origin analysis tracks the per-batch ratio (consecutive zero-consumer batches = drift signal, not violation). Anti-pattern: `synthetic-improvement-bias`. Catalog counts → 7 shapes / 20 patterns, scope-discipline (4).
- `compass/framework/canon.md` — `### consumer-as-primary-signal` entry (4th scope-discipline member) with the 5 promotion instances, **honest counter-evidence** (two consecutive zero-consumer batches #73–#82 immediately preceding promotion; single-active-consumer concentration), and relationships to `[user-as-load-bearing-oversight]` (corrects execution vs directs evolution) + `[independent-review-as-signal-source]` (complementary signal classes).

**Trigger origin (per the new principle, applied to itself):** user decision + retro accumulation — no NEW consumer instance this batch; the promotion packages 5 prior consumer-driven instances. Not ceremony: the principle adds two mechanical obligations (origin naming per entry; explicit no-consumer-origin flag) that change how every future entry is written.

**Pre-push sweep:** run on "19 patterns" / "scope-discipline (3)" — 4 hits, all canon grows-from→to historical lines, justified per point-in-time convention.

**Files touched (3):** `AGENTS.md` · `compass/framework/canon.md` · `compass/workflows/improvements.md`. Counter: #83. 1 of 5 before Retro #018 (fires after #87).

---

### 2026-06-12 — #70 implementation slice: requirement gates + artifact promotion + manual approval bridge (#84)

**Trigger origin (Principle #19):** consumer — #70's architecture was declared from a live consumer orchestrator run (2026-06-09/10, crypto-app cycle: approvals vanished, gates unsatisfiable); the independent review (2026-06-11) confirmed the gap as findings C3 + C6. Retro #017 put it on a hard-line clock (3 batches deferred).

**Friction:** Orchestrator output landed only in `docs/orchestrator-runs/step-NN-*.md` — canonical artifacts were never written, so every downstream workflow's preconditions were mechanically unsatisfiable and `--pipeline` chains were gate-broken by design (C3). run.py never evaluated workflow Preconditions at all. And the two approval mechanisms were incompatible: manual = `status:` frontmatter flip; orchestrator = hitl.jsonl record; newer agent gates (EA, tech-writer) checked only hitl.jsonl — unsatisfiable manually (C6).

**Change (IMPLEMENTED, v0.4.0-alpha-6 / agents v0.3.40):**

- **Requirement gates:** `requires_approved:` workflow frontmatter (graph.py `load_workflow_meta()`, no YAML dependency) checked before dispatch via `_requirement_met()` — **dual acceptance during v0.3.x:** approved hitl.jsonl record (latest decision per path wins) OR `status: approved` frontmatter. Unmet → halt exit 3 naming the producing workflow + the `--approve` remedy; `--dry-run` reports without halting; `<bet-id>` resolved from `--bet`. Declared on create-brief / create-bet-architecture / build.
- **Artifact promotion:** HITL steps declare `**Artifact target:**` (parsed tolerantly into `WorkflowStep.artifact_target`). On approval the gated draft is promoted — `## Output summary` tail stripped, `status: approved` + `approved:` + `source_run:` frontmatter set — via new `connector.py` (filesystem backend only per `[declare-not-implement]`; unimplemented configured connectors fall back with an honest label). hitl.jsonl gains `canonical_path`; `connector` now populated. Approval is the write trigger, exactly as #70 declared.
- **Manual bridge:** `--approve PATH` / `--reject PATH [--feedback]` CLI — one command satisfies BOTH mechanisms (frontmatter flip + journal record, `workflow: "manual"`). EA + tech-writer gates updated to dual acceptance (v0.3.40); SETUP.md presents both approval paths as equivalent; orchestrator README documents gates/promotion/exit code 3.
- **Tests:** `tests/test_gates.py` (NEW, 22 tests) — suite 32 → 54, all green. **`[test-alongside-implementation]` 3rd instance.**
- **Verified end-to-end without API keys:** live create-brief halts exit 3 → `--approve` both foundation docs → gate passes via journal path AND via frontmatter path independently; all 4 dispatch graphs dry-run clean; bet-scoped requirements correctly demand `--bet`.

**What stays declared, not built:** real Confluence/Notion connector backends (interface documented in connector.py); gate wiring for the 13 non-dispatch-graph workflows (C7 track); runs.jsonl step-completion gating for resume.

**Files touched (14):** `compass/orchestrator/connector.py` (NEW) · `compass/orchestrator/graph.py` · `compass/orchestrator/run.py` · `compass/orchestrator/logger.py` · `compass/orchestrator/README.md` · `compass/orchestrator/tests/test_gates.py` (NEW) · `compass/workflows/setup-product.md` · `compass/workflows/create-brief.md` · `compass/workflows/create-bet-architecture.md` · `compass/workflows/build.md` · `compass/agents/enterprise-architect.md` · `compass/agents/tech-writer.md` · `SETUP.md` · `CHANGELOG.md` (+ this file). Counter: #84. 2 of 5 before Retro #018 (fires after #87). **Hard-line clock on #70 cleared.**

---

### 2026-06-12 — #85: setup-foundation-architecture → dispatch graph + C7 reconciliation

**Trigger origin (Principle #19):** framework-internal — independent-review finding C7 (dual source of truth) + the strategic decision to open the orchestrator's full chain. No new consumer signal this batch; the gap blocks consumer pipeline runs (kindtree bootstrap needs this workflow), so the work is upstream of the next consumer validation, not ceremony.

**Friction:** `/setup-foundation-architecture` was the 363-line embedded-methodology holdout (last at v0.3.2). Its EA agent task (v0.3.36) and the workflow had diverged: the workflow held the rich method (fitness functions, 6-category research, 5-category signal consultation, anchor + 4 cascading elicitations, constraints, per-target canary gate); the agent task held only research + 9-axis data model + Well-Architected scoring. Which one ran depended on which file the host loaded — the `embedded-methodology` anti-pattern C7 named. It also blocked the orchestrator's end-to-end chain: `create-brief` now machine-requires an approved `architecture.md`, but nothing orchestratable produced one.

**Change (IMPLEMENTED):**

- `compass/agents/enterprise-architect.md` → v0.3.41: the single two-phase `setup-foundation-architecture` task split into three dispatchable tasks — `research-architecture` (fitness functions + 6-category research + 5-category signal consultation), `derive-architecture` (data-model-before-stack + anchor + 4 cascading elicitations + constraints + Well-Architected + ADRs + compose), `scaffold-foundation` (plan → confirm → scaffold → config → per-target canaries). **All legacy methodology reconciled IN — nothing dropped.** Added orchestrator-mode degradation note (text-only hosts present option-sets + recommendation; the HITL gate is where the human confirms picks) and a filesystem-host note on scaffolding/canaries. Anti-patterns section absorbed the 6 workflow anti-patterns.
- `compass/workflows/setup-foundation-architecture.md` → v0.3.41: 363-line embedded workflow → thin 6-step dispatch graph (`research-architecture` → HITL → `derive-architecture` → HITL → `scaffold-foundation` → `delivery-manager.update-status`). `requires_approved: [docs/foundation/product.md]`; both HITL gates carry `**Artifact target:**` for #84 promotion (research doc + architecture.md). **5th workflow in dispatch-graph shape.**
- Agent file is now the single source of truth; dual-source-of-truth drift (C7) closed.

**Verified:** graph parses to 6 steps (gates at 2 + 4 with correct artifact targets); dry-run passes the `requires_approved` gate on an approved product.md and walks all 6 steps; full suite 55 tests green (+1 SFA integration test in test_graph.py).

**Files touched (5):** `compass/agents/enterprise-architect.md` · `compass/workflows/setup-foundation-architecture.md` · `compass/orchestrator/tests/test_graph.py` · `AGENTS.md` (4→5 of 17) · `SETUP.md` (4→5 dispatch graphs) (+ this file). Counter: #85. 3 of 5 before Retro #018 (fires after #87).

---

### 2026-06-14 — #86: create-story → dispatch graph; full bootstrap→build chain now orchestratable

**Trigger origin (Principle #19):** framework-internal — completes the strategic "open the full chain" arc (paired with #85). No new consumer signal this batch; this is the last gap blocking an end-to-end consumer pipeline run (kindtree bootstrap), so it is upstream of the next consumer validation, not ceremony. The pm.md host change additionally draws on prior consumer-signal evidence (see below).

**Friction:** `/create-story` was the second gap in the orchestrator's chain — `/build` requires an approved story, but nothing orchestratable produced one. Its drift was the INVERSE of #85's: the workflow held the full method while `compass/agents/pm.md` → `decompose-bet-to-story` was a 2-line stub pointing BACK at the workflow. That breaks orchestrator dispatch (the agent receives only its own file as system prompt — never the workflow), so a dispatched PM would have no method. Making the task self-sufficient was blocked by pm.md sitting at 7991/8000 of the ChatGPT instructions cap (9 chars free).

**Change (IMPLEMENTED):**

- `compass/agents/pm.md` → v0.3.42: **`chatgpt` dropped from `preferred_hosts`** → `[claude, codex, gemini]`, lifting the 8000-char cap (it is ChatGPT-only). `decompose-bet-to-story` rewritten from a workflow-pointing stub into a full self-sufficient gate/work/postcondition (slice selection · story ID · conditional Designer/UX-Writer · story.md per template · Standard Experience Checklist gate). **Resolves the pm half of `[host-preference-validation]`** — two independent drivers now: (1) consumer-signal evidence (2026-06-08) that ChatGPT underperformed on pm output, (2) the cap blocking orchestration (2026-06-14). `researcher.md` half stays queued. User-approved decision.
- `compass/workflows/create-story.md` → v0.3.42: fat 10-step process → thin 5-step dispatch graph (`pm.decompose-bet-to-story` → conditional `designer.draft-design-spec` + `ux-writer.write-copy` → HITL gate → `delivery-manager.update-status`). `requires_approved: [docs/bets/<bet-id>/brief.md]`; conditional architecture requirement stays in the PM task gate (not machine-checkable unconditionally). HITL gate carries `**Artifact target:**` for #84 promotion. Methodology now lives in the pm task + `compass/templates/story.md` (Standard Experience Checklist already there). **6th workflow in dispatch-graph shape.**
- `AGENTS.md` host table: pm split to its own row with rationale; count 5→6 of 17 + the full-chain statement. `SETUP.md`: 5→6 dispatch graphs.

**Capstone verification — the full chain is open:** scripted end-to-end gate-unlock simulation (`--approve` at each gate) confirmed `/setup-product` → `/setup-foundation-architecture` → `/create-brief` → `/create-bet-architecture` → `/create-story` → `/build` gates unlock in sequence (each via both hitl.jsonl record AND `status: approved` frontmatter paths). Full suite 57 tests green (+2 create-story integration tests).

**Files touched (5):** `compass/agents/pm.md` · `compass/workflows/create-story.md` · `compass/orchestrator/tests/test_graph.py` · `AGENTS.md` · `SETUP.md` (+ this file). Counter: #86. 4 of 5 before Retro #018 (fires after #87).

---

### 2026-06-14 — `[pluggable-graph-executor]`: LLM-as-orchestrator over a mechanical gate floor — DECLARED, not implemented (#87)

**Trigger origin (Principle #19):** framework-internal — surfaced from a user architecture question this session ("can I eventually use Claude as my orchestrator using this architecture"). **No consumer origin** — flagged explicitly per Principle #19. This is a legitimate `[declare-not-implement]` forward-architecture declaration, not ceremony: it names a property the substrate already has and the discipline that must guard it, so the shape is captured before the build. Real consumer friction (the kindtree run's context-composition limits) is the natural validation that would pull it declared → built.

**Realization:** the dispatch-graph + agent-file substrate already separates the *plan* (workflow) from the *executor* (the thing that walks it). Per `[workflow-as-dispatch-graph]` (v0.3.24) + `[agent-as-surface-independent-unit]` (v0.3.14), the executor is swappable. Three surfaces over one substrate: (1) deterministic `run.py` [shipped], (2) Claude Code interactive [shipped], (3) Claude as autonomous orchestrator spawning one subagent per step [this declaration].

**Load-bearing constraint — the mechanical gate floor:** Compass fights soft-spec rationalization (Principle #14). A deterministic loop *cannot* skip a HITL gate or self-review; an LLM orchestrator *can* rationalize past both. So an LLM executor is valid ONLY if gates/routing/promotion stay mechanical tools it MUST call, not judgments it makes. The orchestrator MAY NOT: decide a requirement gate passed (must call `_requirement_met`), self-approve a HITL gate (must stop + `log_hitl`), review code it dispatched (reviewer routes through `router.py` to a non-Claude host), or skip a step silently (#79 rule). **Hybrid, not handoff:** Claude drives judgment-heavy parts (context composition, ambiguity, dynamic conditional dispatch, recovery); the floor stays mechanical. The floor is Principle #14 applied to the orchestrator itself.

**Reuse (thin new module — replaces only the driver):** `graph.py` (parse), `_requirement_met` (gate), `router.py` (reviewer routing/exclusion), `connector.py` (promote), `logger.py` (runs.jsonl + hitl.jsonl), `hitl.py` (prompt). Implementation surface when built: (a) Claude Code `/run <workflow>` skill via Agent/Task subagents, OR (b) Agent-SDK `agent_run.py` headless, tools = `{dispatch_step, check_gate, promote_artifact, log_decision}` — slots in as a 3rd executor beside `run.py`.

**Candidate class:** would be the 4th architecture-discipline-class Compass-original when codified. Codify after a 2nd instance OR once built + validated.

**Files touched (2):** `compass/orchestrator/DESIGN-pluggable-executor.md` (NEW — full design sketch) · `compass/workflows/improvements.md` (+ CHANGELOG [Unreleased]). **No code changed — declared only.** Counter: #87. **5 of 5 → Retro #018 fires next.** Note: batch #83–#87 is the 3rd consecutive zero-consumer batch — a drift signal Retro #018 should weigh per Principle #19; the kindtree validation run is the standing remedy.

---

### 2026-06-14 — `[per-surface-vertical-test]` codified: auth→RLS→render prod-parity test discipline (#88)

**Trigger origin (Principle #19):** **consumer** — the first real end-to-end Compass orchestrator run on a consumer project (**home-app**, 2026-06-14) surfaced it. This breaks the 3-batch zero-consumer streak the moment the chain became runnable (exactly the Retro #018 meta-observation). User directed: codify now.

**Friction:** tests that authenticate with mocked auth / a Supabase service-role (admin) key, or run on a dev-server build, pass green while **bypassing the authorization layer (RLS) and the prod render path (RSC)**. A broken RLS policy or a render-path contract violation therefore ships green locally and fails only in prod. Same local-green/prod-broken class as #50/#51 (RSC prop serialization + `"use server"` export purity) and the Next.js runtime-contract consumer signal — 3rd instance, now on the auth→RLS→render vertical.

**Change (IMPLEMENTED, v0.3.43):**

- `compass/framework/canon.md` — new `### per-surface-vertical-test` entry. **7th enforcement-class member**; catalog 7 shapes / 21 patterns. Rule: every data surface has ≥1 test traversing the real auth → authorization (RLS) → render vertical end-to-end on a prod-like build; mocked-auth / service-role / dev-build does NOT satisfy. Anti-pattern `mocked-auth-green`. Explicitly distinct from `[mechanical-output-verification]` (build-artifact inspection vs test-coverage of the live security+render vertical — complementary layers).
- `compass/agents/automation.md` → v0.3.43: `write-e2e-tests` Work step 6 + postcondition (primary owner of the vertical test).
- `compass/agents/engineer.md` → v0.3.43: `implement-story` step 6 bullet — flag each data surface's vertical-test need for Automation; auth-mocked unit green ≠ RLS/render coverage.
- `/build` verification (Step 2 check) + `/scan` BUILD-08 (new finding) enforce it at workflow + scanner level.
- AGENTS.md catalog: enforcement 6→7, 20→21 patterns. **Swept two stale facts in the same commit (Principle #17):** the AGENTS.md "scope-discipline total 3" prose (stale since #83 made it 4 — fixed to list `[consumer-as-primary-signal]`) and the last "Codex E2E" refs (fix.md Phase 3 + scan-report.md template — stale since the #77 reviewer/automation split; now "Automation E2E").

**Verified:** `pre-push-consistency-check.py` clean on all amended catalog facts; no agent-cap HARD-FAILs; 57 tests green.

**Files touched (8):** `compass/framework/canon.md` · `compass/agents/automation.md` · `compass/agents/engineer.md` · `compass/workflows/build.md` · `compass/workflows/scan.md` · `compass/workflows/fix.md` · `compass/templates/scan-report.md` · `AGENTS.md` · `CHANGELOG.md` (+ this file). Counter: #88. 1 of 5 before Retro #019 (fires after #92). First consumer-origin improvement since the orchestrator-chain arc began.

---

### 2026-06-14 — Test-data cleanup AC: data-mutating E2E must delete or soft-delete its records (#89)

**Trigger origin (Principle #19):** **consumer-rooted user directive** — surfaced from the home-app end-to-end run context: #88 made E2E run the real auth→RLS→render vertical against a prod-like DB, so tests now create real records. User directed that every E2E case carry an AC to clean up DB records after use, "or at least soft-delete them."

**Friction:** real-vertical E2E (#88) against a prod-like DB leaves residue unless tests tear down what they create. Orphaned rows bloat the database, flake later runs (stale data / uniqueness collisions), and risk test data leaking in a near-prod environment. The cleanup expectation was implicit; it needs to be a contracted, verifiable AC.

**Change (IMPLEMENTED, v0.3.44):** companion rule on `[per-surface-vertical-test]` (not a new catalog pattern — a rider on #88, keeps the count honest at 21).
- `compass/agents/automation.md` → v0.3.44: `write-e2e-tests` Work step 7 (teardown deletes OR soft-deletes created records; soft-delete is the floor when hard delete isn't possible — append-only / audit / RLS-restricted) + postcondition.
- `compass/agents/pm.md` → v0.3.44: `decompose-bet-to-story` postcondition — data-mutating stories must carry ≥1 cleanup AC (PM authors it).
- `compass/templates/story.md`: Test-data-cleanup AC requirement note + example AC. **Swept the last stale "Codex writes E2E" ref** here → "Automation writes E2E" (Principle #17; #77 split residue).
- `compass/framework/canon.md`: companion rule + anti-pattern `orphaned-test-data` added to the `[per-surface-vertical-test]` entry.
- `/build` verification (Step 2 cleanup check) + `/scan` BUILD-09 (new finding, Medium).

**Soft-delete nuance (per user):** hard delete is preferred; soft-delete (mark rows deleted/inactive) is the acceptable floor when the table is append-only / audit / RLS-restricted and hard delete isn't possible.

**Verified:** `pre-push-consistency-check.py` clean; 57 tests green (no code paths changed — discipline/doc only).

**Files touched (7):** `compass/agents/automation.md` · `compass/agents/pm.md` · `compass/templates/story.md` · `compass/framework/canon.md` · `compass/workflows/build.md` · `compass/workflows/scan.md` · `CHANGELOG.md` (+ this file). Counter: #89. 2 of 5 before Retro #019 (fires after #92). 2nd consecutive consumer-rooted improvement.

---

### 2026-06-14 — `/fix` + `/ops` → dispatch graphs (#90)

**Trigger origin (Principle #19):** **consumer-rooted user directive** — "we should move fix to the orchestrator and ops as well," arising from the home-app/crypto-app work (the reactive flows are needed on live consumers, and consistency with the now-orchestratable bootstrap→build chain). 3rd consecutive consumer-rooted improvement.

**Friction:** `/fix` and `/ops` were the last two high-traffic reactive workflows still in legacy embedded-methodology prose — un-orchestratable, and a dual-source-of-truth risk (methodology in the workflow vs the agent files). `engineer.fix-bug` was still a v0.3.14 stub ("migration pending; follow fix.md step-by-step"), and `/ops` had no execution-owner task at all.

**Change (IMPLEMENTED, v0.3.45):** both converted to thin dispatch graphs per `[workflow-as-dispatch-graph]` (7th + 8th in dispatch-graph shape).

- `compass/agents/engineer.md` → v0.3.45: `fix-bug` rewritten stub→self-sufficient (gate/work/postcondition: regression-test-first, minimum fix, `[mechanical-output-verification]`, `[per-surface-vertical-test]` flag, contract sweep, PR); **new `apply-ops-change` task** (execute HITL-approved ops plan exactly, open PR if committed files, **test the rollback**, halt for review).
- `compass/workflows/fix.md` → dispatch graph: `support.triage-bug` → HITL (triage confirm) → `engineer.fix-bug` → `automation.write-e2e-tests` → `reviewer.review-pr` (+security auto-engage) → `engineer.respond-to-review` → HITL (merge) → `tech-writer.accumulate-changelog`. `requires_approved: []` (reactive; hygiene fixes have no bet).
- `compass/workflows/ops.md` → dispatch graph: `enterprise-architect.lead-ops-change` → HITL (plan, rollback mandatory) → `engineer.apply-ops-change` → `reviewer.review-pr` (+security on secrets/IAM/network/auth/certs) → `engineer.respond-to-review` → HITL (merge) → `tech-writer.accumulate-changelog`. `requires_approved: []`.
- `participates_in_workflows`: added `fix` to reviewer, tech-writer, security-reviewer (`[explicit-dispatch-surfaces-latent-participation]` — the refactor surfaced their latent fix participation). AGENTS.md catalog: **6 → 8 of 17** dispatch-graph workflows (Principle #17 sweep, same commit).
- Tests: `test_fix` + `test_ops` added to test_graph.py (parse, gate positions, agent dispatch, empty requires). **59 tests green.**

**Caveat recorded:** the orchestrator's hosts are text-only, so orchestrated `/fix` and `/ops` produce text plans, not applied code/infra — actual execution stays interactive (Claude Code, fs/shell). The dispatch-graph shape is the prerequisite for orchestratability + single-source methodology + the future `[pluggable-graph-executor]` (#87), and it benefits interactive execution too (agents own the method).

**Files touched (8):** `compass/agents/engineer.md` · `compass/agents/reviewer.md` · `compass/agents/tech-writer.md` · `compass/agents/security-reviewer.md` · `compass/workflows/fix.md` · `compass/workflows/ops.md` · `AGENTS.md` · `compass/orchestrator/tests/test_graph.py` · `CHANGELOG.md` (+ this file). Counter: #90. 3 of 5 before Retro #019 (fires after #92). Tier-2 reactive workflows done; remaining 9 (create-bet-portfolio, triage, status, plan, measure, scan, metrics, dashboard, retro) are v0.4-beta scope.

---

### 2026-06-14 — Orchestrator product vision doc (strategic artifact, unnumbered)

**Not a numbered framework improvement** — per the `compass/framework/mvp.md` precedent, a strategic/vision artifact doesn't take a counter slot. Recorded here for traceability.

`compass/orchestrator/VISION.md` (NEW) — the orchestrator's product north star, captured in PM-level language at the user's direction (acting as product owner). Core: the orchestrator is a **conductor** running the full product lifecycle (Triage → PM → Architect → Engineer → Reviewer → E2E → SRE → Deploy → Monitor) for new OR existing products; roles hand off down the lifecycle AND delegate sideways on demand (PM→Researcher, etc.); the **whole portfolio runs in parallel**; a **cockpit** shows what's moving / blocked / decisions-waiting-on-me and lets the user act on that queue; HITL sign-off + decision journal are the permanent floor.

Honest gap analysis folded in: most roles exist; **SRE + Monitor are gaps**; sideways delegation is the new capability (→ `[pluggable-graph-executor]` #87); the cockpit already exists split across `/plan` (schedule) + `/status` (decision queue) + `/dashboard` (merged view) — the vision is to **elevate `/status` into a live, actionable, portfolio-wide cockpit fed by `/plan`**. Roadmap: tool-using roles → roles-delegate → cockpit → fill SRE+Monitor → full parallel loop. Cross-ref added from `DESIGN-pluggable-executor.md` (#87 = roadmap step 1).

**Files touched (3):** `compass/orchestrator/VISION.md` (NEW) · `compass/orchestrator/DESIGN-pluggable-executor.md` (Serves: pointer) · `compass/workflows/improvements.md`. No counter increment (strategic artifact).

---

### 2026-06-19 — `[pluggable-graph-executor]` slice 1: read-only tool-using executor (#91)

**Trigger origin (Principle #19):** user direction — "split and start small with the tools, start with fix"; "vision first" + "tool-using roles (full loop)" as the chosen next step. Rooted in the home-app/crypto-app reality that orchestrated code work was blind to the repo. First build toward `compass/orchestrator/VISION.md` roadmap step 1; moves #87 from declared → built (slice 1).

**Friction:** the orchestrator's host adapters were single-shot, repo-blind (`claude.py` = one `messages.create`, no tools, no filesystem). `engineer.fix-bug` emitted code against a *guessed* schema — a draft, not a grounded change. (Distinct from "can't write code" — it can; the gap was no tool loop + no repo access. Corrected framing from the #90 discussion.)

**Change (IMPLEMENTED, v0.4.0-alpha-7):**
- `compass/orchestrator/hosts/tools.py` (NEW) — read-only repo tools `read_file` / `glob` / `grep`, all **sandboxed to `project_dir`** (`_resolve_in_sandbox` refuses any escaping path — the one security-critical function); `execute_tool()` returns model-readable error strings, never crashes. Size/result caps. No writes, no shell (slice 1).
- `compass/orchestrator/hosts/claude.py` — `dispatch_with_tools()`: messages loop with `tools=`, executes each `tool_use` via `execute_tool(..., project_dir)`, feeds `tool_result` back, stops at final text; `max_iterations` runaway backstop; `client` injectable for tests. Existing single-shot `dispatch` unchanged.
- `compass/orchestrator/hosts/router.py` — `dispatch_to_host` gains `tools` + `project_dir`; routes to `dispatch_with_tools` only when `tools` set AND host is Claude; all other paths unchanged.
- `compass/orchestrator/run.py` — `_read_agent_tools()` parses `executor_tools:` frontmatter (named distinctly from the abstract `required_tools`/`optional_tools`); passed at the dispatch site with `project_dir`; prints `(tools: …)` when active. `--dry-run` + single-shot agents unaffected.
- `compass/agents/engineer.md` → v0.3.46: `executor_tools: [read_file, glob, grep]`; `implement-story` + `fix-bug` note that on a tool-capable host they read the real repo via tools (don't guess the schema).
- Tests: `tests/test_tools.py` (NEW, 14) — sandbox path-escape refusal (relative + absolute), read/glob/grep, unknown-tool + missing-arg error strings, the dispatch loop via a fake client (tool→tool_result→final; immediate-final; max-iterations backstop), `executor_tools` parse (present/absent/real engineer.md). **73 total, green.** `[test-alongside-implementation]`.

**Mechanical floor preserved:** gates, HITL, promotion, logging, exit codes, reviewer-exclusion all unchanged — only the implementer's dispatch gained tools (#87 invariant).

**Out of scope (this slice):** writes, shell, openai/gemini tool-use, Agent SDK, LLM-as-driver. **Slice 2 (next, user-prioritized "full loop"):** add `write_file` + `bash` (apply fix + run regression test fail→pass), guarded by agent refusal rules; re-evaluate Claude Agent SDK there.

**Files touched (7):** `compass/orchestrator/hosts/tools.py` (NEW) · `compass/orchestrator/hosts/claude.py` · `compass/orchestrator/hosts/router.py` · `compass/orchestrator/run.py` · `compass/agents/engineer.md` · `compass/orchestrator/tests/test_tools.py` (NEW) · `CHANGELOG.md` (+ this file). Counter: #91. 4 of 5 before Retro #019 (fires after #92).

---

### 2026-06-19 — `[pluggable-graph-executor]` slice 2: write+verify loop (#92)

**Trigger origin (Principle #19):** user direction — "lets go with slice 2," the full read→write→verify loop prioritized over alternatives. Continues #91 toward `VISION.md` roadmap step 1 (tool-using roles). The riskiest slice (autonomous writes + shell on a real repo), so the safety model is the load-bearing part.

**Friction:** after slice 1, orchestrated `/fix` could *read* the real repo but still only emitted a diff — it couldn't apply the fix or run the regression test (the `fix-bug` discipline of test-fails-then-passes can't be verified without execution).

**Change (IMPLEMENTED, v0.4.0-alpha-8):**
- `compass/orchestrator/hosts/tools.py` — `write_file` (sandboxed via `_resolve_in_sandbox`, size-capped) + `bash` (cwd=project root, **denylist `_screen_bash` mechanizing the framework refusal rules**: force-push, `--no-verify`, `--no-gpg-sign`, `reset --hard`, `clean -f`, `branch -D`, `rm -rf`, sudo, chmod 777, mkfs/dd-to-device, fork bomb, curl|sh; + `BASH_TIMEOUT_S` + output cap). `schemas_for(names, allow_write)` resolves declared `executor_tools` → schemas, dropping write tools unless opted in.
- **Opt-in safety model:** new `run.py --allow-write` (default OFF). Without it, executor_tools are filtered to read-only (slice-1 behavior preserved). **Two defense layers:** (1) `schemas_for` keeps write/bash out of what the model can even call; (2) `execute_tool(..., allow_write)` refuses them anyway if reached. `bash` adds the denylist as a third. run.py prints the granted tools + `read-only`/`read+write` mode.
- `compass/orchestrator/hosts/claude.py` + `router.py` — thread `allow_write` + the granted schema list through `dispatch_with_tools` → `execute_tool`.
- `compass/agents/engineer.md` → v0.3.47: `executor_tools: [read_file, glob, grep, write_file, bash]`; `fix-bug` + `implement-story` describe the write-mode apply→verify loop and that bash refusals must NOT be bypassed (human still approves merge).
- Tests: +12 (`TestWriteGating` + `TestBashSafety`) — schema filtering on/off, execute-layer refusal without opt-in, write sandbox + path-escape, bash denylist (force-push / --no-verify / reset --hard / rm -rf / sudo), safe command runs in sandbox, bash refused without --allow-write. **85 total, green.**

**Decision (re-evaluated per plan):** stayed **hand-rolled** at the host-adapter layer rather than adopting the Claude Agent SDK — the slice-1 loop already existed, adding two guarded tools was incremental, and it preserves multi-host symmetry + `[llm-agnostic-scripts]`. The Agent SDK's robust edit/bash engine would only pay off for a much more open-ended agent than the bounded fix loop.

**Mechanical floor preserved:** gates, HITL (still gates the merge), promotion, logging, reviewer-exclusion all unchanged. The orchestrator still does not auto-commit/push — write mode touches the working tree; the human approves.

**Files touched (6):** `compass/orchestrator/hosts/tools.py` · `compass/orchestrator/hosts/claude.py` · `compass/orchestrator/hosts/router.py` · `compass/orchestrator/run.py` · `compass/agents/engineer.md` · `compass/orchestrator/tests/test_tools.py` · `CHANGELOG.md` (+ this file). Counter: #92. **5 of 5 → Retro #019 fires next.** The text-only gap (from the #90 discussion) is now closed for Claude implementer steps under explicit opt-in.

---

### 2026-06-19 — mechanical consistency check + git hook (#93)

**Trigger origin (Principle #19):** framework-internal — **three consecutive retro audits** (#017/#018/#019) caught the same drift classes (stale counts, hardcoded version self-claims) that a commit-time check computes for free. Top watch-for from Retro #019. Not consumer-rooted, flagged explicitly per Principle #19 — but it's a force-multiplier that makes every consumer-facing change cheaper to keep clean, not introspection-for-its-own-sake.

**Friction:** `pre-push-consistency-check.py` (#82) needs the human to name the amended term, so it only runs when someone remembers. The audits kept finding drift at retro-time that should have been blocked at commit-time. The discipline existed; the enforcement didn't.

**Change (IMPLEMENTED, v0.4.0-alpha-9):**
- `compass/scripts/consistency-check.py` (NEW) — computes + verifies three invariants, no arguments: (1) dispatch-graph count (AGENTS.md "N of 17" == actual `## Dispatch graph` workflows), (2) catalog count (AGENTS.md "7 shapes / N patterns" == canon `### ` entries), (3) version self-claims (no hardcoded `alpha-<N>` in README/CLAUDE/orchestrator run.py+README — CHANGELOG is the single source). Importable check functions + exit-1-on-drift main.
- `compass/scripts/githooks/pre-commit` (NEW) — runs the check + orchestrator tests; committable/shared via `git config core.hooksPath compass/scripts/githooks`.
- `.github/workflows/consistency-check.yml` (NEW) — the enforced CI layer (check + tests on push/PR).
- CLAUDE.md rule 9 + `compass/scripts/README.md` entry document it.
- Tests: `tests/test_consistency.py` (NEW, 5) — repo self-consistent on HEAD + each drift class detected in a synthetic mirror. **90 total, green.**

**Relationship to #82:** rule 8 (`pre-push-consistency-check.py`) is the human-named term-sweep; rule 9 (`consistency-check.py`) is the computable backstop. Together they close the Principle #17 gap for framework-edit sessions — the gap that had no commit-time gate.

**Why not a new canon pattern:** this is the mechanical defense for existing Principle #17 / `[pre-push-grep-discipline]`, like `check-agent-cap.py` is for `[agent-file-compression]` — a script, not a new pattern. Catalog unchanged at 21.

**Files touched (6):** `compass/scripts/consistency-check.py` (NEW) · `compass/scripts/githooks/pre-commit` (NEW) · `.github/workflows/consistency-check.yml` (NEW) · `compass/orchestrator/tests/test_consistency.py` (NEW) · `CLAUDE.md` · `compass/scripts/README.md` (+ this file). Counter: #93. 1 of 5 before Retro #020 (fires after #97). Closes the 3-retro-old "mechanize the pre-push check" watch-for.

---

### 2026-06-19 — codify `[test-alongside-implementation]` (#94)

**Trigger origin (Principle #19):** framework-internal — long-flagged codification-ready (since Retro #015), repeatedly named "the clearest pending codification," user-gated; "keep going" + ~7 instances triggered it. Not consumer-rooted (flagged per Principle #19); it's a discipline already universally followed, now written to canon so it binds future work.

**Friction:** the discipline was perfect-in-practice but un-codified — every orchestrator change shipped tests in-commit, yet nothing bound future (especially non-orchestrator) work to do the same. Promotion had been deferred only by the deliberate-promotion rule, not doubt.

**Change (IMPLEMENTED):**
- `compass/framework/canon.md` — `### test-alongside-implementation` entry: **8th enforcement-class member**, catalog 7 shapes / 22 patterns. Anti-pattern `tests-later`. ~7 instances cited (#72, #80, #84, #85/#86, #91, #92, #93). Explicitly distinct from `[per-surface-vertical-test]` (consumer product tests) — this is framework engineering (Compass testing its own orchestrator).
- `AGENTS.md` — catalog 21→22, enforcement 7→8, member added.
- `CLAUDE.md` — rule 10 (ship tests with new orchestrator/script write paths, same commit).

**Versioned `v0.3.47` (framework-era), NOT `v0.4.0-alpha-N`** — and that correction was forced by #93's own check: the consistency-check flagged `alpha-10` in CLAUDE.md rule 10 (a canon-citation colliding with the orchestrator-self-claim ban). Lesson encoded: **canon entries cite the framework version (v0.3.x), the orchestrator alpha-N lives only in CHANGELOG** — which keeps citations distinguishable from self-claims and keeps the check unambiguous. **#93 caught a real drift in #94 within minutes of shipping — the mechanization proving itself immediately.**

**Catalog sweep (Principle #17, same commit):** canon now 22 entries → AGENTS.md updated to 22; consistency-check.py confirms agreement (the check now guards this invariant). 90 tests green.

**Files touched (4):** `compass/framework/canon.md` · `AGENTS.md` · `CLAUDE.md` · `CHANGELOG.md` (+ this file). Counter: #94. 2 of 5 before Retro #020 (fires after #97). Clears the longest-standing codification candidate.

---

### 2026-06-19 — `[conditional-dispatch]` / triage-as-router — DECLARED, not implemented (#95)

**Trigger origin (Principle #19):** user reasoning during the write-mode `/fix` live-test discussion — "fix means there *is* an issue; triage should decide if a fix is even needed." Framework-internal (flagged), but rooted in real workflow reasoning about how reactive work should enter the system.

**Friction:** dispatch graphs are **linear** — every step runs in order; the only control flow is "HITL reject → halt." So a step whose *outcome should choose the next step* can't be expressed. `/fix` therefore presumes its outcome: triage runs as step 1 and *can* conclude "no fix needed" (duplicate / not-reproducible / L1-close / won't-fix / escalate-to-brief), but the graph can only model that as a blunt HITL-reject halt — not as triage **routing** the work to the right destination.

**Declared shape (`[conditional-dispatch]`):**
- **Mechanism — conditional/branching dispatch.** A step declares branch outcomes; the orchestrator selects the next step from the step's classified result, instead of always advancing linearly. Representation TBD at build (e.g., a router step emits a routing decision + the graph declares branch targets); `run.py` gains branch execution. Deterministic branches are possible; an LLM-as-driver (#87 surface 3) does dynamic routing naturally.
- **First application — triage-as-router.** Intake decides and routes: → `/fix` (real bounded defect) · → `/create-brief` (deeper/architectural work) · → close (duplicate / L1 / won't-fix / not-repro) · → `/triage` incident path (production fire). `/fix` becomes a *branch destination*, not the presumed entry. Matches the VISION's Triage-as-front-door role ("routes to the right starting point").

**Mechanical floor still applies:** branches still pass through HITL gates; a "close / won't-fix" outcome is a logged DRI decision, not a silent drop.

**Relationships:** VISION Triage-as-front-door + "roles delegate on demand"; `[pluggable-graph-executor]` (#87) — the LLM-as-driver surface is the natural enabler of dynamic routing (forward-linked from `DESIGN-pluggable-executor.md`). **Natural build point: the `/triage` → dispatch-graph refactor** (the next reactive-workflow refactor), where branching would first earn its place. Candidate architecture-discipline-class member when built.

**Per `[declare-not-implement]`:** declared now (the shape is clear, the build isn't prioritized); build when `/triage` is refactored or the LLM-as-driver surface lands. Codify as canon after a 2nd instance OR once built.

**Files touched (3):** `compass/orchestrator/DESIGN-pluggable-executor.md` (forward-link) · `CHANGELOG.md` · `compass/workflows/improvements.md`. **No code, no canon entry, no catalog change — declared only.** Counter: #95. 3 of 5 before Retro #020 (fires after #97).

---

### 2026-06-19 — /triage → dispatch graph + conditional dispatch built (#96)

**Trigger origin (Principle #19):** user direction — "prioritize the shape change to triage." Builds `[conditional-dispatch]` (declared #95) on `/triage`'s existing fix-forward branch — the natural first instance.

**Friction:** `/triage` (incident response) was legacy prose (9th un-refactored workflow), and its Phase-4 branch ("rollback resolved → postmortem" vs "needs code fix → /fix") was exactly the routing the linear dispatch-graph model couldn't express. Two gaps, one fix.

**Change (IMPLEMENTED, v0.4.0-alpha-10 / triage+support v0.3.48):**
- **Conditional dispatch (first build of #95):** `graph.py` parses a `**Routes:**` block (`- <label> → Step N`, tolerant of →/->) on a HITL step into `WorkflowStep.routes`; `hitl.py:handle_routing_gate` presents labeled branches + returns the human's choice; `run.py` executes forward-only branches via a skip-set (`_skip_for_route(router, target)` — pure, unit-tested), logging the chosen route to hitl.jsonl. Plain HITL gates unchanged.
- **`/triage` → dispatch graph (9th):** `support.triage-incident` → **routing gate** (`resolved` → postmortem, skipping the fix branch · `needs-fix` → `engineer.fix-bug` → `reviewer.review-pr` → reconverge) → `support.write-postmortem` → HITL → `tech-writer.accumulate-changelog`. `requires_approved: []`.
- **New `support.write-postmortem` task** (no existing task owned the postmortem): timeline + RCA + action-items-routable-to-bets/stories + HITL.
- `participates_in_workflows`: +triage on reviewer + tech-writer (support/engineer already had it). AGENTS.md 8→9 of 17 (consistency-check guards it — passed).
- Tests: +6 (route parsing, plain-HITL-has-no-routes, `_skip_for_route` forward/immediate/backward, triage integration). **96 total, green.**

**v1 scope (declared limits):** HITL-routing only (human picks the branch — matches `/triage`'s human-driven ethos); agent-classified/autonomous routing deferred to the LLM-driver surface (#87 surface 3); forward-only branches. No incident discipline dropped (human-driven stop-the-bleed, full-review-under-P0, comms + postmortem HITL gates).

**Mechanical floor preserved:** routing is a HITL decision logged like any gate; promotion/logging/exit-codes/reviewer-exclusion unchanged.

**Files touched (8):** `compass/orchestrator/graph.py` · `compass/orchestrator/hitl.py` · `compass/orchestrator/run.py` · `compass/agents/support.md` · `compass/agents/reviewer.md` · `compass/agents/tech-writer.md` · `compass/workflows/triage.md` · `compass/orchestrator/tests/test_graph.py` · `AGENTS.md` · `CHANGELOG.md` (+ this file). Counter: #96. **4 of 5 → Retro #020 fires after #97.** `[conditional-dispatch]` now has 1 built instance — codify as canon at the 2nd (e.g. the bug-intake router).

---

### 2026-06-20 — tool-loop hardening + event spine (#97)

**Trigger origin (Principle #19):** **consumer run** — the first live write-mode `/fix --allow-write` on home-app surfaced four distinct orchestrator gaps in one go. Strongest single-run consumer signal of the v0.4 build. (The run: a feature-parity request routed through `/fix` — triage correctly flagged it as "enhancement, not a bug," the user pressed Y to try it anyway, and `engineer.fix-bug` blew the 25-iteration cap.)

**Friction (four gaps):**
1. The tool loop printed one line then ran silently through many Claude calls + `bash` runs (each up to 120s) → looked hung.
2. Hitting `max_iterations` returned a backstop *string* that `run.py` treated as a successful result and **advanced to the next step** — a failed loop silently promoted a non-answer (violates the #79 "failures halt" principle).
3. `bash` inherited stdin → a command that reads stdin could block to the timeout.
4. `select_host` picked a host by API-key presence only; with `OPENAI_API_KEY` set but `openai` not installed it chose `chatgpt` then **crashed mid-dispatch** on ImportError instead of falling through to Claude.

**Change (IMPLEMENTED, v0.4.0-alpha-11):**
- `claude.py:dispatch_with_tools` — `on_event` sink (default `_default_tool_event` terminal printer) emits `tool_use`/`tool_result` events per call → progress is visible **and the sink is the event spine** for a future dashboard/Slack delivery layer (answers the "deliver to the user's surface / dashboard-as-orchestrator" question — structured events now, surface routing later). Max-iterations now **raises RuntimeError** → caught by run.py's existing `except` → halts (exit 1), no silent advance.
- `tools.py:_bash` — `stdin=subprocess.DEVNULL`.
- `router.py:select_host` — rewritten around `_has_key` + `_adapter_importable` (`_pkg_importable` via `importlib.util.find_spec`); a host is selectable only if key AND SDK present, else skip to the next. Map: claude→anthropic, codex/chatgpt/openai→openai, gemini→google.generativeai.
- Tests: +9 (max-iter raises, on_event streams, bash-stdin-no-hang, host-selection key+pkg logic). **102 total, green.**

**Event spine = cockpit foundation:** per the user's product question, the orchestrator's terminal output is a dev surface; real users live in Slack/WhatsApp/the dashboard. The `on_event` sink makes progress **structured and routable** — the delivery layer + dashboard-as-orchestrator (VISION cockpit, step 3) plug into it without touching the loop. Declared follow-on.

**Meta-signal:** routing a feature through `/fix` blew the cap — reinforces the **bug-intake router** need (triage routes feature-gaps → `/create-brief`), the #95 follow-on. This run is its Principle-#19 evidence.

**Files touched (5):** `compass/orchestrator/hosts/claude.py` · `compass/orchestrator/hosts/tools.py` · `compass/orchestrator/hosts/router.py` · `compass/orchestrator/tests/test_tools.py` · `CHANGELOG.md` (+ this file). Counter: #97. **5 of 5 → Retro #020 fires next.**

---

### 2026-06-20 — front-door /triage ITIL intake router — DECLARED, not implemented (#98)

**Trigger origin (Principle #19):** **consumer** — two live home-app runs (feature routed through `/fix`; bug routed through `/triage`-incident) where the triage agent *correctly* classified but the linear flow had nowhere to route. User specified the model: ITIL service-desk intake, front-door `/triage` (no separate `/intake`), HITL-confirmed classification.

**Insight:** triage's job is to classify and route, not to presume the outcome. ITIL names the categories and the discipline (categorize → validate → route to the right practice). `/fix` presumed a fix; `/triage` presumed an incident — both wrong for the items they received. The fix is a real front door.

**Declared design (front-door `/triage` = the intake router):**
- **ITIL category → Compass route:** incident → incident-response branch (today's `/triage` flow becomes *one* route) · bug/defect → `/fix` · enhancement / problem (root-cause) → `/create-brief` · change (config/infra) → `/ops` · service request → `/ops` or answer+close · not-an-issue / duplicate / L1 → close (logged).
- **HITL-confirmed classification** — the intake agent proposes the category + rationale; the human confirms/overrides at the routing gate; then dispatch. (ITIL discipline; the #96 routing gate IS the HITL-confirm primitive — already built.)
- **Two entry points for work, both feeding PM** (user's framing): *reactive* — front-door `/triage` classifies incoming items and routes; *proactive* — planned features enter directly via `/create-brief`. PM's inputs = triage-routed work (bugs/enhancements/problems) + proactively-planned briefs.
- **Shape:** classifier step (generalize `support.triage-incident` or add `support.classify-intake`) → #96 routing gate with the full ITIL option set → HITL → dispatch.
- **Build phasing:** **v1 = cross-workflow hand-off** (record route + emit recommended command with the triage note as the input artifact; only *incident* continues inline). **v2 = auto-chain** (orchestrator runs the target workflow directly — cross-workflow dispatch, related to `--pipeline`).

**Relationships:** realizes VISION Triage-as-front-door; ITIL service desk; **2nd `[conditional-dispatch]` instance** (#95 declared, #96 built within-graph, #98 = cross-workflow front-door) → **codify `[conditional-dispatch]` to canon when #98 builds.** No separate `/intake` (user decision).

**Per `[declare-not-implement]`:** declared now (spec clear, build not yet scheduled). No code, no canon entry, no catalog change.

**Files touched (3):** `compass/orchestrator/DESIGN-pluggable-executor.md` (intake-router section) · `CHANGELOG.md` · `compass/workflows/improvements.md`. Counter: #98. 1 of 5 before Retro #021 (fires after #102).

---

### 2026-06-20 — write-mode work lands on a branch, never main (#99)

**Trigger origin (Principle #19):** **consumer** — during the home-app `/fix --allow-write` run the user noticed the orchestrator was editing files on `main`. That violates the framework's own branch→review→merge discipline (and CLAUDE.md's no-write-to-main stance): every fix/feature/ops change should land on a branch, get reviewed, then merge.

**Friction:** write mode (#92) edited the working tree on whatever branch was checked out — `main` by default. The user had to remember to create a throwaway branch manually; forget, and the agent commits straight to main.

**Change (IMPLEMENTED, v0.4.0-alpha-12):**
- `run.py:_work_branch_name(workflow, bet_id, context)` — derives `<type>/<id>-<slug>` per config.yaml `branch_pattern`: type by workflow (fix/ops/triage→fix|ops; build/create-story/brief/bet-arch→feat), id from `--bet` if present, slug from the context (strips a leading `bug:`/`incident:`/`enhancement:`/`change:` label). Pure + tested.
- `run.py:_ensure_work_branch(project_dir, name)` — git ops scoped to `project_dir`: if on `main`/`master`, create+checkout the work branch (carrying any working changes); if already on a non-main branch, reuse it; no-op outside a git repo.
- Called at the top of `_run_workflow` **only when `--allow-write`** (read-only/dry-run runs never touch git), before the step loop. Prints `[branch] write-mode work on '<name>' (not main) — open a PR + merge after review`.
- Tests: +6 (branch-name derivation with/without bet + label-strip + type-by-workflow; `_ensure_work_branch` in a real tmp git repo: creates off main, reuses on a work branch; no-op for non-git). **107 total, green.**

**Scope:** branch creation only; the PR-open + merge-to-main remain manual / the engineer task's `gh pr` (full git-automation is the declared v0.4-beta gap). The point of #99 is that write-mode changes never silently mutate `main`.

**Files touched (3):** `compass/orchestrator/run.py` · `compass/orchestrator/tests/test_tools.py` · `CHANGELOG.md` (+ this file). Counter: #99. 2 of 5 before Retro #021 (fires after #102). Another consumer-signal fix from the live home-app run (with #97).

---

### 2026-06-20 — tool-loop cap: wrap-up instead of abort (#100)

**Trigger origin (Principle #19):** **consumer** — the home-app `/fix --allow-write` run on the login-message bug. The engineer did the *entire* job (wrote test + fix, ran vitest/typecheck/lint/full-suite/build all green, did manifest verification) across ~25 tool calls — then hit #97's cap and **raised, aborting a finished job** before it could summarize or advance to review. The fix on disk was correct; the orchestration threw it away.

**Friction:** #97 made max-iterations raise-and-halt (to stop silent-success-advancing). But a genuine fix+verify loop legitimately needs 25+ calls, so a *complete* run was treated as a failure. Raise-and-abort was too blunt: it discarded completed work and skipped the review step.

**Change (IMPLEMENTED, v0.4.0-alpha-13):**
- `claude.py:dispatch_with_tools` — **default cap 25 → 50**; on reaching the cap, **one final tools-disabled turn** forces a text summary ("what you changed, the check results, remaining steps/risks") instead of raising. Returns that summary + a `[hit the N-iteration cap — review the diff]` note → the workflow advances to review, where HITL decides. A genuinely-stuck run summarizes "incomplete" and is caught downstream; a complete-but-thorough run reports what it did. This is the right reading of #97's intent: don't promote a *non-answer* as success — but a forced honest summary IS an answer, and review is the safety net.
- `--max-tool-iterations N` flag (run.py → router → dispatch_with_tools) to tune per-run.
- **`_slug` (#99 refinement):** drops stopwords so branch names are meaningful — `fix/logging-message-welcome-back-…` instead of `fix/while-logging-in-i-get`.
- Tests: max-iter now wraps up (returns summary, no raise); slug stopword behavior. **107 total, green.**

**The home-app run was a substantive success** (first real grounded+verified write-mode fix on a live consumer bug); #100 makes the orchestration finish cleanly so the *next* one walks itself through to the review gate instead of aborting at the cap.

**Files touched (5):** `compass/orchestrator/hosts/claude.py` · `compass/orchestrator/hosts/router.py` · `compass/orchestrator/run.py` · `compass/orchestrator/tests/test_tools.py` · `CHANGELOG.md` (+ this file). Counter: #100. 3 of 5 before Retro #021 (fires after #102). Third consumer-signal fix from the live home-app run (with #97, #99).

---

### 2026-06-20 — canary should verify a TESTABLE preview/staging, not just a green build — DECLARED (#101)

**Trigger origin (Principle #19):** **consumer** — home-app's Vercel preview can't exercise auth (Supabase redirect URLs don't whitelist the dynamic `*.vercel.app` preview domains; preview-scoped env vars not set). So a login fix can't be verified on preview — and `[per-surface-vertical-test]` (#88) says auth→RLS→render bugs must be tested on a prod-like build. If the consumer has no auth-testable preview/staging, that discipline collapses to "test in prod."

**Gap:** `scaffold-foundation`'s deploy canary (`/setup-foundation-architecture`, #85) verifies the stack **builds + deploys** per target — but not that the preview/staging env is **functionally testable** (env vars present, auth redirect URLs cover preview domains, a real user flow can run). A green build ≠ a testable environment.

**Declared (extends #88 + the scaffold canary):**
- The canary's postcondition should include **"preview/staging is auth-testable"** for any target with authenticated surfaces: preview-scoped env vars present, auth provider redirect/callback URLs include the preview domain pattern, and a smoke auth flow succeeds (or the gap is surfaced as a finding). 
- `/scan` Build/Production-Ready phase gains a check: **"no auth-testable preview"** → finding (you can't run `[per-surface-vertical-test]` without one).
- Companion `/ops` recipe for the common Vercel+Supabase case (preview env vars + Supabase redirect-URL wildcard + deployment-URL-based callback).

**Why it matters:** #88 mandates prod-parity testing; #101 ensures the *environment to do it in actually exists and works*. Without it, the vertical-test discipline is unenforceable on consumers with broken previews — exactly home-app today.

**Per `[declare-not-implement]`:** declared (consumer-evidenced, spec clear); build when the canary/scan work is scheduled. No code, no canon change.

**Files touched (1):** `compass/workflows/improvements.md`. Counter: #101. **4 of 5 → Retro #021 fires after #102.** Fourth consumer-signal item from the home-app session (with #97/#99/#100).

---

### 2026-06-20 — per-worker worktree isolation — DECLARED, not implemented (#102)

**Trigger origin (Principle #19):** **consumer** — user ran two writers against home-app at once (interactive Claude in VS Code + the orchestrator); the branch one created wasn't isolated from the other. Live evidence of the parallelism-isolation problem the VISION's parallel-portfolio depends on.

**The reality:** a single git working directory holds exactly ONE branch. Concurrent writers in the *same* clone fight over the one working tree — `git checkout` by one switches files under the other. `[#99]`'s in-place branch creation is correct for a **solo** run but unsafe for **concurrent** runs. "Each thread keeps its own branch" is unachievable in a shared working dir; the real requirement is **one working directory per worker.**

**Declared design (`[worktree-per-worker]`):**
- When a run could be concurrent (a flag `--worktree`, or auto when another active run is detected for the same repo), the orchestrator creates its own **git worktree** — `git worktree add <.compass-worktrees/<run-id>> -b <branch>` (branch per `[#99]` naming) — and runs there, sharing the one `.git`. No collision with the human's clone or other runs.
- **Remember it:** persist `run_id → {worktree_path, branch}` (in `runs.jsonl` / a small state file) so a resumed/continued run (`--from-step`) reuses the same worktree+branch instead of re-branching.
- **Cleanup:** remove the worktree on completion/merge (auto-remove if unchanged, like the Agent worktree pattern).
- **Human side:** document the discipline — one writer per working dir; run a second concurrent worker in its own worktree (or clone). Interactive Claude Code + orchestrator in the same clone is the anti-pattern.
- **#99 relationship:** in-place branch = the solo path; worktree = the concurrent path. Both honor branch→review→merge.

**Why it matters:** the VISION's "run the whole portfolio in parallel" = many workers at once; without per-worker worktrees they corrupt each other's working trees. This is the concrete isolation mechanism that makes safe parallelism (and the cockpit's "many things in flight") possible. Pairs with the (declared) cockpit + connector/delivery layer.

**Per `[declare-not-implement]`:** declared (consumer-evidenced, mechanism clear — git worktrees); build when parallel execution is scheduled. No code, no canon change.

**Files touched (1):** `compass/workflows/improvements.md`. Counter: #102. **5 of 5 → Retro #021 fires next.** Fifth consumer-signal item from the home-app session (#97/#99/#100/#101/#102).

### 2026-06-20 — front-door `/triage` ITIL intake router BUILT — implements declared #98 (#103)

**Trigger origin (Principle #19):** **consumer** — the two live home-app `/triage` runs that classified items correctly (a feature-as-bug, a bug-as-incident) but had nowhere to route them. Declared as #98 in the same home-app batch; built here per Retro #021's top watch-for ("build the declared backlog, don't just accrue it").

**What shipped:** `/triage` is now the **front door** for every incoming item, not incident-response only.
- **`support.classify-intake`** (new task, support.md v0.3.49) — proposes exactly one ITIL category (incident / bug / enhancement / problem / change / service-request / not-an-issue) by observed impact+urgency, with a one-line rationale + recommended route + an intake summary for hand-off context. Proposes; the human disposes at the gate.
- **Intake routing gate** (triage.md Step 2) — routes `incident` inline (Step 3, the unchanged incident branch), **hands off** `bug`→`/fix`, `enhancement`/`problem`→`/create-brief`, `change`/`service-request`→`/ops`, and `close`s `not-an-issue`. The fix-forward gate renumbered (resolved→7, needs-fix→5).
- **Engine generalization (`[conditional-dispatch]` 2nd instance):** route targets widened from `int` (inline step, #96) to `int | str`. A `str` target is a `/workflow` hand-off or `close`: `graph.py` parses it (`_parse_route_target`), `hitl.py` describes it (`_route_target_desc`), `run.py` logs the decision, prints the recommended command (`_handoff_message`), and ends the run (`break`). The category→workflow mapping lives in the Routes block (data), never hardcoded in the executor. `--dry-run` now renders routing gates with routes.

**Codified to canon:** `[conditional-dispatch]` — Compass-original (v0.3.49), **4th architecture-discipline member**; catalog 22 → **23 patterns**. Two instances: within-graph fix-forward (#96) + cross-workflow ITIL intake (#103). Anti-pattern named: `linear-graph-routing-dead-end`.

**Scope (v1):** HITL-routing only (human confirms every route); hand-off **recommends** the next command (auto-chaining the child workflow with carried context = v2, needs the #87 LLM-driver). Forward-only branches.

**Verification:** consistency-check CONSISTENT (23 patterns, 9 of 17 workflows); `python3 -m unittest discover -s compass/orchestrator/tests` → **114 pass** (+7); `run triage --dry-run` renders the 9-step front-door graph with both routing gates.

**Files touched (8):** `compass/orchestrator/graph.py` · `compass/orchestrator/hitl.py` · `compass/orchestrator/run.py` · `compass/agents/support.md` · `compass/workflows/triage.md` · `compass/framework/canon.md` · `AGENTS.md` · `compass/orchestrator/tests/test_graph.py` (+ CHANGELOG + this file). Counter: #103. **1 of 5 before Retro #022 (fires after #107).** First post-#102 build; converts a declared item to a built one per the Retro #021 watch-for.

### 2026-06-21 — orchestrator event spine (user-local, portfolio-wide) + text cockpit — delivery layer slice 1 (#104)

**Trigger origin (Principle #19):** **framework, built on consumer signal.** Direct continuation of the home-app batch: #97 declared "the orchestrator's terminal output is a dev surface; real users live in Slack/WhatsApp/the dashboard — the `on_event` sink is the event spine the delivery layer plugs into." Retro #021's #1 watch-for was "build the declared backlog (… cockpit), don't just accrue it." User picked this next ("97") and steered the storage decision ("can we store it in the user local").

**The gap:** #97's spine was a stub — `on_event` lived only inside the tool loop (`dispatch_with_tools`), was never threaded through `dispatch_to_host`/`run.py`, emitted only tool events, and had no consumer. There was no way to see what's happening across runs/projects without tailing terminal output per-run.

**What shipped (slice 1 — the cockpit is sliced like #87→#91/#92):**
- **`events.py` (new) — the spine.** Event types (`run_start · step_start · gate_open · gate_decision · handoff · step_end · run_end` + re-homed `tool_use/tool_result/note`); `make_event`; sinks `terminal_sink` / `jsonl_sink` / `multi_sink` (fan-out that isolates a failing sink — telemetry is best-effort); `load_events`; `compass_home()`/`events_path()`.
- **Spine threaded end-to-end.** `run.py` builds one `emit` closure per run (stamps `project`/`run_id`/`workflow`/`bet_id`), emits lifecycle events at every seam **and every exit path** (normal end, rejected gate, hand-off, missing host/agent, dispatch error), and passes `emit` as `on_event` into `dispatch_to_host` → `dispatch_with_tools` so tool events join the same stream. `router.py` forwards `on_event`; `claude.py`'s `_default_tool_event` now aliases `events.terminal_sink`.
- **`cockpit.py` (new) — first consumer.** `python3 -m compass.orchestrator.cockpit` folds the spine into per-run state and renders the VISION view: **⏸ Awaiting your decision** (open gates across every project + ready-to-run approve/reject command), **▶ In flight**, **✓ Done/halted**. `--project` filter, `--limit`, `--home`.

**Key decision — user-local store (user's steer):** the durable spine is `~/.compass/orchestrator/events.jsonl` (`$COMPASS_HOME` override), **not** in the project repo. Rationale: (1) a *portfolio* cockpit must span every project from one place; (2) live telemetry shouldn't churn project git or collide between concurrent worktrees (#102); (3) the in-repo `runs.jsonl`/`hitl.jsonl` stay the auditable per-project decision journal — different purpose, both persist. `--no-events` opt-out; `--dry-run` skips the durable sink. This establishes the `$COMPASS_HOME` convention (none existed before).

**Convention candidate (declared, not codified — 1 instance):** `[telemetry-user-local-not-in-repo]` — live run telemetry lives in `~/.compass`; the in-repo journal stays the audit. Codify on the 2nd instance.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **128 pass** (+14: spine shapes, sinks, fold/render, portfolio grouping, approve-command, + a real `_run_workflow` lifecycle-emit integration test on a host-less halt). consistency-check CONSISTENT (no catalog change — 23 patterns, 9 of 17 workflows). Cockpit smoke test renders a 2-project portfolio (home-app awaiting · crypto-app in flight · home-app done).

**Scope / next slices (out of scope here):** HTML `/dashboard` live tab fed from the spine · Slack/WhatsApp delivery sinks · approve **from** the cockpit inline (v1 = copy-paste; mechanical gate floor stays in run.py) · `--watch` live tail · cross-host tool events. Each is additive — a new sink or reader over the same spine; the loop never changes.

**Files touched (8):** `compass/orchestrator/events.py` (new) · `compass/orchestrator/cockpit.py` (new) · `compass/orchestrator/run.py` · `compass/orchestrator/hosts/router.py` · `compass/orchestrator/hosts/claude.py` · `compass/orchestrator/tests/test_events.py` (new) · `compass/orchestrator/VISION.md` · `compass/orchestrator/DESIGN-pluggable-executor.md` (+ CHANGELOG + this file). Counter: #104. **2 of 5 before Retro #022 (fires after #107).** 2nd consecutive declared-backlog build (after #103) — the Retro #021 watch-for in action.

### 2026-06-21 — Claude prompt caching + usage telemetry on the event spine (#105)

**Trigger origin (Principle #19):** **user directive, cost-driven.** With the cockpit (#104) making orchestrator runs visible, the user flagged that the underlying API spend is heavy and asked for prompt caching (or equivalent) for Claude. Scope confirmed with the user: caching **+** usage telemetry (reduce *and* make observable).

**The cost:** the tool loop in `hosts/claude.py:dispatch_with_tools` re-sent the **full agent-file system prompt + all tool schemas uncached on every iteration**, plus the growing conversation (file reads can be large). A thorough write-mode `/fix` runs dozens of iterations — the same ~2k-token agent file paid for at full price each time.

**What shipped:**
- **Static-prefix caching** — `system` is now a `cache_control` text block (`_cached_system`); the last tool schema carries `cache_control` (`_cached_tools`), caching the whole tools block. Applied in both `dispatch` (single-shot) and `dispatch_with_tools`.
- **Rolling conversation breakpoint** — `_cache_last_message` marks the last message's last dict block before each `create`, caching the growing prefix incrementally. **Keeps exactly ONE rolling breakpoint** (strips the prior one first) so system + tools + 1 ≤ Anthropic's 4-breakpoint cap — a long loop would otherwise overflow. Never mutates the SDK response objects echoed as the assistant turn (only dict blocks we build).
- **Usage telemetry** — `_emit_usage` reads `response.usage` (guarded with `getattr` — the fake test client has none) and emits a `usage` event (`events.USAGE`, #105) with input/output/cache-read/cache-creation tokens after every call (loop + the #100 cap wrap-up + single-shot). `router.py` now threads `on_event` into single-shot `dispatch` too, so non-tool steps are measured. `terminal_sink` renders it compactly (`$ usage: in=… out=… (cache read=… new=…)`).

**Why this is not an `[llm-agnostic-scripts]` violation:** prompt caching is Claude-specific and lives in the Claude **host adapter** (`hosts/claude.py`) — exactly where SDK-specific code belongs. OpenAI auto-caches; Gemini caches explicitly — those are per-adapter follow-ons, not this slice.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **133 pass** (+5: cache_control on system + tools, single rolling breakpoint after a tool turn, usage event with cache fields, no-usage-object safety, USAGE render). consistency-check CONSISTENT (no catalog change — 23 patterns, 9 of 17 workflows).

**Out of scope (follow-ons):** cockpit $-rollup / per-run cost totals from the `usage` events (pairs with the dashboard live feed) · a token→dollar price table · OpenAI/Gemini caching.

**Files touched (5):** `compass/orchestrator/hosts/claude.py` · `compass/orchestrator/hosts/router.py` · `compass/orchestrator/events.py` · `compass/orchestrator/tests/test_tools.py` · `compass/orchestrator/tests/test_events.py` (+ CHANGELOG + this file). Counter: #105. **3 of 5 before Retro #022 (fires after #107).** Pairs with #104 (cost is now both reduced and observable on the spine).

### 2026-06-21 — cockpit cost rollup (#106)

**Trigger origin (Principle #19):** **continuation of the user's cost directive** — the natural next step after #105 (which *emitted* usage events): make the spend *visible where the work is watched*. Closes the #104 (cockpit) + #105 (caching+telemetry) loop.

**What shipped:** `cockpit.py` `fold_runs` now accumulates each run's `usage` events into token totals (`input/output/cache_read/cache_creation` + last-seen `model`); a new **💰 SPEND** render section shows per-project estimated cost + **cache-hit % of prompt tokens**, and a portfolio total with **how much prompt caching saved** (full-input-price baseline − actual input cost). Helpers: `_price_for` (labeled approximate Claude list prices, `$COMPASS_PRICES` override, defaults to the priciest family so it never under-reports), `cost_usd` (accounts for cache read 0.1× / write 1.25× multipliers), `_full_input_cost` (the no-cache baseline). Section omits cleanly when no usage exists.

**Honest framing:** **tokens are exact; dollars are an at-a-glance estimate, not billing truth** (list prices drift; the table is overridable). The savings figure is real signal — it's computed from the cache-read vs full-input token split, independent of the absolute price.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **139 pass** (+6: usage accumulation, cache-aware cost math, savings>0, SPEND present-with-usage / omitted-without, env price override). consistency-check CONSISTENT (no catalog change). Smoke test renders a 2-project portfolio: `home-app ~$0.19 (89% cached) · crypto-app ~$0.02 (73% cached) · portfolio ~$0.21, caching saved ~$0.55 (78% of input cost)`.

**Out of scope (follow-ons):** per-run cost lines in the DONE section · OpenAI/Gemini pricing · dashboard live-feed surfacing the same rollup.

**Files touched (3):** `compass/orchestrator/cockpit.py` · `compass/orchestrator/tests/test_events.py` · `CHANGELOG.md` (+ this file). Counter: #106. **4 of 5 before Retro #022 (fires after #107).** Third cost/cockpit improvement in the #104→#105→#106 arc — reduced, measured, and now visible.

### 2026-06-21 — /triage skill surface still framed as incident-response (#107)

**Trigger origin (Principle #19):** **consumer** — live home-app session. User: "if triage is the entry point as we discussed, every time I do triage it keeps asking as if it's waiting for an incident." Real usage exposed the gap.

**The bug:** #103 made `/triage` the front-door ITIL intake router in the **workflow** (`triage.md` Step 1 = `support.classify-intake`), **agents**, **canon**, and **AGENTS.md** — but the user-facing **skill description** at `.claude/skills/triage/SKILL.md` still read *"Incident response. Engineer + Support + PO engage. Stop-the-bleed is human-driven."* The interactive model reads that description first and pre-framed every `/triage` as an incident, waiting for incident details even for a plain bug. The workflow body was correct; the **surface** lied.

**Fix:** rewrote the skill `description:` to the front-door framing (classify any item → route) + added an explicit guard line in the skill body ("front door for ALL intake, not just incidents — Step 1 classifies; do not assume an incident"). Swept `README.md` (`/triage <alert> → Incident response` → front-door router). `enterprise-architect.md:78` "incident response capability of the team" is a genuinely different meaning (team-capability assessment) — left as-is, DRI-justified.

**Meta-lesson (the real value):** `.claude/skills/*/SKILL.md` descriptions are **load-bearing behavioral surfaces**, not cosmetic labels — the interactive model frames its whole run off them. A workflow's *semantic* change (incident-response → front-door router) must sweep the skill description in the SAME commit. `[pre-push-grep-discipline]` is the tool (`pre-push-consistency-check.py "Incident response"` would have caught all three at #103) — the gap was not running it against the skill surface when triage's meaning changed. **Watch-for: when a workflow changes what it DOES, grep `.claude/skills/` for the old framing.**

**Verification:** sweep clean except the justified EA hit; consistency-check CONSISTENT (23 patterns, 9 of 17); 139 tests pass (unaffected). Skill registry now shows the front-door description.

**Files touched (3):** `.claude/skills/triage/SKILL.md` · `README.md` · `CHANGELOG.md` (+ this file). Counter: #107. **5 of 5 → Retro #022 fires next.** Consumer-signal fix closing the #103 front-door arc on the surface the user actually touches.

### 2026-06-22 — /fix ITIL-tier collapse (#108, implements the Retro #022 redesign)

**Trigger origin (Principle #19):** **consumer → architecture.** Live home-app run: the orchestrator's `support.triage-bug` step was repo-blind, interrogating the DRI for facts the *code* answers, then "refusing to escalate" to the one agent that can read the code. The DRI named the root cause — *"do we need ITIL L1/L2/L3 in the AI world? moving to L3 is ceremony."* Captured in Retro #022 as a declared redesign; built here.

**The collapse:** removed `support.triage-bug` + the "triage confirmed" HITL gate from `/fix`. `engineer.fix-bug` → **`engineer.triage-and-fix`**, expanded to own reproduce-from-code + diagnose + severity + dedupe (it reads + runs the real code instead of interrogating). `/fix`: **8 steps → 6**, one HITL gate (merge). The renamed task is used by both `/fix` and `/triage`'s needs-fix branch (one engineer fix task).

**Why (the principle):** ITIL tiering exists for human economics + access control — cheap L1 deflect to protect scarce, expensive L3 engineers, and "the triager can't see the code" is an access wall. In the AI world the protected resource is an agent that reads the code instantly at token cost, so the escalation ladder is ceremony. 1st instance of candidate **`[ai-collapses-org-tiering]`** (canon codification deferred — DRI-gated).

**What's KEPT (deliberately — these are not tiering):** front-door routing (`/triage`); **maker ≠ checker** — the different-model Reviewer (`[codex, gemini]`) + Security Reviewer + `respond-to-review` loop all stay (the engineer *validates* by running tests; a *different model reviews* — validation ≠ review; self-review stays forbidden); the HITL merge gate. **`[refuse-escalate]` refined at the application level** — bug-reproduction moved from Support to the Engineer and softened to "reproduce from code first; ask the human only for what code can't reveal (prod data, account state, creds); halt if still irreproducible." **AGENTS Principle #16 / canon `[refuse-escalate]` (foundational scope-widening) untouched** — different concern. No other discipline dropped: regression-test-first, MOV, per-surface-vertical-test, contract sweep, no-hotfix-exception, promote-to-tech-debt-brief all preserved (now inside `triage-and-fix`).

**Support shrinks to the front door:** `triage-bug` task removed; `fix` removed from `participates_in_workflows`; Identity + inlined `[refuse-escalate]` reframed to `classify-intake` (route-no-noise) terms.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **139 pass** (test_fix updated: 6 steps, HITL [5], Step 1 engineer.triage-and-fix, asserts no support step + reviewer present; triage fix-forward assertion updated). consistency-check CONSISTENT (no count change — collapse removes steps, not a dispatch-graph workflow). `run fix --dry-run` → 6-step graph, engineer triages at Step 1, reviewer at Step 3, single HITL at Step 5. Pre-push grep sweep: remaining `triage-bug`/`fix-bug` hits are intentional migration-note history (fix.md) + a test comment; the one genuine stale ref (`tools.py` docstring example) updated.

**Out of scope:** codifying `[ai-collapses-org-tiering]` to canon (DRI-gated, 1 instance); the `--allow-write` hand-off paper-cut (#103 command omits the flag — small follow-on).

**Files touched (7):** `compass/agents/engineer.md` · `compass/workflows/fix.md` · `compass/agents/support.md` · `compass/workflows/triage.md` · `compass/orchestrator/hosts/tools.py` · `compass/orchestrator/tests/test_graph.py` · `AGENTS.md` (+ CHANGELOG + this file). Counter: #108. **1 of 5 before Retro #023 (fires after #112).** First post-Retro-#022 build — converts the retro's headline declared redesign into shipped structure.

### 2026-06-23 — right-size the path to the work: the enhancement lanes (#109)

**Trigger origin (Principle #19):** **DRI design challenge, during live use.** While walking through creating a home-app story, the DRI asked: *"are all enhancements going through the same space?"* then *"AI should also recommend the bet this new story is part of."* The front door was sending **every** `enhancement`/`problem` to `/create-brief` (a new bet + the full pipeline) regardless of size — the planning-side twin of the `/fix` ITIL ceremony (#108).

**The three lanes** (`[right-size-the-path-to-the-work]`, 1st instance): *new capability* → `/create-brief` (new bet) · *slice of an existing bet* (most enhancements) → `/create-story --bet <id>` (no new brief) · *trivial* → hygiene (skip brief, keep review).

**What shipped:**
- **`classify-intake` right-sizes** (support.md v0.3.51) — for enhancement/problem it picks the lane and recommends the specific right-sized command, instead of a reflexive `/create-brief`.
- **The classifier names the bet** (the DRI's add) — new `run.py` helpers `_load_bet_catalog(project_dir)` (compact catalog: each `docs/bets/*/brief.md`'s id + type + status + one-liner from its hypothesis/heading) + `_reads_bet_catalog(agent_file)` (a `loads_bet_catalog: true` frontmatter flag). The orchestrator injects the catalog into any flagged agent's step context; `support.md` opts in. So for a slice the recommendation is `/create-story --bet <matched id>` **by name**. Empty catalog (no bets) → recommend a new bet.
- **Mechanical guard** (create-brief.md v0.3.51) — a new precondition refuses to mint a redundant bet for a slice of an already-approved bet, pointing to `/create-story` (mirrors the existing "Brief already drafted → refuse"; `[refuse-escalate]` spirit).
- **Policy + lane prose** — AGENTS.md "Two paths for work" gains the right-size policy + extends `hygiene` to trivial enhancements (Lane 3 destination **declared**, not wired); triage.md Step 2 names the lanes under the enhancement route.

**Scope discipline:** the 7-ITIL routing gate is **unchanged** (`enhancement → /create-brief` stays the default; right-sizing rides in the recommendation + the create-brief guard, not new gate targets) — so `test_triage_intake_routing_gate` stays green. No new ITIL category, no parser change.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **142 pass** (+3: catalog names bets with type/status + heading/hypothesis one-liner; empty-project → ""; the `loads_bet_catalog` flag). consistency-check CONSISTENT (no count change). Smoke: `_load_bet_catalog` on a 2-bet project renders the catalog correctly.

**Out of scope (declared):** Lane 3 fully wired (brief-less lightweight build for trivial enhancements); `[brief-work-reconciliation]` (the other candidate — surface plan↔work gaps, still open); codifying `[right-size-the-path-to-the-work]` to canon (DRI-gated).

**Files touched (6):** `compass/orchestrator/run.py` · `compass/agents/support.md` · `compass/workflows/create-brief.md` · `compass/workflows/triage.md` · `AGENTS.md` · `compass/orchestrator/tests/test_graph.py` (+ CHANGELOG + this file). Counter: #109. **2 of 5 before Retro #023 (fires after #112).** Pairs with #108 — both *size the path to the work* (collapse the fix tier · right-size the enhancement path).

### 2026-06-23 — right-sized hand-off: live recommendation over the static route target (#110)

**Trigger origin (Principle #19):** **DRI spotted it in a dry-run.** Looking at `triage --dry-run`, the DRI noted Step 2 still shows `enhancement→/create-brief` — *"that should be updated based on what we just built"* (#109). Real seam: #109 right-sized the *recommendation* but kept the routing gate **static**, so the dry-run AND the **live hand-off message** still printed a flat "run /create-brief," contradicting `classify-intake`'s actual right-sized recommendation (e.g. `create-story --bet CB-7`).

**Why static (the constraint):** a routing gate maps each label to exactly one target; per-item right-sizing is the classifier's job, which a static gate can't encode. #109 put the right-sizing in `classify-intake`'s output + the create-brief guard — but never surfaced it at the hand-off. This closes that.

**What shipped:**
- **A contract line** — `classify-intake` (support.md v0.3.52) now ends its output with exactly one `**Next command:** <cmd>` (the right-sized command: `create-story --bet <id>` · `create-brief` · `fix` · `close`).
- **The hand-off echoes it** — `run.py` `_recommended_next(output)` greps that line; the routing-gate hand-off branch prints **"Recommended (right-sized): <cmd>"** (with the static route target shown only as the fallback), falling back to the generic `_handoff_message` when no contract line is present. Works for every hand-off route, carries the right-sizing for enhancement/problem.
- **Dry-run honesty** — `run.py` prints a note (when a graph has routing gates) that gate targets are static fallbacks and the live run uses the classifier's right-sized recommendation; triage.md route prose says the same.

**Scope discipline:** the gate/route/parser is **unchanged** — 7-ITIL targets, `enhancement → /create-brief` still the fallback; `test_triage_intake_routing_gate` stays green. The fix is purely "surface the recommendation that already existed."

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **145 pass** (+3: `_recommended_next` parses the contract line, None when absent, takes the last). consistency-check CONSISTENT (no count change). `triage --dry-run` shows the static routes **+ the new right-sizing note**.

**Out of scope:** a dynamic/agent-classified routing gate (would let the gate itself right-size — #87 surface 3); Lane 3 brief-less trivial build (declared, #109); codifying `[right-size-the-path-to-the-work]` (DRI-gated).

**Files touched (5):** `compass/orchestrator/run.py` · `compass/agents/support.md` · `compass/workflows/triage.md` · `compass/orchestrator/tests/test_graph.py` · `CHANGELOG.md` (+ this file). Counter: #110. **3 of 5 before Retro #023 (fires after #112).** Completes the #109 right-sizing on the surface the DRI actually reads — the dry-run + the live hand-off.

### 2026-06-23 — step-level cockpit + first-turn heartbeat (#111)

**Trigger origin (Principle #19):** **two live-run observations.** (1) DRI: *"I should be able to see the entire plan in a dashboard and the steps that are pending."* The cockpit (#104) was run-level — in-flight showed only the current step. (2) During the live `/fix`, the engineer's first model turn ran 1–2 min with no output → *"stuck in the dispatch."* The spine already had the data; the surfaces didn't show it.

**What shipped:**
- **Step-level view** — `cockpit --run <id>` renders the full workflow plan annotated **✓done / ▶running / ⏸awaiting-you / ·pending**. `fold_runs` now builds a per-run `steps` status map from `step_start`→running, `step_end`→done, `gate_open`→awaiting, `gate_decision`→done. `load_graph_steps(workflow, compass_dir)` loads the dispatch graph so *pending* (not-yet-started) steps show; `compass_dir()` resolves `--compass-dir` → `$COMPASS_FW/compass` → `./compass`. Graph-unavailable → spine-only fallback (no crash). **Ended runs show what ran + the end reason** (no phantom pending — e.g. a triage that handed off at step 2).
- **Default view gains `step N/M`** — the in-flight line shows progress (`step 2/6`) when the graph resolves.
- **First-turn heartbeat** — `run.py` prints one line after "Dispatching…" on tool steps: "first model turn can take ~1–2 min before tool activity — watch `cockpit`." Static expectation-setter (no thread); kills the "looks frozen" perception.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **150 pass** (+6: step-status fold, render_run pending-from-graph, ended-no-pending, graph-unavailable fallback, `load_graph_steps` on real fix.md → 6 steps). consistency-check CONSISTENT. Smoke: `cockpit --run` shows the 6-step `/fix` plan (✓/▶/·); default cockpit shows `step 2/6`.

**Out of scope (declared):** a true periodic "still working…" heartbeat (needs streaming/threads — static line is v1); the HTML `/dashboard` live feed (next delivery slice); `--watch` live re-render.

**Files touched (4):** `compass/orchestrator/cockpit.py` · `compass/orchestrator/run.py` · `compass/orchestrator/tests/test_events.py` · `CHANGELOG.md` (+ this file). Counter: #111. **4 of 5 before Retro #023 (fires after #112).** Both gaps the live run exposed — "see the whole plan / pending" and "looks frozen" — closed.

### 2026-06-23 — OpenAI adapter max_tokens→max_completion_tokens; dispatch halts cleanly (#112)

**Trigger origin (Principle #19):** **live crash.** The home-app `/fix` reached Step 3 `reviewer.review-pr` on **codex** (OPENAI_API_KEY now set — the maker≠checker handoff worked!) and **crashed with a raw traceback**: `openai.BadRequestError 400 — 'max_tokens' is not supported with this model. Use 'max_completion_tokens'` (default model `gpt-5`). The reviewer never ran.

**Two fixes:**
- **`hosts/openai.py`** — send **`max_completion_tokens`** instead of the legacy `max_tokens` (gpt-5 / o-series reject the latter; it's the forward-compatible param). Made the adapter `client`-injectable (mirrors `claude.py`) for testing.
- **`run.py`** — the dispatch wrapper caught only `(RuntimeError, ImportError)`, so a host SDK error (API 400, rate limit, network) escaped as an **uncaught traceback that killed the run**. Now it catches **any `Exception`** → prints a friendly error + **`--from-step` resume hint** + emits `RUN_END (halted)` to the spine, then exits 1. (KeyboardInterrupt is BaseException, so Ctrl-C still propagates.) This is the #79 "failures halt cleanly, no silent/ugly death" principle extended to host adapters.

**Why it matters:** the Codex/Gemini review path is the **maker≠checker** guarantee — if it crashes, the independent review silently doesn't happen. This makes the cross-host review path actually usable, and any future host error degrades to a clean, resumable halt.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **151 pass** (+1: the openai adapter sends `max_completion_tokens`, not `max_tokens`, via a fake client). consistency-check CONSISTENT. The broadened dispatch-halt is exercised by the original crash scenario (now a clean halt + resume hint).

**Resume for the live run:** `compass-run fix --project-dir . --from-step 3 --allow-write --context "resume: Codex review of the AAL2 middleware-renewal fix"` — picks up at the reviewer with the param fix in place.

**Files touched (4):** `compass/orchestrator/hosts/openai.py` · `compass/orchestrator/run.py` · `compass/orchestrator/tests/test_tools.py` · `CHANGELOG.md` (+ this file). Counter: #112. **5 of 5 → Retro #023 fires next.** A consumer-signal bug fix that makes the cross-host (Codex) review path actually work end-to-end.

### 2026-06-23 — HTML cockpit: the live browser feed (#113)

**Trigger origin (Principle #19):** **DRI, repeatedly** — "see the entire plan in a dashboard." The text cockpit (#104/#111) answered it at the CLI; this is the **browser** surface the DRI kept gravitating to ("use the dashboard as the orchestrator"). First improvement of the post-Retro-#023 batch.

**What shipped — one renderer, two surfaces (over the #104 spine):**
- **`render_html`** — a self-contained HTML doc (inline CSS, no deps, `<meta http-equiv=refresh>`): ⏸ awaiting (+ ready-to-run approve command) · ▶ in-flight (+ `step N/M` + the annotated step plan ✓/▶/⏸/·) · ✓ done · 💰 spend. All run/agent/reason text HTML-escaped. Reuses `fold_runs` + cost helpers; factored `_run_step_rows` + `spend_summary` so the **text and HTML views share one source and never drift**.
- **`cockpit --html [path]`** — writes a `file://` snapshot (default `$COMPASS_HOME/orchestrator/cockpit.html`); honest "snapshot at <ts>", re-run to refresh.
- **`cockpit --serve [--port N]`** — a **read-only localhost server** (stdlib `http.server`, `127.0.0.1`, GET-only, no writes/traversal) that re-reads `events.jsonl` per request → the **true live feed** (browser meta-refreshes; each load reflects new events as a workflow runs).

**Relationship to `/dashboard`:** distinct and deliberate. The `/dashboard` skill renders a *project's* artifacts (repo-scoped, `docs/dashboard.html`); this is the **portfolio-wide, user-local orchestrator cockpit** (spans every project, reads `~/.compass`) — same separation as the spine itself (#104). Convergence is a later call.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **156 pass** (+5: html sections/data, escaping `<script>`, empty page, `build_page` bytes, text↔html step-row parity). consistency-check CONSISTENT (no count change). Smoke: `--html` snapshot shows awaiting/in-flight(`step 4/8`)/done/spend; `--serve` + `curl 127.0.0.1` returns the live-rendered cockpit.

**Out of scope (declared):** WebSocket push (meta-refresh polling is v1); approve-from-dashboard (the action channel — relays to the mechanical gate, the bigger v2); converging with the project `/dashboard`; server auth (localhost-only, read-only).

**Files touched (3):** `compass/orchestrator/cockpit.py` · `compass/orchestrator/tests/test_events.py` · `CHANGELOG.md` (+ this file). Counter: #113. **1 of 5 before Retro #024 (fires after #117).** Delivery-layer slice 2 (after the text cockpit) — the browser "dashboard as orchestrator."

### 2026-06-23 — sync-into-consumer.py: safe one-command framework sync (#114)

**Trigger origin (Principle #19):** **consumer, dual-surface.** The DRI runs home-app through **both** VS Code `/skills` (which read the *embedded* `compass/` + `.claude/skills`) **and** the orchestrator (`--compass-dir` → live framework). The orchestrator stays current; the embedded copy drifts (home-app was behind #103–#113). Manual sync (MIGRATION.md) is error-prone — the preserve/overwrite split can clobber the consumer's `docs/`, `config.yaml`, or `.github/` CI.

**What shipped:** `compass/scripts/sync-into-consumer.py <consumer> [--apply] [--no-backup] [--framework DIR]`.
- **Dry-run by default** (prints the overwrite/prune/preserve plan, writes nothing); `--apply` performs it (mirrors `--allow-write` opt-in). Auto-backs-up `consumer/compass/` → `.compass-backups/<ts>/` first.
- **Policy (load-bearing):** OVERWRITE the machinery (`compass/{agents,workflows,framework,templates,scripts,orchestrator}`, `AGENTS.md`, `CLAUDE.md`, `.claude/skills`, `.codex/prompts`); PRESERVE the consumer's own (`config.yaml`, `roles/`, `docs/`, `PROJECT.md`, `README.md`, `.claude/settings*`, `.codex/config.toml`, `.github/`, `.mcp.json`) — **the script only ever writes paths in the overwrite set**, so everything else is safe by construction; PRUNE the framework's own meta-logs from the copy (`improvements.md`, `retros/`).
- **Per-subdir replace, never `rm -rf compass/`** — so `compass/config.yaml` (root) + `roles/` survive untouched. Pure `plan_sync` + `apply_plan` (testable, dry-run reuses the plan).

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **160 pass** (+9: plan classification — machinery in overwrite, config.yaml/docs/.github NOT; missing-framework-path skipped; apply overwrites machinery + preserves config.yaml/docs/PROJECT.md/.github/roles + prunes improvements.md + makes a backup; dry-run writes nothing). consistency-check CONSISTENT. Dry-run smoke against a fake consumer prints the plan, writes nothing.

**Docs:** MIGRATION.md gains a "Keeping a consumer in sync (the easy way)" section; scripts/README.md entry.

**Out of scope (declared):** a `--check` drift-report mode (CI-friendly); auto-sync on a cadence/hook; the drafted-handoff-prompt idea (bumped — this took the #114 slot).

**Files touched (4):** `compass/scripts/sync-into-consumer.py` (new) · `compass/orchestrator/tests/test_sync.py` (new) · `MIGRATION.md` · `compass/scripts/README.md` (+ CHANGELOG + this file). Counter: #114. **2 of 5 before Retro #024 (fires after #117).** The embedded-copy-drift fix for dual-surface users (VS Code `/skills` + orchestrator).

### 2026-06-23 — cost-control batch: Sonnet default (#115) · budget cap (#116) · context condense (#117)

**Trigger origin (Principle #19):** **consumer, hard signal** — the DRI burned **~$20 in a few orchestrator runs** and flagged "something's not right" (and rightly noted that, uncontrolled, VS Code's flat subscription beats a metered orchestrator). Diagnosed against the code: the per-call caps were sane (files 100KB, bash 20KB, prior 3KB); the cost was **model tier × call volume × no guardrail**.

**#115 — Sonnet by default; opt up to `deep`.** `router.DEFAULT_MODELS["claude"]` flipped from `claude-opus-4-8` → `claude-sonnet-4-6` (~5× cheaper). Added `DEEP_MODELS` + `deep_model(host)` and `run._read_model_tier` — an agent with `model_tier: deep` gets the frontier model; explicit `--model` still wins; else Sonnet. **No agent ships `deep`** (max savings, DRI's call); bump a hard fix with `--model claude-opus-4-8`. Reviewer/security-reviewer ride Codex/Gemini (unaffected).

**#116 — `--max-cost <USD>` budget cap (the seatbelt).** Pricing (`cost_usd`/`_price_for`/`_full_input_cost`/multipliers) moved to `events.py` — one source for the #106 cockpit rollup *and* this cap (cockpit re-imports). The per-run sink accumulates spend on every `usage` event and **raises `BudgetExceeded` mid-run** — because the sink is the tool loop's `on_event`, the raise propagates out of the loop → caught by #112's broadened `except` → clean halt + `--from-step --max-cost <higher>` resume hint. Per-step `[cost] run ~$x / $cap` line. **Bonus bug fix:** run.py had passed an `emit(type, **fields)` function as `on_event`, but the loop calls `on_event(dict)` (#104 mismatch) — so tool/`usage` events were **mangled** (never rendered, never priced → the cockpit cost rollup saw nothing from real runs, and the tool-streaming the user thought was "frozen" was actually being dropped). The sink now takes a dict; streaming + usage telemetry actually land on the spine.

**#117 — condensed inter-step context.** `_build_user_message` now passes each prior step's **structured summary** (`parse_step_output` → TL;DR + files + next-command, ~600–800 chars) instead of a 3000-char raw slice. On a 6-step run that's a large token cut on the most expensive late steps — compounding with Sonnet.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **168 pass** (+8: default-Sonnet/deep-Opus + `deep_model` family mapping · `_read_model_tier` · `_condense_output` shrink+signal+fallback · `cost_of_usage_event` · Sonnet≈5×-cheaper · budget accumulation crosses cap · `BudgetExceeded`). consistency-check CONSISTENT (model ids aren't version self-claims). SETUP.md documents the tier + cap.

**Net effect:** "$20 by accident" → "Sonnet by default, condensed context, hard-capped per run." Honest framing kept: for interactive single-task work VS Code (flat sub) is still cheaper; the orchestrator earns its meter on cross-model review / parallel portfolio / headless / audited gates — and the **strategic follow-on is a `claude-code` host adapter** (subscription-backed dispatch), declared.

**Files touched (6):** `compass/orchestrator/hosts/router.py` · `compass/orchestrator/run.py` · `compass/orchestrator/events.py` · `compass/orchestrator/cockpit.py` · `compass/orchestrator/tests/test_graph.py` · `compass/orchestrator/tests/test_events.py` (+ SETUP.md + CHANGELOG + this file). Counter: **#115, #116, #117** (one batch, three numbers). **5 of 5 → Retro #024 fires next.** The first cost-tuning of the orchestrator — built capability-first, now made cost-sane on the strongest consumer signal yet.

### 2026-06-24 — async gates: non-interactive pause-and-resume (#118)

**Trigger origin (Principle #19):** **the VISION + the live friction.** "Orchestrate from the dashboard" (cockpit step 3) needs runs a browser can drive, but every HITL gate blocked on terminal `input()` — so a non-terminal launcher (CI, cron, a dashboard POST) just hangs. First slice of the **dashboard-as-orchestrator arc**; also independently unblocks headless/scheduled runs.

**What shipped:**
- **`--non-interactive`** — at a gate, the run **pauses-and-exits**: emits `gate_open` (the cockpit's ⏸ awaiting signal), prints the resume command, `exit(0)` — and deliberately emits **no `RUN_END`** (so it shows *awaiting*, not *done*).
- **`--decide <approve|reject|ROUTE>`** — the human's relayed decision applied at the **first gate** the (resumed) run reaches; consumed once, so the next gate pauses again. Resume = `--from-step N --non-interactive --decide …`.
- **`_resolve_gate(decide, is_routing, routes)`** — pure resolver: approval → approve/reject/pause; routing → matched-route/pause. Both gate blocks branch on `non_interactive`; the interactive `handle_hitl_gate`/`handle_routing_gate` path is byte-for-byte unchanged.

**The gate floor holds:** `--decide` only *relays* a decision; `run.py`'s gate logic still executes (promotion on approve, RUN_END(halted) on reject, inline-skip/hand-off on routes) — nothing auto-decides. The "I stay in control" floor is preserved, just delivered async. No daemon — reuses `--from-step` + the spine.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **171 pass** (+3: `_resolve_gate` approval + routing + pause cases; `_run_workflow` accepts the new kwargs). consistency-check CONSISTENT. Interactive path unchanged when `--non-interactive` is absent.

**The arc this unlocks (declared, next slices):** **#119 action endpoints** — `--serve` cockpit gains `POST /run` (`compass-run … --non-interactive --max-cost X`) + `POST /decide` (`--from-step N --non-interactive --decide …`) → launch + approve **from the browser**; **#120 `claude-code` host** — subscription-backed dispatch so dashboard-triggered runs are flat-cost. Together = the VISION's dashboard-as-orchestrator, cost-safe.

**Files touched (3):** `compass/orchestrator/run.py` · `compass/orchestrator/tests/test_graph.py` · `CHANGELOG.md` (+ this file). Counter: #118. **1 of 5 before Retro #025 (fires after #122).** The keystone that turns the orchestrator from terminal-only into browser-drivable.

### 2026-06-24 — action endpoints: launch + approve from the browser (#119)

**Trigger origin (Principle #19):** **the VISION continued.** #118 made runs browser-drivable (pause-and-resume gates); #119 closes the loop — the dashboard can now **start** a run and **act on** its gates without a terminal. Slice 2 of 3 of the dashboard-as-orchestrator arc (after #118 async gates, before #120 claude-code host).

**What shipped:**
- **`POST /run`** — launch a workflow from the browser. The page (actions on) renders a **🚀 Launch** form: workflow `<select>` (from the `compass/workflows/*.md` allow-list, `advance` shim excluded), project-dir (prefilled with the server default), context, optional bet, an `--allow-write` checkbox.
- **`POST /decide`** — act on a paused gate: **approve/reject** buttons for an approval gate, **one button per route label** for a routing gate (labels read from the graph; text-field fallback if the graph is unavailable).
- **Opt-in via `--serve --allow-actions`** — plain `--serve` stays read-only (POST → 403), mirroring `--allow-write`. New server flags: `--allow-actions`, `--project-dir` (launch default), `--max-cost` (cap applied to every browser-launched run).
- **`_build_run_argv(action, params, defaults)`** — pure arg-builder: validates the workflow against the allow-list + an existing project-dir + a numeric step, then returns the `compass-run` argv. Unit-tested without ever spawning.
- **The spine learns the path:** `RUN_START` now carries `project_dir` (full path); `fold_runs` captures it so `/decide` can target any run.

**The gate floor + cost cap hold:** the server **only relays to `compass-run`** — it never decides. It spawns via an **argv list** (`subprocess.Popen`, never `shell=True`), **always injecting `--non-interactive` + the server's `--max-cost`**, so a dashboard click can't bypass the mechanical gate floor or run away on cost. Localhost-only (`127.0.0.1`); every input validated before it reaches the argv.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **181 pass** (+10: `_build_run_argv` run/decide/reject cases · render_html actions on/off · `fold_runs` project_dir · `_known_workflows` excludes `advance`). consistency-check CONSISTENT (no count change). Read-only `--serve` default unchanged.

**Next slice (declared):** **#120 `claude-code` host** — subscription-backed local dispatch (`claude -p`) so dashboard-launched runs are flat-cost, not metered. That makes the whole arc cost-safe for everyday use.

**Files touched (4):** `compass/orchestrator/run.py` · `compass/orchestrator/cockpit.py` · `compass/orchestrator/tests/test_events.py` · `CHANGELOG.md` (+ this file). Counter: #119. **2 of 5 before Retro #025 (fires after #122).** The dashboard can now drive a full step — launch → pause at gate → approve/route → resume — from the browser.

### 2026-06-24 — the `claude-code` host: subscription-backed CLI dispatch (#120)

**Trigger origin (Principle #19):** **the live cost wall.** Dogfooding #119 surfaced it directly — "I don't want to use an API key, we're using the CLI." Every orchestrator host called the metered API (the "$20 by accident"), so dashboard-launched runs spent credits. #120 is the **last slice of the dashboard-as-orchestrator arc** (#118 async gates → #119 action endpoints → #120 flat-cost dispatch) — it makes the whole arc affordable for everyday use, and unblocks the deferred tier-B "click Launch and watch it run" test.

**What shipped:**
- **A fourth host, `claude-code`**, that shells out to the logged-in `claude` CLI (`claude -p --output-format json --append-system-prompt-file <agent> --model <alias>`), user message on stdin. Subscription-backed, **no `ANTHROPIC_API_KEY`, flat marginal cost.**
- **Opt-in, two equivalent levers:** `--claude-cli` flag + `COMPASS_CLAUDE_HOST=cli` env. The env var is the dashboard lever — the #119 cockpit spawns with `env=os.environ.copy()`, so exporting it before `cockpit --serve --allow-actions` makes every browser launch flat-cost with **zero cockpit change.**
- **Remap at the `preferred_hosts` level, before `select_host`** (`_remap_claude_cli`): `claude` → `claude-code` only. So (a) no API key needed (`_has_key("claude-code")` = `claude` on PATH), and (b) **reviewers (codex/gemini) are untouched** — cross-model review independence holds by construction.
- **Permission parity (user-confirmed):** `--allow-write` → `--permission-mode bypassPermissions` (the API host already grants write_file + sandboxed bash under allow_write; build agents need bash for tests/git). Read-only steps → `default`. CC owns its own tool loop (we don't pass schemas — `--add-dir <project_dir>` + the mode govern it).
- **Flat-cost accounting:** emits a NOTE (tokens + the CLI's API-equivalent cost, labeled "subscription, $0 marginal") and **no `usage` event** — so `--max-cost` can't false-trip and the cockpit 💰 Spend shows $0. **Zero changes to `events.py`/`cockpit.py`.**

**The flat-cost guarantee (caught live during dogfooding):** the first real CLI run halted with `claude CLI exited 1: (no stderr)`. Root cause — the `claude` CLI **prefers `ANTHROPIC_API_KEY` over the subscription login**, so with a (capped) key exported it billed the metered API and returned `400 You have reached your specified API usage limits`. Two fixes: (1) `_subscription_env` **strips `ANTHROPIC_API_KEY` + `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL`** from the subprocess env so `claude` uses the subscription — this IS the "no API key, flat-cost" promise, not a nicety; (2) the dispatch error now **surfaces stdout** (the CLI reports usage-limit/auth errors there as JSON, with an empty stderr) instead of the useless "(no stderr)". A consumer-as-primary-signal catch — the host's own purpose was silently defeated by an inherited env var.

**Testable without the CLI:** both adapter funcs take an injectable `runner=`; pure `_build_cli_argv`/`_parse_result`/`_cli_model`/`_subscription_env` are unit-tested directly, the dispatch path with a fake runner, the remap as a pure function. **No test invokes the real `claude`.**

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **203 pass** (+22: model-alias map · argv read-only vs bypassPermissions · result parsing + error paths · dispatch emits NOTE & no usage · clean-halt on non-zero exit · API-key-strip env · `_has_key`/`_family`/router routing · remap keeps reviewers off the CLI). consistency-check CONSISTENT.

**Arc complete.** Dashboard-as-orchestrator (VISION step 3) now works end-to-end and cost-safe: launch from the browser (#119) → pause at gates you approve async (#118) → all dispatched on your subscription, flat-cost (#120).

**Files touched (6):** `compass/orchestrator/hosts/claude_code.py` (new, incl. the `_subscription_env` key-strip + stdout error surfacing) · `compass/orchestrator/hosts/router.py` · `compass/orchestrator/run.py` · `compass/orchestrator/tests/test_claude_code.py` (new) · `SETUP.md` · `CHANGELOG.md` (+ this file). Counter: #120. **3 of 5 before Retro #025 (fires after #122).** The orchestrator now runs on a flat subscription, not a meter — the honest answer to "else VSC is better."

### 2026-06-24 — a resumed gate must continue the same run, not fork a duplicate (#121)

**Trigger origin (Principle #19):** **live dashboard use.** Driving a real triage gate from the browser produced *three* `completed: handed off to /fix` rows while the original run sat stuck in ⏸ Awaiting. Root cause: `run_id` was minted fresh per invocation (`workflow--bet--timestamp`), so each `/decide` (a `--from-step` resume) started a NEW run — the paused run's `gate_open` was never cleared (nothing ever emitted its `gate_decision`/`RUN_END`), and every click spawned a duplicate.

**What shipped:** a `--run-id` flag (+ `run_id_override` param) so a resume **continues the original run**. The cockpit's `/decide` threads the paused run's id through (regex-validated, `_RUN_ID_RE`); plain CLI runs still mint a fresh id. Now the resume's gate-decision + handoff land under the *same* id → it leaves ⏸ Awaiting and appears once in ✓ Done. A pure-ish change: `run_id = run_id_override or <generated>` at one site, threaded through `main()`.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **206 pass** (+3: `_build_run_argv` threads `--run-id`, rejects a bogus id; `_run_workflow` stamps `run_id_override` on every spine event). consistency-check CONSISTENT.

**Files touched (4):** `compass/orchestrator/run.py` · `compass/orchestrator/cockpit.py` · `compass/orchestrator/tests/test_events.py` · `CHANGELOG.md` (+ this file). Counter: #121. **4 of 5 before Retro #025 (fires after #122).** The dashboard's resume is now idempotent in identity — one gate, one run.

### 2026-06-24 — dashboard action guards: confirm, disable-on-submit, already-actioned (#122)

**Trigger origin (Principle #19):** **the same live incident as #121.** The duplicate `/fix` runs weren't only the run_id fork — the UI gave **no feedback** on click, so the operator clicked the route button repeatedly while the page waited to refresh. The DRI's ask, verbatim: "the UI should pop an alert before starting and disable any other buttons … should be smart enough to inform the user that they have already run fix."

**What shipped (two layers):**
- **Client (immediate):** every Launch / approve / route form `confirm()`s before acting; on submit, `_act` **disables every button on the page** (+ a "submitting…" note) so a gate can't be double-fired in the refresh window.
- **Server (authoritative):** `POST /decide` checks `_gate_already_actioned(events, run_id)` — if the run's gate is already closed (decided / handed off / ended), it returns **409 "already actioned"** with a link back, instead of spawning a second resume. This is the "you already ran fix" awareness, reliable even from a stale tab.

Together with #121 (the gate now actually clears after one decision), double-routing is closed at both ends — UX *and* correctness.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **208 pass** (+2: render_html action forms carry `onsubmit`/`_act`/`disabled`; `_gate_already_actioned` open vs decided vs unknown). consistency-check CONSISTENT.

**Files touched (4):** `compass/orchestrator/cockpit.py` · `compass/orchestrator/tests/test_events.py` · `SETUP.md` · `CHANGELOG.md` (+ this file). Counter: #122. **5 of 5 — Retro #025 is now DUE (fires after #122).** The dashboard tells you what it's doing and refuses to do it twice.

### 2026-06-24 — refresh mvp.md to current truth (#123)

**Trigger origin (Principle #19):** **post-retro MVP review (DRI-directed).** After Retro #025, the DRI asked for "the open items to consider MVP done." Grounding that surfaced `compass/framework/mvp.md` as stale — it predated the all-14-agents migration, multi-host routing, and the whole orchestrator/cockpit/dashboard arc (still listed agents as `❌ migrate`, multi-host as "deferred to beta"). Retro #018 had flagged "MVP doc refresh" as a watch-for; Retro #025's audit confirmed the drift.

**What shipped:** mvp.md rewritten to current truth — the original "start sending" criteria marked **all met**; agent pack shows all 14 migrated; capabilities delivered *beyond* the original single-host alpha listed (multi-host routing, tool-using executor, async gates, cockpit, dashboard-as-orchestrator, cost controls, the flat-cost `claude-code` host); a **post-MVP roadmap table** embeds the open items, overlaid with Retro #025's watch-fors + codification candidates. Build state stays single-sourced to CHANGELOG + improvements; mvp.md is the scope map. **Declaring MVP functionally complete** is the headline — "it works" is now "it's declared done."

**Verification:** consistency-check CONSISTENT; no test impact (doc change).

**Files touched (3):** `compass/framework/mvp.md` · `CHANGELOG.md` (+ this file). Counter: #123. **1 of 5 before Retro #026 (fires after #127).**

### 2026-06-24 — mechanize the host-list drift class in consistency-check (#124)

**Trigger origin (Principle #19):** **Retro #025 watch-for #1.** The #025 audit caught `claude-code` missing from AGENTS.md's host table *by hand* — `consistency-check.py` passed because it didn't cover prose host-list enumerations. A new host had to be remembered in code AND docs; nothing computed the diff. This is the same "mechanize what the audit keeps catching" move as #93.

**What shipped:** a 4th check — `check_host_list` derives the supported hosts from `router.py`'s authoritative `Supported: …` dispatch error string and verifies each is documented in AGENTS.md's host table (`chatgpt` treated as the OpenAI-family alias → satisfied by the `openai` row). Now a new host that lands in code but not docs fails the commit hook + CI. Per `[test-alongside-implementation]`: +2 tests (drift caught for an undocumented host; alias not false-flagged).

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **210 pass** (+2). consistency-check CONSISTENT (now reports "host list" too).

**Files touched (3):** `compass/scripts/consistency-check.py` · `compass/orchestrator/tests/test_consistency.py` · `CHANGELOG.md` (+ this file). Counter: #124. **2 of 5 before Retro #026 (fires after #127).** One more retro watch-for converted from "remember to" into "the hook enforces it."

### 2026-06-24 — dispatch-on-outcome: a refused step halts, not cascades (#125)

**Trigger origin (Principle #19):** **live `/ops` misroute (session).** A `/ops` run dispatched to the wrong agent cascaded four refusal steps and then crashed on an API limit — the orchestrator kept dispatching after a step had already refused. The MVP-done overlay flagged this as 🟡 correctness (`dispatch-on-outcome`).

**What shipped:** `run.py` now halts the run when a step's output **leads with a refusal sentinel** (`REFUSE:` / `[REFUSE]` / `**Refusing:**`). `_is_refusal` inspects only the first few lines and matches the explicit marker — never prose that merely discusses refusing (no false-positive cascade-stops). The refusal artifact is still printed/written/logged first; then `RUN_END(halted)` fires with a `--from-step` resume hint. The contract is codified in the **`refuse-escalate`** canon entry (agents that refuse lead with the sentinel) — no new pattern, just the machine-readable surface added to principle #16. This is `[failure-direction-inversion]` applied to refusals (the same pattern #127 codifies; #125 is a fresh instance).

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **213 pass** (+3: leading sentinels detected; prose mentioning "refuse" not flagged; buried sentinel not flagged). consistency-check CONSISTENT.

**Files touched (4):** `compass/orchestrator/run.py` · `compass/framework/canon.md` (refuse-escalate) · `compass/orchestrator/tests/test_graph.py` · `CHANGELOG.md` (+ this file). Counter: #125. **3 of 5 before Retro #026 (fires after #127).** A refused step now stops the run instead of dragging it through more refusals.

### 2026-06-24 — branch discipline spans the interactive surface (#126)

**Trigger origin (Principle #19):** **live VS Code session (session).** #99 ("write-mode work lands on a branch, never `main`") was enforced only mechanically in `run.py` (`_ensure_work_branch`) — the interactive surfaces never stated it, so a hand-driven build/fix on Claude Code mutated `main` directly. The MVP-done overlay flagged this 🟡; the session proved branch discipline lived in exactly one place.

**What shipped:** the rule added to the interactive surfaces — `CLAUDE.md` host-runtime git rules (rule 4a, with the framework-repo `main` standing exception named) and `engineer.md` refusal rules (surface-independent: branch before write-mode edits on every host). Now both the orchestrator and the interactive hosts branch before write-mode work; no surface silently mutates `main`.

**Verification:** consistency-check CONSISTENT; no test impact (instruction/doc change).

**Files touched (3):** `CLAUDE.md` · `compass/agents/engineer.md` · `CHANGELOG.md` (+ this file). Counter: #126. **4 of 5 before Retro #026 (fires after #127).** The branch-not-main invariant is now stated where the interactive agents read it, not just where the orchestrator enforces it.

### 2026-06-24 — codify [fail-loud-not-silent] (the overdue failure-direction pattern) (#127)

**Trigger origin (Principle #19):** **DRI-gated codification (5-retro overdue candidate).** `[failure-direction-inversion]` was flagged codification-ready from Retro #020 and carried as "most overdue" through Retro #025. After closing #125 (dispatch-on-outcome — itself a fresh instance), the DRI authorized codification and **renamed it `[fail-loud-not-silent]`** for clarity.

**What shipped:** new canon Compass-original **`fail-loud-not-silent`** — *when a code path can fail, default its failure direction toward a loud halt, not a silent pass.* **9th enforcement-class member; catalog 7 shapes / 23 → 24 patterns.** Three named anti-patterns: `silent-skip` · `success-on-failure` · `swallowed-error`. Codified by ~6 accumulated instances (#79 reviewer silent-skip · #97/#100 max-iter success-advance · #104/#116 mangled telemetry → $0 cost · #120 "(no stderr)" · #125 refusal cascade→halt). Distinguished from `[soft-spec-hardening]` (interpretive room) and related to `[refuse-escalate]` (#125 is this pattern applied to refusals). AGENTS.md catalog count bumped to 24 / enforcement (9); `consistency-check.py` verifies the count.

**Verification:** consistency-check CONSISTENT (catalog count 24 matches); 213 tests (no test impact — canon + count edits).

**Files touched (4):** `compass/framework/canon.md` · `AGENTS.md` · `compass/framework/mvp.md` · `CHANGELOG.md` (+ this file). Counter: #127. **5 of 5 — Retro #026 is now DUE (fires after #127).** The framework's longest-standing codification-ready candidate is finally canon.

### 2026-06-24 — cockpit auto-refresh no longer wipes the Launch form (#128)

**Trigger origin (Principle #19):** **live dashboard use (session).** The first real attempt to *compose* a launch from the dashboard was unusable: the `<meta http-equiv=refresh>` whole-page reload (every 5s) reset the context box, the workflow dropdown, and scroll/selection mid-typing. A live feed and an input form can't coexist under blind meta-refresh — a #119/#122 gap exposed only by typing into the form rather than just clicking gate buttons.

**What shipped:** removed the meta-refresh; replaced with a JS reload that **pauses the instant you focus/type in the Launch form** (the `#ts` line announces "paused while you compose — submit, or reload to resume") and **skips any tick while a field is focused** (`activeElement` guard). Watching-only still auto-refreshes live; submitting navigates away (303) and the next page resumes the live state. No server change — pure render_html.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **214 pass** (+1: no `http-equiv`, has guarded `location.reload`/`paused`/`activeElement`; the prior meta-refresh assertion updated). consistency-check CONSISTENT.

**Files touched (3):** `compass/orchestrator/cockpit.py` · `compass/orchestrator/tests/test_events.py` · `CHANGELOG.md` (+ this file). Counter: #128. **Retro #026 still due (covers #123–#127); #128 opens the next batch (1 of 5 toward Retro #027).** The dashboard's Launch form is finally typeable.

### 2026-06-24 — DECLARED: stale-run detection + dashboard-run visibility (#129)

**Trigger origin (Principle #19):** **live dashboard use (session).** A single launched `/fix` showed **three** runs "In flight" — two were **zombies** from earlier sessions (Jun 22 + Jun 23) that were killed mid-step (Ctrl-C / API-cap crash) and so **never emitted `RUN_END`**; the cockpit can't tell a dead process from a slow one, so they lingered as active indefinitely (one frozen at `engineer.fix-bug` for ~3 days, masquerading as the user's live run). Two sibling visibility gaps surfaced in the same session: (a) **dashboard-launched runs send stdout/stderr to `/dev/null`** (the `Popen` in `_serve`), so there's no live log for them — only the spine; (b) **the OpenAI/Gemini host adapters don't emit `on_event`**, so a reviewer step shows "running" with zero detail until it returns.

**DECLARED (not built) — the fix this slice names, per `[declare-not-implement]`:**
- **Stale bucketing in the cockpit.** `fold_runs` already has `last_ts`; render in-flight runs in two groups — **active** (recent events) vs **⚠ stalled** (no events for > a threshold, default ~30m → process likely gone) — so zombies drop out of the active list instead of impersonating live runs. Non-destructive + self-correcting (a killed run *looks* killed). A pure `_is_stale(run, now, threshold)` + a render bucket; needs `now` passed into `render_html` (today only a formatted `snapshot_ts` string is passed). This is `[fail-loud-not-silent]` applied to the cockpit: an abandoned run should *look* abandoned, not silently-active.
- **Optional: a "close stalled" action** (the manual seed used this session — append `run_end(halted, "stale — process gone")` for in-flight runs older than the threshold; spares anything still emitting).
- **Capture dashboard-run logs** — tee each `Popen`'d run's output to `~/.compass/orchestrator/runs/<run_id>.log` instead of `/dev/null`, surfaced from the `--run` view.
- **Stream non-Claude host events** — give `openai.py`/`gemini_api.py` the same `on_event` usage/turn emission Claude has (pairs with the #120 CLI-host `stream-json` follow-up) so the reviewer step isn't a black box.

**Manual workaround shipped this session (not committed — ad-hoc script):** a staleness sweep that appends `run_end(halted)` for any in-flight run with no events for >30m, sparing live ones. Used to clear the two home-app zombies.

**Verification:** n/a — declared. No code change this entry.

**Files touched (1):** `compass/workflows/improvements.md` (this entry) (+ `compass/framework/mvp.md` roadmap). Counter: #129 (declared). **Retro #026 still due (covers #123–#127).** The cockpit should make a dead run *look* dead — built when the next live session warrants it (or sooner if zombies keep confusing the feed).

### 2026-06-24 — cockpit: spinning loader on the active step + per-step timing (#130)

**Trigger origin (Principle #19):** **live dashboard use (DRI ask).** Watching a `/fix` run, the DRI asked for a loader on the running step ("so we know it's running") and start/end times per state. The static ▶ glyph didn't read as "in progress," and there was no sense of how long a step had been running.

**What shipped:** (1) the running step renders a **CSS-animated spinner** (◐ via `@keyframes spin` on `.running .g`) — clearly "live"; (2) **per-step durations** — `fold_runs` captures `started`/`ended` from `STEP_START`/`STEP_END` (+ `GATE_DECISION`) timestamps; done steps show start→end elapsed, the running step a live `now`-`started` timer (`3m00s…`). Timing strings flow through the shared `_run_step_rows` (text `--run` + HTML stay in sync via `_step_dur_str`/`_fmt_dur`); `now` threaded through `render_html`/`build_page`. **Honest caveat noted in code + CHANGELOG:** the running timer grows even for a stalled run (no `ended`), so it shows *duration*, not *liveness* — true liveness is new spine events / #129's stale-bucketing.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **215 pass** (+1: done-step 12s, running-step live 3m00s, spinner ◐ + `@keyframes` + `.dur` in HTML). consistency-check CONSISTENT.

**Files touched (3):** `compass/orchestrator/cockpit.py` · `compass/orchestrator/tests/test_events.py` · `CHANGELOG.md` (+ this file). Counter: #130. **Retro #026 still due (#123–#127).** The active step now visibly spins and times itself.

### 2026-06-24 — claude-code host: timeout so a hung `claude -p` fails loud (#131)

**Trigger origin (Principle #19):** **live deadlock (session).** A real home-app `/fix` run sat "in flight" for **15+ min** at step 2 (`automation.write-e2e-tests`). Diagnosis: orchestrator process alive but **0% CPU, no `claude` child, no spine events for 21 min** — `claude -p` had hung (most likely it started a dev server / watcher that inherited and held the output pipe, so the call never returned), and the CLI host's `subprocess.run` had **no timeout** → the orchestrator blocked forever. A black-box step that can hang with no bound is exactly `[fail-loud-not-silent]`'s `silent-skip`/hang failure mode.

**What shipped:** `_default_runner` now spawns the CLI via `Popen(..., start_new_session=True)` (its own process group) under `communicate(timeout=_cli_timeout())`. On `TimeoutExpired` it **`os.killpg` SIGKILLs the whole tree** (CLI + any dev server / watcher it spawned), reaps, and raises a clear `RuntimeError` → run.py's dispatch `except` emits `RUN_END(halted)` with a `--from-step` resume hint. Default **900s**; `COMPASS_CLAUDE_CLI_TIMEOUT` overrides (seconds; `0`/blank disables for genuinely long steps). Pairs with #129 (stale detection would *show* it; this *stops* it).

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **217 pass** (+2: `_cli_timeout` default/explicit/disable/garbage; a hung runner surfaces as a clean `RuntimeError`, not a block). consistency-check CONSISTENT. (Real-CLI spawn not unit-tested — injectable `runner` keeps tests hermetic.)

**Files touched (3):** `compass/orchestrator/hosts/claude_code.py` · `compass/orchestrator/tests/test_claude_code.py` · `CHANGELOG.md` (+ this file). Counter: #131. **Retro #026 still due (#123–#127).** A hung CLI step now halts loud in ≤15 min instead of blocking the orchestrator indefinitely.

### 2026-06-24 — claude-code host: run in the target repo + clearer $0 wording (#132)

**Trigger origin (Principle #19):** **live `/fix` (session).** Resuming the home-app fix, the automation agent reported it couldn't read `SignInFlow.tsx` ("only the stories docs subdirectory is in my allowed paths") — yet the file exists at `home-app/app/sign-in/SignInFlow.tsx`. Root cause: the CLI host spawned `claude -p` in the **orchestrator's cwd** (the framework repo, where the command was run) and only *added* the project via `--add-dir`, so the agent's primary workspace was the wrong repo. Separately, the DRI flagged the flat-cost NOTE — `~$0.667 on API` next to "$0 marginal" read as a charge.

**What shipped:** (1) the host now runs the CLI with **`cwd=project_dir`** (`_default_runner` gains a `cwd` param; `_run` passes the project dir) so the agent works *inside* the target repo and can read its source; `--add-dir` stays as a redundant grant. (2) Reworded the NOTE → **`claude-code · $0 to you (subscription) · in=… out=… · ~$0.67 if billed via API`** — "$0 to you" is the actual cost, the comparison is explicitly "if billed via API," so it can't be misread as a bill.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **218 pass** (+1: cwd == project_dir for tool steps; NOTE says "$0 to you" + "if billed via API"; runner fakes updated for the `cwd` kwarg). consistency-check CONSISTENT.

**Watch-for (logged, not fixed):** the automation agent was *blocked* (asked "which project is this file in?") but phrased it as a question, not a `REFUSE:` sentinel — so dispatch-on-outcome (#125) didn't halt and the run cascaded to step 3. Agents need to emit the sentinel when blocked; #125's reach depends on agent-file adoption.

**Files touched (3):** `compass/orchestrator/hosts/claude_code.py` · `compass/orchestrator/tests/test_claude_code.py` · `CHANGELOG.md` (+ this file). Counter: #132. **Retro #026 still due (#123–#127).** The CLI agent now works in the repo it's fixing, and the cost line reads honestly as free.

### 2026-06-24 — dashboard runs are observable: per-run logs in the browser (#133)

**Trigger origin (Principle #19):** **DRI directive.** "Even if [the terminal run] works — the orchestrator should work from the html page as well." Launch + gate-approval already worked from the browser (#118/#119), but dashboard-spawned runs piped output to `/dev/null`, so a blocked agent or a silent (non-Claude) reviewer step was invisible from the page — you were forced back to the terminal. That's not "working from HTML."

**What shipped (the log-capture slice of #129):** the cockpit now **mints the run id** for `POST /run` (matching run.py's format) — reusing the #121 `--run-id` plumbing — so it can **capture the run's stdout+stderr** to `$COMPASS_HOME/orchestrator/runs/<run_id>.log` (append, line-buffered; `/decide` resumes append to the same file). New **`GET /log?run=<id>`** serves a live, auto-refreshing tail (last 64KB); a **`log ↗`** link sits on every run card (awaiting / in-flight / done). Run-id is regex-validated (no path traversal); localhost-only; the `--run-id` arg now applies to both actions (`_build_run_argv` refactor).

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **221 pass** (+3: `_run_log_path` valid/invalid/traversal + `_log_link` gating; `/run` pins `--run-id`; render shows `/log` links only in actionable mode). consistency-check CONSISTENT.

**Still open from #129:** stale-run bucketing + streaming non-Claude host events (the reviewer step still has no live output of its own — but its log file now at least captures the final dispatch result/errors).

**Files touched (3):** `compass/orchestrator/cockpit.py` · `compass/orchestrator/tests/test_events.py` · `CHANGELOG.md` (+ this file). Counter: #133. **Retro #026 still due (#123–#127).** The dashboard can now launch, watch (spinner + timing), approve, AND read what a run actually did — a complete loop from the browser.

### 2026-06-24 — non-interactive runs no longer deadlock on a per-step input prompt (#134)

**Trigger origin (Principle #19):** **live dashboard `create-brief` (session).** The first multi-step *dashboard* run froze at step 2 for 14 min at 0% CPU. The captured log (#133, which made this diagnosable!) showed `Enter context / input for this step. End with a line containing only '.':` — `--non-interactive` (#118) suppressed HITL gates but **not** the per-step `_collect_input` prompt, so step 2 called `input()` and blocked on a tty with no typist. The earlier `/fix` only worked because it ran in a terminal where the operator typed `.` at each prompt; the dashboard path (#119) had silently never been exercised past step 1 of a prompting workflow. A `[fail-loud-not-silent]` sibling — it blocked instead of failing.

**What shipped:** `_collect_input` gains a `non_interactive` param — when set (and no inline context), it returns `""` **without prompting** (step 1 still uses `--context`; later steps get nothing, which is correct for headless). Defense-in-depth: the cockpit now spawns runs with **`stdin=subprocess.DEVNULL`**, so any future stray `input()` hits EOF (already handled → break) instead of hanging on the server's tty.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **224 pass** (+3: non-interactive empty → "" without prompt; non-interactive uses inline; inline returned regardless). consistency-check CONSISTENT.

**Why it mattered:** this blocked **every multi-step dashboard run** — the headline feature of the #118–#133 arc. #133's log capture is what made it a 30-second diagnosis instead of another silent 15-min hang.

**Files touched (3):** `compass/orchestrator/run.py` · `compass/orchestrator/cockpit.py` · `compass/orchestrator/tests/test_graph.py` (+ CHANGELOG + this file). Counter: #134. **Retro #026 still due (#123–#127).** Dashboard-driven multi-step workflows actually run now.

### 2026-06-25 — cockpit server threaded (#135) + gate cards link to the artifact (#136)

**Trigger origin (Principle #19):** **live dashboard use (session).** Two issues in one sitting: (1) closing the browser tab left the cockpit "keeps loading" — the single-threaded `HTTPServer` wedged on a half-open socket; (2) the DRI asked, reviewing an awaiting gate: "it should give me a link to the doc that was created so I can review before approve/reject." The second was then *proven necessary* — a `create-brief` gate had been approved on a `pm.draft-brief` step that had actually **refused** (output was a blocker, not a brief); invisible without a review link.

**What shipped:**
- **#135** — `HTTPServer` → **`ThreadingHTTPServer`** (one line). A dropped/slow browser connection no longer blocks the dashboard's only worker; detached runs were never affected.
- **#136** — a **`review ↗`** link on every awaiting-gate card → **`GET /doc?run=<id>`** resolves the run's `project_dir`+`workflow` (from the spine fold), lists `docs/orchestrator-runs/<workflow>/*.md`, and renders one inline (nav links to each; validated filename, no traversal). Read the artifact, *then* approve/reject.

**Verification:** `python3 -m unittest discover -s compass/orchestrator/tests` → **226 pass** (+2: `_doc_link`/`_run_artifact_dir` resolution + gating; awaiting card carries the `/doc` link). consistency-check CONSISTENT.

**Surfaced (feeds #137):** the `pm.draft-brief` refusal was caused by the **claude-code host inheriting the user's global `~/.claude` memory + CLAUDE.md** — the agent read the DRI's "don't run /create-brief in the framework repo" note + acted like generic Claude Code ("I'll use the Workflow tool") instead of the PM agent, and wrongly claimed the (present, gate-approved) foundation docs were missing. Host-context isolation is the next fix.

**Files touched (3):** `compass/orchestrator/cockpit.py` · `compass/orchestrator/tests/test_events.py` · `CHANGELOG.md` (+ this file). Counters: #135 + #136. **Retro #026 still due (#123–#127).** You can now read before you decide — and the dashboard won't freeze when you close a tab.
