---
name: setup-foundation-architecture
status: active
owner: enterprise-architect
auto_invokes: []
invoked_by: []
version: 0.3.2
---

# Workflow: /setup-foundation-architecture

## Framework grounding

What this workflow operationalizes. Full entries in `compass/framework/canon.md`.

- **Architecture frameworks:** [well-architected] (6-pillar scoring per stack pick) · [evolutionary-architecture] (fitness functions before stack choices)
- **Strategy / discovery (inherited from product bet):** [working-backwards] · [lean-mvp]
- **Communication discipline:** [pyramid-principle] · [stripe-2-page] · [amazon-6-page]
- **Compass-originals operationalized:** [elicitation-with-options] (4 cascading layer elicitations after a static anchor — **first instance**) · [cite-or-mark-na] (signal consultation 5-category; per-pillar scoring) · [refuse-escalate] (bet-arch deviation gate; HITL hard stop between phases) · [soft-spec-hardening]
- **Verifies adherence to:** Principle #14 (elicitation closes the "smart defaults" rationalization surface) · Principle #15 (signal consultation cite-or-n/a; per-pillar evaluations) · Principle #16 (refuse + escalate via bet-arch deviation gate; HITL hard stop scaffolds nothing without approval)

## Purpose

Creates the **foundational architecture bet** — the platform's load-bearing technical decisions captured as a measurable wager in `docs/foundation/architecture.md` and scaffolded into the repo. Runs in two phases with a HITL approval gate between them: nothing in the repo changes until the architecture is human-approved.

## Preconditions (workflow-level GATE — checked once at start)

- **Foundational product approved** — `docs/foundation/product.md` must exist with `status: approved`. **On failure, refuse with:** "Run `/setup-product` and get the product bet approved before invoking `/setup-foundation-architecture`."
- **No in-review architecture** — if `docs/foundation/architecture.md` exists with `status: proposed`, **refuse with:** "Existing architecture.md is in review. Approve, reject, or amend before re-invoking." (Amend of an `approved` architecture is allowed — see Step 1.)
- **State routing (per existing v0.2.x State detection table):** missing arch.md → Phase A; approved arch + scaffold not done → Phase B; approved arch + scaffold done → no-op (or amend creates v2). Scaffold-done detected via presence of boundary folders + `compass/config.yaml` Phase A decisions populated.

## Roles invoked

- `compass/agents/enterprise-architect.md` (migrated v0.3.36) — primary agent throughout both phases. NOTE: this workflow file predates the agent migration and still embeds full methodology; the agent file's `setup-foundation-architecture` task is the source of truth on divergence. Workflow refactor to dispatch-graph shape is tracked separately.

---

## Phase A — Decide & Document

### 1. Check state and handle amend

**Precondition (GATE):** Workflow invoked; workflow-level Preconditions pass.

**Work (Claude):** If `docs/foundation/architecture.md` exists with `status: approved`, ask user: amend (creates v2, supersedes v1) or abort? If amend: rename existing to `docs/foundation/architecture-v<N>.md`, flip its frontmatter to `status: superseded`. Increment the next-version number.

**Postcondition (GATE):** Either no architecture.md exists, OR existing approved file renamed `architecture-v<N>.md` with `status: superseded` and user has confirmed amend intent.

### 2. Load Enterprise/Solution Architect role context

**Precondition (GATE):** Step 1 postcondition holds.

**Work (Claude):** Load `compass/agents/enterprise-architect.md` as active agent context for the rest of the workflow.

**Postcondition (GATE):** EA role active.

### 3. Read foundational product bet

**Precondition (GATE):** EA role loaded.

**Work (Claude):** Read `docs/foundation/product.md` end-to-end. Note: target users, market positioning, defensibility moats, north-star metric, guardrails, measurement window, regulatory needs, and **Access & Data Posture** (the v0.3.1 section: auth posture · data sensitivity · regulatory regime) — auth model derives from this in Step 10.

**Postcondition (GATE):** Product bet loaded into working context with Access & Data Posture explicitly noted.

### 4. Derive fitness functions

**Precondition (GATE):** Product bet read.

