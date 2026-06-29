---
id: RETRO-031
type: retro
status: archive
altitude: framework
period_start: 2026-06-28
period_end: 2026-06-29
improvement_count: 10
created: 2026-06-29
author: framework-Architect (Compass-on-Compass)
parent_log: compass/workflows/improvements.md
consolidates_from: []
---

# Retro #031 — framework — improvements #168 to #177

The **live-dogfood batch**: almost every entry was born from a real WLT-26/WLT-27 build run in the browser, surfacing the next defect the moment the previous fix unblocked it. This is the densest consumer-signal-driven cycle in framework history — and it ran the first genuinely *parallel* story builds (WLT-27-2/3/4 concurrent, isolated worktrees) end-to-end.

## Source entries in scope

#168 designer/ux-writer host + gate-resume promotion + awaiting-approval false-positive · #169 CI honest-green (skip host-readiness tests when SDK absent) · #170 idle guard streams partial messages (no false-kill) · #171 design & copy become human-owned stories (not sidecars) · #172 story-scoped build (`/build <story-id>`) · #173 build branches no longer stack (clean fresh-base) · #174 worktree-per-build by default · #175 telemetry out of git + worktree pruning · #176 dashboard shows the story id · #177 dashboard approve no longer races the auto-refresh.

## Common patterns (positive)

