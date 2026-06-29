---
id: CT-1
type: architectural-initiative
status: proposed
priority: P0
parent:
portfolio_stub: false
depends_on: []
parallel_with: []
architecture_required: false   # core architecture decided in-session (Compass-primary projection); captured below + in tech notes
created: 2026-06-26
author: PM
sources:
  - compass strategic thesis (memory: compass-strategic-thesis)
  - artifact systems-of-record decision (memory: artifact-systems-of-record)
  - architecture roadmap (plan: humming-moseying-charm.md)
key_metric:
  name: unbroken ground-truth chain for one program
  baseline: "0 — today the tower goes dark at the merge line; deliverables aren't on a canonical store"
  target: "1 program rendered intake→live-and-measured with 0 blind links, Compass-canonical, projected to a Jira epic + Confluence page"
  source: control-tower exec view + spine coherence ledger
guardrails:
  - name: no zombie/lying state
    threshold: "0 runs shown in-flight that are actually dead; 0 'completed' runs that produced no artifact"
  - name: anti-lock-in preserved
    threshold: "canonical store remains plain markdown + append-only ledger, client-cloneable; no proprietary-only format"
measurement_window_days: 30
check_in_cadence: weekly
area_tags: [orchestrator, connector, cockpit, coherence]
estimate:
  duration_weeks: 4
  confidence: low
  refined_by: stub
  refined_at: 2026-06-26
---

# Control Tower MVP — a live, ground-truth WBS for one program

## Problem

A delivery exec's view of a program today is **status theater**: RAG decks and Jira boards report *self-asserted* status (gameable), and the truth surfaces too late (red at month 3, not week 1). Compass already executes the delivery spine (brief → architecture → stories → build → cross-model review → gated merge), but the picture **goes dark exactly where it matters** — past the merge line (deploy, migrate, runtime) there's no visibility, and the deliverables aren't held on a canonical store the tower can treat as truth. So the "control tower" can't yet make its one promise: *the status can't lie, because the status IS the work.*

## User

Primary: a **delivery exec / engagement MD** (the economic buyer) who wants to manage a portfolio **by exception** — spend time only on programs that need help, caught early. Secondary: the **delivery team** operating the program day-to-day, and (read-only) the **client**, for whom the black box becomes glass.

## Why this matters

This is the MVP that proves the company thesis on **one real program**: vendor-neutral, multi-model delivery that runs *on* the platform, so transparency is a byproduct of execution. It's also the **flagship demo** — and the sample program we walk through IS this bet (the tower tracking its own construction). Without it, Compass is a code-gen tool among many; with it, Compass is the layer none of them have.

## Hypothesis (the bet)

If we make Compass the **canonical store** for planning/governance deliverables, **project** them one-way to Confluence/Jira, and render one program's **full SDLC chain live with ground-truth status** (no blind links, no zombie state), then a delivery person who is *not* the builder can answer *"what is the true status of this program?"* from the tower alone — proving manage-by-exception on a real program, measured by a complete intake→live-and-measured chain within the window.

## Defensibility (moat impact)

- **Data gravity (Switching):** Compass owns the canonical deliverable → owns the relationship; Jira/Confluence become views.
- **Transparency-as-byproduct (Data/Speed):** the tower can't lie because it drives the work — unreplicable by report-only tools (Jira) or reveal-nothing tools (Cursor/Devin).
- **Vendor-neutrality (Regulatory/anti-lock-in):** canonical store is plain markdown + append-only ledger in a git repo the client can clone anytime — *"system of record AND zero lock-in,"* the opposite of Atlassian.

**Moat impact (one line):** strongest in the portfolio — it converts execution into a switching-cost + transparency moat simultaneously.

## Scope

