---
id: RETRO-022
type: retro
status: archive
altitude: framework
period_start: 2026-06-20
period_end: 2026-06-22
improvement_count: 5
created: 2026-06-22
author: framework-Architect (Claude Opus 4.8)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #022 — framework — improvements #103 to #107

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 + `[fractal-retro]` (canon v0.3.17). **Status: archive.** Two arcs in one batch — the **delivery layer** (cockpit + cost) and the **front-door router** — both driven almost entirely by one continuous live home-app session. **Headline finding: a user-driven architectural challenge to ITIL tiering itself** (captured below as a codification candidate + a declared redesign).

## Source entries in scope

- **#103** — front-door `/triage` ITIL intake router (implements declared #98) + `[conditional-dispatch]` codified to canon (4th architecture-discipline member; catalog 22→23)
- **#104** — orchestrator event spine (user-local `~/.compass`, portfolio-wide) + text cockpit — delivery layer slice 1
- **#105** — Claude prompt caching + usage telemetry on the event spine
- **#106** — cockpit cost rollup (per-project spend + cache savings)
- **#107** — fix `/triage` skill surface still framed as incident-response (consumer signal)

## Headline finding — the ITIL-tiering challenge (DRI, live session)

While using the orchestrator on a real home-app bug, the DRI hit the orchestrator's `support.triage-bug` step **interrogating** them for product basics — and named the root cause precisely: *"do we really need the ITIL L1/L2/L3 destructuring in the AI world? moving from L1/L2 to L3 is a ceremony — they need to run it, validate it, figure out the fix."*

**The diagnosis (agreed):** ITIL tiering exists for **human economics + access control** — cheap L1 generalists deflect/route to protect scarce, expensive L3 engineers, and the "triager can't see the code" wall is an access decision. In the AI world the protected resource is an agent that reads the code instantly at token cost, so the escalation ladder is ceremony reproducing a human org-chart whose premises no longer hold.

**The synthesis — separate the org-chart from the functions. Keep what's load-bearing, drop the tiering:**
- **Keep — routing** (`/triage` front door: *which* workflow, not *who*).
- **Keep — maker ≠ checker** (engineer fixes; a **different model** reviews). ⚠️ This is **not** ITIL and must never collapse — the fixer running its own tests is *validation*, a second model reviewing is *review*; self-review stays forbidden.
- **Keep — HITL gates** and **reproduce-before-fix** (as a *step* the fixer does, not a wall it escalates across).
- **Drop — the support-triage→engineer escalation tier.** Collapse into one tool-capable `engineer.triage-and-fix` that reads the code, reproduces by *running* it, diagnoses, and fixes — asking the human only for what code genuinely can't reveal (prod data, account-specific state, credentials).

This **supersedes the in-flight #108 "knowledge base for triage" idea** — a code-capable fixer needs *code*, not a functional-docs KB. #108-as-KB is dropped; the collapse replaces it.

## Common patterns (positive)

| Pattern | Instances | What it means |
|---|---|---|
| **One live session → a whole batch** | #103/#104/#105/#106/#107 all trace to the continuous home-app run | Second batch running where a single real session is the engine (Retro #021 was the first). Principle #19 is now the *normal* mode, not the exception. |
| **Declared → built, on the watch-for** | #98→#103 (router), VISION step 3→#104 (cockpit) | Retro #021's #1 watch-for was "build the declared backlog, don't just accrue it." This batch converted two big declarations to builds. |
| **Reduce → measure → see, in one arc** | #105 caching → #105 telemetry → #106 rollup | Cost was attacked as a system: cut it (caching), instrument it (usage events on the #104 spine), surface it (cockpit SPEND). Each slice additive over the prior. |
| **Additive-over-a-spine architecture** | #104 spine → #105 usage event → #106 reader | The event spine made #105/#106 cheap — a new event type + a new reader, loop untouched. Good substrate pays off immediately. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening | Convention-ready? |
|---|---|---|---|
| **Semantic change didn't sweep the user-facing surface** | #107 — #103 repurposed `/triage` everywhere except `.claude/skills/triage/SKILL.md`, so interactive triage still pre-framed as an incident | #107 fixed it + swept README; lesson logged | **Yes** — `[skill-surface-is-load-bearing]`: a workflow's *semantic* change must sweep its skill `.md` description (the interactive model frames its whole run off it). `[pre-push-grep-discipline]` is the tool; the gap was not running it against `.claude/skills/`. |
| **Modeling a human constraint the AI doesn't have** | the repo-blind `support.triage-bug` interrogating the DRI | the ITIL-collapse redesign (declared below) | **Yes** — see headline; candidate `[ai-collapses-org-tiering]`. |
| **Hand-off omits the flag the target needs** | the #103 hand-off prints a `/fix` command without `--allow-write`, so a copy-paste run is read-only | noted (paper-cut) | Small — fold into the `/fix` redesign or a quick follow-on. |

