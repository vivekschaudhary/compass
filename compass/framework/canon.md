# Compass — Canonical Framework References

Reference material cited by Compass workflows' "Framework grounding" sections. Each entry: **name · originator · year · one-sentence contribution.** Reference material, not an essay — additions go here in the same shape.

Cited via short-form in workflows: e.g., `[working-backwards]` → links to that entry.

## Strategy / discovery foundations

### working-backwards
**Working Backwards / PR-FAQ** — Amazon (Jeff Bezos, ~2004); popularized in *Working Backwards* (Bryar & Carr, 2021). Start from the customer outcome (a draft press release + FAQ) and derive the product backward — forces the team to write the win before designing the build.

### lean-mvp
**Lean Startup MVP + Build–Measure–Learn** — Eric Ries, *The Lean Startup* (2011). Treat product features as falsifiable hypotheses; validate the smallest experiment that produces signal before scaling.

### continuous-discovery
**Continuous Discovery Habits** — Teresa Torres, *Continuous Discovery Habits* (2021). Weekly customer contact + opportunity-solution trees as the cadence for keeping the product-discovery loop alive (vs. quarterly research rounds).

### jtbd
**Jobs-to-be-Done** — Clayton Christensen (formalized ~2003; lineage to Theodore Levitt 1960). Frame features by the job the user hires the product to do, not by the user's demographic; "people don't buy quarter-inch drills, they buy quarter-inch holes."

## Competitive position

### porter-5-forces
**Porter's Five Forces** — Michael Porter, *Competitive Strategy* (1980). Industry-level analysis of supplier power, buyer power, threat of new entrants, threat of substitutes, and rivalry; tells you whether the industry is profitable to enter.

### helmer-7-powers
**Helmer's 7 Powers** — Hamilton Helmer, *7 Powers* (2016). Company-level moat analysis: scale economies, network effects, counter-positioning, switching costs, branding, cornered resource, process power. Compass extends to a 9-type catalog for foundational-product defensibility.

### blue-ocean
**Blue Ocean Strategy** — W. Chan Kim & Renée Mauborgne, *Blue Ocean Strategy* (2005). Create uncontested market space rather than competing in red oceans of head-to-head competition; framework includes the "four actions" (raise / reduce / eliminate / create).

## Bet-based commitment

### shape-up
**Shape Up — "shape → bet → build" cycle** — Ryan Singer / Basecamp, *Shape Up* (2019). Six-week appetite-bounded cycles; work is shaped before it's committed; the bet table replaces backlogs.

### helmer-bet-portfolio
**Helmer's mathematical bet portfolio model** — Hamilton Helmer / Deep Strategy investment firm methodology. Frames strategic decisions as a portfolio of bets sized by 7 Powers' expected value; informs how Compass treats foundational + feature bets as a measurable wager set.

## Communication discipline

### pyramid-principle
**Pyramid Principle / TL;DR-at-top** — Barbara Minto (McKinsey lineage, *The Minto Pyramid Principle*, 1973+ editions). Conclusion first, supporting arguments next, evidence last — the inverse of how thinking happens, but how reading happens.

### stripe-2-page
**Stripe's 2-page narrative tradition** — Stripe internal practice (~2014+, surfaced in engineering blog posts and Patrick Collison interviews). Cascading strategy docs at fixed page budgets force forcing-function compression; budget = signal of seriousness.

### amazon-6-page
**Amazon's 6-page narrative memo** — Amazon (Jeff Bezos, ~2004). Meetings open with silent reading of a 6-page narrative memo; PowerPoint banned. Forces the writer to do the synthesis the reader would otherwise have to do live.

## Goal-setting

### okrs
**OKRs (Objectives & Key Results)** — Andy Grove (Intel, 1970s) → John Doerr, *Measure What Matters* (2018). Objective = ambitious qualitative goal; Key Results = measurable outcomes that prove the objective. Compass uses for foundational + quarterly OKR bets.

### north-star
**North Star Framework** — Amplitude (Sean Ellis lineage, formalized ~2017-2019). Single metric that captures core customer value; serves as the strategic compass for cross-functional alignment.

## Architecture frameworks

### well-architected
**AWS Well-Architected Framework** — Amazon Web Services (2015; sustainability pillar added 2021). Six pillars: **reliability · security · performance efficiency · cost optimization · operational excellence · sustainability**. Compass uses the six pillars as scoring axes for every foundational architecture decision (each stack pick gets per-pillar rationale). Framework is cloud-vendor-named but principles apply to any deployment target (on-prem, multi-cloud, edge).