### In scope
- **Coherence layer** (trust precondition): stale-run auto-halt, bookkeeping-promotion-on-merge, delivery observability (deploy/URL/flags). *(Down-payment shipped: gate-no-TTY-safety + authoring-write-default, #159.)*
- **Compass-primary store + projection**: canonical-on-Compass semantics + distribution-pointer model; **Jira** projection adapter (epic+stories, status→transition map, idempotent); **Confluence** projection adapter (product/brief/architecture pages, idempotent); **gate approval drives the Jira transition + Confluence update**; drift detection (Compass wins).
- **Exec control-tower view**: portfolio/WBS view (programs→epics→stories, live status); manage-by-exception surfacing; traceability-chain drill-down (intake→…→live→metric, no blind links); cost rollup.
- **Demo readiness**: seed multi-program history (this bet + one enterprise-relatable domain); scripted dry-run with one safe live beat.

### Out of scope
- Multi-user auth / hosting / SSO (productization step — git store is the MVP canonical store).
- **Two-way** reconcile of structured fields (push-first; Compass-owned fields are projection-only; selective two-way for human-native fields like comments is post-MVP).
- Live CI/cloud integration beyond the DRI's own stack (GitHub + Vercel + Postgres).
- Telegram/Slack surfaces; additional model hosts or workflows.

## Architecture decisions (captured in-session — why `architecture_required: false`)

- **Source of truth = Compass-primary, external projection** (`[compass-primary-with-external-projection]` — inverts external-primary). Planning/governance deliverables (product, epics, stories) are born + stored on Compass (canonical), then pushed one-way to Confluence/Jira. **Code stays GitHub-canonical** (Compass observes + reconciles deploy/DB; doesn't store code).
- **Build on the existing seam:** `compass/orchestrator/connector.py` already defines the store-adapter contract (`resolve_connector`/`push_artifact`/`set_frontmatter_status`/…), implements only filesystem with an honest fallback; `config.yaml` already names `ticketing: jira`, `docs: confluence` (declared, degrading to filesystem). MVP = graduate those two from declared → implemented as **one-way projection adapters** ([declare-not-implement] paying off).
- **Auth = API token (server-to-server)**, not interactive claude.ai MCP (headless/dashboard runs have no interactive MCP session).
- **Spine = coherence ledger:** per artifact `{type, canonical=compass, distribution-pointer (Jira key / Confluence page id), sync_status}`.

## Open questions for Researcher

- Jira/Confluence specifics (Cloud vs Server; the project's workflow states; the Confluence space) — needed to make the status-lifecycle → Jira-transition map real, not generic.
- Confluence page model (storage format / templates) for projecting product/brief/architecture.

## Research findings

_To be filled by Researcher._

## User pain input (from Support)

_n/a — internal architectural-initiative bet._

## Stories

_Decomposed into the full story set (the complete backlog) via `/create-story CT-1`. Each lives under `stories/<story-id>/`; built one at a time via `/build`._

**Planned WBS (the backlog to decompose):**

*Theme 1 — Coherence (trust precondition)*
- **CT-2** Stale-run auto-halt (heartbeat/timeout → `RUN_END(halted)`; tower shows ⚠ stalled with age) — depends on: none
- **CT-3** Bookkeeping-promotion-on-merge (story/status/bet docs land on `main` atomically with the code) — depends on: none
- **CT-4** Delivery observability (deploy status + live URL + feature flags surfaced through to the tower) — depends on: none
- *(shipped: gate-no-TTY-safety + authoring-write-default — #159, the down-payment)*

*Theme 2 — Compass-primary store + projection (core)*
- **CT-5** Compass-primary store semantics + distribution-pointer model (canonical-on-Compass; pointer fields; spine ledger entry) — depends on: none
- **CT-6** Jira projection adapter (push epic+stories; config-driven status→transition map; idempotent update-not-create via stored key) — depends on: CT-5
- **CT-7** Confluence projection adapter (push product/brief/architecture pages; idempotent via stored page id) — depends on: CT-5
- **CT-8** Gate approval drives Jira transition + Confluence update (the demo beat) — depends on: CT-6, CT-7
- **CT-9** Drift detection (external edits to Compass-owned fields flagged on spine; Compass wins / re-push) — depends on: CT-6, CT-7

*Theme 3 — Exec control-tower view (the demo face)*
- **CT-10** Portfolio/WBS view (programs → epics → stories with live ground-truth status) — depends on: none (reads spine + docs)
- **CT-11** Manage-by-exception surfacing (needs-attention: stalled/red/awaiting, oldest-first) — depends on: CT-2
- **CT-12** Traceability-chain drill-down (intake→brief→arch→stories→build→review→merge→deploy→migrate→live→metric, no blind links) — depends on: CT-4, CT-5
- **CT-13** Cost rollup per program — depends on: none

*Theme 4 — Demo readiness*
- **CT-14** Seed multi-program history (this CT-1 bet + one enterprise-relatable-domain program) — depends on: enough of T1–T3
- **CT-15** Demo dry-run + one safe live beat (scripted, pre-tested) — depends on: most

**Build order:** CT-5 + the Theme-1 coherence trio first (parallelizable; coherence already in flight) → CT-6/CT-7 → CT-8/CT-9; Theme-3 view stories ride alongside (CT-10/CT-11/CT-13 can start now against the existing spine; CT-12 after CT-4/CT-5); Theme-4 last. **Built one story at a time via `/build`** — sibling stories touching the same files merge serially.

## Scan summary

Latest scanner posture for this bet. Re-run `/scan CT-1` to refresh.

- **Last scanned:** _not yet scanned_
- **Blocking advance:** no

## Check-in log

_Populated automatically by `/measure` cron._

## DRI Log

### Decisions
- [2026-06-26] [PM] **Compass-primary, external projection** as the source-of-truth model (inverts the earlier external-primary call) — rationale: data-gravity moat + structurally-airtight ground truth + one-way push >> two-way sync + future license-consolidation value — area: connector — alternatives: external-canonical with cached pointer (rejected: weaker moat, two-way-sync swamp) — reversibility: medium.
- [2026-06-26] [PM] **The plan IS the demo sample** — CT-1 is authored as a real Compass bet so the control tower renders the construction of the control tower (self-referential, ground-truth) — area: process — reversibility: easy.
- [2026-06-26] [PM] **Scope cut**: auth/hosting, two-way reconcile, non-DRI CI/cloud, extra surfaces/hosts OUT of MVP — rationale: the demo is the MVP; depth on one chain over breadth — area: scope — reversibility: easy.

### Risks
- [2026-06-26] [PM] Jira workflow customization (per-org states/fields) could make the status-map brittle — likelihood: medium — impact: medium — mitigation: config-driven map; target the DRI's own Jira for the demo — area: connector.
- [2026-06-26] [PM] "Your data in our backend" lock-in objection from enterprise procurement — likelihood: medium — impact: medium — mitigation: lead with the git-cloneable plain-markdown portability story — area: positioning.

### Issues
- [2026-06-26] [PM] Researcher input needed on the DRI's actual Jira/Confluence setup before CT-6/CT-7 can be specced concretely — severity: medium — owner: PM/Researcher — status: open — area: connector.

---

_Approved by: <name> on <date>_