## Convention candidates

- **`[ai-collapses-org-tiering]`** (NEW, 1 strong instance — DRI-originated) — AI dissolves human escalation tiers (ITIL L1/L2/L3). Keep **routing**, **maker≠checker**, and **HITL**; drop the **escalation ladder**. First implementation = the `/fix` collapse (declared below). Codify when the redesign ships (its 1st concrete instance) — or sooner given the strength of the reasoning; **DRI-gated**.
- **`[skill-surface-is-load-bearing]`** (NEW, 1 instance — #107) — `.claude/skills/*/SKILL.md` descriptions are behavioral surfaces, not labels; semantic workflow changes must sweep them. Codify on 2nd instance.
- **`[failure-direction-inversion]`** — still codification-ready (carried from Retros #017–#021, ~5 instances). DRI-gated. Overdue.
- **`[conditional-dispatch]`** — **CLOSED**: codified to canon at #103 (v0.3.49). Was the standing candidate from Retro #021.

## Declared (not built) — coming out of this retro

- **The `/fix` tier collapse** — restructure `/fix` to `engineer.triage-and-fix (tool-capable: reproduce→diagnose→fix→test) → HITL gate → reviewer (different model)`; shrink `support` to the front door (`/triage` + comms); soften `[refuse-escalate]` from *"demand repro from the user"* to *"reproduce from the code; ask the human only for what code can't tell you."* Preserve maker≠checker + HITL. **This is the next improvement to plan.**
- **#108-as-KB — DROPPED** (superseded; recorded so it isn't re-proposed).

## Drift signals

| Signal | Evidence | Investigation |
|---|---|---|
| **Orchestrator triage worse than interactive Claude Code** | repo-blind triage interrogated the DRI on facts the code answers | The collapse fixes it; until then, interactive Claude Code is the better tool for diagnosing a known bug. |
| **Declared backlog persists** | worktree isolation (#102), delivery follow-ons (HTML feed, Slack, inline-approve/action-channel), `[failure-direction-inversion]` codification | Keep converting; same watch-for as #021. |
| **Cost made visible but not yet bounded** | #106 shows spend; no budget/cap surfaced | Possible follow-on: a per-run/portfolio budget signal in the cockpit. |

## Full-surface audit

**Method:** `consistency-check.py` (counts + version self-claims) + task double-ownership across agents + dispatch-graph count vs AGENTS + full suite.

| Finding | Verified? | Disposition |
|---|---|---|
| consistency-check | CONSISTENT | clean (3rd straight retro with nothing to fix) |
| task double-ownership | none | clean |
| dispatch-graph count (9) vs AGENTS | match | clean |
| test suite | 139 pass | clean |

## Trigger-origin analysis

- **Consumer (live home-app session):** 5 of 5. The routing dead-end → #103; VISION cockpit pull + "use the dashboard as orchestrator" → #104; "API costs are heavy" → #105/#106; "triage waits for an incident" → #107; and the batch's headline architectural challenge (ITIL tiering) all came from one continuous run. Most consumer-concentrated batch yet — even more than #021.

## Watch-for list (next 5 improvements, #108–#112)

- **Build the `/fix` tier collapse** (the headline redesign) — and codify `[ai-collapses-org-tiering]` when it lands.
- **Worktree isolation (#102)** — still the blocker for safe parallelism.
- **Delivery follow-ons** — HTML `/dashboard` live feed, Slack/WhatsApp sinks, the **action channel** (approve-from-surface relays to the mechanical gate), `--watch`.
- **Codify `[failure-direction-inversion]`** — overdue.
- **Sweep `.claude/skills/` whenever a workflow's meaning changes** (`[skill-surface-is-load-bearing]`).

## Meta-observations

**The framework's best ideas now come from using it, not designing it.** Two consecutive batches (#021, #022) were ~100% consumer-driven, and this one produced a *challenge to a foundational borrowed model* (ITIL) — the deepest kind of signal, the sort introspection rarely surfaces. The DRI hit a wall (repo-blind triage), and instead of patching it, asked whether the wall should exist. That's `[consumer-as-primary-signal]` operating at the architecture level, not the bug level.

**Retros are doing their job as a holding pen.** The ITIL-collapse insight could have triggered an immediate restructure mid-session; instead it's captured here as a declared redesign + a candidate principle, to be planned deliberately — `[declare-not-implement]` + "report, don't prescribe" holding under real pressure.

**18th consecutive on-time retro.**

---

_Archived 2026-06-22. Not edited after this date. Next retro fires after improvement #112._