### evolutionary-architecture
**Building Evolutionary Architectures** — Neal Ford, Rebecca Parsons, Patrick Kua (2017; 2nd edition 2022). Introduces *fitness functions* as continuous architectural tests — objective, measurable criteria the architecture must satisfy. Compass operationalizes via the "derive fitness functions before stack choices" ordering in `/setup-foundation-architecture`: fitness functions name the falsification criteria; stack picks derive from them.

## Compass-original patterns

### cite-or-mark-na
**Cite-or-mark-n/a enforcement** — Compass principle #15. For N-category structured consultations (Researcher 6-category, Architect 6-pillar + 6-research, Architect signal-consultation 5-category, Story standard-experience 6, Architect playbook 5th), each category produces a citation OR explicit `n/a — <reason>`. Empty cells and unjustified n/a both fail.

### refuse-escalate
**Refuse + escalate to upstream artifact** — Compass principle #16. When a workflow detects an attempt to silently widen an upstream decision (foundational stack, data model, fitness functions), it refuses and escalates to the workflow that owns the decision. No silent in-place widening.

### soft-spec-hardening
**Soft spec → AI rationalization → hardening recipe** — Compass principle #14 (foundational). Anywhere an agent has interpretive room, it exercises judgment that diverges from intent. The fix is explicit constraint + mechanical verification gate + named anti-pattern in the workflow file. Drives the gate/work/postcondition template structure.

### elicitation-with-options
**Elicitation-with-options** — Compass-original interaction pattern (v0.3.2). When a workflow must surface choices to the user (stack picks, configuration decisions, posture declarations), it presents **3 widely-used options + an "Other (specify)" escape valve**. The first decision is **static** (an anchor — same 3 options regardless of context); subsequent decisions **cascade** (options biased by prior picks for coherent combinations). Each pick is captured with cited option + rationale in the workflow's output artifact. Reduces agent rationalization (principle #14) at decision points where genuine user input matters — replaces "draft with smart defaults, ask user to approve" with "ask user, present curated options, capture pick." First applied in `/setup-foundation-architecture` (4 cascading stack-layer elicitations after an anchor decision).