- **`[consumer-as-primary-signal]` (Principle #19) validated overwhelmingly.** ~8 of 10 entries originated from a live run: #168 (3 bugs across 3 real WLT-27 runs), #170 (architect idle-killed mid-compose), #172 (the "looks hung" `/build WLT-27-1`), #173 (cumulative conflicting PRs), #176 (card showed the bet not the story), #177 (approve dropped). The dogfood flywheel isn't a slogan here — it's the literal mechanism that produced the batch.
- **Layered progressive hardening (`[L-layered-progressive-rollout]`).** #172→#173→#174→#175 is a textbook chain: each fix exposed the next gap. Story-scoping revealed branch-stacking; fixing stacking revealed the shared working tree; isolating with worktrees revealed committed telemetry dirtying the tree. The framework converged by *running*, not by up-front design.
- **Reproduce/diagnose-from-the-spine before fixing.** Every "it didn't work" was traced to ground truth first: #172/#176/#177 were diagnosed by folding the event spine and reading run logs (#177's root cause — a dropped POST — was *proven* by the spine showing exactly one clean resume and zero failed ones). `[reproduce-before-diagnose]` (canon #144) held throughout.
- **Friction removal as a first-class move.** The DRI repeatedly stripped optionality that only caused silent failure: #174 killed the `--worktree` flag I had added ("why are we adding flags — standard devops"); the same instinct drove write-by-default (#179, next batch). Isolation and write-permission became *defaults*, not knobs.

## Recurring anti-patterns (negative)

- **`flag-for-a-capability-the-workflow-needs`** — I reached for a `--worktree` opt-in (#174); the DRI rejected it. A capability a workflow *needs to do its job* should be the default, not a flag. (Recurs into #179's write-by-default.)
- **`silent-drop-on-the-action-surface`** — #176 (card mislabeled by parent bet) + #177 (approve POST silently aborted by the auto-refresh). The surface where the human *acts* dropped/obscured actions with no error. As load-bearing as the execution path, and historically under-tested.
- **`shared-state-collision-under-concurrency`** — branch-stacking on a dirty tree (#173); step-`*.md` artifacts written to one shared path by concurrent same-workflow runs (surfaced #174, only partly addressed by #175's telemetry gitignore).
- **`over-matching-incomplete-classifier`** — #168's "awaiting approval" false-positive; the #149 classifier regex keeps needing tightening (2nd instance after the original).
- **`global-cleanup-catches-inflight`** (operational, this session) — `--reap-stale COMPASS_STALE_TIMEOUT=1` halted a *live* build (-4) in the spine. Cleanup tools need run-targeting.

## Convention candidates

- **`[capability-by-default-not-flag]`** — if a workflow needs a capability to do its job (isolation, write permission), it's on by default; `--dry-run`/explicit opt-OUT is the escape hatch. **3 instances**: #174 (worktree default, flag killed) · #159 (authoring write) · #179 (code write, next batch). **PROMOTE candidate** — DRI-driven all three; the clearest codification signal in the batch.
- **`[actionability-before-trust]`** — the actionable surface must never silently drop, mislabel, or misroute a human action; it earns trust the same way observability does. **3 instances** (#176 label · #177 dropped approve · #178 missing `--compass-dir`, next batch). Candidate; would extend the observability class to actions.
- **`[isolation-per-unit-of-work]`** — each unit of parallel work gets its own checkout (git worktree) — the local equivalent of a fresh CI runner. **1 instance** (#174) but architecturally load-bearing; wait for a 2nd (e.g. per-agent worktrees in the orchestrator).
- **`[telemetry-is-not-an-artifact]`** — run state (jsonl, step logs) lives in `~/.compass` / gitignored; never committed (it dirties the tree + leaks into code PRs). **1 instance** (#175) — wait.

## Drift signals

- **7 workflows still reference deprecated `compass/roles/`** — `status.md`, `retro.md`, `plan.md`, `advance.md`, `dashboard.md`, `setup-product.md`, `build.md`. The grace-period removal is v0.4; these should repoint to `compass/agents/`. **New watch-for** (verified by mechanical sweep this retro; the independent context-free agent dispatched this batch cross-checks the same surface).
- **Shared step-artifact path under concurrency** — `docs/orchestrator-runs/<workflow>/step-NN.md` is keyed by workflow+step, so concurrent same-workflow runs clobber each other's step files (cosmetic — per-run logs + spine are correct). Watch-for: run-scope the step-artifact path.
- **`--reap-stale` is global** — no `--run-id` targeting; an over-aggressive timeout can halt in-flight runs. Watch-for: targeted reap.
- **The dashboard is a long-running process** — JS/code fixes (#176/#177) don't take effect until the cockpit is restarted. A live `/version` or auto-reload-of-self would close the "fix merged but dashboard still old" gap.

## Full-surface audit

Method: **mechanical sweep** (this retro) **+ independent context-free agent** (dispatched against the current repo state; treated as claims-to-verify).

- **Computable drift classes** (`consistency-check.py`): dispatch-graph count, catalog count, version self-claims, host list — **CONSISTENT** (git hook + CI green). Fixed-in-batch / clean.
- **`compass/roles/` references**: 7 live workflow references (listed above) → **new watch-for**, not fixed-in-batch.
- **design.md/copy.md sidecars (#171)**: only legitimate "do NOT create sidecars" instructions remain (pm.md) — no stale "produce a sidecar" directive in agents/templates/workflows. Clean.
- **Counts**: 18 workflows, 14 agents on disk — consistent with self-claims. Clean.
- Independent-agent findings reconciled in the chat summary; any net-new verified drift becomes a watch-for in a future entry (archive immutability).

## Trigger-origin analysis

- **Dogfood/consumer-originated:** #168, #170, #172, #173, #176, #177 (~6/10) — direct from live runs.
- **DRI-direction-originated:** #171 (design/copy as stories), #174 (worktree default / kill the flag).
- **CI/infra-originated:** #169 (bare-env false-red).
- **`[consumer-as-primary-signal]`** is the dominant origin — the strongest single-batch validation since the principle was codified (#83).

## Watch-for list (next 10 improvements)

- Repoint the 7 `compass/roles/`-referencing workflows to `compass/agents/` (or confirm intentional grace-period).
- Run-scope the step-artifact path so concurrent builds stop clobbering `step-*.md`.
- Targeted `--reap-stale --run-id` so cleanup can't catch in-flight runs.
- A cockpit self-version / auto-reload so merged dashboard fixes go live without a manual restart.
- Whether `[capability-by-default-not-flag]` gets formally promoted (it's at 3 instances).
- Whether `[actionability-before-trust]` reaches promotion (3 instances incl. #178).

## Meta-observations

- This batch is the **proof of the dogfood thesis**: running Compass *on* Compass (and on home-app) generated its own improvement backlog in real time. The fix latency was minutes — defect surfaced in a browser run, root-caused from the spine, fixed + tested + PR'd, often within one exchange.
- The **concurrency arc (#172–#175)** is the most important durable capability: parallel, isolated story builds are what makes the control tower credible at enterprise scale. It only became correct by being *run* three-wide — unit tests passed long before the live 3-way run exposed the allow_write/read-only failure mode (next batch, #179).
- A caution: the velocity means several fixes (worktree, telemetry, prune) shipped without a *concurrent* end-to-end test — they're validated by the live runs, not by CI. Watch that the test suite catches up to the concurrency behavior it can't easily simulate.

## Promotion candidates to canon

- **`[capability-by-default-not-flag]`** (3 instances, DRI-driven) — recommend codifying: a workflow's required capability is a default, not a flag; opt-OUT (`--dry-run`/explicit) is the escape hatch.
- **`[actionability-before-trust]`** (3 instances) — recommend codifying as an observability-class sibling: the action surface must not silently drop/mislabel a human action.
- Not auto-promoted — each needs its own improvement entry per the retro contract.
