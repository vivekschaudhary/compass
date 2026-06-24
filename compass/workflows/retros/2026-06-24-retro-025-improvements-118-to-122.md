---
id: RETRO-025
type: retro
status: archive
altitude: framework
period_start: 2026-06-24
period_end: 2026-06-24
improvement_count: 5
created: 2026-06-24
author: framework-Architect (Compass-on-Compass)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #025 — framework — source entries #118 to #122

> Batch retro at the **`framework`** altitude per AGENTS.md principle #14 + `[fractal-retro]` (canon v0.3.17). **Status: archive.** Reports patterns; does not prescribe.

## Source entries in scope

- **#118** — async gates: non-interactive pause-and-resume (`--non-interactive` + `--decide`)
- **#119** — action endpoints: launch + approve from the browser (`POST /run` + `/decide`, `--allow-actions`)
- **#120** — the `claude-code` host: subscription-backed CLI dispatch (+ follow-up: `_subscription_env` key-strip + stdout error surfacing)
- **#121** — `--run-id`: a resumed gate continues the same run, not a fork
- **#122** — dashboard action guards: confirm, disable-on-submit, already-actioned

## Common patterns (positive)

| Pattern | Instances in this batch | What it means |
|---|---|---|
| **Multi-slice declared-then-built arc, completed in order** | #118 → #119 → #120 (the dashboard-as-orchestrator arc, each slice declared the next) | The arc was built as three deliberate slices (async gate → action endpoints → flat-cost host), each shipping standalone value and naming its successor. First arc both *declared and fully built AND battle-tested* inside the same dogfooding session. |
| **Surface-independent mechanism reused** | #119/#120 (env `COMPASS_CLAUDE_HOST` propagates through `Popen(env=os.environ.copy())` → dashboard inherits the CLI host with **zero cockpit change**); #121 (`run_id` threaded through the same form-hidden machinery) | Capabilities composed through existing seams (env inheritance, hidden form fields, the spine) instead of new plumbing. `[surface-independent-mechanism]` gains instances. |
| **Pure core + injectable boundary = testable without the world** | #119 (`_build_run_argv` pure), #120 (`_build_cli_argv`/`_parse_result`/`_subscription_env` pure; `runner=` injected — no test invokes real `claude`), #121 (`_remap_claude_cli` pure), #122 (`_gate_already_actioned` pure) | Every slice isolated a pure arg/parse/decision function + an injectable side-effect. +43 tests across the batch, none touching the network/CLI. `[test-alongside-implementation]` (codified #94) held 5/5. |
| **Guard the floor by construction** | #119 (spawns always carry `--non-interactive` + `--max-cost`; localhost-only; argv never `shell=True`), #120 (remap only `claude`→`claude-code`, reviewers untouched), #122 (server-side 409 backstop) | Each new power was shipped with its abuse-path already closed — the gate floor, cost cap, and reviewer independence never depended on the UI behaving. |

## Recurring anti-patterns (negative)

| Anti-pattern | Instances | Hardening shape applied | Convention-ready? |
|---|---|---|---|
| **Swallowed failure diagnostics** — the error path hid the real cause | #120 follow-up: `claude` exited 1 with the reason in **stdout**, but the adapter only reported stderr → "(no stderr)", fully blind | Surface stdout on non-zero exit (parse the JSON error). Same shape as #104 (on_event dict mangled → cost showed nothing) and #112 (dispatch halt). | Reinforces `[failure-direction-inversion]` (overdue since #020) — a "diagnostics must surface the actual cause" sibling |
| **Inherited env shadows intent** | #120 follow-up: an exported (capped) `ANTHROPIC_API_KEY` silently overrode the subscription login → the CLI host billed the metered API, defeating its own purpose | `_subscription_env` strips `ANTHROPIC_API_KEY`/`AUTH_TOKEN`/`BASE_URL` for the subprocess | 1 instance — watch for a 2nd (env-precedence surprises) |
| **Identity fork on resume** | #121: `run_id` minted fresh per invocation → `/decide` forked a duplicate run; the paused run never cleared from ⏸ awaiting | `--run-id`/`run_id_override` continues the original run | 1 instance — the "resume continues, not forks" idea |
| **No-feedback UI invites repeat actions** | #122: a route button with no confirm/disable → the operator clicked 3× → 3 duplicate `/fix` runs | confirm() + disable-on-submit (client) + 409 already-actioned (server) | 1 instance |

## Convention candidates