**Work (Claude):** Derive measurable fitness functions from the product bet. **≥1 per Well-Architected pillar (6 minimum), each measurable in numbers — not adjectives.** Examples per pillar:
- **Reliability:** target uptime, MTTR, RPO/RTO
- **Security:** auth model implication, data-at-rest posture, compliance posture (HIPAA / SOC 2 / FedRAMP / none — derived from product Access & Data Posture)
- **Performance efficiency:** p95 latency, concurrent users, throughput
- **Cost optimization:** cost-per-user ceiling, year-1 infra budget
- **Operational excellence:** deploy frequency, on-call burden, observability coverage
- **Sustainability:** carbon-per-request budget or hosting-region constraints ("not load-bearing at current stage" is a valid answer for early-stage)

These are the architecture bet's falsification criteria. **Per [evolutionary-architecture] — fitness functions come BEFORE stack picks; they're the test the picks must satisfy.**

**Postcondition (GATE):** Fitness functions captured in working notes — ≥1 per pillar, each numerically measurable. Empty pillars fail.

### 5. Architecture research (6-category)

**Precondition (GATE):** Fitness functions declared.

**Work (Claude):** EA produces evidence across all 6 architecture-research categories (see `compass/agents/enterprise-architect.md` → Task `setup-foundation-architecture`, Phase A research framework). **"Smart default" / "team preference" is NOT a substitute** — mirrors the ban on Researcher's log-and-walk-away. Findings live in `docs/foundation/architecture.md` under "Architecture Research" OR a standalone `docs/foundation/architecture-research.md` if substantial.

**Postcondition (GATE):** Architecture research findings present with cited sources per category. Per [cite-or-mark-na] — empty cells fail; "n/a" without reason fails.

### 6. Signal consultation (5-category)

**Precondition (GATE):** Architecture research complete.

**Work (Claude):** In addition to *external* prior-art research, consult **existing project signal**. Especially load-bearing for amend flows (v2+); on initial v1 draft, most categories will be trivially `n/a — greenfield`. The 5 canonical categories:

1. **Production observability (if applicable)** — current baselines via configured MCP (Sentry / Datadog / etc.). Cite URL or `n/a — greenfield / no MCP configured`.
2. **Recent PR feedback** — Codex BLOCKERs / ISSUEs in foundational scope across the last ~10 PRs. Cite PR numbers or `n/a — no PRs yet in this scope`.
3. **Prior architectural decisions across all bets** — search `docs/bets/*/architecture.md` for prior decisions that touch foundational scope. Cite bet IDs or `n/a — no bets yet`.
4. **Bet-architecture deviation pressure** — any open bet that triggered the deviation gate (step 7 of `/create-bet-architecture`) and is waiting on this foundational amend? Cite bet IDs.
5. **Team playbooks** — search `docs/playbooks/*` for prior stack-specific learnings. Match by `stack_combo` tags. Cite or `n/a — empty directory` (valid for first-project bootstrap; mandatory once team has playbooks across projects).

**Per [cite-or-mark-na]:** each category produces a citation OR explicit `n/a — <reason>`. Uncited consultation is the violation.

**Postcondition (GATE):** All 5 signal-consultation categories addressed (cited or `n/a — <reason>` per category).

### 7. Derive foundational data model

**Precondition (GATE):** Signal consultation complete.

**Work (Claude):** Establish the data conventions every bet inherits. **Runs BEFORE stack picks — DB choice should be informed by data shape, not the reverse:**
- **Core entity noun-set** — extracted from the product bet (who, what, when, transactions). Each entity traces back to a line in `docs/foundation/product.md`. **Don't invent entities the product bet doesn't imply.**
- **Identity strategy** — UUID v7 / ULID / sequential / external IDs — with rationale.
- **Tenancy model** — single-tenant / pooled / siloed / hybrid — derived from product bet personas and defensibility moats.
- **Audit / event-sourcing posture** — full event log / change-data-capture / created-updated-only — derived from compliance + defensibility moats.
- **Soft vs hard delete convention.**
- **PII / sensitive-data handling** — what counts as PII, encryption at rest, retention windows. **Links to Security pillar + product Access & Data Posture.**
- **Timestamps convention** — UTC, `created_at` / `updated_at` columns, etc.
- **Migration strategy** — online / offline / blue-green / expand-contract — derived from Reliability + Operational excellence fitness functions.
- **High-level ERD** — Mermaid `erDiagram` block showing entities + key relationships. Cardinality marked.

