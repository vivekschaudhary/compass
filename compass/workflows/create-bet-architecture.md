# Workflow: /create-bet-architecture

Drafts bet-level technical strategy. Architect leads; Enterprise/Solution Architect always engages for cross-system input.

## Trigger

`/create-bet-architecture <bet-id>` — after the bet's brief is `approved`.

## Process

1. **Verify gate:** `docs/bets/<bet-id>/brief.md` has `status: approved`. If not, refuse.
2. **Check architecture_required field** in brief:
   - If `false` → log decision in brief DRI ("Architect declined; rationale: <why>"), exit
   - If `true` or `auto` → proceed
3. **Load Architect role context** (`compass/roles/architect.md`)
4. **Load Enterprise/Solution Architect role context** (`compass/roles/enterprise-architect.md`) — joins always
5. **Architect reads:**
   - Brief
   - Foundation product + architecture docs (**Stack table is the canonical list of tooling — anything outside it triggers the deviation gate below**)
   - Researcher findings
   - Existing code (read-only) for current architecture in relevant boundaries
   - Prior bet architectures (if any)
6. **If `auto`**, Architect first decides whether architecture is needed:
   - Small change, no new boundaries, no contract change → mark `architecture_required: false` in brief, log decision, exit
   - Touches boundaries, contracts, dependencies, or invariants → proceed
7. **Foundational-stack deviation gate (load-bearing).** Before drafting bet architecture, answer: *Does this bet introduce tools, services, frameworks, data stores, runtimes, or major dependencies not in `docs/foundation/architecture.md` Stack table?*
   - **NO** → proceed to step 8 with the existing foundational stack as the constraint.
   - **YES** → **STOP.** Refuse to silently widen the foundational stack inside a bet doc. Tell the user explicitly:
     > "This bet needs `<tool / service / framework>`, which isn't in the foundational stack. Run `/setup-foundation-architecture` in amend mode to add it (with an ADR / Amendments entry citing this bet as the trigger). Then resume `/create-bet-architecture <bet-id>`."

     Log the deviation as a DRI Issue on the bet (severity High, owner Enterprise/Solution Architect). Do not draft bet architecture that quietly adds tooling — foundational scope decisions live at foundational level by design. Bet architecture is constrained to operate **within** the foundational stack.

   **Scope note — this gate vs. the build-time package gate.** This deviation gate covers *major* dependencies (tools/services/frameworks/data stores/runtimes) at architecture time and routes them to a foundational amend + ADR. It is **complemented at build time** by the `[external-package-gate]` (`compass/workflows/build.md` Phase 2, `compass/roles/architect.md` → "External-package empirical approval"), which covers **every** external package the Engineer reaches for — including small utilities below the "major dependency" threshold — via the Architect's 6-category empirical evaluation + the `compass/config.yaml` `dependency_policy.approved_packages` ledger. Together they close the full surface: nothing — major or minor — enters the dependency tree without Architect approval.
8. **Joint draft of `docs/bets/<bet-id>/architecture.md`** using `compass/templates/architecture.md`:
   - Decision (clear, unambiguous statement)
   - Context (technical situation, constraints)
   - Approach (file/module names, interfaces, data flow)
   - Data model changes
   - API / contract changes
   - Dependencies (justified)
   - **Enterprise Architect section:** cross-system implications, standards compliance, any drift flags
   - Alternatives considered (≥1, real not strawman)
   - Consequences (positive, negative, reversibility)
   - Test strategy (categories)
   - Rollout (feature flag, migration, staged)
   - DRI Log
9. **Status `proposed`** on architecture doc
10. **HITL gate** — human reviews and marks `status: approved`
11. **Update brief frontmatter:** `architecture_status: approved`

## Output

- `docs/bets/<bet-id>/architecture.md` with `status: approved`
- Brief's `architecture_status: approved`
- DRI log seeded with technical decisions (rationale + alternatives + reversibility)

## Notes

- Architecture is an **artifact, not a hard gate** — small bets can skip
- Engineer can start as soon as architecture is approved (no waiting for "perfect")
- Architect will engage on every PR for this bet to verify compliance (prevents tech debt drift)
- If Enterprise Architect flags standards drift, that's a BLOCKER for approval