- **`[surface-independent-mechanism]`** — *carried from Retro #024 (was 3 instances, codification-ready).* New instances this batch: env-propagation-through-`Popen` (#119/#120) and run_id-through-hidden-fields (#121). **Instances now 5+.** Proposed principle: *"Deliver a new capability through an existing seam (env, the event spine, hidden form fields, the dispatch graph) before adding new plumbing — the cheapest integration is the one that needs no integration."* **Recommendation: PROMOTE (user-gated).**
- **`[economy-by-default]`** — *carried from Retro #024.* #120 (subscription flat-cost as the cost answer; `--max-cost` can't false-trip on it) is another instance. **Recommendation: promote alongside `[surface-independent-mechanism]` (user-gated) — both have ≥3 stable instances.**
- **`[size-the-path-to-the-work]`** — *carried meta candidate (Retro #023).* No strong new instance this batch. **Recommendation: wait.**
- **`[failure-direction-inversion]`** — *carried/overdue since Retro #020 (~4 instances).* The #120 "(no stderr)" hiding is a fresh sibling instance (diagnostics defaulting to silence). **Recommendation: this is now the most-overdue codification — decide it next batch (user-gated).**
- **NEW: `[continue-not-fork-on-resume]`** — a resumed/relayed action must continue the original unit of work (same id), not spawn a parallel one (#121). 1 instance. **Recommendation: wait for a 2nd.**

## Drift signals

| Signal | Evidence | Investigation candidate |
|---|---|---|
| **Host-list enumerations are an un-mechanized drift class** | The audit found `claude-code` missing from AGENTS.md's host table + router.py's docstring — `consistency-check.py` passed because it doesn't cover prose host lists. Every new host must be hand-added in N prose places. | Extend `consistency-check.py` to enumerate hosts from `router.py`'s dispatch arms and diff against the AGENTS.md table — or a `[single-source-host-list]`. |
| **Capability shipped, then same-session patched** | #120 shipped without the `_subscription_env` strip + stdout surfacing; the first real run exposed both → immediate follow-up commit | Healthy (live dogfooding caught it fast), but a reminder that a host adapter isn't "done" until a real auth-constrained run exercises it. |
| **High same-day cadence** | all of #118–#122 dated 2026-06-24, one continuous session | Not over-engineering (each slice earned its place via live friction); noted for honesty. |

## Full-surface audit

**Method:** independent context-free agent (fresh session, Sonnet — different context than the implementer), treated as claims-to-verify; plus `consistency-check.py` + live `unittest` count.

| Finding | Verified? | Disposition |
|---|---|---|
| AGENTS.md "Supported hosts" table omits `claude-code` (stale post-#120) | yes | **fixed-in-batch** (added a `claude-code` row) |
| `router.py` docstring credential-check block omits `claude-code → claude CLI on PATH` | yes | **fixed-in-batch** (added the line) |
| Test-count claims: live runner = 208; latest claim (improvements #122 / CHANGELOG) = 208; chain 171→181→203→206→208 internally consistent | yes (consistent) | no action |
| #118–#122 "N of 5" counter sequence + "Retro #025 fires after #122" | yes (consistent) | no action |
| All documented CLI flags (`--claude-cli`, `--run-id`, `--non-interactive`, `--decide`, `--max-cost`; `--allow-actions` in cockpit) exist in argparse | yes (consistent) | no action |
| `claude_code.py` claims (key-strip, bypassPermissions mapping, NOTE/no-usage-event, `--append-system-prompt-file`) match code | yes (consistent) | no action |
| Workflow count "17" / dispatch-graph "9 of 17" | yes (consistent) | no action |
| `consistency-check.py` | CONSISTENT | no action |

## Trigger-origin analysis

- **Live dogfooding (DRI driving the dashboard against home-app / crypto-app)** — **5 of 5.** #118–#120 from "orchestrate from the dashboard" + "I don't want to use an API key"; #120-follow-up/#121/#122 from defects the DRI hit clicking the live cockpit (capped-key 400, triple `/fix` rows, no button feedback).
- **5th straight ~100%-consumer/dogfood batch** (#103–#107, #108–#112, #113–#117, now #118–#122). `[consumer-as-primary-signal]` (Principle #19) continues to dominate.
- **Concentration risk:** single consumer-session source (one DRI, one dogfooding arc). Same standing note as the last four batches — the signal is deep but narrow; a second independent consumer would broaden it.

## Watch-for list (next 5 improvements: #123–#127)

- **Mechanize host-list consistency** — extend `consistency-check.py` to host enumerations (the exact drift this audit caught by hand).
- **CLI-host tool streaming** — the declared #120 follow-up: surface per-tool `tool_use`/`tool_result` from `claude -p --output-format stream-json` so CLI-host steps show live tool activity (today they show running→done).
- **Codify the overdue pair** — `[surface-independent-mechanism]` + `[economy-by-default]` are both ≥3 instances and stable; `[failure-direction-inversion]` is the most-overdue. User-gated promotion decisions.
- **Second consumer signal** — break the single-session concentration; run a second app through the orchestrator.
- **`[continue-not-fork-on-resume]`** 2nd instance.

## Meta-observations

- **21st consecutive on-time retro** (fired at #122, the cadence horizon). The discipline-as-muscle-memory streak holds.
- **First arc declared, fully built, AND battle-tested in one session.** #118 declared #119+#120; both shipped; the DRI then drove the whole loop live and surfaced #120-follow-up/#121/#122 — declaration → build → live-hardening compressed into a single continuous arc. The orchestrator's "dashboard as orchestrator" vision (VISION step 3) is now real and exercised.
- **Hardening-to-capability ratio ≈ 3:2** this batch (#118–#120 capability, #121–#122 + the #120 follow-up hardening) — and every hardening item came from *using* the capability minutes after shipping it. The shortest convention-discovery lag observed: defect surfaced and fixed within the same session.
- **The honest-cost thread closed.** Retro #024's concession ("VS Code flat-sub is cheaper for interactive") drove #120; the orchestrator now runs on a flat subscription, not a meter — the strategic answer was built, not just declared.

---

_Archived 2026-06-24. Not edited after this date. Next retro fires after improvement #127._