No invented entities. No "we'll figure out tenancy later" — it shapes the DB choice, so decide now.

**Postcondition (GATE):** Foundational Data Model section drafted in `docs/foundation/architecture.md` with all sub-sections populated (no TBDs). Mermaid ERD present with cardinality. Every entity traces back to a product.md line.

### 8. Anchor elicitation (primary language + deployment model)

**Precondition (GATE):** Data model derived.

**Work (Claude):** **Per [elicitation-with-options] — present the static 3 anchor options + "Other (specify)" escape valve. Ask the user to pick; capture pick + rationale + per-pillar implication. Do NOT draft with "smart defaults" and ask for approval.**

Surface to user:

> "Pick the **anchor**: primary stack language + deployment model. This biases the cascading 4-layer elicitations that follow.
>
> 1. **TypeScript + Vercel** — full-stack Next.js, serverless, fast iteration. Pillar tradeoffs: high ops-simplicity (Vercel-managed), strong DX, cost scales with traffic, weaker for long-running workloads.
> 2. **TypeScript + AWS** — Node containers on ECS/Fargate. Pillar tradeoffs: fuller control, higher operational surface, cost-predictable at scale, more YAML.
> 3. **Python + managed PaaS** — FastAPI containers on Railway/Render/Fly. Pillar tradeoffs: polyglot data work and ML-friendly, simpler than AWS, smaller ecosystem for serverless edge.
> 4. **Other (specify)** — name it + 2-line rationale; what doesn't fit options 1-3?"

Capture the user's pick. Record in `docs/foundation/architecture.md` "Stack picks (elicited) → Anchor" subsection: picked option, one-line rationale, one-line per-pillar implication.

