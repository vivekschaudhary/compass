# Compass — workflows and steps

Compiled from `compass/seed/*.csv` at `8ef8e2f6` — the rows v2 imports and executes. Not from `compass/workflows/*.md`, which are the dispatch graphs, and not from the `### Task:` sections in `compass/agents/*.md`, which do not run.

**21 workflows · 102 steps · 226 criteria · 16 roles**

## How to read a row

A row names who acts, on what basis, producing what, after what, accepted by whom — the row *is* the instruction.

| Column | Means |
|---|---|
| **#** | `ord` — position in the workflow |
| **Kind** | `AI` an agent drafts · `Human` a person reviews/decides (hard stop) · `Nested` opens another workflow · `Machine` code runs, no model |
| **Role** | the role that owns the row |
| **Task** | the step slug — what criteria and `depends_on` point at |
| **Produces** | the deliverable filed by this row |
| **Reads** | the basis handed to the row |
| **After** | `depends_on` — rows that must be closed first, in this run |

## Index

| Workflow | Workstream | Phase | Owner | Steps | Criteria | Repeats | Enabled |
|---|---|---|---|--:|--:|---|---|
| [`onboarding`](#onboarding) | Delivery | Onboarding | PMO Analyst | 1 | 2 | no | yes |
| [`sprint-0`](#sprint-0) | Delivery | Discovery | Delivery Manager | 25 | 53 | no | yes |
| [`design-library`](#design-library) | Design | Discovery | Designer | 6 | 14 | yes | yes |
| [`foundation-architecture`](#foundation-architecture) | Engineering | Discovery | Staff Engineer | 9 | 25 | no | yes |
| [`epics`](#epics) | Product | Discovery | Product Owner | 7 | 16 | yes | yes |
| [`product-brief`](#product-brief) | Product | Discovery | Product Owner | 7 | 20 | no | yes |
| [`release`](#release) | Delivery | Build | Delivery Manager | 0 | 0 | yes | **no** |
| [`sprint`](#sprint) | Delivery | Build | Delivery Manager | 7 | 18 | yes | yes |
| [`sprint-plan`](#sprint-plan) | Delivery | Build | Product Owner | 6 | 16 | yes | yes |
| [`build`](#build) | Engineering | Build | Engineer | 5 | 15 | yes | yes |
| [`feature-architecture`](#feature-architecture) | Engineering | Build | Staff Engineer | 3 | 10 | yes | yes |
| [`fix`](#fix) | Engineering | Build | Engineer | 6 | 16 | yes | yes |
| [`tech-design`](#tech-design) | Engineering | Build | Staff Engineer | 3 | 10 | yes | yes |
| [`job-aids`](#job-aids) | GTM | Build | Tech Writer | 0 | 0 | yes | **no** |
| [`launch-readiness`](#launch-readiness) | GTM | Build | GTM | 0 | 0 | yes | **no** |
| [`release-comms`](#release-comms) | GTM | Build | GTM | 0 | 0 | yes | **no** |
| [`feature`](#feature) | Product | Build | Product Owner | 3 | 11 | yes | yes |
| [`story`](#story) | Product | Build | Product Manager | 5 | 0 | yes | **no** |
| [`learn`](#learn) | Product | Operate | Product Manager | 0 | 0 | yes | **no** |
| [`measure`](#measure) | Product | Operate | Researcher | 0 | 0 | yes | **no** |
| [`triage`](#triage) | Support | Operate | Support | 9 | 0 | yes | yes |

## What nests what

```
sprint-0     #2   draft-product-brief              opens →  product-brief
sprint-0     #15  draft-features                   opens →  feature
sprint-0     #16  draft-foundation-architecture    opens →  foundation-architecture
sprint-0     #17  draft-feature-architecture       opens →  feature-architecture
sprint-0     #18  build-design-library             opens →  design-library
sprint-0     #19  draft-epics                      opens →  epics
sprint-0     #23  draft-sprint-plan                opens →  sprint-plan
sprint       #1   sprint-planning                  opens →  sprint-plan
epics        #7   design-epics-tech                opens →  tech-design
```

---

# The workflows

<a id="onboarding"></a>
## `onboarding` — Onboarding engagement

**Delivery** workstream · **Onboarding** phase · owned by **PMO Analyst** · runs once

1 step — 1 machine

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | Machine | — | `validate-connections` | — | — | — |

**Titles** — what the person sees in the queue:

- `validate-connections` — Validate the connections

### Gates — 2 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `validate-connections` | done | The doc store answers | `connector` docs is wired |
| `validate-connections` | done | The tracker answers | `connector` tickets is wired |


<a id="sprint-0"></a>
## `sprint-0` — Discovery

**Delivery** workstream · **Discovery** phase · owned by **Delivery Manager** · runs once

25 steps — 10 human, 8 ai, 7 nested

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 0 | AI | Delivery Manager | `file-sow` | SOW | — | — |
| 1 | AI | Delivery Manager | `file-requirements` | Requirements | — | `file-sow` |
| 2 | Nested ↳ `product-brief` | Product Owner | `draft-product-brief` | — | — | `file-sow`, `file-requirements` |
| 3 | AI | Delivery Manager | `draft-timeline` | Milestones and timeline | — | `file-sow` |
| 4 | Human | Delivery Manager | `review-timeline` | — | — | `draft-timeline` |
| 5 | Human | Product Manager | `approve-timeline` | — | — | `review-timeline` |
| 6 | AI | Delivery Manager | `propose-staffing` | Staffing plan `[roster]` | — | `draft-timeline`, `approve-timeline`, `file-sow` |
| 7 | Human | Delivery Manager | `review-staffing` | — | — | `propose-staffing` |
| 8 | Human | Product Manager | `approve-staffing` | — | — | `review-staffing` |
| 9 | AI | Delivery Manager | `draft-raci` | RACI | — | `propose-staffing`, `approve-staffing` |
| 10 | Human | Delivery Manager | `review-raci` | — | — | `draft-raci` |
| 11 | Human | Product Manager | `approve-raci` | — | — | `review-raci` |
| 12 | AI | Delivery Manager | `draft-ways-of-working` | ways-of-working | — | `propose-staffing`, `approve-staffing`, `draft-raci`, `approve-raci` |
| 13 | Human | Delivery Manager | `review-ways-of-working` | — | — | `draft-ways-of-working` |
| 14 | Human | Product Manager | `approve-ways-of-working` | — | — | `review-ways-of-working` |
| 15 | Nested ↳ `feature` | Product Owner | `draft-features` | — | — | `file-sow`, `file-requirements`, `draft-product-brief` |
| 16 | Nested ↳ `foundation-architecture` | Staff Engineer | `draft-foundation-architecture` | — | — | `file-requirements`, `file-sow`, `draft-product-brief`, `draft-features` |
| 17 | Nested ↳ `feature-architecture` | Staff Engineer | `draft-feature-architecture` | — | — | `draft-product-brief`, `draft-foundation-architecture`, `draft-features` |
| 18 | Nested ↳ `design-library` | Designer | `build-design-library` | — | — | `draft-product-brief`, `file-requirements` |
| 19 | Nested ↳ `epics` | Product Owner | `draft-epics` | — | — | `file-requirements`, `draft-product-brief`, `draft-features`, `draft-timeline`, `approve-timeline` |
| 20 | AI | Delivery Manager | `tailor-delivery-plan` | delivery plan | deliverables | `draft-raci`, `approve-raci`, `draft-timeline`, `approve-timeline`, `draft-epics`, `propose-staffing`, `approve-staffing`, `file-sow`, `draft-features`, `draft-foundation-architecture`, `draft-feature-architecture` |
| 21 | Human | Delivery Manager | `review-delivery-plan` | — | — | `tailor-delivery-plan` |
| 22 | Human | Product Manager | `approve-delivery-plan` | — | — | `review-delivery-plan` |
| 23 | Nested ↳ `sprint-plan` | Product Owner | `draft-sprint-plan` | — | deliverables | `draft-epics`, `propose-staffing`, `approve-staffing`, `tailor-delivery-plan`, `approve-delivery-plan` |
| 24 | AI | Delivery Manager | `kickoff` | kickoff | — | `draft-sprint-plan`, `draft-ways-of-working`, `approve-ways-of-working`, `tailor-delivery-plan`, `approve-delivery-plan` |

**Titles** — what the person sees in the queue:

- `file-sow` — File the SOW
- `file-requirements` — File the Requirements
- `draft-product-brief` — Product brief
- `draft-timeline` — Milestones and timeline
- `review-timeline` — Review the timeline
- `approve-timeline` — Review and approve the timeline
- `propose-staffing` — Staffing plan and resources
- `review-staffing` — Review the staffing plan
- `approve-staffing` — Review and approve the staffing plan
- `draft-raci` — Roles and responsibilities
- `review-raci` — Review the RACI
- `approve-raci` — Review and approve the RACI
- `draft-ways-of-working` — Team working agreement
- `review-ways-of-working` — Review the working agreement
- `approve-ways-of-working` — Review and approve the working agreement
- `draft-features` — Features and how each is judged
- `draft-foundation-architecture` — Foundation architecture
- `draft-feature-architecture` — Feature architecture
- `build-design-library` — Design library
- `draft-epics` — Epics from milestones and features
- `tailor-delivery-plan` — Tailor the delivery plan
- `review-delivery-plan` — Review the delivery plan
- `approve-delivery-plan` — Review and approve the delivery plan
- `draft-sprint-plan` — Sprint plan for sprint 1
- `kickoff` — Kickoff

### Gates — 53 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `(workflow)` | ready | The systems of record answered | `connector` docs is wired |
| `(workflow)` | ready | _(no statement — measured as `connector` tickets is wired)_ | `connector` tickets is wired |
| `file-sow` | done | The SOW is filed — everything downstream derives from it and cannot be invented | `document` SOW status published |
| `file-requirements` | done | The requirements are filed | `document` Requirements status published |
| `file-requirements` | done | They are filed as supplied, not paraphrased — everything downstream cites them and cannot tell a summary from the source | judgment — a person confirms |
| `draft-product-brief` | done | The product brief is published | `document` product-brief status published |
| `draft-product-brief` | done | Every feature the SOW commits to is covered or named out of scope | judgment — a person confirms |
| `draft-timeline` | done | The timeline is published | `document` Milestones and timeline status published |
| `review-timeline` | done | The timeline is published | `document` Milestones and timeline status published |
| `review-timeline` | done | Every milestone has a date and something it delivers | judgment — a person confirms |
| `approve-timeline` | done | The timeline is published | `document` Milestones and timeline status published |
| `approve-timeline` | done | The dates are ones the engagement can be held to, not the ones the SOW hoped for | judgment — a person confirms |
| `approve-timeline` | done | The timeline is accepted by the product manager, and their name is on the close | judgment — a person confirms |
| `propose-staffing` | done | The roster is published | `document` Staffing plan status published |
| `review-staffing` | done | The roster is published | `document` Staffing plan status published |
| `review-staffing` | done | Every role a later phase assigns work to has a named holder | judgment — a person confirms |
| `review-staffing` | done | Roles left deliberately unstaffed are recorded with a reason | judgment — a person confirms |
| `approve-staffing` | done | The roster is published | `document` Staffing plan status published |
| `approve-staffing` | done | Every named holder is a real person who has agreed to the role — approving this puts them on the engagement | judgment — a person confirms |
| `approve-staffing` | done | The roster is accepted by the product manager, and their name is on the close | judgment — a person confirms |
| `draft-raci` | done | Roles and responsibilities are published | `document` RACI status published |
| `review-raci` | done | Roles and responsibilities are published | `document` RACI status published |
| `review-raci` | done | Every named holder appears against at least one responsibility | judgment — a person confirms |
| `approve-raci` | done | Roles and responsibilities are published | `document` RACI status published |
| `approve-raci` | done | Every decision the engagement will have to make has one accountable name, not two | judgment — a person confirms |
| `approve-raci` | done | The RACI is accepted by the product manager, and their name is on the close | judgment — a person confirms |
| `draft-ways-of-working` | done | Ways of working is published | `document` ways-of-working status published |
| `review-ways-of-working` | done | Ways of working is published | `document` ways-of-working status published |
| `review-ways-of-working` | done | Every ceremony names who runs it and how often, rather than that it happens | judgment — a person confirms |
| `approve-ways-of-working` | done | Ways of working is published | `document` ways-of-working status published |
| `approve-ways-of-working` | done | It is an agreement the team has actually made, not one written on their behalf | judgment — a person confirms |
| `approve-ways-of-working` | done | The working agreement is accepted by the product manager, and their name is on the close | judgment — a person confirms |
| `draft-features` | done | The features are published | `document` features status published |
| `draft-features` | done | Every feature names the outcome it is betting on | judgment — a person confirms |
| `draft-features` | done | Every feature says how it will be judged — the target, and where the number comes from | judgment — a person confirms |
| `draft-features` | done | What the brief leaves unclear is an open question, not a guessed feature | judgment — a person confirms |
| `draft-foundation-architecture` | done | The foundation architecture is published | `document` foundational-architecture status published |
| `draft-foundation-architecture` | done | Every epic has a named home in the architecture | judgment — a person confirms |
| `build-design-library` | done | The design library is published | `document` design-library status published |
| `build-design-library` | done | It links the real artifact — the Figma file or component library — rather than describing it | judgment — a person confirms |
| `tailor-delivery-plan` | done | The delivery plan is published | `document` delivery plan status published |
| `review-delivery-plan` | done | The delivery plan is published | `document` delivery plan status published |
| `review-delivery-plan` | done | Every role the plan names is staffed on the roster | judgment — a person confirms |
| `approve-delivery-plan` | done | The delivery plan is published | `document` delivery plan status published |
| `approve-delivery-plan` | done | The plan the team will actually run is this one — departures from the standard lifecycle are named, not assumed | judgment — a person confirms |
| `approve-delivery-plan` | done | The delivery plan is accepted by the product manager, and their name is on the close | judgment — a person confirms |
| `draft-sprint-plan` | done | This sprint's plan is published | `document` sprint-plans status published |
| `draft-sprint-plan` | done | Every committed story belongs to an epic | `ticket` committed-have-epic is true |
| `draft-sprint-plan` | done | Every committed story is on the board with an owner | `ticket` on-board is true |
| `draft-sprint-plan` | done | The plan fits the roster's capacity, or says where it does not | judgment — a person confirms |
| `draft-sprint-plan` | done | Work taken on that was not in the plan is recorded as unplanned | judgment — a person confirms |
| `kickoff` | done | The kickoff record is published | `document` kickoff status published |
| `kickoff` | done | Kickoff happened — the Delivery Manager confirms it, and their name is on the close | judgment — a person confirms |


<a id="design-library"></a>
## `design-library` — Design library

**Design** workstream · **Discovery** phase · owned by **Designer** · repeatable

6 steps — 4 human, 2 ai

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Designer | `research-design` | design-research | — | — |
| 2 | Human | Designer | `review-design-research` | — | — | `research-design` |
| 3 | Human | Product Manager | `approve-research` | — | — | `review-design-research` |
| 4 | AI | Designer | `derive-library` | design-library | — | `research-design`, `approve-research` |
| 5 | Human | Designer | `review-library` | — | — | `derive-library` |
| 6 | Human | Product Manager | `approve-library` | — | — | `review-library` |

**Titles** — what the person sees in the queue:

- `research-design` — Research the design ground
- `review-design-research` — Review the research
- `approve-research` — Review and approve the research
- `derive-library` — The design library
- `review-library` — Review the library
- `approve-library` — Review and approve the library

### Gates — 14 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `research-design` | done | The research is published | `document` design-research status published |
| `review-design-research` | done | The research is published | `document` design-research status published |
| `review-design-research` | done | Existing patterns are named — what the client already uses, and what it costs to depart from it | judgment — a person confirms |
| `review-design-research` | done | A review that found nothing says so explicitly, rather than closing in silence | judgment — a person confirms |
| `approve-research` | done | The research is published | `document` design-research status published |
| `approve-research` | done | Every finding from the review is answered — accepted, actioned, or overruled with a reason | judgment — a person confirms |
| `approve-research` | done | The research is accepted by the product manager, and their name is on the close | judgment — a person confirms |
| `derive-library` | done | The library is published | `document` design-library status published |
| `review-library` | done | The library is published | `document` design-library status published |
| `review-library` | done | It LINKS the real artifact — the Figma file or component library — rather than describing it | judgment — a person confirms |
| `review-library` | done | Each finding names the screen or component it is about, not the library in general | judgment — a person confirms |
| `approve-library` | done | The library is published | `document` design-library status published |
| `approve-library` | done | Every finding from the review is answered — accepted, actioned, or overruled with a reason | judgment — a person confirms |
| `approve-library` | done | The library is accepted by the product manager, and their name is on the close | judgment — a person confirms |


<a id="foundation-architecture"></a>
## `foundation-architecture` — Workflow: /foundation-architecture

**Engineering** workstream · **Discovery** phase · owned by **Staff Engineer** · runs once

9 steps — 6 human, 3 ai

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Staff Engineer | `research-architecture` | architecture-research | — | — |
| 2 | Human | Staff Engineer | `review-research` | — | — | `research-architecture` |
| 3 | Human | Principal Engineer | `approve-research` | — | — | `review-research` |
| 4 | AI | Staff Engineer | `derive-architecture` | foundational-architecture | — | `research-architecture`, `approve-research` |
| 5 | Human | Staff Engineer | `review-architecture` | — | — | `derive-architecture` |
| 6 | Human | Principal Engineer | `approve-architecture` | — | — | `review-architecture` |
| 7 | AI | Staff Engineer | `scaffold-foundation` | scaffold-record | — | `derive-architecture`, `approve-architecture` |
| 8 | Human | Staff Engineer | `review-scaffold` | — | — | `scaffold-foundation` |
| 9 | Human | Principal Engineer | `approve-scaffold` | — | — | `review-scaffold` |

**Titles** — what the person sees in the queue:

- `research-architecture` — Research the ground
- `review-research` — Review the research
- `approve-research` — Accept the research
- `derive-architecture` — Foundation architecture
- `review-architecture` — Review the architecture
- `approve-architecture` — Accept the architecture
- `scaffold-foundation` — Scaffold the foundation
- `review-scaffold` — Review the scaffold
- `approve-scaffold` — Accept the scaffold

### Gates — 25 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `research-architecture` | done | The research is published | `document` architecture-research status published |
| `review-research` | done | The research is published | `document` architecture-research status published |
| `review-research` | done | Every constraint names where it came from — a system, a document, or a person who said it | judgment — a person confirms |
| `review-research` | done | What could not be found out is listed, not left as a gap the architecture quietly fills | judgment — a person confirms |
| `review-research` | done | Every finding says what it would cost to be wrong about | judgment — a person confirms |
| `review-research` | done | A review that found nothing says so explicitly, rather than closing in silence | judgment — a person confirms |
| `approve-research` | done | The research is published | `document` architecture-research status published |
| `approve-research` | done | The research covers the ground this architecture has to stand on, or names what it does not | judgment — a person confirms |
| `approve-research` | done | The research is accepted by the principal engineer, and their name is on the close | judgment — a person confirms |
| `derive-architecture` | done | The architecture is published | `document` foundational-architecture status published |
| `review-architecture` | done | The architecture is published | `document` foundational-architecture status published |
| `review-architecture` | done | Every decision names what it beat and why — an option not considered is not a decision | judgment — a person confirms |
| `review-architecture` | done | Every constraint the research surfaced is either honoured or explicitly overruled | judgment — a person confirms |
| `review-architecture` | done | Each decision is judged against the research, not against the reviewer's preference | judgment — a person confirms |
| `review-architecture` | done | Disagreements are recorded as findings the approver can rule on, not resolved privately | judgment — a person confirms |
| `approve-architecture` | done | The architecture is published | `document` foundational-architecture status published |
| `approve-architecture` | done | Every finding from the review is answered — accepted, actioned, or overruled with a reason | judgment — a person confirms |
| `approve-architecture` | done | The architecture is accepted by the principal engineer, and their name is on the close | judgment — a person confirms |
| `scaffold-foundation` | done | The scaffold record is published | `document` scaffold-record status published |
| `review-scaffold` | done | The scaffold record is published | `document` scaffold-record status published |
| `review-scaffold` | done | What was created is listed with where it lives, so it can be checked rather than trusted | judgment — a person confirms |
| `review-scaffold` | done | The scaffold matches the approved architecture, and any departure is named | judgment — a person confirms |
| `review-scaffold` | done | Every departure from the architecture is either justified or raised as a finding | judgment — a person confirms |
| `approve-scaffold` | done | The scaffold record is published | `document` scaffold-record status published |
| `approve-scaffold` | done | The scaffold is accepted by the principal engineer, and their name is on the close | judgment — a person confirms |


<a id="epics"></a>
## `epics` — Epics

**Product** workstream · **Discovery** phase · owned by **Product Owner** · repeatable

7 steps — 4 human, 2 ai, 1 nested

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Product Owner | `research-epics` | epic-research | — | — |
| 2 | Human | Product Owner | `review-epic-research` | — | — | `research-epics` |
| 3 | Human | Product Manager | `approve-research` | — | — | `review-epic-research` |
| 4 | AI | Product Owner | `draft-epics` | deliverables@tickets `[backlog]` | — | `research-epics`, `approve-research` |
| 5 | Human | Product Owner | `review-epics` | — | — | `draft-epics` |
| 6 | Human | Product Manager | `approve-epics` | — | — | `review-epics` |
| 7 | Nested ↳ `tech-design` | Staff Engineer | `design-epics-tech` | — | — | `approve-epics` |

**Titles** — what the person sees in the queue:

- `research-epics` — What the epics must cover
- `review-epic-research` — Review the coverage
- `approve-research` — Review and approve the coverage
- `draft-epics` — The epics
- `review-epics` — Review the epics
- `approve-epics` — Review and approve the epics
- `design-epics-tech` — Technical design per epic

### Gates — 16 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `research-epics` | done | The coverage is published | `document` epic-research status published |
| `review-epic-research` | done | The coverage is published | `document` epic-research status published |
| `review-epic-research` | done | Every feature and milestone is named, with what it still needs to become epics | judgment — a person confirms |
| `approve-research` | done | The coverage is published | `document` epic-research status published |
| `approve-research` | done | Nothing the brief commits to is missing from the coverage, or the gap is named | judgment — a person confirms |
| `approve-research` | done | The coverage is accepted by the product manager, and their name is on the close | judgment — a person confirms |
| `draft-epics` | done | The epics are published | `document` deliverables status published |
| `review-epics` | done | The epics are published | `document` deliverables status published |
| `review-epics` | done | Every epic belongs to a feature | judgment — a person confirms |
| `review-epics` | done | Every epic traces to something the brief or the SOW commits to | judgment — a person confirms |
| `review-epics` | done | Every epic names the milestone it serves | judgment — a person confirms |
| `review-epics` | done | What the brief leaves unclear is an open question, not a guessed epic | judgment — a person confirms |
| `review-epics` | done | Each epic is judged on whether it can be estimated, not on whether it sounds right | judgment — a person confirms |
| `approve-epics` | done | The epics are published | `document` deliverables status published |
| `approve-epics` | done | Every finding from the review is answered — accepted, actioned, or overruled with a reason | judgment — a person confirms |
| `approve-epics` | done | The epics are accepted by the product manager, and their name is on the close | judgment — a person confirms |


<a id="product-brief"></a>
## `product-brief` — Workflow: /product-brief

**Product** workstream · **Discovery** phase · owned by **Product Owner** · runs once

7 steps — 5 human, 2 ai

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Researcher | `gather-evidence` | brief-evidence | — | — |
| 2 | Human | Researcher | `review-evidence` | — | — | `gather-evidence` |
| 3 | Human | Product Owner | `approve-evidence` | — | — | `review-evidence` |
| 4 | AI | Product Owner | `draft-brief` | product-brief | — | `gather-evidence`, `approve-evidence` |
| 5 | Human | Researcher | `review-brief` | — | — | `draft-brief` |
| 6 | Human | Product Owner | `answer-review` | — | — | `review-brief` |
| 7 | Human | Product Manager | `approve-brief` | — | — | `answer-review` |

**Titles** — what the person sees in the queue:

- `gather-evidence` — Evidence for the brief
- `review-evidence` — Review the evidence
- `approve-evidence` — Review and approve the evidence
- `draft-brief` — Product brief
- `review-brief` — Review the brief
- `answer-review` — Answer the review
- `approve-brief` — Review and approve the brief

### Gates — 20 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `gather-evidence` | done | The evidence is published | `document` brief-evidence status published |
| `review-evidence` | done | The evidence is published | `document` brief-evidence status published |
| `review-evidence` | done | Every claim carries a source and a date, or is marked as having none | judgment — a person confirms |
| `review-evidence` | done | What could not be found out is listed, not left for the brief to assume | judgment — a person confirms |
| `approve-evidence` | done | The evidence is published | `document` brief-evidence status published |
| `approve-evidence` | done | The sources are ones the brief can rest on, rather than the first thing found | judgment — a person confirms |
| `approve-evidence` | done | Nothing the evidence marks as unknown is written as if it were settled | judgment — a person confirms |
| `approve-evidence` | done | The evidence is accepted by the product owner, and their name is on the close | judgment — a person confirms |
| `draft-brief` | done | The brief is published | `document` product-brief status published |
| `review-brief` | done | The brief is published | `document` product-brief status published |
| `review-brief` | done | Every claim traces to the evidence or is marked as the author's judgment | judgment — a person confirms |
| `review-brief` | done | Nothing the evidence marks as unknown is presented as settled | judgment — a person confirms |
| `review-brief` | done | Each finding says what it would cost to be wrong about | judgment — a person confirms |
| `review-brief` | done | A review that found nothing says so, rather than closing in silence | judgment — a person confirms |
| `answer-review` | done | The brief is published | `document` product-brief status published |
| `answer-review` | done | Every finding from the review is answered — accepted, actioned, or overruled with a reason | judgment — a person confirms |
| `answer-review` | done | What the client left unclear is an open question, not a guessed requirement | judgment — a person confirms |
| `approve-brief` | done | The brief is published | `document` product-brief status published |
| `approve-brief` | done | The brief is accepted by the product manager, and their name is on the close | judgment — a person confirms |
| `approve-brief` | done | The brief commits to no more than the engagement can be held to, or names where it goes further | judgment — a person confirms |


<a id="release"></a>
## `release` — Release

**Delivery** workstream · **Build** phase · owned by **Delivery Manager** · repeatable · **not enabled**

No steps in the seed.

<a id="sprint"></a>
## `sprint` — Sprint

**Delivery** workstream · **Build** phase · owned by **Delivery Manager** · repeatable

7 steps — 4 human, 2 ai, 1 nested

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | Nested ↳ `sprint-plan` | Product Owner | `sprint-planning` | — | delivery plan,deliverables,Staffing plan | — |
| 2 | AI | Delivery Manager | `sprint-review` | 05-cadence/sprint-reviews | sprint-plans | `sprint-planning` |
| 3 | Human | Delivery Manager | `review-sprint-review` | — | — | `sprint-review` |
| 4 | Human | Product Manager | `approve-sprint-review` | — | — | `review-sprint-review` |
| 5 | AI | Delivery Manager | `sprint-retro` | 05-cadence/retros | — | `sprint-review`, `approve-sprint-review` |
| 6 | Human | Delivery Manager | `review-retro` | — | — | `sprint-retro` |
| 7 | Human | Product Manager | `approve-retro` | — | — | `review-retro` |

**Titles** — what the person sees in the queue:

- `sprint-planning` — Sprint planning
- `sprint-review` — Sprint review
- `review-sprint-review` — Review the sprint review
- `approve-sprint-review` — Review and approve the sprint review
- `sprint-retro` — Retro
- `review-retro` — Review the retro
- `approve-retro` — Review and approve the retro

### Gates — 18 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `(workflow)` | ready | The delivery plan is published | `document` delivery plan status published |
| `sprint-planning` | done | This sprint's plan is published | `document` sprint-plans status published |
| `sprint-planning` | done | Every committed story belongs to an epic | `ticket` committed-have-epic is true |
| `sprint-planning` | done | Every committed story is on the board with an owner | `ticket` on-board is true |
| `sprint-planning` | done | The plan fits the roster's capacity, or says where it does not | judgment — a person confirms |
| `sprint-planning` | done | Work taken on that was not in the plan is recorded as unplanned | judgment — a person confirms |
| `sprint-review` | done | The review is published | `document` 05-cadence/sprint-reviews status published |
| `review-sprint-review` | done | The review is published | `document` 05-cadence/sprint-reviews status published |
| `review-sprint-review` | done | Every story that did not land says why | judgment — a person confirms |
| `approve-sprint-review` | done | The review is published | `document` 05-cadence/sprint-reviews status published |
| `approve-sprint-review` | done | It reports what happened rather than what was hoped for — a sprint that missed says so | judgment — a person confirms |
| `approve-sprint-review` | done | The sprint review is accepted by the product manager, and their name is on the close | judgment — a person confirms |
| `sprint-retro` | done | The retro is published | `document` 05-cadence/retros status published |
| `review-retro` | done | The retro is published | `document` 05-cadence/retros status published |
| `review-retro` | done | Actions have a named owner, or are recorded as not taken | judgment — a person confirms |
| `approve-retro` | done | The retro is published | `document` 05-cadence/retros status published |
| `approve-retro` | done | Actions carried over from the last retro are accounted for, not silently dropped | judgment — a person confirms |
| `approve-retro` | done | The retro is accepted by the product manager, and their name is on the close | judgment — a person confirms |


<a id="sprint-plan"></a>
## `sprint-plan` — Sprint plan

**Delivery** workstream · **Build** phase · owned by **Product Owner** · repeatable

6 steps — 4 human, 2 ai

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Product Owner | `research-capacity` | capacity-research | — | — |
| 2 | Human | Product Owner | `review-capacity` | — | — | `research-capacity` |
| 3 | Human | Product Manager | `approve-capacity` | — | — | `review-capacity` |
| 4 | AI | Product Owner | `draft-sprint-plan` | sprint-plans `[sprint]` | — | `research-capacity`, `approve-capacity` |
| 5 | Human | Product Owner | `review-plan` | — | — | `draft-sprint-plan` |
| 6 | Human | Product Manager | `approve-plan` | — | — | `review-plan` |

**Titles** — what the person sees in the queue:

- `research-capacity` — What the team can take on
- `review-capacity` — Review the capacity picture
- `approve-capacity` — Review and approve the capacity picture
- `draft-sprint-plan` — The sprint plan
- `review-plan` — Review the plan
- `approve-plan` — Review and approve the plan

### Gates — 16 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `research-capacity` | done | The capacity picture is published | `document` capacity-research status published |
| `review-capacity` | done | The capacity picture is published | `document` capacity-research status published |
| `review-capacity` | done | Capacity is derived from the roster and known absence, not assumed from headcount | judgment — a person confirms |
| `review-capacity` | done | Work already in flight is counted against it | judgment — a person confirms |
| `approve-capacity` | done | The capacity picture is published | `document` capacity-research status published |
| `approve-capacity` | done | The capacity is one the team can be held to, rather than the one the plan needs | judgment — a person confirms |
| `approve-capacity` | done | The capacity picture is accepted by the product manager, and their name is on the close | judgment — a person confirms |
| `draft-sprint-plan` | done | This sprint's plan is published | `document` sprint-plans status published |
| `draft-sprint-plan` | done | Every committed story belongs to an epic | `ticket` committed-have-epic is true |
| `draft-sprint-plan` | done | Every committed story is on the board with an owner | `ticket` on-board is true |
| `review-plan` | done | This sprint's plan is published | `document` sprint-plans status published |
| `review-plan` | done | The plan fits the capacity that was accepted, or says where it does not | judgment — a person confirms |
| `review-plan` | done | Each commitment is judged against the accepted capacity, not against ambition | judgment — a person confirms |
| `approve-plan` | done | This sprint's plan is published | `document` sprint-plans status published |
| `approve-plan` | done | Work taken on that was not in the plan is recorded as unplanned | judgment — a person confirms |
| `approve-plan` | done | The plan is accepted by the product manager, and their name is on the close | judgment — a person confirms |


<a id="build"></a>
## `build` — Workflow: /build

**Engineering** workstream · **Build** phase · owned by **Engineer** · repeatable

5 steps — 4 ai, 1 human

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Engineer | `implement-story` | {subject}@scm `[code]` | — | — |
| 2 | AI | Automation | `write-e2e-tests` | {subject}@scm `[code]` | — | `implement-story` |
| 3 | AI | Reviewer | `review-pr` | {subject}@scm `[code]` | — | `write-e2e-tests` |
| 4 | AI | Engineer | `respond-to-review` | {subject}@scm `[code]` | — | `review-pr` |
| 5 | Human | Principal Engineer | `approve-build` | — | — | `respond-to-review` |

**Titles** — what the person sees in the queue:

- `implement-story` — Implement the story
- `write-e2e-tests` — Automated tests for the story
- `review-pr` — Review the change
- `respond-to-review` — Answer the review
- `approve-build` — Accept the change

### Gates — 15 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `implement-story` | done | A pull request is linked on the story | `ticket` pr-linked is true |
| `implement-story` | done | The checks ran and passed — the pull request is opened only on green, so its absence is the failure and not a delay | judgment — a person confirms |
| `implement-story` | done | Every acceptance criterion on the story is implemented, or is named as not covered and why | judgment — a person confirms |
| `implement-story` | done | The change is on a branch, never on the default branch | judgment — a person confirms |
| `write-e2e-tests` | done | Each test fails without the change and passes with it — a test that passes either way proves nothing | judgment — a person confirms |
| `write-e2e-tests` | done | Behaviour deliberately left untested is named on the story, not omitted | judgment — a person confirms |
| `write-e2e-tests` | done | The tests are on the same branch as the change they cover | judgment — a person confirms |
| `review-pr` | done | Every finding cites a file and a line that appears in this diff, not in code the diff did not touch | judgment — a person confirms |
| `review-pr` | done | A review that found nothing says so explicitly, rather than being recorded as no review at all | judgment — a person confirms |
| `review-pr` | done | The reviewer did not write the change under review | judgment — a person confirms |
| `respond-to-review` | done | Every finding is resolved or answered with a reason — silence on a finding is not an answer | judgment — a person confirms |
| `respond-to-review` | done | The checks still pass after the response — an answer that breaks the build is not an answer | judgment — a person confirms |
| `approve-build` | done | The change is accepted by the principal engineer, and their name is on the close | judgment — a person confirms |
| `approve-build` | done | The diff was read, not just the summary of it | judgment — a person confirms |
| `approve-build` | done | The engineer who wrote the change did not accept it | judgment — a person confirms |


<a id="feature-architecture"></a>
## `feature-architecture` — Feature architecture

**Engineering** workstream · **Build** phase · owned by **Staff Engineer** · repeatable

3 steps — 2 human, 1 ai

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Staff Engineer | `draft-feature-architecture` | 03-architecture/features | — | — |
| 2 | Human | Staff Engineer | `review-feature-architecture` | — | — | `draft-feature-architecture` |
| 3 | Human | Principal Engineer | `approve-feature-architecture` | — | — | `review-feature-architecture` |

**Titles** — what the person sees in the queue:

- `draft-feature-architecture` — Feature architecture
- `review-feature-architecture` — Review the feature architecture
- `approve-feature-architecture` — Review and approve the feature architecture

### Gates — 10 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `draft-feature-architecture` | done | The feature architecture is published | `document` 03-architecture/features status published |
| `review-feature-architecture` | done | The feature architecture is published | `document` 03-architecture/features status published |
| `review-feature-architecture` | done | Every feature has a named home in the architecture | judgment — a person confirms |
| `review-feature-architecture` | done | Every decision names what it beat and why — an option not considered is not a decision | judgment — a person confirms |
| `review-feature-architecture` | done | Any departure from the foundation architecture is named and justified, not quietly taken | judgment — a person confirms |
| `review-feature-architecture` | done | Each decision is judged against the foundation architecture, not against the reviewer's preference | judgment — a person confirms |
| `review-feature-architecture` | done | A review that found nothing says so explicitly, rather than closing in silence | judgment — a person confirms |
| `approve-feature-architecture` | done | The feature architecture is published | `document` 03-architecture/features status published |
| `approve-feature-architecture` | done | Every finding from the review is answered — accepted, actioned, or overruled with a reason | judgment — a person confirms |
| `approve-feature-architecture` | done | The feature architecture is accepted by the principal engineer, and their name is on the close | judgment — a person confirms |


<a id="fix"></a>
## `fix` — Workflow: /fix

**Engineering** workstream · **Build** phase · owned by **Engineer** · repeatable

6 steps — 5 ai, 1 human

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Engineer | `triage-and-fix` | {subject}@scm `[code]` | — | — |
| 2 | AI | Automation | `write-e2e-tests` | {subject}@scm `[code]` | — | `triage-and-fix` |
| 3 | AI | Reviewer | `review-pr` | {subject}@scm `[code]` | — | `write-e2e-tests` |
| 4 | AI | Engineer | `respond-to-review` | {subject}@scm `[code]` | — | `review-pr` |
| 5 | Human | Principal Engineer | `approve-fix` | — | — | `respond-to-review` |
| 6 | AI | Tech Writer | `accumulate-changelog` | {subject}@scm `[code]` | — | `approve-fix` |

**Titles** — what the person sees in the queue:

- `triage-and-fix` — Reproduce and fix
- `write-e2e-tests` — Regression test
- `review-pr` — Review the fix
- `respond-to-review` — Answer the review
- `approve-fix` — Accept the fix
- `accumulate-changelog` — Record it in the changelog

### Gates — 16 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `triage-and-fix` | done | A pull request is linked on the ticket | `ticket` pr-linked is true |
| `triage-and-fix` | done | The failure was reproduced before it was fixed — a change made from the report alone fixes the report, not the fault | judgment — a person confirms |
| `triage-and-fix` | done | The cause is named, not just the symptom that was removed | judgment — a person confirms |
| `triage-and-fix` | done | The change is on a branch, never on the default branch | judgment — a person confirms |
| `write-e2e-tests` | done | The regression test fails without the fix and passes with it — a test that passes either way did not catch this and will not catch it again | judgment — a person confirms |
| `write-e2e-tests` | done | It targets the reported failure, not a nearby one that was easier to write | judgment — a person confirms |
| `review-pr` | done | Every finding cites a file and a line that appears in this diff, not in code the diff did not touch | judgment — a person confirms |
| `review-pr` | done | The review says whether the cause was addressed or only the symptom | judgment — a person confirms |
| `review-pr` | done | The reviewer did not write the fix under review | judgment — a person confirms |
| `respond-to-review` | done | Every finding is resolved or answered with a reason — silence on a finding is not an answer | judgment — a person confirms |
| `respond-to-review` | done | The checks still pass after the response — an answer that breaks the build is not an answer | judgment — a person confirms |
| `approve-fix` | done | The fix is accepted by the principal engineer, and their name is on the close | judgment — a person confirms |
| `approve-fix` | done | The reported failure is gone, checked against the report rather than against the fix | judgment — a person confirms |
| `approve-fix` | done | The engineer who wrote the fix did not accept it | judgment — a person confirms |
| `accumulate-changelog` | done | The entry names the user-visible effect, not the code that changed | judgment — a person confirms |
| `accumulate-changelog` | done | A fix with no user-visible effect says so, rather than being left out | judgment — a person confirms |


<a id="tech-design"></a>
## `tech-design` — Technical design

**Engineering** workstream · **Build** phase · owned by **Staff Engineer** · repeatable

3 steps — 2 human, 1 ai

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Staff Engineer | `draft-epic-tech-design` | 03-architecture/epic/{epic} | — | — |
| 2 | Human | Staff Engineer | `review-epic-tech-design` | — | — | `draft-epic-tech-design` |
| 3 | Human | Principal Engineer | `approve-epic-tech-design` | — | — | `review-epic-tech-design` |

**Titles** — what the person sees in the queue:

- `draft-epic-tech-design` — Epic technical design
- `review-epic-tech-design` — Review the technical design
- `approve-epic-tech-design` — Accept the technical design

### Gates — 10 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `draft-epic-tech-design` | done | The epic technical design is published | `document` 03-architecture/epic/{epic} status published |
| `review-epic-tech-design` | done | The epic technical design is published | `document` 03-architecture/epic/{epic} status published |
| `review-epic-tech-design` | done | Every claim about the code cites a file that was read, not a file that was assumed | judgment — a person confirms |
| `review-epic-tech-design` | done | Every story in the epic has a named home in the design, or is called out as not needing one | judgment — a person confirms |
| `review-epic-tech-design` | done | Any departure from the foundation or feature architecture is named and justified, not quietly taken | judgment — a person confirms |
| `review-epic-tech-design` | done | The design is judged against the architecture above it, not against the reviewer's preference | judgment — a person confirms |
| `review-epic-tech-design` | done | A review that found nothing says so explicitly, rather than closing in silence | judgment — a person confirms |
| `approve-epic-tech-design` | done | The epic technical design is published | `document` 03-architecture/epic/{epic} status published |
| `approve-epic-tech-design` | done | Every finding from the review is answered — accepted, actioned, or overruled with a reason | judgment — a person confirms |
| `approve-epic-tech-design` | done | The technical design is accepted by the principal engineer, and their name is on the close | judgment — a person confirms |


<a id="job-aids"></a>
## `job-aids` — Job aids and enablement

**GTM** workstream · **Build** phase · owned by **Tech Writer** · repeatable · **not enabled**

No steps in the seed.

<a id="launch-readiness"></a>
## `launch-readiness` — Launch readiness

**GTM** workstream · **Build** phase · owned by **GTM** · repeatable · **not enabled**

No steps in the seed.

<a id="release-comms"></a>
## `release-comms` — Release comms

**GTM** workstream · **Build** phase · owned by **GTM** · repeatable · **not enabled**

No steps in the seed.

<a id="feature"></a>
## `feature` — Feature

**Product** workstream · **Build** phase · owned by **Product Owner** · repeatable

3 steps — 2 human, 1 ai

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Product Owner | `draft-feature` | features | — | — |
| 2 | Human | Product Owner | `review-feature` | — | — | `draft-feature` |
| 3 | Human | Product Manager | `approve-feature` | — | — | `review-feature` |

**Titles** — what the person sees in the queue:

- `draft-feature` — The feature and its targets
- `review-feature` — Review the feature
- `approve-feature` — Accept the feature

### Gates — 11 criteria

| Task | Gate | Criterion | Checked by |
|---|---|---|---|
| `draft-feature` | done | The features are published | `document` features status published |
| `review-feature` | done | The features are published | `document` features status published |
| `review-feature` | done | Every feature names the outcome it is betting on | judgment — a person confirms |
| `review-feature` | done | Every feature says how it will be judged — the target, and where the number comes from | judgment — a person confirms |
| `review-feature` | done | Every feature carries a Metric section — what is being measured, its target, and where the number will be read from | judgment — a person confirms |
| `review-feature` | done | Every feature carries a Measurement section, present and empty before launch rather than absent — a section that appears later is one nobody agreed to | judgment — a person confirms |
| `review-feature` | done | Every feature carries a Decision section reserved for persevere, pivot, kill or inconclusive — stated as not yet due, never pre-filled | judgment — a person confirms |
| `review-feature` | done | Each target is judged on whether it could actually be measured, not on whether it sounds right | judgment — a person confirms |
| `approve-feature` | done | The features are published | `document` features status published |
| `approve-feature` | done | Every finding from the review is answered — accepted, actioned, or overruled with a reason | judgment — a person confirms |
| `approve-feature` | done | The features are accepted by the product manager, and their name is on the close | judgment — a person confirms |


<a id="story"></a>
## `story` — Workflow: /story

**Product** workstream · **Build** phase · owned by **Product Manager** · repeatable · **not enabled**

5 steps — 4 ai, 1 human

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Product Manager | `decompose-epic-to-story` | — | — | — |
| 2 | AI | Designer | `draft-design-spec` | — | — | — |
| 3 | AI | UX Writer | `write-copy` | — | — | — |
| 4 | Human | Product Manager | `approve` | — | — | — |
| 5 | AI | Delivery Manager | `update-status` | — | — | — |

### Gates — none

No criteria in the seed. Nothing refuses a start or a close here, so every row of this workflow opens and closes on the actor alone.


<a id="learn"></a>
## `learn` — Learn

**Product** workstream · **Operate** phase · owned by **Product Manager** · repeatable · **not enabled**

No steps in the seed.

<a id="measure"></a>
## `measure` — Measure

**Product** workstream · **Operate** phase · owned by **Researcher** · repeatable · **not enabled**

No steps in the seed.

<a id="triage"></a>
## `triage` — Workflow: /triage

**Support** workstream · **Operate** phase · owned by **Support** · repeatable

9 steps — 6 ai, 3 human

| # | Kind | Role | Task | Produces | Reads | After |
|--:|---|---|---|---|---|---|
| 1 | AI | Support | `classify-intake` | — | — | — |
| 2 | Human | Support | `approve` | — | — | — |
| 3 | AI | Support | `triage-incident` | — | — | — |
| 4 | Human | Support | `approve` | — | — | — |
| 5 | AI | Engineer | `triage-and-fix` | — | — | — |
| 6 | AI | Reviewer | `review-pr` | — | — | — |
| 7 | AI | Support | `write-postmortem` | — | — | — |
| 8 | Human | Support | `approve` | — | — | — |
| 9 | AI | Tech Writer | `accumulate-changelog` | — | — | — |

### Gates — none

No criteria in the seed. Nothing refuses a start or a close here, so every row of this workflow opens and closes on the actor alone.

---

## Roles

| Role | Title | Tier | Scope | Workstream | Hosts |
|---|---|---|---|---|---|
| `delivery-manager` | Runs the engagement | oversight | everyone | Delivery | claude,codex,gemini |
| `product-manager` | The bar for what gets built | oversight | everyone | Product | claude,codex |
| `product-owner` | Writes what to build | practitioner | everyone | Product | claude,codex |
| `researcher` | Evidence for the bet | practitioner | workstream | Product | claude |
| `designer` | Flows and screens | practitioner | mine | Design | claude |
| `ux-writer` | The words on the screen | practitioner | mine | Design | claude |
| `principal-engineer` | The standard the how is held to | oversight | everyone | Engineering | — |
| `staff-engineer` | The how — grounded in the code | practitioner | workstream | Engineering | claude,codex |
| `engineer` | Builds and ships | practitioner | mine | Engineering | claude,codex,gemini |
| `automation` | End-to-end tests | practitioner | mine | QA | claude |
| `gtm` | Launch and comms | practitioner | mine | GTM | claude |
| `sre` | Change and runbooks | practitioner | mine | SRE | claude |
| `pmo-analyst` | Configures the org and its engagements | platform | everyone | — | — |
| `reviewer` | Reviewer | practitioner | everyone | Engineering | — |
| `tech-writer` | Technical Writer | practitioner | mine | Product | — |
| `support` | Support Engineer | practitioner | mine | Support | — |
