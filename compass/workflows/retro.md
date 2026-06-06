# Workflow: /retro

Periodic retro of framework (or project) improvements. Fires every 5 improvements logged in `compass/workflows/improvements.md` (framework) or `docs/improvements.md` (project). Produces an archived retro at `compass/workflows/retros/<date>-retro-<NNN>-<period>.md`.

**Why this exists.** Per AGENTS.md principle #14, soft-spec rationalization is the dominant failure mode of agent-driven workflows. Hardening fixes the loophole the agent found *this time*; retros catch loopholes that recurred across multiple improvements and should have been hardened earlier. The retro is the **convention-discovery lag closer** — it shortens the time between "pattern visible in 3 improvements" and "pattern formally codified in AGENTS.md."

The retro **reports**, it doesn't **prescribe**. Patterns surfaced feed future improvements via normal triggers (real-world friction, dogfood evidence, user direction). The retro is not a planning workflow.

## Trigger

- **Auto-fires** when `compass/workflows/improvements.md` accumulates 5 new dated entries since the last retro. (Manual responsibility of the next Architect / PM reading the log — there's no cron yet; in practice, fire it during a normal Compass session when you notice the count.)
- **Manual:** `/retro` to fire on demand. Useful when the framework has had a major release (e.g., a new workflow shipped) and you want a focused retro of the patches around it.

## State detection

| State | Action |
|---|---|
| Fewer than 5 entries since last retro (or no improvements log) | **Refuse.** Tell user: "<N> improvements since last retro; <5 - N> more needed to fire automatically. Override with `/retro --force` if you want a partial-batch retro." |
| 5+ entries since last retro | **Run retro** for the next 5 entries (oldest first). If more than 5 accumulated, run sequential retros (one per 5-batch). |
| Backfill mode (`/retro --backfill`) | Generate retros retroactively for all historical 5-batches that don't yet have a retro. Useful when adopting `/retro` on an existing improvements log. |

## Process

1. **Verify gate:** `compass/workflows/improvements.md` exists with ≥5 entries (or in backfill mode, has any entries).
2. **Identify next batch:** read the improvements log; find the first 5 entries that don't have a retro covering them. (Retros are sequential and disjoint — improvement 1-5 in retro #001, 6-10 in #002, etc.)
3. **Load Delivery Manager agent** (`compass/agents/delivery-manager.md`) for project retros, OR framework-Architect persona for framework retros (Compass on Compass). (Delivery Manager migrated + renamed from Project Manager in v0.3.15; legacy role file retained during v0.3.x grace period.)
4. **Read all 5 improvements** fully — both the entries in `improvements.md` AND the underlying CHANGELOG entries for each version.
5. **Synthesize across the batch** using the retro template (`compass/templates/retro.md`):
   - **Common patterns (positive)** — what's working that shows up multiple times
   - **Recurring anti-patterns (negative)** — soft-spec rationalization surfaces that recurred
   - **Convention candidates** — shapes stable enough to promote to AGENTS.md cross-cutting principles (rule of thumb: ≥3 instances and the shape is mature)
   - **Drift signals** — workflows being repeatedly patched; big-bundle releases needing immediate follow-ups; framework tech debt
   - **Trigger-origin analysis** — where did improvements come from; concentration risk
   - **Watch-for list** for the next 5 — hypotheses to track explicitly
   - **Meta-observations** — framework surface area growth, hardening ratio, convention discovery lag observed
6. **Write archive** at `compass/workflows/retros/<YYYY-MM-DD>-retro-<NNN>-<period>.md` (e.g., `2026-05-26-retro-001-v0.1.8-to-v0.1.12.md`). Status: `archive`. **Never edited after publication.**
7. **Update `compass/workflows/improvements.md` header** with: "Retros every 5 entries. Last retro: [<#NNN>](retros/...). Next retro fires after improvement #<M+5>."
8. **If any convention candidates are recommended for promotion this batch**, surface them as a follow-up suggestion in the chat output. Don't auto-promote — that's a separate decision (and would itself be a new improvement requiring its own entry).
9. **No HITL gate.** Retros report on what already happened; no decisions to approve.

## Verification (mandatory)

- [ ] Retro archive exists at `compass/workflows/retros/<YYYY-MM-DD>-retro-<NNN>-<period>.md`
- [ ] Frontmatter populated: `period_start`, `period_end`, `improvement_count: 5`, `created`, `author`, `parent_log`
- [ ] All 6 retro sections present (Improvements / Common patterns / Recurring anti-patterns / Convention candidates / Drift signals / Watch-for list); empty sections explicitly noted "none observed"
- [ ] Improvements log header updated with retro link + next-fire counter
- [ ] Status: `archive`

## Output

- `compass/workflows/retros/<YYYY-MM-DD>-retro-<NNN>-<period>.md` — archived retro
- `compass/workflows/improvements.md` header updated with retro link + next-fire counter
- Chat summary: top 1-3 patterns + any convention candidates ready for promotion

## Refusal cases

- Fewer than 5 entries since last retro (without `--force`)
- `compass/workflows/improvements.md` missing entirely

## Notes

- **Reports, doesn't prescribe.** Retros surface patterns but never create new improvements directly. If a retro identifies a convention to codify (e.g., "N-category enforcement is ready"), that codification happens as a normal improvement in a future patch — with its own entry, its own ADR-style rationale, its own gate.
- **Sequential and disjoint.** Retro #001 covers improvements 1-5; #002 covers 6-10; never overlap. Backfill mode handles historical gaps.
- **Archive immutability.** Retros are never edited after publication. If later analysis contradicts a retro's conclusion, the contradiction lands in a future retro — not by rewriting history. This preserves the "what we knew at the time" honesty that makes retros useful as institutional memory.
- **Framework retros vs project retros.** Same workflow shape, different `parent_log`. Compass-on-Compass retros use `compass/workflows/improvements.md`. Project retros (a team retroing their own bets / sprints) would use `docs/improvements.md` and write to `docs/retros/`. Currently only framework retros are wired; project-retro variant can generalize when a project asks for it.
