# Workflow: /advance — DEPRECATED (v0.3.0)

> **⚠️ This workflow is deprecated as of v0.3.0 (2026-05-26).** Do not extend it. Do not invoke it. The migration table below tells you what to do instead.
>
> **Why deprecated:** Retro #003 ([compass/workflows/retros/2026-05-26-retro-003-v0.2.3-to-v0.2.7.md](retros/2026-05-26-retro-003-v0.2.3-to-v0.2.7.md)) flagged `/advance: 0 uses in aura-app over 4 days of active dev` as a drift signal. The framework was over-engineering a "canonical phase advance" command that real users don't invoke — phase transitions happen naturally via status-field flips, and the auto-trigger chain (`/advance` → `/plan` → `/scan` → `/dashboard`) was load-bearing in the spec but irrelevant in practice. **This is an instance of AGENTS.md Principle #14** (soft spec → AI rationalization) applied to *framework design*: the framework designer rationalized that a canonical advance command was needed; reality showed it wasn't.

## Migration

| What you used to do | What to do now |
|---|---|
| `/advance` to move to next phase | Flip the artifact's `status:` field directly (`proposed` → `approved` → `in-build` → `shipped` → etc.). That's what users were doing anyway; `/advance` just wrapped it. |
| `/advance` to refresh the plan | `/plan` directly. |
| `/advance` to run the scanner | `/scan <bet-id>` directly. (Auto-invoked at `/build` phase boundaries — that pattern stands without `/advance`.) |
| `/advance` to refresh the dashboard | `/dashboard` directly. (Auto-invoked by `/scan`, `/plan`, `/metrics`, `/status` — independent of `/advance`.) |
| `/advance` to see current state | `/status` directly. (Auto-refreshes `/dashboard`.) |
| `/advance` to block on Critical scanner findings | Run `/scan <bet-id>` manually; resolve findings or suppress with HITL per `compass/config.yaml` `scanner.suppression_policy`. The `blocking_advance` field on scan reports stays — informational only, no longer blocks a workflow. |

## Behavior if invoked

The `.claude/skills/advance/` skill is intentionally kept registered so invocations don't fail silently. On invocation, this workflow now:

1. Prints the migration table above.
2. Exits without performing any phase advance, scan, or refresh.

**No new "canonical phase advance" command will be added** to replace `/advance`. The whole insight from the drift signal is that this command was unneeded. Replacing it with a renamed equivalent would re-introduce the same loophole.

---

## Historical — what `/advance` did when active (v0.1.x to v0.2.8)

The sections below are **historical record** of the workflow as it existed before v0.3.0. Preserved for archaeology and for understanding references in older CHANGELOG / improvements / retro entries. Not extended; not invoked.

### Trigger (historical)

`/advance` (optionally `/advance <bet-or-story-id>` to specify)

### Process (historical)

1. **Identify active work item:**
   - If ID provided → use it
   - Else read `docs/status.md` for in-flight items
   - If multiple in flight → ask user which one
   - If none → suggest `/start` or `/create-brief`
2. **Determine current phase** from status doc + artifact status fields
3. **Check HITL gate** at current → next transition:
   - Read `compass/config.yaml` `hitl_level`
   - Determine if approval required at this transition
   - If required: check whether approved (status field flipped, PR review, etc.)
   - **If not approved:** stop. Tell user what needs approval and where. Do not advance.
4. **Run `/scan <bet-id>` before advancing.** Read the resulting `docs/bets/<bet-id>/scan-report.md`. Apply scanner block semantics per `compass/config.yaml` `scanner.per_phase`:
   - **`strict` mode + `blocking_advance: true`:** refuse advance. Output the open Critical findings with their `Fix` field. Tell user to resolve them or suppress with HITL approval (per `scanner.suppression_policy.critical`), then re-invoke `/advance`.
   - **`advisory` mode + Critical findings:** warn loudly but allow advance. Open Criticals get logged as DRI Risks on the bet automatically.
   - **High findings (any mode):** warn but never block (suppression policy `dri_justification_required` if user chooses to suppress).
   - Some Critical findings are **non-suppressible** (PII without privacy review, missing legal review on T&C changes, etc., per the check catalog). These always block, regardless of mode.
5. **Determine next role / phase**:
   - In a bet's lifecycle: brief → architecture (if required) → story → build → review → merge → release → measure
   - In `/fix`: triage → fix → review → merge → release
   - In `/triage`: triage → mitigation → postmortem → comms
   - In `/ops`: classify → plan → execute → review → merge
6. **Load next role's context** (`compass/roles/<role>.md`)
7. **Execute next phase** per that role's process
8. **Update `docs/status.md`** to reflect new phase
9. **Auto-run `/plan`** to refresh the living project plan. The phase that just advanced is now an input to the plan for the next phase — `/plan` re-reads artifacts, recomputes dates, and appends to the refinement log. This is the load-bearing mechanic that makes "output → input" real instead of aspirational. Skip only if `docs/foundation/portfolio.md` is not yet approved (no plan exists yet to refresh). (`/plan` itself auto-runs `/dashboard`, so the browser view at `docs/dashboard.html` refreshes transitively.)

### Special cases (historical)

#### Parallel phases

When a phase has multiple roles (Designer + UX Writer in parallel):
- Execute both contexts in sequence in this workflow
- Both must complete before advancing further

#### Skipping phases (change flow)

If work_type is `change` and architecture_required is `false` AND no UI involved:
- At phase 2 entry: ask "any UI changes?" — if no, skip Designer/UX Writer
- At phase 3 entry: ask "any boundary/contract changes?" — if no, skip Architect
- Log skip as DRI decision (no silent skips)

#### Final phase

If current phase is final (release for bets, comms for incidents):
- Confirm completion, update status to `done` or appropriate terminal state
- Delivery Manager updates status doc

### Notes (historical)

- Does NOT autonomously chain through multiple phases
- One advance call = one phase
- Designed so HITL gates can interrupt naturally

---

_Deprecated 2026-05-26 (v0.3.0). See the Migration section at top. Do not extend._
