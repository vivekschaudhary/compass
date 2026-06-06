# Workflow: /create-brief

Creates a new bet — feature, OKR, tech debt, continuous improvement, or architectural initiative. PM-led, Researcher always engaged.

Two modes:

- **Create fresh** (steady state): `/create-brief <source>` or `/create-brief <free text>` — drafts a new bet from scratch.
- **Promote stub** (bootstrap): `/create-brief <bet-id>` where `docs/bets/<bet-id>/brief.md` exists with `portfolio_stub: true` — fills in the full content for a stub created by `/create-bet-portfolio`.

## Trigger

`/create-brief <source-link>` (Confluence, GDrive, Notion, ticket URL)
OR
`/create-brief <free text description>`
OR
`/create-brief <source-link> <free text>` (both — combine source with additional context)
OR
`/create-brief <bet-id>` (promote-stub mode — only if a portfolio stub exists for this ID)

## Mode detection

| Argument shape | File at `docs/bets/<arg>/brief.md` | Mode |
|---|---|---|
| Looks like a bet ID (e.g., `PROJ-42`) | exists with `portfolio_stub: true` | **Promote stub** |
| Looks like a bet ID | exists with `portfolio_stub: false` (or absent) | **Refuse** — brief already fully drafted; use `/create-story` or `/create-bet-architecture` next |
| Looks like a bet ID | does not exist | **Refuse** — no stub to promote, and `/create-brief` for fresh bets needs source material, not an ID |
| URL / free text | n/a | **Create fresh** |

## Process

1. **Verify gate:** `docs/foundation/product.md` and `docs/foundation/architecture.md` both exist with `status: approved`. If not, refuse.
2. **Load PM role context** (`compass/roles/pm.md`)
3. **Engage Researcher** (always — `compass/roles/researcher.md`)
4. **Gather source material:**
   - If source link: read via MCP (Confluence / GDrive / Notion / Linear / Jira)
   - If free text: use as primary source
   - Multiple sources allowed
5. **Researcher gathers context** in parallel:
   - Existing tickets via MCP
   - Sentry data, analytics
   - Support pain input (load Support role context briefly)
   - Asks PM clarifying questions for any gaps (Researcher always asks questions — that's its job)
6. **Generate bet ID** (Jira-style — create the epic in Jira, get the ID, e.g. PROJ-42)
7. **Draft brief** at `docs/bets/<bet-id>/brief.md` using `compass/templates/brief.md`:
   - Frontmatter: id, type (feature/okr/tech-debt/etc.), parent (optional — link to OKR or foundation bet), status: `proposed`, created date, author, source links
   - Problem, user, why-this-matters
   - Hypothesis (the bet)
   - Primary metric (name, baseline, target, source)
   - Guardrail metrics (what shouldn't degrade)
   - Measurement window (default 30 days, configurable)
   - Check-in cadence (weekly / biweekly / monthly)
   - Scope: in vs. out
   - Architecture required flag (`true | false | auto`)
   - DRI Log section
8. **Mirror to Jira/Trello/Confluence** as an epic
9. **HITL gate** — human reviews and marks `status: approved`
10. **Delivery Manager updates `docs/status.md`**

## Output

- `docs/bets/<bet-id>/brief.md` with `status: proposed` → `approved`
- Mirrored to ticketing/docs system
- `docs/status.md` updated

## Promote-stub mode (specifics)

When mode = "Promote stub":

1. Read the existing stub at `docs/bets/<bet-id>/brief.md` — keep its frontmatter (`id`, `parent`, `type`, `depends_on`, `parallel_with`, hypothesis traced to product bet), discard placeholder body.
2. Read `docs/foundation/portfolio.md` to load the bet's role in the wedge (which loop step it enables, what depends on it).
3. Skip the source-material gather step (the stub already has its trace-back). PM may still ask user for additional context for the full draft.
4. Engage Researcher as normal — but specifically to flesh out: user-pain evidence for *this* bet, competitive context, and any moat implications.
5. Fill the full brief content (problem, user, why-this-matters, scope, guardrails, etc.) as usual.
6. **Clear the flag:** set `portfolio_stub: false` in frontmatter.
7. Update `docs/foundation/portfolio.md` Promotion log table (Bet ID, promoted-on date, status after).
8. HITL approves the full brief separately from portfolio approval.

## Notes

- PM decomposes into stories **one at a time** via `/create-story <bet-id>` after this brief is approved
- If brief has `architecture_required: true` or `auto` → Architect engages next via `/create-bet-architecture <bet-id>`
- Researcher findings live in the brief itself or `docs/bets/<bet-id>/research.md` if substantial
- For new projects: run `/create-bet-portfolio` first to draft the MVP wedge as stub briefs; then promote each via `/create-brief <bet-id>` as you're ready to fully scope it
