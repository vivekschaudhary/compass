# Workflow: /create-bet-portfolio

Creates the **MVP bet portfolio** — the initial bet wedge for a new project. Bootstrap-only: runs once, after foundation product + architecture are approved, before any per-bet work begins.

**Why this exists.** New projects need 3-6 bets together to form a viable MVP (auth + core capability + persistence + engagement loop, etc.). Creating them one-at-a-time during bootstrap means: architecture gets decided knowing only bet 1; teams sit idle; cross-bet dependencies stay invisible; parallel work is impossible.

After the MVP ships, the project transitions to steady-state: new bets come one-at-a-time via `/create-brief`. This workflow does **not** replace `/create-brief` — it sits above it for bootstrap only.

## Trigger

`/create-bet-portfolio` once both foundation bets are approved.

## State detection (before any step)

| State                                                  | Action                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `docs/foundation/portfolio.md` missing                 | Run.                                                                                                                              |
| Portfolio exists, `status: proposed`                   | **Refuse.** Tell user to approve, reject, or amend before re-invoking.                                                            |
| Portfolio `approved`, no stubs promoted yet            | Allow amend (creates v2). Bootstrap hasn't truly begun.                                                                           |
| Portfolio `approved`, ≥1 stub promoted via `/create-brief` | **Refuse.** Bootstrap is done. New bets go through `/create-brief <source>` from scratch. No re-bootstrapping mid-project.    |

## Process

1. **Verify gate:** both `docs/foundation/product.md` AND `docs/foundation/architecture.md` exist with `status: approved`. If not, refuse and tell user which is missing.
2. **Check state** per table above.
3. **Load PM agent context** (`compass/agents/pm.md`, migrated v0.3.14).
4. **Engage Researcher** (mandatory — `compass/agents/researcher.md`, migrated v0.3.14). Researcher's job here:
   - Surface market patterns for MVP wedge shape in this product's category (what did comparable products need to ship to be usable?).
   - Flag MVP candidates the user might be missing (auth, billing, observability bare minimums).
   - Apply the 6-category framework (especially User pain, Competitive, Moat) — same rules as foundation: no log-and-walk-away.
5. **Elicit MVP definition from the user.** Structured, not free-form:
   - Ask the forcing question: **"What does this product need to do for one real user to complete the core value loop once?"** Their answer (verbatim) is the MVP definition.
   - Ask explicitly: **"What are you tempted to include that is NOT required for that first successful loop?"** Their answer feeds the "Deliberately out of MVP" section — captured but not built into stubs.
   - Optional: accept a source link (Confluence / GDrive / notes) for context — but still run the forcing question. Don't assume the source already drew the MVP line.
   - **PM owns the MVP/post-MVP call.** Researcher surfaces what comparable products needed for their MVPs as a sanity check.
6. **Draft stub briefs** (typically 3-6) for MVP bets only:
   - Generate bet IDs via the ticketing system (Jira-style epics, or Linear).
   - For each MVP bet, create `docs/bets/<bet-id>/brief.md` with:
     - Frontmatter: `id: <BET-ID>`, `type:` (feature / okr / tech-debt / architectural-initiative), `status: proposed`, `parent: FOUNDATION-PRODUCT`, `portfolio_stub: true`, `depends_on: [<bet-id>...]`, `parallel_with: [<bet-id>...]`, `created: <today>`, `author: PM`
     - Title + one-line hypothesis traced to a specific line in `docs/foundation/product.md`
     - Placeholder content — full brief content (problem, scope, research, guardrails) is filled later by `/create-brief <bet-id>` promotion.
   - **No stub briefs for post-MVP items.** They live as one-liners in the portfolio doc only.
