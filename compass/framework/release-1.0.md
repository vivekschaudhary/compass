# Compass 1.0 — Release Plan

**Theme:** *Pilot-ready.* 1.0 ships when the delivery control tower is hardened enough to run **one real enterprise program end-to-end** — the .NET/Blazor licensing-portal POC — through the full lifecycle (foundation → bets → stories → parallel isolated builds → cross-model review → merge → WBS/conformance/audit), on the pilot's own GitHub + Jira + Confluence, with no sharp edge that would embarrass in front of the MD.

**Status (2026-06-30):** planning locked. Milestone [1.0](https://github.com/vivekschaudhary/compass/milestone/1). Tracks the strategic thesis — *validate via one real program* (the control-tower thesis).

**Single sources:** framework work is tracked in **GitHub** — open backlog = issues (milestone 1.0); the why + change = issue + PR (`Closes #N`); shipped summary = `CHANGELOG.md` + Releases (#42; `improvements.md` is frozen at #181, historical). This file is the scope map + sequencing, not a version log.

---

## Acceptance gate

**#33 — the pilot vertical slice runs end-to-end through the tower.** 1.0 is done when #33 is green. Everything below exists to make that credible.

---

## Tracker model (who tracks what)

- **Compass framework** → **GitHub issues** in `vivekschaudhary/compass`, milestone-tagged (#180). `improvements.md` is the shipped-change memory.
- **Consumer apps** (home-app + others) → **Jira + Confluence** (the same projection Compass ships, #34). Product docs land in Confluence; stories become Jira issues.

A clean separation: the framework's own progress is GitHub-native; the work *run through* Compass lands in the customer's own tools.

---

## Phases (sequenced against the gate)

### Phase 1 — Operability (stop the friction biting *now*)
The sharp edges the live dogfood exposed; these would embarrass in the pilot.
- **#26** — PM sequences same-module stories + `/build` warns on overlapping parallel launches *(actively blocking WLT-27-4)*
- **#40** — vendored `compass/` shadows the real module → pip-installable `compass-run` entrypoint *(just bit the live push)*
- **#28** — targeted `--reap-stale --run-id` (cleanup can't halt in-flight runs)
- **#27** — run-scope the step-artifact path (concurrent builds stop clobbering `step-*.md`)

### Phase 2 — Demo surface (build on the live Atlassian win)
- **#35** — cross-story dependencies → Jira epic + blocked-by links *(the demo-maker: six flat tickets → a managed program)*
- **#34** — live Jira/Confluence ✅ **DONE** (proven 2026-06-30: 8 Confluence pages + Jira KAN-1…6 on the pilot's Atlassian)
- **Confluence formatting** *(new — to file):* markdown → proper storage headings, not `<pre>` blocks, so pages read like real docs
- **#30** — cockpit self-reload (merged dashboard fixes go live without a manual restart)
- **#29** — auto-remove a merged build's worktree

### Phase 3 — Release engineering (an operator, not just the DRI, can run it)
- **#38** — unify framework + orchestrator versions → a coherent 1.0; finish `compass/roles/` removal (**#31**)
- **#37** — quickstart / SETUP docs (fresh-environment walkthrough to a first shipped story)

### Phase 4 — Codify + spike
- **#22** — codify `[capability-by-default-not-flag]` (canon)
- **#23** — codify `[actionability-before-trust]` (canon)
- **#36** — spike: can the engineer code a UI from a Figma export? *(could reshape #171; exploratory — candidate to slip to 1.1)*

---

## Critical path

```
Phase 1 (operability)  ──►  clean pilot run is possible
        │
        ├─►  Phase 2 (demo surface)  ─┐
        ├─►  Phase 3 (release eng)   ─┤
        └─►  Phase 4 (codify/spike)  ─┘
                                       └─►  #33 pilot E2E  ──►  ship 1.0
```
Phase 1 is the gate to a credible pilot run; 2/3/4 proceed in parallel after; **#33 is the final gate.**

## Dependencies
- **#33** depends on Phases 1–3 being solid.
- **#35** builds on **#34** (live Jira, done).
- **#37** (quickstart) depends on **#40** + **#38** (the install/version story).
- **#31** ⊂ **#38**.

## Scope decisions
- **In 1.0:** #22, #23, #26–#31, #33–#38, #40 + Confluence-formatting (to file).
- **Deferred to 1.1 (post-1.0 backlog):** #24 (`[reviewer-scope-separation]`), #25 (`[honest-degradation]`), #32 (placeholder-dir guard).
- **Watch:** #36 (Figma spike) — keep in 1.0 only if it stays a time-boxed spike; slip to 1.1 if it grows.

## Out of scope for 1.0
- Surface-independent progress fan-out (Telegram/Slack push) — strong post-1.0 candidate (push gate/run events to any human surface).
- AI generating Figma/design or final copy (humans own these, #171) unless #36 proves otherwise.
- Multi-program / org-altitude aggregation.
