---
name: create-product-brief
status: active
owner: product-manager
auto_invokes: []
invoked_by: [manual]
version: 1.0.0
requires_approved: []
---

# Workflow: /create-product-brief

## Framework grounding

- **Strategy / discovery foundations:** [working-backwards] · [lean-mvp] · [continuous-discovery] · [jtbd]
- **Communication discipline:** [pyramid-principle] · [stripe-2-page] · [amazon-6-page]
- **Goal-setting:** [okrs]
- **Compass-originals operationalized:** [agent-as-surface-independent-unit] · [workflow-as-dispatch-graph] · [cite-or-mark-na] · [refuse-escalate] · [soft-spec-hardening] · [elicitation-with-options]
- **Verifies adherence to:** Principle #14 (soft spec → AI rationalization) · Principle #15 (cite-or-mark-n/a) · Principle #16 (refuse + escalate)

## Purpose

Produces the **product brief** — the engagement's mission, users, posture, scope, and measurable objectives — as **a page in the engagement's docs system** (Confluence / GDrive / Teams), with a **Jira ticket carrying each human approval**. It is the head of the lifecycle: `/create-product-brief` → MVP plan → epic.

**Docs-primary (#154).** The page IS the record. Compass authors it, publishes it under the engagement's parent page, and leaves **nothing in the project repo** — no file, no stub, no cache. Downstream workflows gate on the **approval ticket**, not on a repo path.

## Trigger

`/create-product-brief` — no arguments. The workflow opens by asking what the source material is.

## Architectural shape

Thin dispatch graph per `[workflow-as-dispatch-graph]`. Methodology lives in the agent task files; this file declares preconditions, the ordered `<agent>.<task>` sequence, and cross-agent verification.

**First pass is deterministic** (this graph, in this order). **Revision after the first pass is agentic** and lives in a separate command — see Notes.

## Where the artifacts live

| Artifact | Home | Approval |
| --- | --- | --- |
| Research findings | a page in `@docs`, under the engagement parent | the **research-review** Jira ticket |
| Product brief | a page in `@docs`, under the same parent | the **product-brief-approval** Jira ticket |

`@docs` is an **adapter slot**, not a vendor: it resolves to `connectors.docs` in `compass/config.yaml`. `confluence` is implemented; `gdrive` and `teams-sharepoint` are declared and raise until built (`[declare-not-implement]`).

## Preconditions (workflow-level GATE — checked once at start)

- **Source material present** — at least one of: signed SOW · free-text vision · link to an existing deck/page/doc · discovery workshop output. **On failure, refuse with:** *"Provide a SOW, a source link, workshop notes, or a vision statement to begin. This workflow will not invent a product from nothing."*
- **No brief awaiting approval** — if a product brief exists whose approval ticket is open, **refuse with:** *"A product brief is already in review (`<TICKET>`). Approve or reject it before re-invoking."*
- **No approved brief without `--amend`** — if an approved brief exists and `--amend` was not passed, **refuse with:** *"An approved product brief exists (`<TICKET>`). Re-run with `--amend` to supersede it."* Amending supersedes the prior version; it never deletes it.
- **Docs system reachable and credentialed** — the docs system is the system of record. If it cannot be written, **refuse** — *never* fall back to a repo file. A silent fallback recreates the dual-truth this design removes. (Enforced mechanically: `docs_adapter.DocsUnreachable`.)
- **Ticketing reachable and credentialed** — the approval tickets are the gate record. If Jira cannot be reached, refuse. (Enforced mechanically: `docs_primary.GateUnreachable`.)

## Roles invoked (agents dispatched)

- `compass/agents/researcher.md` — Task `cite-evidence-6-category-9-moat` (cited evidence + client-specific context; publishes the research page)
- `compass/agents/product-manager.md` — Task `draft-product-brief` (elicits, drafts, publishes the brief page)
- `compass/agents/delivery-manager.md` — Task `update-status`

## Dispatch graph

### Step 1. `researcher.cite-evidence-6-category-9-moat` (Researcher agent owns)

**Dispatches:** Researcher agent
**Task definition:** `compass/agents/researcher.md` → Task `cite-evidence-6-category-9-moat`
**Input:** source material (SOW · link · notes · vision text) · engagement name
**What it covers:** identify open questions → gather cited evidence → capture **client/engagement-specific context** (their systems, constraints, stakeholders, prior attempts) → state limitations and conflicting findings → separate evidence from recommendation → publish the research page under the engagement parent → open the **research-review** ticket → seed DRI (≥1 Decision AND ≥1 Risk).
**Output:** research page in `@docs` + research-review ticket

### Step 2. **HITL gate** (human) — research review

**Dispatches:** HUMAN (not an agent)
**Artifact target:** `research@docs`
**What it covers:** the human reviews the research page and moves the **research-review ticket to Done** to approve. The PM does not draft until this gate passes — an unvalidated evidence base must not become an approved commitment. Rejection re-dispatches the Researcher. **Per Principle #16:** agents must NOT self-approve.

### Step 3. `product-manager.draft-product-brief` (PM agent owns)

**Dispatches:** PM agent
**Task definition:** `compass/agents/product-manager.md` → Task `draft-product-brief`
**Input:** approved research page · source material · engagement name
**What it covers:** confirm gate (research approved) → **elicit every material unknown** with 3 concrete options + "other", capturing answers verbatim (no inference) → draft the brief: Vision · target users · problem · **Access & data posture** · scope in/out · **Objectives + Key Results** → publish the brief page under the engagement parent → open the **product-brief-approval** ticket → seed DRI ≥1 Decision → halt.
**Output:** brief page in `@docs` + product-brief-approval ticket

### Step 4. **HITL gate** (human) — brief approval

**Dispatches:** HUMAN (not an agent)
**Artifact target:** `product-brief@docs`
**What it covers:** the human reviews the brief and moves the **product-brief-approval ticket to Done**. That ticket is what downstream workflows read (`product-brief@tickets`); nothing downstream runs until it is Done. **Any later change to an approved brief reverts this ticket to pending** — an approved commitment always reflects something a human actually signed off on.

### Step 5. `designer.spec-design-foundation` (Designer agent owns)

**Dispatches:** Designer agent
**Task definition:** `compass/agents/designer.md` → Task `spec-design-foundation`
**Input:** approved brief (surfaces, audience, posture come from it)
**What it covers:** name every surface the product needs → state audience and context of use as constraints → set a **numeric** accessibility bar → declare the states every component must answer → record brand constraints or justified `n/a` → leave `## Visual direction (human)` as `<TBD>` → open the **design-foundation-approval** ticket → seed DRI ≥1 Decision → halt.
**Output:** design-foundation page in `@docs` + design-foundation-approval ticket

**Why here.** The brief settles who the product is for and what it must do; the design foundation is the first thing that depends on that and the last thing that can be decided cheaply. Specced later, every `create-story` run invents its own components and states, and the product accumulates a different answer per story.

**Why the agent does not choose the direction.** Palette, typeface and tone remain human work per #171. This step states what a direction must *satisfy* so the human choosing it knows the constraints and the choice can be checked against something.

### Step 6. **HITL gate** (human) — design foundation approval

**Dispatches:** HUMAN (not an agent)
**Artifact target:** `design-foundation@docs`
**What it covers:** the human reviews the foundation **and fills `## Visual direction (human)`** — palette, typeface, tone — then moves the **design-foundation-approval ticket to Done**. `designer.build-design-library` refuses to run while the direction is `<TBD>`: a library built against a direction nobody chose is a direction chosen silently by the agent.

### Step 7. `delivery-manager.update-status` (Delivery Manager agent owns)

**Dispatches:** Delivery Manager agent
**Task definition:** `compass/agents/delivery-manager.md` → Task `update-status`
**What it covers:** record that the product brief and the design foundation exist and are approved, with their page links, approval tickets, and dates.

## Workflow-level verification (final GATE)

Mirrors per-task postconditions + cross-agent invariants.

- [ ] (Step 1 — researcher) Every claim carries a **real citation** — no "TBD", no uncited assertion; anything unsourceable is explicitly marked unavailable **with a reason**
- [ ] (Step 1 — researcher) **Client/engagement-specific context** captured — their systems, constraints, stakeholders, prior attempts (not only generic market research)
- [ ] (Step 1 — researcher) **Limitations and conflicting findings stated** — sample bias, recency, gaps, and any evidence contradicting the recommendation
- [ ] (Step 1 — researcher) Evidence is separated from recommendation ("data says X" ≠ "we recommend Y")
- [ ] (Step 1 — researcher) Researcher DRI: **≥1 Decision AND ≥1 Risk** (Issues-only does not satisfy)
- [ ] (Step 1 — researcher) Research page published under the engagement parent; research-review ticket opened
- [ ] (Step 2 — HITL) Research-review ticket is **Done** before Step 3 dispatches
- [ ] (Step 3 — pm) Brief contains **all six mandatory sections**: Vision · target users · problem · Access & data posture · scope in/out · Objectives + Key Results
- [ ] (Step 3 — pm) **Access & data posture** — auth posture, data sensitivity, regulatory regime each carry a value OR explicit `n/a — <reason>`. Empty fails. Unjustified `n/a` fails. **Per Principle #15.**
- [ ] (Step 3 — pm) **Every Key Result is measurable** — metric + baseline + target + timeframe. A KR without a threshold fails (`[soft-spec-hardening]`)
- [ ] (Step 5 — designer) Every **surface** the product needs is named — a foundation covering one surface does not cover the others
- [ ] (Step 5 — designer) The accessibility bar is a **number** (contrast ratio · target size · keyboard coverage), not an adjective
- [ ] (Step 5 — designer) The **required-states contract** is declared — this is what the library is later checked against
- [ ] (Step 5 — designer) `## Visual direction (human)` is present and `<TBD>` — **not** filled by the agent (#171)
- [ ] (Step 6 — HITL) The human filled the visual direction before the ticket moved to Done — an approved foundation with a `<TBD>` direction blocks `build-design-library`
- [ ] (Step 3 — pm) **No inferred answers** — every material unknown was elicited with options and captured verbatim, not guessed
- [ ] (Step 3 — pm) PM DRI: ≥1 Decision entry
- [ ] (Step 3 — pm) Brief page published under the **same** engagement parent as the research page; approval ticket opened and linked to the page
- [ ] (Steps 1 + 3) **Nothing was written to the project repo** — `git status` is clean. No brief file, no stub, no cache
- [ ] (Step 4 — HITL) Human moved the approval ticket to Done. **Per Principle #16:** no agent self-approval
- [ ] (Step 5 — delivery-manager) Status records the brief with its page link, ticket, and approval date

Workflow is NOT complete until every item is checked.

## Output summary contract (mandatory to user)

- **TL;DR** — 3 lines max: what was published / current gate state / what's pending
- **Artifacts** — table: artifact · page URL · approval ticket · state
- **Next recommended command** — once approved: the MVP-plan workflow
- **Open questions or risks** — surfaced during research / elicitation (only if applicable)
- **Per-step agent dispatch** — which agent ran on which host

## Notes

### Revision is a separate command

This workflow's **first pass is deterministic** — the graph above, in order. **Changes after that are agentic** and belong to a separate revision command (#154 follow-up), which reads change requests from **Confluence page comments**, **Jira ticket comments**, and the **control-tower app**, applies them conversationally, and **reverts the approval ticket to pending**. `/create-product-brief` itself always does the first pass and refuses when a brief already exists — one command, one job.

### Anti-patterns

- **Silent filesystem fallback.** When the docs system is the record, an unreachable docs system is a REFUSAL, not a local write. Closed mechanically in `docs_adapter` (raises rather than falls back).
- **Inferring posture.** Auth posture, data sensitivity, and regulatory regime are PRODUCT decisions elicited from the human — never guessed from the source material. Architecture derives from them.
- **Approving on a status NAME.** Client Jira workflows rename statuses freely; the gate reads `statusCategory`, which is stable.
- **Drafting on unreviewed evidence.** Step 3 does not start until the research ticket is Done — that is the point of the first gate.
- **Reading this file alone and trying to execute it.** The step-by-step work lives in the agent task definitions. Load the named agent file for each step.

### Edge cases

- **Amend mode** — an approved brief is superseded, never deleted; the prior version remains in the docs system's page history and the prior ticket stays as the record of what was approved when.
- **Docs backend not implemented** — `gdrive` / `teams-sharepoint` raise `DocsBackendNotImplemented` naming what IS implemented, rather than failing obscurely.
- **Repo-mode consumers** — a project still on `source_of_truth: repo` keeps the classic repo-path gate; the ticket gate applies under `external`. Both forms are served by the same requirement checker.

---

_Authored at v1.0.0 (#154). Replaces `/create-product-brief`, which was repo-primary, had its dispatch graph ordered so Step 1 gated on Step 2's output, and carried an output gate that checked for sections its own template did not have._