7. **Draft `docs/foundation/portfolio.md`** using `compass/templates/portfolio.md`:
   - **MVP definition statement** at the top — verbatim user answer.
   - Bet list table (MVP bets only).
   - **Mermaid `flowchart`** dependency graph — every MVP bet as a node, edges as "depends on". If no dependencies, declare "No dependencies — all bets parallel" in writing.
   - **Parallel-build candidates** — explicit list of independent paths that can run in parallel from day 1.
   - **Deliberately out of MVP** section — one-liner per item with rationale.
   - PM rationale: why this wedge, why this MVP line.
   - Frontmatter: `type: portfolio`, `status: proposed`, `parent: FOUNDATION-PRODUCT`.
8. **Mirror to ticketing system** — each stub as an epic (per config).
9. **DRI log seeded** on `portfolio.md` (PM ≥1 Decision; Researcher ≥1 Decision AND ≥1 Risk — same breadth as setup-product's enforcement).
10. **HITL approval** — human reviews `portfolio.md`, approves or rejects. Portfolio status `proposed` → `approved`. Each stub brief stays `status: proposed, portfolio_stub: true` until its own `/create-brief` promotion + HITL.

## Verification (mandatory)

- [ ] MVP definition statement present at top of `docs/foundation/portfolio.md` (verbatim user answer to the forcing question)
- [ ] Portfolio has 3-6 MVP bets (warn if outside; PM must justify in DRI Decision)
- [ ] Every bet has a one-line hypothesis traced to a specific line in `docs/foundation/product.md`
- [ ] "Deliberately out of MVP" section present with ≥1 item (if zero post-MVP items named, log as DRI Risk — usually means MVP scope is being padded)
- [ ] Mermaid `flowchart` dependency graph present (or explicit "no dependencies — all parallel" declared in writing)
- [ ] Parallel-build candidates identified
- [ ] PM DRI has ≥1 Decision; Researcher DRI has ≥1 Decision AND ≥1 Risk (Issues-only does not satisfy)
- [ ] Each stub brief file exists at `docs/bets/<bet-id>/brief.md` with `status: proposed` + `portfolio_stub: true`
- [ ] No stub briefs exist for post-MVP items (those live as one-liners in `portfolio.md` only)
- [ ] Status: `proposed`

If any unchecked, workflow is NOT complete. **HITL approval cannot pass while any verification item is unchecked.**

## Output

- `docs/foundation/portfolio.md` with status `proposed` → `approved` after HITL
- 3-6 stub briefs at `docs/bets/<bet-id>/brief.md` with `portfolio_stub: true` (each with a default `estimate` block: `duration_weeks: 2, confidence: low, refined_by: stub`)
- Mirrored to ticketing system per config
- **After portfolio HITL approval, run `/plan`** to seed `docs/foundation/plan.md` with the initial time-bound schedule (coarse dates from dep graph + default 2-week durations). Re-run `/plan` manually as estimates sharpen (after each brief / architecture approval, after build PR merges) — or rely on cron-driven refresh per `compass/config.yaml`. (`/plan` auto-runs `/dashboard`, so the browser view will reflect the new portfolio + initial schedule immediately.)

## Refusal cases

- Foundation product or foundation architecture not yet `approved`
- Portfolio already exists in `proposed` state (in review)
- Portfolio already `approved` and ≥1 stub promoted (bootstrap is over — use `/create-brief` for new bets)

## What happens next

For each MVP bet, run `/create-brief <bet-id>` when ready to fully scope that bet. This **promotes** the stub: fills in full content (problem, user, scope, research findings, guardrails), clears `portfolio_stub: true`, and requires its own HITL approval before `/create-bet-architecture` and `/create-story` can run.

Parallel paths from the dependency graph can promote, design, and build concurrently — that's the point of bootstrapping via portfolio.

## Notes

- **Two distinct HITL approvals per bootstrap bet**: portfolio approval ("yes, this is the wedge") + per-brief approval ("yes, this is what bet N specifically should be"). Deliberate.
- **Portfolio is bounded to MVP.** Year-2 roadmap items live in `Deliberately out of MVP`, not as stubs. The portfolio is not the roadmap.
- **Re-bootstrapping is refused.** Once the MVP is in flight, the project is in steady state. Future strategic batches happen via OKR bets + their child briefs, not by re-running this workflow.