**Postcondition (GATE):** Anchor pick captured in architecture.md with rationale + per-pillar implication. If "Other": user-provided option + rationale recorded; downstream cascades fall back to static layer options (don't infer).

### 9. Frontend stack elicitation (cascading from anchor)

**Precondition (GATE):** Anchor captured.

**Work (Claude):** Present 3 frontend stack options **biased by the anchor pick**. Each option bundles framework + build tool + styling. Ask user to pick; capture pick + cascade rationale + per-pillar implication.

Example cascades:
- **Anchor=TS+Vercel:** Options favor (1) Next.js + Turbopack + Tailwind, (2) Remix + Vite + Tailwind, (3) Astro + Vite + CSS Modules
- **Anchor=TS+AWS:** Options favor (1) Next.js standalone + Turbopack + Tailwind, (2) Vite + React + Tailwind, (3) Remix + Vite + Emotion
- **Anchor=Python+PaaS:** Options include (1) React + Vite + Tailwind, (2) HTMX + Alpine + Tailwind, (3) Vue + Vite + Tailwind
- **Anchor=Other:** Fall back to static 3 — (1) Next.js + Turbopack + Tailwind, (2) Vite + React + Tailwind, (3) HTMX + Alpine

Plus "Other (specify)" escape.

**Postcondition (GATE):** Frontend stack pick captured in architecture.md "Stack picks (elicited) → Layer 1 — Frontend" with: picked option, how anchor biased the options surfaced, rationale, per-pillar implication.

### 10. Backend stack elicitation (cascading)

**Precondition (GATE):** Anchor + frontend captured.

**Work (Claude):** Present 3 backend stack options **biased by anchor + frontend**. Each option bundles framework + contracts format + **auth model** (derived from foundation-product **Access & Data Posture**, set in v0.3.1 — auth posture · data sensitivity · regulatory regime). Don't redefine the auth posture; derive auth-model implementation from it.

Example cascades:
- **Anchor=TS+Vercel, FE=Next.js:** Options favor (1) Next.js API routes + tRPC + Clerk/passkey, (2) Next.js + REST + NextAuth/passkey, (3) Hono on Vercel Functions + tRPC + Lucia
- **Anchor=TS+AWS:** Options favor (1) NestJS + REST OpenAPI + Cognito, (2) Fastify + tRPC + Lucia, (3) Hono containers + REST + Auth0
- **Anchor=Python+PaaS:** Options favor (1) FastAPI + OpenAPI + Authlib/passkey, (2) Django + DRF + django-allauth, (3) Litestar + OpenAPI + custom passkey

Plus "Other (specify)" escape.

**Per principle #16:** if the elicited auth model **diverges** from the product Access & Data Posture (e.g., product says "MFA-required" but pick says "no MFA"), refuse the pick and require alignment first.

**Postcondition (GATE):** Backend stack pick captured with cascade rationale, per-pillar implication, AND explicit reference to the product Access & Data Posture the auth model implements.

### 11. Data stack elicitation (cascading)

**Precondition (GATE):** Anchor + frontend + backend captured.

**Work (Claude):** Present 3 data stack options **biased by anchor + backend**. Each option bundles database + cache + object storage + secrets management. **DB choice MUST cite the Foundational Data Model** (step 7) — DB pick that ignores entity shape / identity strategy / tenancy / audit posture is the decide-before-derive anti-pattern and fails the postcondition.

Example cascades:
- **Anchor=TS+Vercel:** Options favor (1) Vercel Postgres + Upstash Redis + Vercel Blob + Vercel env, (2) Neon + Upstash Redis + R2 + Doppler, (3) Supabase (Postgres+Auth+Storage) + Upstash + Supabase env
- **Anchor=TS+AWS:** Options favor (1) RDS Postgres + ElastiCache + S3 + AWS Secrets Manager, (2) DynamoDB + ElastiCache + S3 + AWS SSM Parameter Store, (3) Aurora + ElastiCache + S3 + HashiCorp Vault
- **Anchor=Python+PaaS:** Options favor (1) Managed Postgres (Railway/Render/Neon) + Redis + S3-compatible + .env via PaaS, (2) PlanetScale (MySQL) + Upstash + R2 + Doppler, (3) Supabase + Redis + Supabase Storage + Supabase env

Plus "Other (specify)" escape.

**Postcondition (GATE):** Data stack pick captured with cascade rationale, per-pillar implication, AND explicit citation of how the picked DB satisfies the Foundational Data Model decisions (identity strategy, tenancy, audit posture, PII handling).

### 12. Ops stack elicitation (cascading)

**Precondition (GATE):** Anchor + frontend + backend + data captured.

**Work (Claude):** Present 3 ops stack options **biased by anchor + prior picks**. Each option bundles CI/CD + observability + IaC + deployment-target detail.

Example cascades:
- **Anchor=TS+Vercel:** Options favor (1) Vercel (CI/CD built-in) + Sentry + Vercel CLI + GitHub Actions checks, (2) GitHub Actions + Vercel + Sentry + Pulumi, (3) GitHub Actions + Vercel + Datadog + Terraform
- **Anchor=TS+AWS:** Options favor (1) GitHub Actions + ECS Fargate + Datadog + CDK, (2) AWS CodePipeline + ECS + CloudWatch + CDK, (3) GitHub Actions + EKS + Datadog + Terraform
- **Anchor=Python+PaaS:** Options favor (1) GitHub Actions + Railway/Render + Sentry + Railway/Render config, (2) GitHub Actions + Fly + Sentry + fly.toml, (3) GitHub Actions + Heroku + Papertrail + app.json

Plus "Other (specify)" escape.

**Postcondition (GATE):** Ops stack pick captured with cascade rationale, per-pillar implication, AND deploy-target details that map 1:1 to Phase B canary kinds (web | mobile | container | other).

### 13. Document constraints

**Precondition (GATE):** All 5 stack picks (anchor + 4 layers) captured.

**Work (Claude):** Document constraints explicitly in architecture.md "Context" section: regulatory (from product Access & Data Posture), team skill, performance (from fitness functions), cost (from fitness functions).

**Postcondition (GATE):** Constraints section populated; each constraint cites its source (product bet, fitness functions, or elicited rationale).

### 14. Finalize architecture.md draft

**Precondition (GATE):** All elicited picks captured; constraints documented.

**Work (Claude):** Compose remaining sections of `docs/foundation/architecture.md` using `compass/templates/foundation-architecture.md`: Decision (one paragraph summarizing posture from picks) · Boundaries (initial) · Cross-cutting standards · Hypothesis (the bet) · Guardrail metrics · **Alternatives considered (evaluated against fitness functions — not generic pros/cons; strawmen explicitly disallowed)** · Architecture Research findings (from step 5) · Consequences (positive + negative + lock-in). Frontmatter: `type: foundational-architecture`, `status: proposed`.

**Postcondition (GATE):** architecture.md exists with all template sections populated. Frontmatter `status: proposed`. Alternatives evaluated against fitness functions.

### 15. DRI log seeded

**Precondition (GATE):** architecture.md drafted.

**Work (Claude):** EA seeds DRI log with: technology decisions (rationale + alternatives + reversibility per pick) · risks (vendor lock-in, scaling, compliance, cost) · issues (open unknowns). **≥1 Decision AND ≥1 Risk entry; Issues optional.**

**Postcondition (GATE):** architecture.md DRI Log has ≥1 EA Decision AND ≥1 EA Risk entry. Issues-only does not satisfy.

### 16. Mirror to Confluence (optional — config-gated)

**Precondition (GATE):** DRI log seeded; `compass/config.yaml` `connectors.docs` set.

**Work (Claude):** If mirroring enabled, push architecture.md as a strategic technical doc to configured docs system. If disabled, skip — and log the skip as a DRI Decision in architecture.md ("mirroring not configured; skipped" — no silent skips per principle #3).

**Postcondition (GATE):** Either (a) mirrored with link captured, OR (b) skip logged as DRI Decision.

### Phase A Verification (mandatory — must pass before HITL gate)

- [ ] (Step 1) State handled — no existing architecture.md, OR existing approved version renamed `architecture-v<N>.md` with `status: superseded`
- [ ] (Step 4) Fitness functions declared — ≥1 per Well-Architected pillar (6 minimum), each measurable in numbers (not adjectives)
- [ ] (Step 5) Architecture research findings present across the 6 categories — **Per Principle #15 (cite-or-mark-n/a)** each category cited or `n/a — <reason>`
- [ ] (Step 6) Signal consultation present across all 5 categories — **Per Principle #15** each cited or `n/a — <reason>`; blank cells fail; "n/a" without reason fails
- [ ] (Step 7) Foundational Data Model section populated — every entity traces back to a product.md line (no invented entities); identity / tenancy / audit / delete / PII / timestamps / migration all decided (no TBDs); Mermaid ERD with cardinality present
- [ ] (Step 8) **Anchor pick captured** in Stack picks (elicited) — option, rationale, per-pillar implication. **Per [elicitation-with-options]** — user picked from 3 options + Other, not "smart default."
- [ ] (Steps 9-12) **All 4 layer picks captured** (frontend / backend / data / ops) — each with: picked option, cascade rationale (how anchor + prior picks biased options), one-line rationale, one-line per-pillar implication
- [ ] (Step 10) Backend pick's auth model **aligns with foundation-product Access & Data Posture** — no divergence (or divergence explicitly logged as DRI Risk with rationale)
- [ ] (Step 11) Data stack pick **cites the Foundational Data Model** — DB choice maps to identity strategy + tenancy + audit posture + PII handling
- [ ] (Step 12) Ops stack pick's deploy-target detail maps to Phase B canary kinds (web | mobile | container | other)
- [ ] (Step 14) Alternatives evaluated against fitness functions (not generic pros/cons, not strawmen)
- [ ] (Step 15) EA DRI has ≥1 Decision AND ≥1 Risk entry (Issues-only does not satisfy)
- [ ] (Step 16) Mirroring completed OR skip logged as DRI Decision
- [ ] **If `version > 1` (amend flow):** ADR / Amendments section has ≥1 new ADR entry with triggering bet/source cited
- [ ] Status: `proposed`

Workflow is NOT complete in Phase A until every item is checked. **Per Principle #16 — HITL approval cannot pass while any verification item is unchecked.**

### HITL Gate — hard stop between phases

Workflow **halts here**. Human reviews `docs/foundation/architecture.md` and flips `status: proposed` → `status: approved`.

**No scaffolding has been written. No `compass/config.yaml` populated. Nothing in the repo has changed except the docs.** This is deliberate — scaffolding creates the project's bones and is hard to reverse, so it waits on explicit approval of the architecture itself.

If HITL rejects: amend (creates v2) or abort. **Per Principle #16 — no scaffold runs on a rejected or pending architecture.**

---

## Phase B — Scaffold

Runs only when `docs/foundation/architecture.md` has `status: approved` AND scaffold has not yet been written.

### 17. Plan scaffolding

**Precondition (GATE):** architecture.md `status: approved`; scaffold not yet done.

**Work (Claude):** Present every file that will be created, grouped by purpose (entrypoints, configs, CI, etc.). **Wait for explicit user confirmation before writing** (per AGENTS.md principle #11 — no silent writes).

**Postcondition (GATE):** File plan presented as a table; user has explicitly confirmed.

### 18. Scaffold the repo

**Precondition (GATE):** User confirmed file plan.

**Work (Claude):** Write boundary folders, CI/CD configs, base configs per the confirmed plan. Use elicited picks from Phase A as the basis (no smart defaults at scaffold time — picks are already locked).

**Postcondition (GATE):** All files in the confirmed plan exist on disk; no extra files written.

### 19. Populate compass/config.yaml

**Precondition (GATE):** Scaffold written.

**Work (Claude):** Populate `compass/config.yaml` with Phase A team decisions (anchor + 4 layer picks + fitness function thresholds + tool selections).

**Postcondition (GATE):** `compass/config.yaml` has Phase A decisions captured in the appropriate sections.

### 20. Deploy canaries (load-bearing — one per target)

**Precondition (GATE):** Config populated; ops stack pick names ≥1 deploy target.

**Work (Claude):** For **each deploy target** named in the foundational architecture's ops stack pick — web (URL), mobile (dev-build artifact link), container (registry image), or other — produce a canary that proves the stack actually composes for *that target*. Capture each in `compass/config.yaml` `ci_cd.canary_artifacts[]` with `{kind, url, verified_at, notes?}`. Kinds: `web` | `mobile` | `container` | `other`.

**Multi-target projects need one entry per target.** A typical full-stack consumer app (web + mobile) needs both a web URL and a mobile dev-build link. A backend service needs both a deployed endpoint and (if shipping client SDKs) a published-package link.

**If any target's canary fails, treat as a Phase A blocker** — that target's architecture choice doesn't actually deploy yet. Loop: fix the Phase A architecture (additional ADR / Amendments entry naming what changed), re-scaffold the affected pieces for that target, re-canary. Don't proceed to step 21 until **all targets** are green.

*Why this is load-bearing:* foundational architecture choices that look fine on paper often don't compose on first contact with the actual deploy pipeline — and the failure can hide on one target while another target ships fine. Multi-round deploy debugging mid-project is the most expensive class of failure this gate prevents.

**Postcondition (GATE):** Every deploy target named in the ops stack pick has a corresponding entry in `canary_artifacts[]` with `verified_at` populated. Partial coverage fails.

### 21. Summarize what was written

**Precondition (GATE):** Canaries green.

**Work (Claude):** Output to user: table of files written + purpose, plus the canary URLs.

**Postcondition (GATE):** Summary table presented; user has visibility into what shipped.

### Phase B Verification

- [ ] (Step 17) All files in the scaffold plan were listed before any write
- [ ] (Step 17) User explicitly confirmed the plan
- [ ] (Step 18) Scaffold written; no extra files beyond the confirmed plan
- [ ] (Step 19) `compass/config.yaml` populated with Phase A decisions (anchor + 4 layer picks)
- [ ] (Step 20) **Deploy canaries green for every target** — every deploy target named in the ops stack pick has a corresponding entry in `compass/config.yaml` `ci_cd.canary_artifacts[]` with `{kind, url, verified_at}` populated. Multi-target projects must have one entry per target — partial coverage fails. If any target's canary failed, returned to Phase A with an ADR entry; did not proceed.
- [ ] (Step 21) Written-files summary table produced

---

## Output summary contract (mandatory to user)

- **TL;DR** — 3 lines max: architecture.md drafted (or scaffold complete) / current phase + status / what's pending
- **Files created / modified** — table with path + change type
- **Next recommended command** — once approved + scaffolded: `/create-bet-portfolio` (for new projects) or `/create-brief` (for mid-project bet addition)
- **Open questions or risks** — surfaced during elicitation, research, or scaffolding (only if applicable)

## Notes

### Anti-patterns

- **"Smart defaults" instead of elicitation** — drafting stack picks via inferred defaults and asking user to approve. Closed by [elicitation-with-options] — workflow asks; user picks from curated options; pick captured with rationale. (The Pre-v0.3.2 behavior this round explicitly replaces.)
- **Elicitation without cascade** — picking each layer independently of prior picks produces incoherent stacks (e.g., React frontend + Python backend + no JSON contract = friction). Cascade ensures coherent combinations.
- **Auth model divergence from product posture** — backend pick's auth implementation contradicts foundation-product Access & Data Posture (e.g., product says MFA-required, pick says passwordless-only). Caught in Step 10 Postcondition; refuse + escalate.
- **DB pick that ignores data model** — picking a database without citing Foundational Data Model (identity / tenancy / audit / PII). Caught in Step 11 Postcondition.
- **Scaffold before HITL approval** — writing repo files before architecture.md is approved. Closed by HITL hard stop between Phase A and Phase B.
- **Single-target canary on multi-target stack** — assuming one canary covers all deploy targets (e.g., web canary green ≠ mobile canary green). Closed by per-target canary requirement in Step 20.

### Edge cases

- **Anchor = Other (specify)** — user named a custom anchor that doesn't fit options 1-3. Downstream cascades fall back to static 3 layer options per layer (don't try to infer cascade from custom anchor).
- **Amend mode** — existing approved architecture.md renamed `architecture-v<N>.md` with `status: superseded`. New v2 starts at `status: proposed` and goes through full Phase A Verification again. ADR / Amendments section MUST gain ≥1 new entry citing the triggering bet/source.
- **Mirroring disabled** — if `compass/config.yaml` connectors don't include docs, Step 16 skipped and logged as DRI Decision.
- **No mobile target** — if ops stack pick has no mobile deploy target, Step 20 canary list excludes mobile kind (only the targets actually picked).

### Migration (v0.3.2 hardening)

- **Translated to gate/work/postcondition template** per v0.3.0-alpha precedent (same as `/setup-product`). Structural translation of v0.2.x Phase A/B + State detection table into workflow-level Preconditions + numbered triplet steps.
- **Framework grounding section added** per v0.3.0-alpha Part 2 — cites [well-architected], [evolutionary-architecture], [elicitation-with-options] (Compass-original), cross-cutting principles #14 / #15 / #16.
- **NEW: elicitation-with-options pattern (steps 8-12)** — replaces the old "Make project-level choices" single bullet (13 stack rows with smart defaults) with structured anchor + 4 cascading stack-layer elicitations. **First instance of the [elicitation-with-options] Compass-original.** Deliberate violation of v0.3.0-alpha's "preserve all existing behavior" hardening rule — the elicitation is a behavior change, per user direction. Documented as precedent break in `compass/workflows/improvements.md`.
- **All other behavior preserved:** Phase A/B split with HITL gate, foundational data model derivation before stack picks (v0.1.12), bet-arch deviation gate referenced from `/create-bet-architecture` (v0.2.4), multi-target canary in Phase B (v0.2.7), ADR / Amendments pattern (v0.2.4), 6 Well-Architected pillar scoring (v0.1.11 — now baked into each elicitation step's per-pillar implication rather than separate).
- **Step count:** Phase A 12 → 16 steps (added 5 elicitation steps, removed 1 "make project-level choices" step). Phase B 5 steps unchanged (renumbered 17-21).

---

_Workflow hardened 2026-05-27 (v0.3.2) per `compass/templates/workflow-template.md`. Second workflow translated; first to add the [elicitation-with-options] pattern. Validation observations in `compass/workflows/improvements.md`._
