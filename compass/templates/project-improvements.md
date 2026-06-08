# Project Improvements Log

> **Template** — ships at `compass/templates/project-improvements.md`. Consuming projects copy this to `docs/improvements.md` at their repo root and append entries from there.

Real friction encountered while running the project (using Compass workflows), with the change made to fix it. This file is the institutional memory of why THIS PROJECT'S workflows + agents + bet portfolio are shaped the way they are. Project-altitude analogue of `compass/workflows/improvements.md` (which is the FRAMEWORK's improvement log).

Each entry: what happened → what changed → what to watch for.

## Retro cadence

Retros every 5 entries per AGENTS.md principle #14 + `[fractal-retro]` (canon.md v0.3.17 — same workflow shape at every altitude; this is the project altitude's instantiation). Project retros land at `docs/retros/<NNN>-<period>.md` and consume this log + any child retros (bet, role, workflow) that exist in the project.

- **Project retro #001** (improvements 1→5): [docs/retros/001-<period>.md] (link once it exists)
- ...

**Next project retro fires after improvement #<M+5>.**

## Relationship to other altitudes

This log is the source for project-altitude retros. Other altitudes have their own source logs:

- **Role altitude:** `docs/role-activity/<role>.md` — agents append patterns mid-task
- **Workflow altitude:** `docs/workflow-runs/<workflow>.md` — workflows append one entry per run
- **Bet altitude:** per-bet DRI logs + outcome transition (no separate log; the bet's own artifacts ARE the source)
- **Org altitude:** aggregator across multiple project `docs/improvements.md` files (v0.4+)
- **Framework altitude:** `compass/workflows/improvements.md` in the Compass framework repo (separate from this project)

Project retros can also consolidate child-altitude retros (role, workflow, bet) — list those in the project retro's `consolidates_from:` frontmatter.

## Template

```
### YYYY-MM-DD — Short title naming the friction

**Friction:** What hurt, where, and how it surfaced.

**Change:**
- Bullets describing the specific edits.

**Files touched:** comma-separated paths.

**Watch for:** future risks, follow-ups, things that could regress.
```

---

<!-- Append new entries below. Most recent at the bottom. -->
