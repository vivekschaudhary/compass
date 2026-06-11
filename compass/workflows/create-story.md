# Workflow: /create-story

PM decomposes the bet into **one** shippable story at a time. After a story ships, PM runs this again for the next slice.

## Trigger

`/create-story <bet-id>`

## Process

1. **Verify gates:**
   - `docs/bets/<bet-id>/brief.md` has `status: approved`
   - If brief has `architecture_required: true` → `docs/bets/<bet-id>/architecture.md` has `status: approved`
   - If neither → refuse with reason
2. **Load PM agent context** (`compass/agents/pm.md`, migrated v0.3.14)
3. **Read** brief, bet architecture (if exists), prior stories under this bet (to know what's done, what's queued)
4. **PM identifies next shippable slice:**
   - Smallest thing that delivers value
   - Independent (can ship on its own)
   - Informed by what previous stories taught (adaptive planning)
5. **Generate story ID** (Jira sub-ticket under bet — e.g., PROJ-43 under PROJ-42)
6. **Engage Designer + UX Writer** if story has UI surface:
   - Designer drafts `docs/bets/<bet-id>/stories/<story-id>/design.md`
   - UX Writer drafts `docs/bets/<bet-id>/stories/<story-id>/copy.md`
   - Both run in parallel
7. **Draft story** at `docs/bets/<bet-id>/stories/<story-id>/story.md` using `compass/templates/story.md`:
   - Frontmatter: id, bet (parent), type, status: `ready` (or `needs-design` until design exists)
   - Title
   - Description
   - Acceptance criteria (required)
   - **Standard Experience Checklist (required, load-bearing).** Each of the 6 categories — Navigation / States / Feedback / Accessibility / Edge cases / Cross-surface consistency — is either covered by ≥1 AC item OR explicitly marked `n/a — <reason>`. Empty categories (no AC reference AND no `n/a` note) block the story from reaching `status: ready`. This is the bridge between Designer's "every state per screen" completeness and the implementation contract — what the Designer drew but the AC doesn't say will ship missing (the aura-app missing-back-button class of failure).
   - Design link (required if UI work)
   - Tech notes (referencing bet architecture)
   - Dependencies (other stories, external systems)
   - Priority
   - DRI Log
8. **Mirror to Jira/Linear** as story under bet's epic
9. **HITL gate** (if `hitl_level: every_phase` — otherwise auto-advance to ready)
10. **Delivery Manager updates `docs/status.md`**

## Output

- `docs/bets/<bet-id>/stories/<story-id>/story.md` with `status: ready`
- If UI: `design.md` + `copy.md` alongside
- Mirrored to Jira/Linear
- `docs/status.md` updated

## Refusal cases

- Brief not approved
- Architecture required but not approved
- Previous story under this bet is still in `build` and PM hasn't shipped it (one at a time discipline)
- Standard Experience Checklist has any empty category (no AC reference AND no `n/a — <reason>` note) — story cannot reach `status: ready`

## Notes

- After story is `ready`, `/build <story-id>` can run
- After story ships, run `/create-story <bet-id>` again for the next slice
- Stories under one bet need not be all created upfront (it's adaptive)
