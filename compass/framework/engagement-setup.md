# Engagement setup — provisioning, intake, and the canonical workflow flow

How an engagement comes into being, and the shape every workflow after it repeats.

Companion to `delivery-lifecycle.md` (which owns the ticket states) and `canon.md` (which
owns the patterns). This doc owns the **sequence**: what must be true before work can
start, and what every workflow does once it can.

---

## 1. What a workflow IS (functional)

> **A named role produces one deliverable, derived from an agreed basis, into the place
> the team already works — and a named human accepts it before anything downstream
> depends on it.**

### The invariants

1. Every deliverable has a **basis**, an **owner**, a **home**, a **reader**, and an **approver**.
2. Missing basis → **refuse**. Never fill the gap with plausible fiction.
3. AI-complete ≠ done. **Only a human closes the gate.**
4. If step *n* produces it, step *n+1* declares it as input — otherwise the chain is decorative.

Everything mechanical below exists to hold one of these up.

### The canonical flow

| # | Functional intent | Mechanism |
|---|---|---|
| 1 | Nothing is invented — you can always answer *"on what basis?"* | resolve source: explicit input → else the canonical doc-tree path |
| 2 | Exactly one role owns producing it | `spec.role`; the job lands in that role's queue |
| 3 | No basis, no deliverable | refuse **before any mutation** |
| 4 | Work in progress is visible the moment it starts | `startWork` → In Progress |
| 5 | The deliverable lands where the client already looks | `writeProviderDoc` (Confluence / Teams) |
| 6 | One canonical home per artifact — no v2-final-final | update the scaffolded page, never a sibling |
| 7 | The next role can find it without remembering a link | upsert the `doc_page` pointer |
| 8 | Anyone on the ticket can reach the artifact | remote link + comment |
| 9 | Nothing is approved without a named human deciding | `handoffForApproval` → gate |

A workflow differs from its siblings in only five things:
**role · verb · source path · target path · gateRole.**

Reference implementation: `app/api/product-brief/route.ts`.

---

## 2. Phase A — provisioning (NOT a workflow)

Phase A has none of the canonical flow's shape: no basis, no deliverable, no draft, no
gate. It is **configuration**, and treating it as a workflow is what made intake feel
like a permanent exception. It is one.

**Actor: an admin executes; the DM is accountable.**

The split is justified on least privilege, not convenience — the holder of the Atlassian
token, Graph client secret, and repo write access is frequently platform ops or the
client's own IT, not the person running delivery. Requiring a DM to hold tenant
credentials to start a project is both unrealistic and a security smell.

Accountability stays with the DM via Sprint 0 ticket #1 (*"Connect systems of record"*,
DoD `tickets.wired && docs.wired && scm.wired`). The DM does not type the credentials;
the DM owns that they exist.

### Decided first, because it governs everything else

**Where are the artifacts allowed to live?** Consulting-specific and contractual: does the
client require artifacts in *their* tenancy? Getting this wrong means migrating every
artifact mid-engagement, or a compliance problem.

### Readiness check

Phase B gates on this. It is a single computed state, not a checklist someone ticks.

```
docs.wired        provider + space/site + root page set, and a test write succeeds
tickets.wired     project set, AND the board HAS the gate status
scm.wired         repo resolves
tree.scaffolded   doc_page rows exist, including the empty 02-scope/sow slot
```

**Why `tickets.wired` checks for the gate status specifically.** `moveTo` degrades quietly
— it logs *"skipped — add the status to the board?"* and carries on. If the client's Jira
has no **Awaiting HITL approval** column, every gate silently fails to transition while
runs report success. That is the exact difference between a governed record and status
theater, and it is a one-time check.

**Why `tree.scaffolded` is in the list.** Verified 2026-08-05: all three live engagements
had **zero `doc_page` rows** — the tree had never been scaffolded. So `02-scope/sow` did
not exist, and the product brief had no SOW to read. Nothing surfaced this because
nothing asserted readiness.

Roster is deliberately **not** here — see Phase B.

---

## 3. Phase B — intake (the first workflow)

> **Turn a commercial commitment into a delivery structure.**

| | |
|---|---|
| Basis | the SOW — the thing the client actually signed |
| Owner | Delivery Manager (mobilisation, not product definition) |
| Output | the engagement's shape: deliverables, milestones, staffing, Sprint 0 backlog |
| Approver | DM confirms the extraction before the structure is treated as real |
| Reader | the PM, who derives the product brief from the same SOW |

### The SOW gets a home first

The SOW is the **root basis** — everything downstream derives from it. Loaded as pasted
text into a form, it has no home, no version, no link, and six weeks later *"which SOW
did we brief against?"* has no answer. So the load step writes it into **`02-scope/sow`**
before extraction runs. That is what makes every later "derived from the SOW" claim
checkable, and it is why Phase A must scaffold the tree first.

### Roster arrives WITH the SOW

Not a precondition. The SOW names the team, and extraction already pulls both
`staffing` (role + count) and `team` (named individuals). Asking the DM to supply it up
front is asking a human for what the document states.

Roster is **progressive**: extracted where the SOW states it, `Unassigned` seeded per
role otherwise, and the gaps raised as structured questions. Queues route by **role**,
not person — so a gate still lands correctly before every seat is filled.

The only human needed before Phase B is whoever runs it: the DM.

### First-ingest vs re-ingest

These are different, and conflating them is what made intake hard to place.

| | first-ingest | re-ingest |
|---|---|---|
| Creates the engagement? | yes | no — it exists |
| Fits the canonical flow? | **no** — no engagement to attach to, output is structure not a document | **yes**, all nine steps |
| Basis | the signed SOW | the revised SOW / change request |
| Output | the container | a scope-delta doc |
| Surface | the bootstrap page | a DM workflow |

**First-ingest creates the container; every workflow after it — including re-ingest —
fills the container and is governed identically.**

Re-ingest is the real recurring gap: SOWs are amended constantly via change requests,
and today there is nowhere for that to land.

---

## 4. The resulting order

```
  ADMIN            Phase A · provisioning        (no basis, no gate — a readiness check)
    ↓              docs · tickets · scm · doc tree scaffolded
  DM               Phase B · intake              basis: the SOW (written to 02-scope/sow)
    ↓              → deliverables · milestones · roster · Sprint 0 backlog
  PM               product brief                 basis: the SOW
    ↓              → 01-foundation/product-brief
  ARCHITECT        foundation architecture       basis: the product brief
    ↓
  …                every subsequent workflow, same nine steps
```

Sprint 0 already encodes the DM/PM/Architect half of this. What is new is that **Phase A
becomes an asserted precondition of Phase B** rather than a ticket nobody checks.

---

## 5. Open

- **Where does the roadmap live?** The chain currently jumps product brief → epics with
  nothing holding the sequencing rationale. Natural home for the MVP-plan idea.
- **At-risk starts.** Work beginning before signature (LOI, T&M ramp) is common in
  consulting. Needs an engagement in `SOW pending` with Phase B gated but mobilisation
  running.
- **No-SOW mode.** A product org running Compass internally has no SOW; the product brief
  is the origin artifact. The paste-override covers it today as a workaround, not a
  declared mode.