### freshness-check
**Freshness-check** — Compass-original pattern (v0.3.3). Compass docs that reference external-tool formats / APIs / conventions get **frontmatter markers**: `last_verified: <date>`, `freshness_window_days: <N>`, `external_source: <URL>`. Workflows that depend on those docs add a **Precondition step** that reads the markers and refuses if `today - last_verified > freshness_window_days`. Refusal points the user at the canonical external source + the Compass file to update. Missing `last_verified` is treated as infinitely stale (forces one-time backfill on first use). Closes the soft-spec-rationalization surface where Compass docs silently go stale against evolving external tools (principle #14: "the docs might be current, let me try anyway"). **Pull-bridge round 1** of three: v0.3.3 = workflow-side date check (this); **round 2 — shipped v0.3.7** (after 3 consecutive slips from v0.3.4 → v0.3.5+ → v0.3.6+): framework-side detection via `compass/scripts/check-freshness.py` + `.github/workflows/freshness-check.yml` — script walks `compass/` for files with `last_verified:` frontmatter; queries external sources (GitHub API releases/tags/commits or HTTP Last-Modified); auto-bumps `last_verified` where the source is unchanged (safe); flags where it has changed (manual review); errors when network fails. Workflow runs Mondays 06:00 UTC; opens PR for bumps or Issue for flags-only weeks. **Honest accuracy bounds:** detection is HTTP-level (timestamp comparison), not semantic — a doc page may change cosmetically without affecting Compass; the script flags it anyway. Auto-bump only happens when external is UNCHANGED (safer to flag than silently mark stale docs fresh). **Round 3 (v0.4+):** distribution — Compass framework updates auto-propagate to consuming repos as PRs (still deferred; multi-consumer reality observed in v0.3.7 cycle — aura-app at v0.2.x + crypto-app at v0.3.x with no sync mechanism between them — strengthens the case). First applied: Codex review format in `/build` (refusal when `compass/roles/reviewer.md` is stale). **v0.3.6 extension — review-time application:** the pattern also applies at review time, not just at doc-load time. When a story or DRI Decision names a runtime behavior or file convention as load-bearing ("Next.js middleware uses X", "Vercel Functions support Y in this region"), Codex re-verifies the claim against the named tool's current primary docs rather than trusting the story-as-written. Story claims about framework behavior can go stale between when written and when reviewed. See `compass/roles/reviewer.md` "Review-time freshness" subsection.

### role-boundary
**Role-boundary** — Compass-original pattern (v0.3.4). Workflow steps that load or transition roles include structured HTML-comment markers: `<!-- COMPASS_ROLE_BOUNDARY: <enter|exit> | role=<name> | workflow=<id> | step=<N> -->`. The markers serve two purposes: **documentation** (translators / readers see explicit role transitions) and **parser anchors** (the reference parser at `compass/scripts/token-usage.py` maps Claude Code session messages to workflow steps using these markers, then attributes tokens per role). Compass ships the protocol + a sample Python 3 stdlib parser; consumers can adopt as-is or fork. **Accuracy is rough, not exact** — the parser assumes Claude executes steps in linear order; user interruptions, multi-message steps, and out-of-order tool calls complicate attribution. Report includes a Confidence footer naming the heuristics used. PM-owned by convention (matches existing `/status` + `/plan` ownership of "make work visible" jobs). First applied: `/build` (Engineer + Codex + Tech Writer markers across Phase 1–7).

### agent-handoff
**Agent-handoff** — Compass-original pattern (v0.3.5). When a workflow routes work between AI agents (Engineer → Reviewer, Architect → Engineer, etc.), Compass defines a 5-piece handoff shape so the user is not the bridge: **trigger artifact** (the medium that signals "next agent's turn" — PR, issue, label, file) · **trigger event** (what fires the next agent — GitHub event, webhook, status check) · **context window** (what state the receiving agent reads) · **output medium** (where receiving agent posts response) · **loop signal** (how the sending agent knows there's a response to react to). Compass ships a reference GitHub Actions template at `compass/scripts/agent-handoff.yml` parameterized over the reviewer agent — the consuming repo copies it to `.github/workflows/`, picks ONE reviewer block (Codex / Claude headless / Gemini / generic), sets the matching API-key secret, and the Engineer → Reviewer handoff stops requiring tool-switching. **Agent-agnostic by design** — the pattern abstracts over which AI plays the reviewer role. First applied: `/build` Phase 5 step 13 references the automated path (with manual fallback). Vendor CLI install commands and flags are **drift-prone** — sibling README tracks `last_verified` per `[freshness-check]`.

### mechanical-output-verification
**Mechanical-output-verification** — Compass-original pattern (v0.3.6). When a workflow requires a build, deploy, or framework-discovery step, the **postcondition is inspection of the build OUTPUT or runtime artifact, not just the build PROCESS exit code**. Source intent and build output can diverge silently — the build process can complete cleanly while the runtime configuration drops what the source declared. **Inspect the artifact that actually runs**, not the source that was supposed to compile into it. Sharper version of Principle #14 — the soft spec being rationalized is increasingly subtle ("the build succeeded" / "the tests pass" / "the principle is cited in the comment"); the fix is reading the actual runtime artifact, not trusting surrounding signals. Framework-specific anchors: **Next.js 16** (`.next/server/functions-config-manifest.json` — `/_middleware` entry registers middleware/proxy on Next 16+; `routes-manifest.json`, `app-paths-manifest.json`, `prerender-manifest.json`); **Pre-v16 Next** (legacy `.next/server/middleware-manifest.json` — empty by design in 16.x; cross-check with functions-config-manifest.json on 16+); **Vercel Functions** (`.vercel/output/functions/`); **Expo** (prebuild native config + bundle); **general principle** — when runtime configuration is data-driven (manifests, bundle indexes, config JSON written by the build), reading source ≠ reading runtime. **Two instances at codification:** (1) `/build` Phase 2 step 7 build-artifact inspection from aura-app CB-1.4 dashboard proxy (middleware-manifest.json check revealed gap between source intent and runtime config, 2026-06-01); (2) Codex's own retrospective from the same cycle ("Start with framework registration checks before reading functional tests" + "Prefer 'is this actually deployed by the framework?' over 'do the tests pass?'"). Closes the **`polished-but-broken`** anti-pattern (tests pass + build green + narrative coherent + behavior wrong). Applied: `/build` Phase 2 step 7 (Engineer self-check) + `compass/roles/reviewer.md` Step 0 (Codex review process — framework-registration check before functional analysis). **4th enforcement-class member** (joining cite-or-mark-n/a · refuse-escalate · soft-spec-hardening); resets catalog balance to 4 enforcement : 4 usability.

---

_Reference material. Add new entries in the same shape: short name (lowercase-kebab), **bold full name + originator + year**, one-sentence contribution. No essay prose._
