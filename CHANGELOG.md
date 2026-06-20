# Changelog

All notable changes to Compass itself (the framework, not project artifacts).

Project work-shipping changelog lives at `docs/changelog.md` — that's for user-visible product changes. This file tracks framework evolution.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Tool-loop cap handling — wrap-up instead of abort (#100, v0.4.0-alpha-13).** A thorough write-mode fix (write test + write fix + typecheck/lint/test/build + manifest check) easily exceeds the cap; #97's raise-and-halt was discarding *completed* work. Now: default cap raised 25→50; `--max-tool-iterations N` to tune; and on reaching the cap the agent does a **final tools-disabled turn** to force a summary (work + state captured, workflow advances to review) rather than aborting — a stuck run summarizes "incomplete" and HITL/review catches it. Also improved `_slug` (#99): drops stopwords so branch names are meaningful (`fix/logging-message-welcome-back-…`, not `fix/while-logging-in-i-get`). +tests, 107 total. Origin: the home-app `/fix` run that finished the fix but aborted at the cap.
- **Write-mode work lands on a branch, never main (#99, v0.4.0-alpha-12).** When `--allow-write`, the orchestrator creates/checks out a work branch (`<type>/<id>-<slug>` per config.yaml `branch_pattern`; type by workflow — fix/ops/feat) before any write step, instead of editing `main` directly — enforcing the framework's branch→review→merge discipline. Reuses the current branch if already off main; no-op outside a git repo. +6 tests (107 total). Origin: home-app run editing `main`.
- **DECLARED (not built):** front-door `/triage` ITIL intake router (#98). `/triage` becomes the front door (no separate `/intake`): classify any incoming item → HITL-confirm the ITIL category → route (incident→incident-flow · bug→`/fix` · enhancement/problem→`/create-brief` · change→`/ops` · service-request→`/ops`/close · not-an-issue→close). Two entry points feed PM: reactive (triage routes) + proactive (`/create-brief`). 2nd `[conditional-dispatch]` instance; v1 = cross-workflow hand-off, v2 = auto-chain. Evidence: two live home-app runs where triage classified correctly but had nowhere to route. Spec in `DESIGN-pluggable-executor.md`.

- **Tool-loop hardening + event spine (#97, v0.4.0-alpha-11).** Four fixes surfaced by the first live write-mode `/fix` run on home-app: (1) **structured progress events** — `dispatch_with_tools` emits `tool_use`/`tool_result` events through an `on_event` sink (default = terminal printer) so a tool run is legible, not a frozen prompt; the sink is the **event spine** a dashboard/Slack delivery layer plugs into. (2) **Max-iterations now RAISES** instead of returning a non-answer string that silently advanced the workflow — a maxed/failed loop halts the run (no silent promotion). (3) **`bash` runs with `stdin=DEVNULL`** — a command that reads stdin fails fast instead of hanging to the timeout. (4) **`select_host` checks the SDK is importable, not just the key** — skips a host whose adapter package is missing and falls through (no mid-dispatch ImportError crash). +9 tests (102 total).

- **`/triage` → dispatch graph + conditional dispatch BUILT (#96, v0.4.0-alpha-10).** 9th workflow in dispatch-graph shape, and the **first `[conditional-dispatch]` instance** (#95 declared → built). `graph.py` parses a `**Routes:**` block on a HITL step into `WorkflowStep.routes`; `hitl.py:handle_routing_gate` lets the human pick a branch; `run.py` executes forward-only branches via a skip-set (`_skip_for_route`). `/triage`'s fix-forward decision is now a real routing gate: `resolved` → postmortem (skips the fix branch) · `needs-fix` → engineer.fix-bug → review → postmortem. New `support.write-postmortem` task. v1 is HITL-routing only (agent-classified routing deferred to the LLM-driver). +6 tests (96 total). All incident discipline preserved (human-driven stop-the-bleed, full review under P0, HITL-gated comms + postmortem).
- **DECLARED (not built):** `[conditional-dispatch]` — triage-as-router (#95). Dispatch graphs are linear today (every step runs; only HITL-reject halts); they can't express a step whose outcome *routes* to one of several next steps. Motivating case: triage should decide *whether* a fix is even warranted and route (fix / brief / close / incident), with `/fix` as one branch — not the presumed entry. Declared; natural build point is the `/triage` → dispatch-graph refactor. Forward-linked from `DESIGN-pluggable-executor.md`.
- **`[test-alongside-implementation]` codified (#94, canon v0.3.47).** 8th enforcement-class Compass-original — new orchestrator/script write paths ship tests in the same commit (anti-pattern `tests-later`). Catalog → 22 patterns. ~7 instances (#72–#93). Distinct from `[per-surface-vertical-test]` (consumer tests) — this governs framework engineering.
- **Mechanical consistency check + git hook (#93, v0.4.0-alpha-9).** `compass/scripts/consistency-check.py` computes the drift classes the retro audits kept catching (Retro #017/#018/#019) — dispatch-graph count, catalog pattern count, hardcoded orchestrator version self-claims — and fails on mismatch, no arguments needed. Shipped as a shared git hook (`compass/scripts/githooks/pre-commit`, enable with `git config core.hooksPath compass/scripts/githooks`) + CI (`.github/workflows/consistency-check.yml`). CLAUDE.md rule 9. +5 tests (90 total). Moves the recurring drift from retro-time to commit-time.
- **`[pluggable-graph-executor]` slice 2 — write+verify loop (#92, v0.4.0-alpha-8).** The full read→write→run loop. `hosts/tools.py` gains `write_file` (sandboxed) + `bash` (cwd=project, denylist mechanizing the framework refusal rules — no force-push / `--no-verify` / `reset --hard` / `clean -f` / `branch -D` / `rm -rf` / sudo / …, plus timeout + output cap). **Opt-in only:** new `run.py --allow-write` flag; without it executor_tools stay read-only (slice-1 behavior). Two-layer gating: `schemas_for(names, allow_write)` filters write tools out of what the model can call, and `execute_tool(..., allow_write)` refuses them as a second layer. `engineer.md` v0.3.47 declares the write tools + the apply→verify loop (write failing test → run → fix → re-run → checks). Mechanical floor + HITL-gates-the-merge unchanged. Stayed hand-rolled (not the Agent SDK) — keeps multi-host symmetry. +12 tests (85 total).
- **`[pluggable-graph-executor]` slice 1 — read-only tool-using executor (#91, v0.4.0-alpha-7).** First step from declared → built (#87, VISION roadmap step 1). New `compass/orchestrator/hosts/tools.py` (sandboxed `read_file`/`glob`/`grep`, refusing any path escaping `--project-dir`); `claude.py:dispatch_with_tools()` runs a read-tool loop (iteration-capped) so a tool-capable agent grounds itself in the real repo before answering; `router.py` + `run.py` route to it only when an agent declares `executor_tools:` AND the host is Claude. `engineer.md` (v0.3.46) declares `executor_tools: [read_file, glob, grep]`. Single-shot path unchanged for all other agents. Mechanical floor (gates/HITL/promotion/logging) untouched. +14 tests (73 total). Slice 2 (write + run-tests, the full loop) is next.
- **DECLARED (not built):** `[pluggable-graph-executor]` — LLM-as-orchestrator over a mechanical gate floor (#87). Design sketch at `compass/orchestrator/DESIGN-pluggable-executor.md`; a 3rd executor (Claude driving subagents) alongside `run.py` and Claude Code interactive, valid only if gates/routing/promotion stay mechanical tool calls. Build trigger: orchestrator context-composition friction or v0.4-beta multi-agent scope.
- **`[per-surface-vertical-test]` canon pattern (#88, v0.3.43)** — 7th enforcement-class Compass-original. Every data surface needs ≥1 test traversing the real auth → authorization (RLS) → render vertical end-to-end on a prod-like build; mocked-auth / service-role / dev-build does not satisfy (anti-pattern `mocked-auth-green`). Codified into `automation.md` (`write-e2e-tests`, v0.3.43, primary owner) + `engineer.md` (`implement-story`, v0.3.43, flag the vertical-test need) + `/build` verification + `/scan` BUILD-08. Origin: first end-to-end orchestrator run on a consumer (home-app).
- **`/fix` + `/ops` → dispatch graphs (#90, v0.3.45)** — 7th + 8th workflows in dispatch-graph shape; the reactive flows are now orchestratable. `engineer.fix-bug` rewritten from a v0.3.14 stub to self-sufficient; new `engineer.apply-ops-change` task (execute approved ops plan + test rollback). Methodology moved into agent tasks (no behavior dropped: regression-test-first, mandatory tested rollback, full review / no-hotfix-exception, all-ops-equal). Count: 8 of 17 workflows now dispatch graphs.
- **Test-data cleanup companion rule (#89, v0.3.44)** — `[per-surface-vertical-test]` companion: any E2E that creates/mutates persistent records must clean them up (hard delete, or **soft-delete** when append-only / audit / RLS-restricted), carried as an explicit story AC (anti-pattern `orphaned-test-data`). Into `automation.md` (teardown) + `pm.md` (authors the cleanup AC) + `compass/templates/story.md` + `/build` verification + `/scan` BUILD-09. Origin: user directive rooted in the home-app run (real-vertical E2E now hits a prod-like DB → records need cleanup).

### Changed

-

### Fixed

## [0.4.0-alpha-6] — 2026-06-12

> **The #70 data-layer slice lands — requirement gates + artifact promotion + manual approval bridge. Counter #84.**

### Added

- **Requirement gates** (`requires_approved:` workflow frontmatter, parsed by `graph.py:load_workflow_meta()`): before dispatch, each declared artifact path must be approved — via an approved hitl.jsonl record (latest decision wins) OR `status: approved` frontmatter (v0.3.x dual acceptance, the orchestrator/manual bridge). Unmet → halt exit 3 with the producing workflow named; `--dry-run` reports without halting; `<bet-id>` placeholder resolved from `--bet`. Declared on create-brief, create-bet-architecture, build.
- **Artifact promotion on HITL approval** (`**Artifact target:**` line in HITL gate steps, parsed into `WorkflowStep.artifact_target`): approval is now the write trigger per #70 — the gated draft (preceding step output, `## Output summary` tail stripped) is pushed to its canonical path with `status: approved` + `source_run:` frontmatter. Declared on setup-product (product.md), create-brief (brief.md), create-bet-architecture (architecture.md); build's merge gate promotes nothing by design.
- **`compass/orchestrator/connector.py`** (new): push interface per `[declare-not-implement]` — filesystem backend only; a configured-but-unimplemented connector (e.g. `connectors.docs: confluence`) falls back to filesystem with an honest label recorded in hitl.jsonl. Plus `extract_artifact_body()` / `set_frontmatter_status()` / `read_frontmatter_status()` helpers.
- **`--approve PATH` / `--reject PATH [--feedback TEXT]`** CLI modes: the manual approval bridge — one command flips the artifact's frontmatter AND appends the hitl.jsonl record, satisfying both gate mechanisms from interactive sessions.
- **hitl.jsonl schema**: `canonical_path` field added; `connector` field now populated on promotion.
- **22 new tests** (`tests/test_gates.py`) — meta parsing, target parsing, dual-acceptance checks, promotion helpers, manual-bridge round-trips. Suite: 54.

### Changed

- `enterprise-architect.md` + `tech-writer.md` → v0.3.40: gates accept dual acceptance (hitl.jsonl record OR `status: approved` frontmatter). SETUP.md documents both approval paths as equivalent.

## [0.4.0-alpha-5] — 2026-06-09

> **Consumer-ready orchestrator — live-validated against crypto-app CB-4. Counter #63 — fires Retro #013 (9th consecutive on-time).**

### Added

- `--compass-dir PATH` flag: decouple framework location from consumer project. Framework lives in its own repo; consumer project only needs `docs/` + `PROJECT.md`. `compass_dir` still defaults to `project_dir/compass` when flag is omitted.
- `--bet ID` flag: auto-loads `docs/bets/<ID>/brief.md` + `architecture.md` + story summaries + `PROJECT.md` as `## Bet context — <ID>` block for Step 1. Live-validated: Architect received CB-4 brief automatically, ran gate correctly (`architecture_required: false` → DRI Decision, no spurious architecture.md drafted).
- `compass/orchestrator/logger.py` (new): parses every agent step output for structured sections; appends record to `docs/orchestrator-runs/runs.jsonl`. Fields: `run_id`, `ts`, `workflow`, `bet_id`, `step`, `agent`, `task`, `host`, `model`, `gate_result`, `tldr`, `dri_decisions`, `files_created`, `files_modified`, `next_command`, `risks`, `output_chars`, `artifact_path`.
- `--log` flag: tabular summary of all logged steps from runs.jsonl.
- `--dri` flag: all DRI decisions extracted across all runs.

## [0.4.0-alpha-4] — 2026-06-09

> **Pipeline mode: cross-workflow chaining.** Orchestrator can now walk PM → Architect → Reviewer → Support in a single command. **Counter #62 (4 of 5 before Retro #013).**

### Added

- `--pipeline W1,W2,…` flag to `compass/orchestrator/run.py` — runs multiple workflows in sequence with automated context passing between them. Full PM → Architect → Build chain:
  ```bash
  python3 -m compass.orchestrator.run \
    --pipeline create-brief,create-bet-architecture,build \
    --context "Crypto portfolio tracker."
  ```
- `_run_workflow()` internal function extracted from `main()` — single-workflow execution returns `(prior_outputs, artifact_paths)` so callers can chain runs.
- `_cross_workflow_context()` — compact handoff summary (artifact paths + last step output preview, ≤800 chars) injected as first-step context of the next workflow.
- Cross-workflow step tagging — `prior_outputs` carry `workflow` key so context headers label as `[create-brief — Step 2: pm.draft-brief]`.
- Pipeline dry-run — `--pipeline W1,W2 --dry-run` prints the full dispatch graph for each workflow in sequence without executing.
- HITL gates still fire per-workflow; pipeline halts at any rejection and prints `--from-step` command for that specific workflow.

## [0.4.0-alpha-3] — 2026-06-09

### Added

- Orchestrator HITL context passing (`compass/orchestrator/hitl.py` + `run.py`):
  - HITL gate now shows reviewing artifact path + 600-char output preview so reviewer doesn't have to scroll
  - Rejection feedback captured interactively and written to `docs/orchestrator-runs/<workflow>/step-N-hitl-rejected.md`
  - `--from-step N` flag: resume from step N, loading steps 1..N-1 from prior artifact files on disk; enables rerun after HITL rejection without re-dispatching earlier steps
  - Rejection note includes exact `--from-step` command to rerun

## [0.3.36] — 2026-06-09

### Added

- `[cross-artifact-sweep-on-contract-shift]` canon entry — 18th Compass-original, 5th enforcement-class member. When any contract changes, sweep all referencing artifacts before PR opens; log DRI Decision. 5 instances across CB-2.2/2.5/3.1/3.2/3.3. Applied at implement-story step 7. AGENTS.md: enforcement (4) → (5); catalog 17 → 18 patterns.

## [0.3.35] — 2026-06-09

### Added

- `[cross-artifact-sweep-on-contract-shift]` promoted to `engineer.md` core principles + new pre-PR sweep step (implement-story step 7) + postcondition. 5+ consumer instances (CB-2.2/2.5/3.1/3.2/3.3 ×2). When any contract changes, sweep all referencing artifacts before PR opens and log DRI Decision.
- `[empty-numeric-input-zero-trap]` added to `engineer.md` — numeric inputs must treat empty vs zero as explicitly distinct states; `<input type="number">` delivers `0` when empty.
- `/build` workflow-level verification checklist: 3 new pre-merge items — `[rsc-prop-serialization]` + `[server-action-file-export-purity]` + `[cross-artifact-sweep-on-contract-shift]`, each "confirmed or DRI Risk logged."

## [0.3.34] — 2026-06-09

### Added

- `[discipline-as-muscle-memory]` canon entry — 17th Compass-original, 3rd scope-discipline class member. When a discipline commitment fires on-time for 5+ consecutive instances, the enforcement scaffolding from `[hard-line-declaration]` can be reduced; habit is structural. Complementary pair with `[hard-line-declaration]` (v0.3.10): establish → prove → reduce overhead. One instance at codification: 7 consecutive on-time retros (#005–#011). Two anti-patterns named: `premature-scaffold-removal` (reducing before 5 consecutive) + `scaffold-that-never-retires` (keeping full apparatus after habit proven). AGENTS.md catalog updated: 7 shapes / 17 patterns; scope-discipline grows from 2 → 3 members.

## [0.3.33] — 2026-06-09

> **Automation agent created (new — no legacy role) — completes Build pack per mvp.md.** Owns E2E tests + CI/CD + deploy + release; split from Reviewer (Reviewer → PR code review only). **Counter #56 (1 of 5 before Retro #012).**

### Added

- **`compass/agents/automation.md`** (NEW, v0.3.33, 6473 chars): `preferred_hosts: [claude, codex, gemini]`. 3 tasks: `write-e2e-tests` (AC-mapped E2E + failure-path tests, prod-equivalent runtime required, 6-category Standard Experience coverage) · `configure-ci` (pipeline lint → typecheck → tests → build → E2E → deploy preview → prod; mechanical output verification) · `release` (staging → HITL → prod tag → error rate monitor). Key principles inlined: `[failure-mode-first]` · framework runtime contracts in E2E (tests must run against prod-equivalent, not localhost) · `[mechanical-output-verification]` on pipeline outputs.
- **`AGENTS.md`** — Automation added to table (✅ v0.3.33, new); agent count 13 → 14; Reviewer description updated to "PR code review" (E2E moves to Automation).

## [0.3.32] — 2026-06-09

> **Scanner agent migrated** — `compass/roles/scanner.md` → `compass/agents/scanner.md`. Auto-invoked by `/build`; needed for full MVP workflow coverage. **Counter #55 — fires Retro #011.**

### Added

- **`compass/agents/scanner.md`** (NEW, v0.3.32, 5423 chars): `preferred_hosts: [claude, codex, gemini]`. 2 tasks: `scan-bet` (full quality scan: phase detection → check catalog → findings with confidence → suppression preservation → scan-report.md + DRI Issues) · `scan-phase` (single-phase aggregate scan). 5 refusal rules. Key principles: findings-not-failures · suppressions-not-overrides · never-self-assess · preserve-suppressions-across-runs.

### Changed

- **`AGENTS.md`** — Scanner: legacy → ✅ v0.3.32.

## [0.3.31] — 2026-06-09

> **Support agent migrated** — `compass/roles/support.md` → `compass/agents/support.md`. 3 tasks: `triage-bug` · `triage-incident` · `supply-user-pain`. Needed for `/fix` + `/triage` MVP workflows. **Counter #54 (4 of 5 before Retro #011).**

### Added

- **`compass/agents/support.md`** (NEW, v0.3.31, 5881 chars): `preferred_hosts: [chatgpt, claude, codex, gemini]`. 3 tasks with full gate/work/postcondition: `triage-bug` (reproduce → classify P0-P3 → L1/escalate → triage note), `triage-incident` (acknowledge → blast radius → HITL stop-the-bleed → HITL comms → postmortem), `supply-user-pain` (user pain signal for brief creation with citations). 6 refusal rules. Key principles: severity by impact not frustration · stop-the-bleed is human-driven · comms require HITL approval.

### Changed

- **`AGENTS.md`** — Support: legacy → ✅ v0.3.31.

## [0.3.30] — 2026-06-09

> **Principle #17: Minimize friction — consumer-project evidence promoted to AGENTS.md cross-cutting principle.** Friction is now a first-class failure mode with a named anti-pattern (`ceremony-without-constraint`) and a measurable definition. **Counter #53 (3 of 5 before Retro #011).**

### Changed

- **`AGENTS.md`** — Cross-cutting principle #17 added: "Minimize friction." Every agent interaction and workflow step must not increase user decisions/prompts/actions beyond what the task genuinely demands. Measurable definition: human decisions per workflow run from clone to first artifact. Anti-pattern: `ceremony-without-constraint`. Origin cited: consumer project evidence 2026-06-09 (crypto app run, friction caused abandonment).

## [0.3.29] — 2026-06-09

> **Engineer agent prod-parity discipline — improvement #52.** Three new principles + two named Next.js anti-patterns + postcondition hardening. Direct response to two prod-only failures on CB-3.3 (RSC prop serialization + "use server" export purity) invisible to 541 tests.

### Changed

- **`compass/agents/engineer.md`** (v0.3.14 → v0.3.29, 13108 → 15336 chars):
  - **New core principle `[failure-mode-first]`** — every external call has an explicit error path before done; silent swallows are defects.
  - **New core principle: framework runtime contracts** — names the class of bugs invisible to local tooling. Two confirmed Next.js/Vercel instances: `[rsc-prop-serialization]` (Server→Client props must be JSON or Server Actions) + `[server-action-file-export-purity]` ("use server" files export async functions only). Engineer must verify or flag as DRI Risk before shipping.
  - **Two new postconditions** — all external calls have explicit error handlers; framework runtime contracts verified (or DRI Risk logged).
  - **Three new anti-patterns** — `[rsc-prop-serialization]` · `[server-action-file-export-purity]` · silent error swallow.
  - **New DRI logging trigger** — framework runtime contract hits logged with instance counter; at 3 instances propose canon anti-pattern.

## [0.4.0-alpha-2] — 2026-06-08

> **Orchestrator multi-host dispatch — P0 drift from Retro #009 closed.** Reviewer steps (`preferred_hosts: [codex, gemini]`) now route to OpenAI API (codex) or Gemini API — NOT Claude. Engineer → Claude, Reviewer → Codex: cross-model independence restored structurally. **Counter #48 (4 of 5 before Retro #010 — 2 more before retro fires).**

### Added

- **`compass/orchestrator/hosts/router.py`** — host selection + dispatch routing. `select_host(preferred_hosts)` returns first host with credentials available. `dispatch_to_host(host, ...)` routes to the correct adapter. Credential checks: `claude` → `ANTHROPIC_API_KEY`; `codex`/`chatgpt`/`openai` → `OPENAI_API_KEY`; `gemini` → `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
- **`compass/orchestrator/hosts/openai.py`** — OpenAI API adapter. Used for agents with `codex`/`chatgpt`/`openai` in `preferred_hosts:`. Loads agent `.md` as system prompt. Default model: `gpt-4o`. Raises `ImportError` with install hint if `openai` package missing.
- **`compass/orchestrator/hosts/gemini_api.py`** — Google Gemini API adapter. Used for agents with `gemini` in `preferred_hosts:`. Loads agent `.md` as `system_instruction`. Default model: `gemini-2.0-flash`. Raises `ImportError` with install hint if `google-generativeai` package missing.

### Changed

- **`compass/orchestrator/run.py`** alpha-1 → alpha-2:
  - `_read_preferred_hosts(agent_file)` — parses `preferred_hosts:` from agent file YAML frontmatter.
  - Each agent step: reads preferred_hosts → calls `select_host()` → if None, prints warning + skips step (no crash).
  - Dispatch via `dispatch_to_host(host, ...)` — not hardcoded Claude.
  - Dry-run now shows `→ <selected host> (preferred: [...])` or `→ NO HOST AVAILABLE`.
  - `prior_outputs` accumulation now includes `host` field (which host produced the output).
  - `--model` now applies to whichever host is selected (was Claude-only).
- **`compass/orchestrator/README.md`** — updated to v0.4-alpha-2; host routing example table; multi-host setup instructions.

## [0.3.28] — 2026-06-08

> **Designer + UX Writer agents migrated — 8th + 9th migrated agents; completes the Product pack** (`compass/roles/` → `compass/agents/`). Both under 4500 chars with real task definitions, refusal rules, and host-capability degradation. **Counter #47 (2 of 5 before Retro #010).**

### Added

- **`compass/agents/designer.md`** (NEW, v0.3.28, 4474 chars): `preferred_hosts: [chatgpt, claude, codex, gemini]`. Task `draft-design-spec`: Gate (story ready + approved brief + design system) → Work (flows · states · interactions · a11y · copy-need flagging · Figma link · DRI seed) → Postcondition (all states per screen · copy needs flagged · a11y documented · not self-approved). 5 refusal rules. Standard Experience Checklist bridge principle inlined.
- **`compass/agents/ux-writer.md`** (NEW, v0.3.28, 4498 chars): `preferred_hosts: [chatgpt, claude, codex, gemini]`. Task `write-copy`: Gate (design spec present · voice guidelines loaded) → Work (placeholder inventory · copy fill · error type discrimination · empty state next-action · char limit coordination · DRI seed) → Postcondition (all placeholders filled · error copy type-discriminated · terminology consistent · not self-approved). 5 refusal rules. Verbatim discipline principle inlined.

### Changed

- **`AGENTS.md`** — Designer + UX Writer: legacy → ✅ v0.3.28. Agent count updated: v0.3.28 adds designer + ux-writer.

## [0.3.27] — 2026-06-08

> **`/create-brief` refactored to dispatch-graph shape — 4th workflow migrated** (joining `/setup-product` v0.3.14 + `/build` v0.3.23 + `/create-bet-architecture` v0.3.26). Embedded 83-line methodology → thin 4-step dispatch contract (researcher.cite-evidence-6-category-9-moat · pm.draft-brief · HITL · delivery-manager.update-status). **Counter #46 (1 of 5 before Retro #010).**

### Changed

- **`compass/workflows/create-brief.md`** refactored to dispatch-graph shape (v0.3.27). Standard frontmatter (name, status, owner, version: 0.3.27). Framework grounding (working-backwards · lean-mvp · jtbd · shape-up + 5 Compass-originals). Two modes declared: fresh (URL/text) + promote-stub (portfolio stub). 3 workflow-level preconditions (foundation approved · source present · brief not already drafted). Dispatch graph: Step 1 `researcher.cite-evidence-6-category-9-moat` → Step 2 `pm.draft-brief` → Step 3 HITL → Step 4 `delivery-manager.update-status`. 9-item verification checklist. Output summary contract. Notes: promote-stub mode semantics + 4 named anti-patterns.
- **`AGENTS.md`** — workflow-migration count updated: 3 → 4 dispatch-graph workflows; `/create-brief` (v0.3.27, 4th) added.

## [0.3.26] — 2026-06-08

> **`/create-bet-architecture` refactored to dispatch-graph shape — 3rd workflow migrated** (joining `/setup-product` v0.3.14 + `/build` v0.3.23). Embedded 11-step methodology prose → thin 3-step dispatch contract (architect.draft-bet-architecture · HITL · delivery-manager.update-status). Orchestrator can now walk the Product → Architecture chain end-to-end. **Counter #44 (4 of 5 before Retro #009).**

### Changed

- **`compass/workflows/create-bet-architecture.md`** refactored 61 → ~120 lines (embedded methodology → dispatch graph). Standard frontmatter (name, status, owner, version: 0.3.26). Framework grounding (well-architected · evolutionary-architecture · 4 Compass-originals). Architectural shape declaration (thin dispatch graph per `[workflow-as-dispatch-graph]`). Preconditions (3 workflow-level gates: brief approved · foundation docs present · not already approved). Dispatch graph: Step 1 `architect.draft-bet-architecture` → Step 2 HITL → Step 3 `delivery-manager.update-status`. Workflow-level verification checklist (9 items). Output summary contract. Notes: ADR-not-gate · Enterprise Architect handling in dispatch-graph shape · 3 named anti-patterns (silent-stack-introduction · exploration-shaped-architecture · strawman-alternatives).
- **`AGENTS.md`** — workflow-migration count updated: 2 → 3 dispatch-graph workflows; `/create-bet-architecture` (v0.3.26, 3rd) added.

### Notes

- **Enterprise Architect** is explicitly named in the legacy workflow as "always engages." In the dispatch-graph shape, cross-system implications live in architecture.md section 7 (Architect task owns it). Enterprise Architect agent migration is deferred (non-MVP per `compass/framework/mvp.md`); for now, the HITL reviewer performs the cross-system check or a separate `/ops` task handles it.
- **`[explicit-dispatch-surfaces-latent-participation]` did NOT fire this migration** — no new agent participation surfaced. Delivery Manager was already explicit in `/setup-product`'s shape; Enterprise Architect is captured via a workflow Note (not a new dispatch step). Pattern remains at 1 instance.
- Dry-run verified: `python3 -m compass.orchestrator.run create-bet-architecture --dry-run` produces 3 steps correctly (architect.draft-bet-architecture · HITL · delivery-manager.update-status).

## [0.3.25] — 2026-06-08

> **Architect agent migrated** from `compass/roles/architect.md` → `compass/agents/architect.md`. 6th migrated agent (joins pm, researcher, engineer, reviewer, delivery-manager). Unlocks `/create-bet-architecture` for dispatch-graph refactor (Task 2). Two tasks defined: `draft-bet-architecture` (full 6-step process with foundational-stack deviation gate) + `assess-pr-compliance` (PR compliance vs approved bet architecture). **Counter #43 (3 of 5 before Retro #009).**

### Added

- **`compass/agents/architect.md`** (v0.3.25, 7779 chars, 221 headroom under 8000 cap) — standard agent frontmatter (`preferred_hosts: [claude, codex, gemini]`; CLI-class requiring filesystem read access; chatgpt excluded); Identity; 5 Core principles inlined (refuse-escalate · cite-or-mark-na · soft-spec-hardening · ADR-not-gate · status-starts-proposed); 2 task definitions; Refusal rules (6); Output summary contract; Logging patterns mid-task; Anti-patterns; Host capability degradation.
  - **`draft-bet-architecture` task** — 6-step Work: state check (architecture_required: false → exit with DRI); load context; foundational-stack deviation gate (STOP + escalate to `/setup-foundation-architecture` amend if YES); draft 12-section architecture.md; set status proposed; HITL halt. Postcondition: all 12 sections populated · foundational-stack assertion explicit · ≥1 real alternative · Consequences has positive+negative+reversibility · deviation gate cleared or escalated · HITL halt announced.
  - **`assess-pr-compliance` task** — reads approved architecture.md + PR diff; flags foundational-stack violations, data model deviations, API contract breaks; returns COMPLIANT / DEVIATION-REQUIRES-AMEND with file+line references.

### Changed

- **`AGENTS.md`** — Architect migration status `legacy` → `✅ v0.3.25`; agent count prose updated (3 → 4 migrated at v0.3.14; 6 total now including v0.3.25).

## [0.4.0-alpha-1] — 2026-06-08

> **Orchestrator v0.4-alpha-1 — artifact write + state passing.** Step outputs now write to `docs/orchestrator-runs/<workflow>/step-<N>-<agent>-<task>.md`. Each subsequent step receives prior step outputs as context — full multi-step runs produce coherent output chains. **Counter #45 — Retro #009 NOW DUE** (5th consecutive on-time retro; fires immediately after this commit).

### Changed

- **`compass/orchestrator/run.py`** upgraded alpha-0 → alpha-1:
  - `_write_artifact()` — writes step output to `docs/orchestrator-runs/<workflow>/step-<N>-<agent>-<task>.md` with frontmatter (workflow, step, agent, task, generated timestamp). Creates parent dirs. Controlled by `--no-write` flag.
  - `_build_user_message()` — prepends prior step outputs as "## Prior step outputs (workflow context)" block before the task instruction. Truncates each prior output to 3000 chars to stay within context window. State accumulates across all steps in a run.
  - `prior_outputs` list accumulates throughout the run; each completed agent step appends `{step, agent, task, output}`.
  - Added `--no-write` CLI flag (stdout-only mode).
  - Updated version string alpha-0 → alpha-1 in docstring.
- **`compass/orchestrator/README.md`** — updated usage examples (full workflow run + `--no-write`); scope section updated to reflect artifact write + state passing shipped.

### Notes

- Artifact path is `docs/orchestrator-runs/` (not `docs/foundation/` or `docs/bets/`) to avoid polluting canonical artifact locations with orchestrator draft output. User copies/moves the generated content to the canonical path after review. Git commit automation (auto-move + commit) ships in v0.4-beta.
- State passing truncates prior outputs at 3000 chars each — sufficient for typical PM/Researcher outputs; very long outputs (full architecture docs) may need the context budget raised in v0.4-beta once we measure real usage.

## [0.4.0-alpha-0] — 2026-06-08

> **Orchestrator v0.4-alpha-0 — MVP unlock: Compass workflows are now executable.** First working end-to-end dispatch: CLI walks a dispatch-graph workflow, loads agent files as system prompts, dispatches to Claude API. Dry-run validates both migrated dispatch graphs (`/setup-product` + `/build`) correctly — 4 steps + 8 steps respectively, agents + HITL gates all parsed. API dispatch path wired and tested (requires `ANTHROPIC_API_KEY`). **Task 3 of today's 3-task arc.** Counter ticks to #42.

### Added

- **`compass/orchestrator/`** (new Python package — `compass/orchestrator/__init__.py`)
- **`compass/orchestrator/graph.py`** — dispatch graph parser. Reads `compass/workflows/<workflow>.md`, scopes to the `## Dispatch graph` section, extracts `### Step N.` headers. Classifies steps as: agent dispatch (`<agent>.<task>` from backtick pair in title), HITL gate (`**Dispatches:** HUMAN`), or workflow-level (mechanical steps without agent dispatch). Returns `WorkflowStep` dataclass list.
- **`compass/orchestrator/hosts/claude.py`** — Claude API adapter. Loads agent `.md` file as `system` prompt, sends task name + user context as `user` message, calls `anthropic.Anthropic.messages.create()`, returns response text. Configurable model (default: `claude-opus-4-8`). Raises `RuntimeError` on missing `ANTHROPIC_API_KEY`; raises `ImportError` with install hint on missing `anthropic` SDK.
- **`compass/orchestrator/hitl.py`** — HITL gate handler. Prints gate banner (step number + title), prompts `y/n`, returns bool. Handles `EOF`/`KeyboardInterrupt` gracefully (returns False = halt).
- **`compass/orchestrator/run.py`** — CLI entry point (`python -m compass.orchestrator.run`). Flags: `--dry-run` (print graph, no API), `--step N` (single-step execution), `--context TEXT` (inline input for first agent step, skips interactive prompt), `--model ID`, `--project-dir PATH`. Fail-fast API key check before prompting. Handles workflow-level steps gracefully (print "handle manually" + skip). Agent file resolution: tries `compass/agents/` first, falls back to `compass/roles/`.
- **`compass/orchestrator/README.md`** — setup, usage examples, options table, architecture, v0.4-alpha-0 known gaps, v0.4-beta roadmap.

### Verified

- `--dry-run` for `/setup-product`: 4 steps (pm.setup-product-foundation · researcher.cite-evidence-6-category-9-moat · HITL · delivery-manager.update-status) — correct.
- `--dry-run` for `/build`: 8 steps (engineer.implement-story · reviewer.write-e2e-tests · reviewer.review-pr · engineer.respond-to-review · pm.arbitrate-dispute · HITL · workflow:Mechanical merge constraints · workflow:Post-merge tech-writer) — correct.
- Fail-fast API key check works (exits immediately with clear message if `ANTHROPIC_API_KEY` not set).
- Agent file resolution works for all 5 migrated agents (pm, researcher, engineer, reviewer, delivery-manager).

### Notes

- **v0.4-alpha-0 scope:** single-host (all → Claude API); stdout-only output (no artifact write); no structured state passing between steps; interactive input only (except `--context` for Step 1); no resume on error.
- **v0.4-beta** adds: multi-host dispatch per `preferred_hosts:` (Codex CLI for Reviewer, Gemini fallback); artifact write automation (step output → `docs/` commit); structured state passing; `pip install compass` entry point; `compass/config.yaml` hitl_level integration.
- The `[workflow-as-dispatch-graph]` codification (v0.3.24) is directly load-bearing for this release: the orchestrator's graph parser depends on workflows being in dispatch-graph shape. The 2 migrated workflows become the first 2 automatable paths; each future workflow migration adds another.

## [0.3.24] — 2026-06-08

> **`[workflow-as-dispatch-graph]` codified as 16th Compass-original — 3rd architecture-discipline class member.** Executes Retro #008's explicit PROMOTE TO CANON recommendation (2 instances: `/setup-product` v0.3.14 + `/build` v0.3.23). Architecture-discipline class grows to 3 members (joining `[agent-as-surface-independent-unit]` v0.3.14 + `[fractal-retro]` v0.3.17); now tied with observability as largest non-enforcement class. **Core insight:** agents own methodology (gate/work/postcondition per task); workflows own sequence (dispatch graph). Together they form the composition model that the v0.4 orchestrator requires — a dispatch graph is directly machine-walkable; embedded-methodology workflows cannot be executed by machine. **Also ships `compass/framework/mvp.md`** — MVP scope locked: orchestrator-first + vertical slice through Product/Build/GTM/Support agent pack + "start sending" checklist. **Counter ticks to #41 (1 of 5 before Retro #009).**

### Added

- **`compass/framework/mvp.md`** (new foundation doc) — MVP scope for "start sending" by end of June 2026. Orchestrator v0.4-alpha scope (single-host; all → Claude API; CLI entry `compass run <workflow>`; HITL gate handler; git automation). Full agent pack status table (Product/Build/GTM/Support with migration status). Connecting workflows priority. Vertical slice build order (Slice 1: Product vertical → Slice 2: Build vertical → Slice 3: GTM+Support). "Start sending" checklist (4 conditions that make MVP shippable). Open questions resolved: Automation splits from Reviewer; GTM = Launch Engineer composite; Security Reviewer + Delivery Manager deferred to v0.4-beta; Tech Writer out; multi-host deferred to beta.
- **`compass/framework/canon.md`** — `### workflow-as-dispatch-graph` added as 16th Compass-original. Covers: thin dispatch contract definition; workflow-level vs task-level content split (the mental test); `embedded-methodology` anti-pattern (2 sources of truth per task, machine execution blocked); orchestrator-prerequisite argument; distinction from `[agent-as-surface-independent-unit]` (complementary constraints); `[explicit-dispatch-surfaces-latent-participation]` watch-for candidate (1 instance); migration path for 12 remaining embedded-methodology workflows.

### Changed

- **`AGENTS.md`** — catalog totals updated 7 shapes / 15 → 16 patterns; architecture-discipline class 2 → 3 members. Added `[workflow-as-dispatch-graph]` pattern entry with full dispatch-graph shape, anti-pattern, orchestrator implications, and migration path.

### Notes

- Retro #008 PROMOTE recommendation executed within 24 hours of the retro firing — closes the watch-for latency drift signal Retro #007 named (3-release lag on `[agent-file-compression]` before v0.3.22). Pattern: codify Retro PROMOTE recommendations in the NEXT immediate release after the retro fires.
- `compass/framework/mvp.md` carries no version bump because it's a strategic artifact (foundation doc), not a framework improvement. It informs build order but doesn't change framework behavior.

## [0.3.23] — 2026-06-08

> **`/build` refactored to thin dispatch-graph shape — 2nd workflow migrated** (joining `/setup-product` v0.3.14). 7 phases / 164 lines of embedded methodology → thin dispatch graph naming `<agent>.<task>` references per `[agent-as-surface-independent-unit]` (canon v0.3.14). **No behavior change** — every gate, postcondition, refusal case, HITL gate, mechanical merge constraint preserved (now living in agent task definitions). **NEW task `engineer.respond-to-review`** added so the Phase 5 review-response loop has explicit dispatch surface. **PM agent now participates in `/build`** (explicit `arbitrate-dispute` dispatch on disputes). **Two codification candidates unlocked at 2 instances each:** `[workflow-as-dispatch-graph]` + `[task-ownership-locality]` — both join the active candidate queue; codification decision deferred to Retro #008 evidence weighing. **Task 3 of today's 3-task arc** (Task 1 = v0.3.21 trim; Task 2 = v0.3.22 codification + check script). **Counter ticks to #40 — Retro #008 auto-fires** for the v0.3.19 → v0.3.23 cycle (5 improvements).

### Changed

- **`compass/workflows/build.md` refactored 164 → 256 lines, methodology embedded → dispatch graph.** Same structure as `/setup-product`: frontmatter (name, status, owner, version) · Framework grounding (one-line pattern refs) · Purpose · Architectural shape · Trigger · Preconditions (workflow-level GATE) · Roles invoked (agents dispatched) · Dispatch graph (Step 1 → Step 8 naming `<agent>.<task>` references) · Workflow-level patterns (Story → multiple PRs, Post-merge bugs, Scanner at phase boundaries) · Workflow-level verification (final GATE) · Output summary contract · DRI logging · Discipline always · Notes (what changed, anti-patterns, edge cases, migration). COMPASS_ROLE_BOUNDARY markers retained (per-dispatch-step instead of per-phase; same token-attribution semantics for `compass/scripts/token-usage.py`).
- **`compass/agents/engineer.md` v0.3.14 → unchanged frontmatter version** (mid-cycle edit during v0.3.23 refactor, not a full agent re-cut). Added new task `respond-to-review` (Gate + Work + Postcondition format covering Phase 5 review-response loop). Removed redundant "Addressing reviewer findings" inline section (content now lives in the proper task). Size: 11,436 → 13,108 chars (WARN, not FAIL — `preferred_hosts: [claude, codex, gemini]` excludes chatgpt so cap doesn't strictly apply; flagged for trim if a future migration adds chatgpt).
- **`compass/agents/pm.md` frontmatter** — added `build` to `participates_in_workflows: [setup-product, create-bet-portfolio, create-brief, create-story, build]` reflecting the existing `arbitrate-dispute` task that fires in `/build` disputes (previously implicit; now explicit per the dispatch-graph refactor). Version bumped 0.3.21 → 0.3.23. Size: 7,983 → 7,990 chars (still under cap with 10 chars headroom).
- **`AGENTS.md`** — workflow-migration prose updated: "2 of 14 workflows now in dispatch-graph shape: `/setup-product` (v0.3.14, 1st) + `/build` (v0.3.23, 2nd); 12 remaining migrate as the agents they dispatch finish migration."

### Notes

- **No behavior change verified by content sanity:** same workflow trigger (`/build <story-id>`) · same readiness check (story `ready` + brief `approved` + bet architecture `approved` if required) · same review loop (Engineer ↔ Reviewer until no blockers / no disputes) · same dispute branch (PM arbitrates) · same HITL gate at merge · same mechanical merge constraints (CI green · zero BLOCKERs · zero CRITICALs · zero disputes · human approval) · same post-merge tech-writer engagement · same Scanner at phase boundaries · same Story → multiple PRs · same Post-merge bug handling. The refactor is pure structural redistribution; the workflow's contract with users is unchanged.
- **Two codification candidates unlocked at 2 instances each.** Per Compass 3-instance rule, codification waits for 3rd instance:
  - **`[workflow-as-dispatch-graph]`** — workflows become thin dispatch graphs naming `<agent>.<task>` references; methodology lives in agents. 1st instance: `/setup-product` v0.3.14. 2nd instance: `/build` v0.3.23 (this release). 3rd-instance candidate: `/fix` (next-natural refactor; Engineer agent migrated; `engineer.fix-bug` task already declared).
  - **`[task-ownership-locality]`** — tasks belong to agents (not workflows). 1st instance: `/setup-product` (4 tasks across pm + researcher + delivery-manager agents). 2nd instance: `/build` (5 tasks across engineer + reviewer + pm agents — including the new `engineer.respond-to-review`). 3rd-instance candidate: any subsequent workflow refactor.
  - Both candidates surface in Retro #008 evidence weighing. Codification at Retro #008 is OPTIONAL (per `[declare-not-implement]` we wait for 3rd instance); Retro #008 may PROMOTE either to canon if it judges 2 instances + clean structural shape sufficient.
- **`engineer.md` cap status** — now 13,108 chars (WARN). The `respond-to-review` task is real work that belongs inlined (per `[agent-as-surface-independent-unit]` hybrid-inlining principle — task gates + work + postconditions cannot be deferred to external fetch). engineer.md exceeds cap but doesn't target chatgpt (`preferred_hosts: [claude, codex, gemini]`) so `check-agent-cap.py` correctly reports WARN not FAIL. If a future migration adds chatgpt support to Engineer (would require Engineer-on-ChatGPT-Custom-GPT — degraded surface for code work), trim engineer.md per `[agent-file-compression]` (canon v0.3.22) before flipping `preferred_hosts:`.
- **PM agent's `participates_in_workflows:` correction.** PM's `arbitrate-dispute` task has fired in `/build` disputes since the workflow's inception; pre-v0.3.23 the frontmatter omitted `build` because the dispatch graph was implicit (inline workflow guidance, not a typed dispatch reference). The refactor makes the dispatch explicit, so PM's frontmatter follows. This is an instance of the dispatch-graph shape SURFACING latent dependencies that the embedded-methodology shape kept hidden.
- **Cadence:** v0.3.23 = ~60-min single-session workflow refactor. Same release class as v0.3.14 (`/setup-product` refactor) but smaller (Engineer + Reviewer + PM already migrated; new task addition was the only agent-file structural change). v0.3.14 had to migrate PM + Researcher + Engineer simultaneously alongside the workflow refactor; v0.3.23 only added one new task to one already-migrated agent.
- **Counter ticks to #40 → Retro #008 AUTO-FIRES** for the v0.3.19 → v0.3.23 cycle. **5 improvements in 1 day (2026-06-08):**
  - **#36** — v0.3.19: `[user-as-load-bearing-oversight]` codified (14th Compass-original; 2nd observability-class member)
  - **#37** — v0.3.20: aspirational refinement (orchestrator catches mechanizable cases; user oversight shrinks to architectural-only residual)
  - **#38** — v0.3.21: pm.md + researcher.md trimmed to fit cap
  - **#39** — v0.3.22: `[agent-file-compression]` codified (15th Compass-original; 3rd observability-class) + `check-agent-cap.py` shipped
  - **#40** — v0.3.23: `/build` refactored to dispatch-graph shape (2nd dispatch-graph workflow)

  Retro #008 evaluates: codification candidates `[workflow-as-dispatch-graph]` + `[task-ownership-locality]` (both 2-instance now); whether the same-release codification-plus-mechanism pattern (v0.3.22) is itself codification-class; cadence pattern (5 improvements in 1 day vs. the more typical 1-2 per cycle); whether `[external-primary-with-cached-pointer]` + `[host-preference-validation]` deserve in-cycle PROMOTE (each at 1 instance from consumer-project work).

- **Files (6):** `compass/workflows/build.md` (164 → 256 lines, refactor); `compass/agents/engineer.md` (NEW task `respond-to-review` + removed redundant inline section); `compass/agents/pm.md` (frontmatter `participates_in_workflows:` + version bump 0.3.21 → 0.3.23); `AGENTS.md` (workflow-migration prose); `CHANGELOG.md` (this entry); `compass/workflows/improvements.md` (entry #40 + header counter v0.3.22=#39 → v0.3.23=#40 — RETRO #008 NOW DUE).

## [0.3.22] — 2026-06-08

> **`[agent-file-compression]` codified as 15th Compass-original + mechanical defense shipped.** 3rd observability-class member (joining `[role-boundary]` v0.3.4 + `[user-as-load-bearing-oversight]` v0.3.19); observability shape grows from 2 → 3 members; observability now the largest non-enforcement class. **Three instances at codification:** delivery-manager.md (v0.3.18, 21,714 → 7,960), pm.md (v0.3.21, 12,664 → 7,983), researcher.md (v0.3.21, 12,115 → 7,981). **Mechanical defense:** `compass/scripts/check-agent-cap.py` (single-file Python 3 stdlib; walks `compass/agents/*.md`; host-aware enforcement — hard-fails on chatgpt-targeted overages, warns on non-chatgpt). **First Compass-original codified alongside its mechanical defense in the SAME release** — prior observability-class members shipped the pattern first and the script later (token-usage.py at v0.3.4+; check-freshness.py at v0.3.7 round 2). v0.3.22 ships both together — itself an instance of v0.3.20's aspirational refinement (orchestrator catches the mechanizable case as it's named, not 4 releases later). **Task 2 of today's 3-task arc** (Task 1 = v0.3.21 trim; Task 3 = `/build` workflow dispatch-graph refactor, fires Retro #008). Counter ticks to #39; Retro #008 fires after #40 (1 of 5 remaining).

### Added

- **`compass/scripts/check-agent-cap.py`** (NEW; Python 3.9+ stdlib). Walks `compass/agents/*.md`; reports per-file size + overage/headroom + chatgpt-target flag; exits non-zero if any chatgpt-targeted agent exceeds the ~8000-char cap. CLI: `--root` (override repo path), `--cap` (override 8000 default), `--out` (write report file), `--quiet` (suppress stdout). Exit codes: 0 (all chatgpt-targeted fit) · 1 (at least one chatgpt-targeted exceeds) · 2 (usage error). Host-aware: agents whose `preferred_hosts:` excludes `chatgpt` (reviewer.md targets `[codex, gemini]`; engineer.md targets `[claude, codex, gemini]`) get WARN not FAIL on overage — useful intel without false-positive merge blocks. Smoke-test on current repo: 3 chatgpt-targeted agents pass (delivery-manager 7960 + 40 headroom, pm 7983 + 17, researcher 7981 + 19); 2 non-chatgpt agents WARN (engineer 11436 + 3436 over, reviewer 19809 + 11809 over).
- **`compass/scripts/README.md`** entry for `check-agent-cap.py` — usage, exit codes, host-aware enforcement explanation, accuracy honesty, automated execution recommendations. Also adds `sync-from-gdrive.py` to Future scripts as forward-link to the `[external-primary-with-cached-pointer]` candidate (1 instance from user's consumer-project work 2026-06-08; codify on 2nd instance).

### Changed

- **`compass/framework/canon.md`** — added `### agent-file-compression` entry as 15th Compass-original, 3rd observability-class member. Catalog grows from 7 shapes / 14 patterns → 7 shapes / 15 patterns; observability (2 → 3). The compression playbook is fully spelled out (hybrid-inlining preserved per `[agent-as-surface-independent-unit]`; per-task structural compression; inline-separated lists; host-cap-degradation table → bullets; version stamp). Cites all 3 instances with chars-saved evidence. Names anti-pattern `cap-compounding-without-structural-defense`. Cites Retro #007 as drift-signal origin. Forward-link to candidates: `[external-primary-with-cached-pointer]` (GDrive primary + repo cache) + `[host-preference-validation]` (preferred_hosts evidence-backed).
- **`AGENTS.md`** Patterns section — catalog totals updated (7 shapes / 14 → 15 patterns; observability 2 → 3 members; workflow-execution patterns total 10 → 11). New `[agent-file-compression]` entry added after `[user-as-load-bearing-oversight]`. Observability class reframed: "now durably validated as the largest non-enforcement class" (3 members vs enforcement's 4). When-you're-unsure section gains entry: *"I'm editing an agent file; how do I know if it'll fit the cap?"* → run `check-agent-cap.py`.

### Notes

- **Codification trigger satisfied at 3 instances** per Compass rule. Pattern observed 3 times across 4 releases (v0.3.18 + v0.3.21 + v0.3.21), all with identical compression playbook + identical structural cause (agent files grow past cap when content accretes without size-budget visibility). Codified now to make the playbook + the check mechanical from this point forward.
- **The script + the codification + AGENTS.md update + README update + CHANGELOG entry all ship in this single release.** This is the v0.3.20 aspirational refinement working: orchestrator (here, the release-planning process) catches the mechanizable case (cap-compounding) at codification, not 4 releases later. Compare v0.3.4 `[role-boundary]` → v0.3.4+ token-usage.py (later) and v0.3.3 `[freshness-check]` → v0.3.7 check-freshness.py (4 releases later). v0.3.22 closes the lag entirely.
- **WARN vs FAIL distinction is host-aware by design.** The OpenAI Custom GPT Instructions cap is OpenAI-specific. Reviewer.md (`preferred_hosts: [codex, gemini]` — chatgpt deliberately excluded per cross-host integrity) and engineer.md (`preferred_hosts: [claude, codex, gemini]` — chatgpt not yet supported) can technically exceed the cap and still function on their declared hosts. The script surfaces overages as WARN (visibility, not failure) — if a future migration adds chatgpt support to either, the overage becomes a hard failure on the next CI run automatically. No prose update needed; just changing `preferred_hosts:` triggers re-evaluation.
- **Cadence:** v0.3.22 = ~45-min codification + script release. Single-session. Same release class as v0.3.7 (check-freshness.py round 2 of `[freshness-check]`) but with the codification + script paired instead of 4 releases apart.
- **Counter ticks to #39.** Retro #008 fires after #40 (1 of 5 remaining). Hard line still in effect from Retro #007.
- **Files (6):** `compass/scripts/check-agent-cap.py` (NEW); `compass/scripts/README.md` (entry added); `compass/framework/canon.md` (15th Compass-original); `AGENTS.md` (catalog totals + pattern entry + when-unsure line); `CHANGELOG.md` (this entry); `compass/workflows/improvements.md` (entry #39 + header counter v0.3.21=#38 → v0.3.22=#39).
- **Forward-link to candidates surfaced this session:** `[external-primary-with-cached-pointer]` (1 instance — Wealth-at-Fingertips consumer project, 2026-06-08); `[host-preference-validation]` (1 instance — user evidence on Claude-first ordering). Both noted in canon.md `[agent-file-compression]` entry + persisted to memory file `queued_codification_candidates_2026-06-08.md`. Wait for 2nd instance of either before codifying.

## [0.3.21] — 2026-06-08

> **Artifact-pruning release: `pm.md` + `researcher.md` trimmed to fit OpenAI's ~8000-char Custom GPT Instructions cap.** pm.md: 12,664 → 7,983 chars (37% reduction; 17 chars headroom). researcher.md: 12,115 → 7,981 chars (34% reduction; 19 chars headroom). Same v0.3.18 compression playbook (Identity + Core principles INLINED, task bodies restructured to Gate + Work + Postcondition, framework-knowledge folded into Host-cap tail, anti-patterns inline-separated, host-cap table → bullets). **No behavior change** — same identity, tasks, gates, postconditions, refusal rules, `preferred_hosts`, required + optional tools. **Task 1 of today's 3-task arc**; closes v0.3.17 watch-for #2 + v0.3.18 deferred work. **Three agent files now fit the cap** (delivery-manager v0.3.18 + pm v0.3.21 + researcher v0.3.21) — 3 instances of `[agent-file-compression]` accumulated; codification ready for Task 2. Counter ticks to #38; Retro #008 fires after #40 (2 of 5 remaining).

### Changed

- **`compass/agents/pm.md` trimmed 12,664 → 7,983 chars** (37% reduction). Strategy: combined 3 opening notes into one Notes paragraph; tightened Identity; compressed each Core principle to one line (kept INLINED); restructured `setup-product-foundation` to Gate + Work + Postcondition (dropped verbose Inputs enumeration, Handoffs detail, Triggered-by lines); compressed the 3 other tasks (`draft-brief`, `decompose-bet-to-story`, `arbitrate-dispute`) to terse stubs since 2 are migration-pending; folded Framework knowledge into Host-cap tail (one-line Compass-original + external-framework list); compressed Anti-patterns to inline-separated line; compressed Host capability degradation from 3-column table to bullet list. Frontmatter `version:` bumped 0.3.14 → 0.3.21.
- **`compass/agents/researcher.md` trimmed 12,115 → 7,981 chars** (34% reduction). Same strategy + researcher-specific compression on the 6-category research framework: each category's source list compressed to a single inline-separated line of starting points (framework SHAPE preserved as load-bearing); 9-moat evaluation moved from table to numbered inline list with verdict-required preserved as load-bearing rule; moat-sources line compressed; "Moat-specific" anti-patterns folded into general Anti-patterns line. Frontmatter `version:` bumped 0.3.14 → 0.3.21.
- **`[agent-file-compression]` now at 3 instances** — delivery-manager.md (v0.3.18), pm.md (v0.3.21), researcher.md (v0.3.21). Codification ready per Compass 3-instance rule. **Task 2 of today's arc** (next release) ships the codification + `compass/scripts/check-agent-cap.py` as the mechanical defense Retro #007 named.

### Notes

- **No behavior change verified** by content sanity: same task names (pm: 4 task headers / researcher: 1 task header); same Gate + Postcondition pairs preserved (1 each — only setup-product-foundation + cite-evidence-6-category-9-moat have full gate/postcondition; pm's other 3 tasks are migration-pending stubs or short paragraphs); same Refusal rules count; same Anti-patterns; same `preferred_hosts:` + `required_tools:` + `optional_tools:` + `participates_in_workflows:`.
- **Three pruning instances accumulated, pattern stable:** v0.3.18 delivery-manager (21,714 → 7,960; 63% reduction); v0.3.21 pm (12,664 → 7,983; 37%); v0.3.21 researcher (12,115 → 7,981; 34%). delivery-manager was the worst offender; pm + researcher had less to cut because they grew more linearly. The compression strategy generalizes cleanly across all three.
- **Counter ticks to #38.** Retro #008 fires after #40 (2 of 5 remaining). Hard line still in effect from Retro #007.
- **Cadence:** v0.3.21 = ~30-min artifact-pruning release. Same release class as v0.3.11 (compass/roles/reviewer.md pruning) + v0.3.18 (delivery-manager.md trim). Pattern: artifact-pruning releases are small + focused + single-session.
- **Files (4):** `compass/agents/pm.md` (trim); `compass/agents/researcher.md` (trim); `CHANGELOG.md` (this entry); `compass/workflows/improvements.md` (entry #38 + header counter v0.3.20=#37 → v0.3.21=#38).

## [0.3.20] — 2026-06-07

> **Aspirational refinement of v0.3.19 `[user-as-load-bearing-oversight]`: orchestrator (v0.4) catches mechanizable cases; user oversight shrinks to architectural-decisions-only residual.** v0.3.19 codified the pattern *descriptively* (user IS load-bearing today). User caught the missing aspirational complement same-session: *"ideally user as load bearing oversight is what we need to get away from .. maybe add another improvement that we want the orchestrator to make these decisions ... most of them. except the architecture ones"*. That observation is itself instance #12 of `[user-as-load-bearing-oversight]` — the framework's pattern is self-validating in real-time, including against its own incomplete codifications. v0.3.20 ships the refinement: explicit architectural-vs-mechanizable decision taxonomy + v0.4 orchestrator's accountability to minimize the user-oversight surface. Per `[declare-not-implement]` — declared, not built (orchestrator is v0.4 scope). Counter ticks to #37; Retro #008 fires after #40 (3 of 5 remaining).

### Added

- **Architectural-vs-mechanizable decision taxonomy** added to `[user-as-load-bearing-oversight]` discipline implications via the v0.3.20 improvements.md entry. Names which case-types stay with user (genuine human judgment) vs which the v0.4 orchestrator catches.

  **Stays with user (architectural — genuine human-judgment territory; ~30% of historical instances):**
  - Designing new patterns (e.g., v0.3.17 multi-altitude retro architecture observation)
  - Refining principle boundaries from new evidence (e.g., v0.3.16 `.codex/prompts/reviewer.md` boundary refinement of v0.3.15's `[tool-wrappers-own-their-cadence]`)
  - Setting strategic direction (e.g., v0.4 scope, what to ship next when multiple paths are valid)
  - Approving HITL gates (foundation approval, brief approval, merge approval)
  - Evidence citation the framework can't have (e.g., v0.3.17 PR-redo loop data)
  - Naming decisions (rename direction calls; canon-entry naming choices)
  - Cross-bet prioritization

  **Orchestrator catches (mechanizable — should NOT need user; ~70% of historical instances):**
  - Framework-vs-project boundary violations (freedom-bootstrap mistake) — refusal check on `framework: compass` config + canon.md presence
  - Phantom writes / volume mismatches — post-write `ls` verification
  - Spec-following errors (v0.3.15 rename direction) — workflow-instruction checklist; explicit "do now vs defer" tagging in spec text
  - Tool-wrapper boundary classification (`.claude/skills/` vs framework-canonical files) — file-classification manifest
  - Watch-for latency (3-release delay on cap-violation) — severity tags (`P0` = blocks next release; `P1` = blocks Retro N+1; etc.) + automated tracking
  - Counter visibility (cap-violations, freshness windows, retro-due flags) — automated checks surfaced in dashboard Actions tab
  - Retro PROMOTE follow-through tracking — ensure next-improvement actually addresses the PROMOTE
- **Forward-link candidate `[orchestrator-as-residual-shrinker]`** surfaced as 1-instance codification candidate. **Anti-pattern named: `framework-leans-on-user-for-mechanizable-residual`** — when framework treats user as load-bearing for cases that have stable mechanical signatures (boundary violations, spec mismatches, counter visibility), the framework is structurally lazy. The user is the residual for things the framework CAN'T mechanically catch (architectural judgment); the framework owes the user mechanical defense everywhere else. **Codify when 2nd instance accrues** — likely when v0.4 orchestrator design enters scoping and the taxonomy gets applied to a 2nd mechanizable case the orchestrator catches.

### Changed

- **`AGENTS.md` `[user-as-load-bearing-oversight]` Patterns entry gains a v0.3.20 Aspiration note** — points at the architectural-vs-mechanizable taxonomy + v0.4 orchestrator scope. The Patterns entry's discipline implication #4 ("framework hardens mechanically when same correction recurs ≥3 times") gets sharpened: the orchestrator IS the hardening mechanism, and the architectural/mechanizable taxonomy IS the framework's accountability for which residual stays with user.

### Notes

- **v0.3.19's codification was descriptively correct but aspirationally incomplete.** v0.3.20 closes the gap. The honest framing is: `[user-as-load-bearing-oversight]` names the structural truth of today; **the goal is to shrink the user's load-bearing surface to architectural-only over time**, with v0.4 orchestrator as the load-bearing mechanism for the mechanizable residual.
- **`[user-as-load-bearing-oversight]` instance #12 accrued in real-time during v0.3.19 codification.** User caught the missing aspirational complement; v0.3.20 adds it. The pattern is recursively self-validating — even the codification of the pattern needed user oversight to be complete. **Worth noting as a vivid example of why the pattern is durable** (not a 1-time observation; ongoing structural reality).
- **`[declare-not-implement]` 5th instance.** v0.3.20 declares the orchestrator's responsibility + the taxonomy; does NOT build the orchestrator. v0.4 ships the orchestrator with the taxonomy as a load-bearing input. Pattern empirically validated 5× across releases now.
- **Counter ticks to #37.** Retro #008 fires after #40 per `[fractal-retro]` cadence (3 more improvements).
- **Cadence:** v0.3.20 = ~15-min aspirational-refinement release. Same release-class as a watch-for follow-up (e.g., v0.3.11 pruning per Retro #005). Small + focused + closes-gap-from-prior-release pattern.
- **Files (3):** `AGENTS.md` (Aspiration note on existing Patterns entry); `CHANGELOG.md` (v0.3.20 entry); `compass/workflows/improvements.md` (entry #37 + header counter v0.3.19=#36 → v0.3.20=#37).

## [0.3.19] — 2026-06-07

> **`[user-as-load-bearing-oversight]` codified — 14th Compass-original, 2nd observability-class member; observability shape now structurally validated.** Direct follow-through on Retro #007's PROMOTE recommendation (shipped same day, `b3ea044`). When the framework's mechanical discipline (refuse-escalate, soft-spec-hardening, cite-or-mark-na, freshness-check, workflow gates, retro cadence) produces wrong-shaped output that automated checks miss, **the user catches it; the agent course-corrects.** This is the system working as designed — the human is structurally part of the discipline loop, not external observer. **11+ instances at codification** across v0.3.14 → v0.3.18 (per Retro #007 + Retro #006 accumulated). Catalog: 7 shapes / 13 patterns → **7 shapes / 14 patterns**. Observability class: 1 member (`[role-boundary]`) → **2 members** — now structurally validated, matching scope-discipline at v0.3.10 + architecture-discipline at v0.3.17 trajectories. Counter ticks to #36; Retro #008 fires after #40 (4 of 5 remaining).

### Added

- **`[user-as-load-bearing-oversight]` registered in `compass/framework/canon.md`** as 14th Compass-original. Anti-pattern named: **`framework-discipline-mistaken-for-self-sufficiency`** (when agents treat user corrections as friction to engineer away rather than first-class signal). **11+ instances cited** at codification, organized as: 5+ pre-cycle (per Retro #006) + 6+ in-cycle (Retro #007 v0.3.14 → v0.3.18: framework pivot origin · rename direction · tool-wrapper boundary · codex-prompt boundary refinement · multi-altitude retro architecture observation · PR-redo loop trigger). Representative example pulled out: freedom-bootstrap-in-framework mistake (user invoked `/setup-product` in framework's own repo; agent ran mechanically; user caught it). **5 discipline implications spelled out:** (1) every QUEUED entry declares explicit triggers; (2) every CHANGELOG entry cites user observations as origin when applicable; (3) course-corrects from user are first-class signal not friction; (4) when user-caught pattern recurs ≥3 times of same correction, framework hardens mechanically (user is structural for residual not for repeated identical catches); (5) retro convention candidates ranked by user-correction frequency.
- **Naming consideration documented in canon entry:** alternative `[human-in-the-discipline-loop]` was considered (more accurate framing — emphasizes human as structural part of loop, not external observer). Kept `[user-as-load-bearing-oversight]` for continuity with 11+ prior references; "oversight" framing honest (it IS oversight, just structurally load-bearing); "user" is the canonical Compass term. Rename to `[human-in-the-discipline-loop]` reversible if 2nd-instance evidence ever shows the alternative framing is needed.
- **Forward-link candidates surfaced in canon entry:** `[framework-repo-guard]` (if user has to flag framework-vs-project boundary again, mechanical refusal becomes warranted — 1 instance from freedom-bootstrap mistake, awaiting 2nd); `[bottom-up-signal-carriage]` declared in `[fractal-retro]` (the user's role as signal carrier pre-`[fractal-retro]`; now multi-altitude retros provide structural alternative, but may persist where leaf-altitude logging discipline doesn't stick).

### Changed

- **`AGENTS.md` Patterns section gains `[user-as-load-bearing-oversight]` entry** with full 11-instance rationale + anti-pattern + 5 discipline implications + distinction from Principle #16 refuse-escalate (refuse-escalate = agent's own discipline; this = structural complement). Catalog totals updated: 7 shapes / 13 patterns → 7 shapes / 14 patterns; observability class 1 → 2 members; **observability shape now structurally validated** (joining scope-discipline at v0.3.10 + architecture-discipline at v0.3.17 in achieving 2nd-member validation). Workflow-execution patterns total updated: 9 → 10.
- **`AGENTS.md` "When you're unsure" gains a new line** on user-correction interpretation: "The user just corrected me; should I argue, defer, or accept? → Accept it as first-class signal per `[user-as-load-bearing-oversight]` (canon v0.3.19). The user has context (their actual project, their priorities, their semantic memory) that you don't. Course-correct cleanly; surface the framework-discipline implications if any. Never engineer user corrections away as friction."

### Notes

- **Direct Retro #007 follow-through.** Retro #007 (`b3ea044`, same day) recommended PROMOTE TO CANON. v0.3.19 executes the recommendation in the immediate next improvement. **First time the framework follows through on a PROMOTE recommendation in the immediate next improvement** — sets reference example for how retro-output discipline lands. Closes the retro discipline loop cleanly: retro reports → next improvement promotes → catalog updates → discipline becomes explicit standard.
- **Observability shape structurally validated.** Joins enforcement (4 members), handoff (2), scope-discipline (validated v0.3.10), and architecture-discipline (validated v0.3.17) as classes with 2+ members. **5 of 7 pattern shapes now structurally validated as durable.** The 2 single-member shapes awaiting 2nd-instance promotion: **interaction** (`[elicitation-with-options]`), **freshness** (`[freshness-check]`).
- **Counter ticks to #36.** Retro #008 fires after #40 per `[fractal-retro]` cadence (4 more improvements). Hard line still in effect from Retro #007.
- **Cadence:** v0.3.19 = ~30-minute codification release. Same release-class as v0.3.10 [hard-line-declaration] codification (scope-discipline 2nd member) and v0.3.17 [fractal-retro] codification (architecture-discipline 2nd member). Pattern: every time a shape gets its 2nd member, the codification release is small + focused + ~1 session.
- **Files (4):** `compass/framework/canon.md` (new entry), `AGENTS.md` (Patterns section update + catalog totals + When-you're-unsure line), `CHANGELOG.md` (v0.3.19 entry), `compass/workflows/improvements.md` (entry #36 + header counter).

## [0.3.18] — 2026-06-07

> **Artifact-pruning release: `compass/agents/delivery-manager.md` trimmed to fit OpenAI's ~8000-char Custom GPT Instructions cap.** 21,714 → 7,960 chars (63% reduction). All load-bearing content preserved: Identity, 6 inlined Core principles, all 5 tasks with Gate + Work + Postcondition, Refusal rules, Output summary contract, Logging patterns mid-task, Anti-patterns, Host capability degradation. Strategy per the v0.3.15 + v0.3.17 watch-fors: tighten prose throughout, drop duplicate "Triggered by" lines (handoffs implicit from workflow dispatch), compress framework-knowledge to inline references where each principle is named, compress host-cap table to bullet list. **Counter ticks to #35 → Retro #007 now due** (1 of 1 needed before auto-fire). **No behavior change** — same agent identity, same tasks, same gates, same postconditions; the file just fits Custom GPT Instructions paste now.

### Changed

- **`compass/agents/delivery-manager.md`** trimmed from 21,714 → 7,960 chars to fit OpenAI Custom GPT Instructions ~8000-char cap. Strategy:
  - Combined 3 separate opening notes (Naming note · Host preference note · v0.4 capability-expansion heads-up) into one compressed "Notes" paragraph.
  - Core principles kept inlined but each principle compressed to one line.
  - Each task's body restructured: `Gate` (preconditions) + `Work` (compressed step sequence) + `Postcondition` (load-bearing); dropped the verbose "Inputs" enumeration (implicit from Work steps) and "Handoffs" (implicit from workflow dispatch); dropped trailing "Triggered by" lines.
  - Framework knowledge section folded into Host capability degradation tail (single line listing referenced patterns).
  - Anti-patterns compressed from bullet list to one inline-separated line.
  - Host capability degradation table compressed from 3-column markdown table to bullet list.
  - Frontmatter `version:` bumped 0.3.15 → 0.3.18 stamping the trim.
- **No behavior change.** Same identity, same 5 tasks, same gates + postconditions, same refusal rules, same anti-patterns. The compression preserves load-bearing content per `[agent-as-surface-independent-unit]` (canon v0.3.14) hybrid-inlining principle: discipline principles + task gates + refusal rules INLINED; deep framework references compressed to one-line pattern names with `compass/framework/canon.md` as the fetch source.

### Notes

- **Counter ticks to #35.** **Retro #007 is now due** — auto-fires on next framework session per `[fractal-retro]` (canon v0.3.17) cadence (every 5 entries; previous Retro #006 fired at #30). Retro #007 covers improvements #31–#35 (v0.3.14 → v0.3.18).
- **`[hard-line-declaration]` validated again.** Retro #007 fires ON TIME at #35; hard line from Retro #006 (which itself was on time) held. **Third consecutive on-time retro** — the cadence-discipline mechanism is now empirically validated past the codification threshold with high signal-to-noise.
- **`[user-as-load-bearing-oversight]` instance count accruing into Retro #007 territory.** Pre-Retro-#007 instance count: 5+ from v0.3.15-v0.3.17 sessions (rename direction, tool-wrapper boundary, retro architecture observation, pull-forward decision, PR-redo loop data citation). Canon promotion case overwhelming; Retro #007 will surface this explicitly.
- **Two future-watch items closed by this release:** (a) v0.3.15 watch-for "Custom GPT char limit for delivery-manager.md — exceeds the cap" CLOSED. (b) v0.3.17 watch-for "Custom GPT char limit on PM/Researcher/Delivery-Manager — delivery-manager.md was already ~11KB pre-v0.3.17, v0.3.17 makes that worse" PARTIALLY closed (delivery-manager addressed; pm.md + researcher.md still over cap and could compound on next agent migration). Next compression targets: pm.md (current size unknown — measure before next release); researcher.md (current size unknown — measure).
- **Cadence:** v0.3.18 = ~30-minute artifact-pruning release. Same release class as v0.3.11 (reviewer.md pruned per Retro #005 artifact analysis). 7 release classes stable (Compass-original codification · capability-extension · architectural-direction · artifact-pruning · infrastructure · framework-on-framework · documentation).

## [0.3.17] — 2026-06-07

> **First recursive workflow in Compass: `[fractal-retro]` codified (2nd architecture-discipline class member) — same retro workflow shape applied at every altitude (role · workflow · bet · project · org · framework), with bottom-up consolidation via `consolidates_from:` frontmatter.** Schema generalization + project altitude end-to-end + per-role and per-workflow log schemas all ship; agents can start logging patterns mid-task immediately. Role / workflow / bet aggregation logic + org-altitude aggregator script DECLARED per `[declare-not-implement]`, built when data accumulates. **Trigger that pulled the build forward from the v0.3.16 QUEUED entry:** PR-redo loop signal (user observed Claude redoing PRs ~5x in ≥4 instances + 10+ improvements surfacing as work happens) — exactly the friction role-altitude Engineer + Reviewer retros + workflow-altitude `/build` retros catch before manual flagging is required. Counter ticks to #34.

### Added

- **`[fractal-retro]` codified in `compass/framework/canon.md`** (v0.3.17) as 2nd architecture-discipline class member (joining `[agent-as-surface-independent-unit]` v0.3.14). Catalog grows from 7 shapes / 12 patterns → 7 shapes / 13 patterns. Architecture-discipline class structurally validated as durable (2 members), no longer a one-off. **Anti-pattern named: `single-altitude-retro-loses-bottom-up-signal`** — when retros only fire at framework altitude, role/workflow/bet-level patterns have nowhere to surface except informal user-flagging (an instance of `[user-as-load-bearing-oversight]`). **Two instances at codification:** (a) existing framework retros #001–#006 reframed as altitude=framework under recursive model — zero behavior change; (b) project-altitude retro variant shipped end-to-end this release (declared at `compass/workflows/retro.md` line 65 pre-v0.3.17 but never built).
- **`compass/templates/retro.md` schema generalized** — new frontmatter fields `altitude:` (one of role/workflow/bet/project/org/framework) and `consolidates_from:` (paths to child retros consumed). `parent_log:` semantic generalizes from 2-value enum to N-altitude; comment block in the template enumerates the altitude→path mapping. Body intro generalized to acknowledge multi-altitude reading (each altitude has a different source-log shape).
- **NEW: `compass/templates/role-activity-log.md`** — per-role activity log schema. Lives at `docs/role-activity/<role>.md` in consuming projects. Agents append structured entries (timestamp · pattern · evidence · instance count) as they surface patterns mid-task. Source for role-altitude retros (`/retro --altitude=role --role=<role>`). Append-only; specific over abstract; cite-don't-assert; cross-bet by design.
- **NEW: `compass/templates/workflow-run-log.md`** — per-workflow run log schema. Lives at `docs/workflow-runs/<workflow>.md` in consuming projects. One entry per workflow invocation, capturing run metadata + patterns surfaced (e.g., PR-redo cycles, BLOCKER counts, dispute counts, freshness-check refusals). Source for workflow-altitude retros. Highest-value workflow to log first: `/build` (where the v0.3.17 trigger pattern lived).
- **NEW: `compass/templates/retro-project.md`** — concrete project-altitude retro template. Consumes the base `retro.md` shape + adds project-specific sections: child retros consolidated (role/workflow/bet within the project), cross-altitude promotion candidates (to org altitude), per-project trigger-origin analysis.
- **NEW: `compass/templates/project-improvements.md`** — template for project-altitude shipped-improvements log. Consuming projects copy to `docs/improvements.md` at their repo root. Project analogue of `compass/workflows/improvements.md` (which is the framework's improvement log).

### Changed

- **`compass/workflows/retro.md` rewritten for 6 altitudes.** New sections: Altitudes table enumerating all 6 + their source logs + archive paths + default cadence; Dispatch rules (default by invocation context — framework if invoked inside framework repo; project if invoked inside a project; explicit override via `--altitude=<x>` arg + per-target arg for role/workflow/bet); Aggregation contract (child-retro consumption rules; cross-altitude promotion discipline — three-altitude rise = canon promotion candidate); per-altitude refusal cases. **Existing framework-altitude behavior unchanged** — Retros #001–#006 still valid; their frontmatter may not have explicit `altitude: framework` (predate v0.3.17, immutable). Future framework retros (Retro #007 onward) set the field explicitly.
- **5 migrated agents gain "Logging patterns mid-task" sections** — `compass/agents/engineer.md` + `compass/agents/reviewer.md` (priority — closest to PR-redo loop), plus `compass/agents/pm.md` + `compass/agents/researcher.md` + `compass/agents/delivery-manager.md`. Each section: when to append (role-specific examples — e.g., Engineer logs framework-registration drift recurrences; Reviewer logs recurring BLOCKER shapes), entry shape (per template), discipline rules (append-only; specific; cite-don't-assert; cross-bet; counter discipline). Reinforces the load-bearing principle that role-altitude retros need source data to aggregate.
- **`AGENTS.md` Patterns section gains `[fractal-retro]` entry** with full 2-instance rationale + anti-pattern + recursive-workflow framing. Catalog totals updated (7 shapes / 13 patterns; architecture-discipline now 2 members). "When you're unsure" section gains a line on where to log mid-task patterns (`docs/role-activity/<role>.md` vs `docs/workflow-runs/<workflow>.md`).

### Decided

- **Role / workflow / bet aggregation logic DECLARED, not built** per `[declare-not-implement]`. v0.3.17 ships the schemas + the agent-side logging discipline so data starts accumulating immediately. Aggregation logic for role/workflow/bet altitudes fires its own future improvement when their data accumulates enough to warrant retros (≥5 entries per altitude). The project altitude IS wired end-to-end as the worked example.
- **Org-altitude aggregator (`compass/scripts/aggregate-retros.py`) DECLARED, not built.** Original cross-program ask. Deferred until trigger #1 fires (a second project starts using Compass and the user wants cross-project pattern visibility). Per `[declare-not-implement]` 4th instance: declare the structural shape now; build when the data exists to aggregate.
- **`[declare-not-implement]` 4th instance** (after v0.3.5 agent-handoff template's reviewer blocks; v0.3.8 same-day adapter layer correction; v0.3.16 multi-altitude retros QUEUED state). Pattern now empirically validated 4× across releases; v0.3.17 itself demonstrates the discipline working — the build was pulled forward when a trigger fired, not pre-built speculatively.

### Notes

- **First recursive workflow in Compass.** Bets are fractal (foundation → OKR → feature → story); metrics are top-down fractal (foundation → OKR → feature → story → engineering); plans are single-altitude rollup. Retros become the first **workflow** that's fractal — same workflow file applied at every altitude, with altitude as frontmatter property.
- **The `[declare-not-implement]` ↔ `[fractal-retro]` discipline pairing.** v0.3.17 ships less than the full 6-altitude design on purpose: schema generalization (cheap; future-proofs all altitudes), project altitude end-to-end (worked example; proves the aggregation pattern), per-role/per-workflow log schemas (data starts accumulating now). Role/workflow/bet/org aggregation defers until evidence accumulates — building speculative aggregation logic on no data is the anti-pattern `[declare-not-implement]` exists to prevent.
- **Trigger discipline working.** v0.3.16 queued the design with 4 explicit triggers; trigger #2 (agents surfacing patterns mid-task with no log to land in) fired in the same session, evidenced by the PR-redo loop signal. v0.3.17 ships the response. This is the cleanest possible cycle for `[declare-not-implement]` — declare with triggers; build when a trigger fires; cite the trigger in the shipped entry.
- **`[user-as-load-bearing-oversight]` accrued ≥4 fresh instances in this session.** (a) Original retro architecture observation. (b) Pull-forward decision when trigger fired. (c) PR-redo loop data citation. (d) Course-correct on `.codex/prompts/reviewer.md` boundary in v0.3.16. Canon promotion case for Retro #007 is now overwhelming; defer to that retro to make the formal call rather than pre-empting here.
- **Counter ticks to #34.** Next retro fires after #35 (Retro #007). 1 more improvement before Retro #007 auto-fires.
- **Cadence:** v0.3.17 = first-recursive-workflow + 5 new templates + 5 agent updates + workflow rewrite + canon entry + AGENTS.md updates. ~14 framework-canonical files. Substantial release; validates that v0.3.14's pattern-shape work (architecture-discipline class) supports compounding additions.

## [0.3.16] — 2026-06-06

> **Reviewer agent migrated — the cross-host integrity point lands in `compass/agents/`.** New `compass/agents/reviewer.md` owns 2 tasks (`review-pr` with the full 7-step process incl. Step 0 framework-registration check + Step 4 review-time freshness verification on NEW load-bearing claims; `write-e2e-tests`). **`preferred_hosts: [codex, gemini]`** — DELIBERATELY EXCLUDES claude, enforcing the implementer ≠ reviewer model-split as agent-frontmatter state rather than CLAUDE.md prose (cited in canon v0.3.5, v0.3.8; CB-1.4 empirically validated). Legacy `compass/roles/reviewer.md` gets the standard superseded banner. **Freshness frontmatter (`last_verified`, `freshness_window_days`, `external_source`) relocated to the agent file** — `/build` Phase 5 Step 12a now reads the markers from the new path; single source of truth on the agent file to avoid drift. **`.codex/prompts/reviewer.md` updated to dispatch to `compass/agents/reviewer.md`** — distinct from v0.3.15's `[tool-wrappers-own-their-cadence]` boundary (Reviewer is Codex-assigned-by-design, so the Codex prompt is the natural dispatch surface for *this* agent; updating it now is in-cadence, not a framework-rename chasing wrappers). **No behavior change** in `/build` or `/ops` — same 7-step review flow, same severity taxonomy (BLOCKER/ISSUE/NIT), same Codex output shape, same dispute arbitration (PM arbitrates). Counter ticks to #33 (2 of 5 remaining before Retro #007).

### Added

- **`compass/agents/reviewer.md`** — self-sufficient agent file. Frontmatter: `name: reviewer`, **`preferred_hosts: [codex, gemini]` (EXCLUDES claude — load-bearing cross-host integrity)**, `required_tools: [filesystem_read, shell_exec, github_write_artifact, mcp_github]`, `optional_tools: [web_search, mcp_sentry]`, `participates_in_workflows: [build, ops]`, `version: 0.3.16`, plus the **freshness markers** relocated from the legacy role file. Body: Identity (the two writing surfaces — review-pr + write-e2e-tests) → 5 core principles inlined (`[mechanical-output-verification]` v0.3.6, `[freshness-check]` v0.3.3, `[role-boundary]` v0.3.4, `[refuse-escalate]`, `[hold-positions-in-disputes]`) → 2 tasks with gate/work/postcondition each (review-pr with the full 7-step process; write-e2e-tests) → refusal rules → framework knowledge referenced → output summary contract (the Codex review comment format — explicitly the freshness target) → anti-patterns (`polished-but-broken`, `direct-import-test-suspicious`, `narrow-bug-focus`, `story-claim-trust without primary-doc verification`, plus the standard reviewer anti-patterns) → host-capability degradation table covering codex / gemini / pure-chat. **Host preference note** explains the cross-host integrity rationale upfront — preferred_hosts excludes claude on purpose, not as a host-preference convenience.
- **`[freshness-markers-follow-source-of-truth]`** surfaced as a 1-instance codification candidate. When an agent migrates and the source-of-truth moves from `compass/roles/<role>.md` to `compass/agents/<agent>.md`, the **freshness frontmatter MOVES WITH IT** — workflows that read the markers update the path. Surfaces here for the first time because `compass/roles/reviewer.md` was the only legacy role file carrying `[freshness-check]` markers. Promote to canon when 2nd instance accrues (likely when next freshness-marker-carrying file migrates, or when a per-bet artifact gains freshness markers).
- **`[different-model-reviewer-as-agent-frontmatter]`** surfaced as a 1-instance enforcement-shift. The structural Compass invariant "reviewer must use a different model than implementer" was previously enforced via prose across 10+ files (per canon v0.3.8). v0.3.16 lands the first **agent-frontmatter-level** enforcement: `preferred_hosts: [codex, gemini]` (no claude). Probably already covered structurally by `[agent-as-surface-independent-unit]` (canon v0.3.14) — the agent frontmatter IS the surface-independent unit, and host-restriction-as-frontmatter is just an application. May not warrant separate canon entry; tracking as a sub-instance of v0.3.14.

### Changed

- **`compass/roles/reviewer.md` signposted as superseded.** v0.3.14-pattern banner: pointer to `compass/agents/reviewer.md` as source-of-truth; notes the **freshness frontmatter was relocated** (so the legacy file no longer carries the load-bearing markers — the banner explicitly states this); names the `/build` Phase 5 Step 12a path update; "agent file wins on divergence"; "removed in v0.4" deadline (once `/build` and `/ops` workflows refactor to dispatch-graph shape). Legacy body intact during v0.3.x grace period.
- **`.codex/prompts/reviewer.md` updated to dispatch at the new agent file.** "Read these in order, then act" list line 2 flipped from `compass/roles/reviewer.md` → `compass/agents/reviewer.md`. "Execute" section now says "Follow `compass/agents/reviewer.md` exactly — in particular Task `review-pr` (7-step process incl. Step 0 framework-registration check and Step 4 review-time freshness verification on NEW load-bearing claims)". **In-cadence touch** per the boundary distinction from v0.3.15's `[tool-wrappers-own-their-cadence]` — Reviewer is Codex-assigned-by-design, so the Codex prompt is the natural dispatch surface for *this* specific agent's migration (NOT analogous to updating `.claude/skills/dashboard/SKILL.md` for an unrelated Delivery Manager rename).
- **`compass/workflows/build.md` Phase 5 updated.** Step 8 load instruction (`compass/agents/reviewer.md`); Step 12a freshness-check precondition reads the agent file's frontmatter (path updated; "Expected Codex output shape" → "Output summary contract" section reference); Step 13 manual-invocation pointer updated. ROLE_BOUNDARY markers unchanged (`role=reviewer` tag value matches the agent name). Workflow stays in v0.3.0-alpha step-body shape; refactor to dispatch-graph shape declared as next v0.3.16+ improvement per `[declare-not-implement]`.
- **`AGENTS.md` row 73 updated.** "Reviewer (Codex; writes E2E + automation)" / `compass/roles/reviewer.md (+ .codex/prompts/reviewer.md)` / `legacy` → `compass/agents/reviewer.md (+ .codex/prompts/reviewer.md)` / `✅ v0.3.16`. Migration column now 5 ✅ migrated (pm, researcher, engineer, delivery-manager, reviewer) and 8 legacy (support, designer, ux-writer, architect, enterprise-architect, security-reviewer, tech-writer, scanner).
- **`CLAUDE.md` cross-host independence paragraph updated.** "(when migrated in v0.3.15+) will declare `preferred_hosts: [codex, gemini]` (NOT claude)" → past-tense: "(migrated v0.3.16) declares `preferred_hosts: [codex, gemini]` (NOT claude) — making the implementer/reviewer model split enforced at the agent-frontmatter level". Security Reviewer's pending-migration note retained.
- **PR templates** (`compass/templates/pr-template.md` + `.github/PULL_REQUEST_TEMPLATE.md` — identical content): two `compass/roles/reviewer.md` references in the "Review handoff" section flipped to `compass/agents/reviewer.md`. Security Reviewer's reference stays at `compass/roles/security-reviewer.md` (not migrating).
- **`compass/scripts/README.md`** "Manual fallback always supported" section: pointer flipped from `compass/roles/reviewer.md` → `compass/agents/reviewer.md` task `review-pr`.
- **`SETUP.md`** "CLI-based agents" guidance updated to note that the prompt-pattern points at `compass/agents/<agent>.md` for migrated agents and `compass/roles/<role>.md` for legacy ones during v0.3.x grace period.

### Not changed (deliberate)

- **Security Reviewer untouched.** `compass/roles/security-reviewer.md`, `.codex/prompts/security-reviewer.md`, AGENTS.md row 74 — all stay. Migration is its own future session. The Reviewer migration deliberately does NOT bundle Security Reviewer; each agent migrates on its own cadence.
- **`compass/workflows/ops.md`** — references "Security Reviewer (Codex) auto-engages" + "Full Codex review on every ops change. Full Security Reviewer engagement when applicable". Neither path requires a file-path update for THIS Reviewer migration (the Codex review reference is generic; the Security Reviewer reference is its own pending agent). Left as-is.
- **`compass/config.yaml.tool_assignments.reviewer: codex`** stays. The assignment matches the agent's `preferred_hosts: [codex, gemini]` default. Block deprecated for v0.4 removal anyway.
- **`compass/framework/canon.md`** historical pattern descriptions (v0.3.3, v0.3.5, v0.3.6, v0.3.8, v0.3.9) reference `compass/roles/reviewer.md` in the "first applied" notes — **archive immutability**, those describe the framework's history when reviewer was at the legacy path. Not rewriting history.
- **`compass/roles/{engineer,enterprise-architect,pm}.md`** legacy role files mention Reviewer/Codex review in their prose — these legacy bodies are intact (and their owning agents are pending migration, at which point any path updates would happen as part of those migrations per the established pattern).
- **`/build` and `/ops` workflow step-bodies** stay in v0.3.0-alpha shape — load instructions flip; methodology embedded inline. Refactor to dispatch-graph shape declared as next v0.3.16+ improvement.
- **Archive logs untouched** — historical entries in `improvements.md`, `CHANGELOG.md` below v0.3.16, and `compass/workflows/retros/*.md`.

### Notes

- **Migration #5 of 13.** Same mechanical pattern as v0.3.14 (pm, researcher, engineer) and v0.3.15 (delivery-manager rename + migration). The v0.3.14 spec is doing what it was designed to do: incremental, low-risk, reversible-individually, no big-bang. **What was new this round:** (1) carrying load-bearing freshness frontmatter alongside the file move (surfaces `[freshness-markers-follow-source-of-truth]` candidate); (2) deliberate-exclusion `preferred_hosts` (`[codex, gemini]` not just `[codex]` — leaves room for gemini as the alternative different-model reviewer; matches CLAUDE.md v0.3.14 prediction); (3) load-bearing in-cadence `.codex/prompts/reviewer.md` touch (boundary distinction from v0.3.15's wrapper-update refusal, made explicit in this entry).
- **`/build` is now PARTIALLY migrated** — Phase 5 (Reviewer's domain) loads from `compass/agents/reviewer.md`, but other phases (1–4 Engineer-owned) still load from `compass/agents/engineer.md` directly (already migrated v0.3.14). Workflow file itself stays in v0.3.0-alpha shape; refactoring to dispatch-graph shape (per the v0.3.14 `/setup-product` precedent) would move methodology bodies into agent task definitions. Worth doing when next Engineer or Reviewer agent task definition needs updating — natural moment for the workflow refactor to ride along.
- **Cross-host integrity unchanged in operational terms.** Codex still plays Reviewer; the dispatch surface (`.codex/prompts/reviewer.md`) still tells Codex to follow the canonical role file — only the canonical path moved from `compass/roles/` to `compass/agents/`. Gemini remains a declared alternative in `preferred_hosts` but is not actively configured in this repo's setup.
- **In-session course-corrects: 1.** The `.codex/prompts/reviewer.md` in-scope decision was explicitly flagged at plan time as the only architectural call (distinct from v0.3.15's `[tool-wrappers-own-their-cadence]` boundary). Plan was approved as-is; reasoning preserved in the CHANGELOG so future agent migrations can apply the same boundary test (host-assigned-by-design ⇒ that host's wrapper is in scope; orthogonal host wrappers stay on their own cadence).
- **Counter ticks to #33. Next retro fires after #35** (Retro #007). 2 of 5 remaining. Hard line still in effect from Retro #006.
- **Cadence:** v0.3.16 = single-agent migration with one architectural decision (the `.codex/` boundary) and one new pattern candidate (`[freshness-markers-follow-source-of-truth]`). ~18 framework-canonical files touched. Validates that v0.3.14 made subsequent migrations cheap even when they carry load-bearing freshness state.

## [0.3.15] — 2026-06-05

> **Project Manager → Delivery Manager agent migration + rename — first v0.3.15+ agent-migration release.** New `compass/agents/delivery-manager.md` ships as a self-sufficient, surface-independent agent file owning 5 tasks (`update-status`, `refresh-plan`, `regenerate-dashboard`, `compile-sprint-comms`, `rollup-token-usage`); legacy `compass/roles/project-manager.md` kept at its historical path with a v0.3.14-pattern "superseded + renamed" banner; `/setup-product` Step 4 dispatch graph reference moves from `project-manager.update-status` → `delivery-manager.update-status` (rename) with the lookup target moving from `compass/roles/` → `compass/agents/` (migration). The rename is bundled into this migration per the v0.3.14 spec target naming; capability expansion (Time / Quality / Finance pillars) arrives at v0.4 cut alongside the orchestrator + per-host cost tracking, per `[declare-not-implement]`. **No behavior change in `/setup-product`** — same task ownership, same postconditions, same HITL gate. Counter ticks to #32 (3 of 5 remaining before Retro #007).

### Added

- **`compass/agents/delivery-manager.md`** — self-sufficient agent file structured per the v0.3.14 surface-independent spec: YAML frontmatter (`name: delivery-manager`, `preferred_hosts: [claude, codex, gemini, chatgpt]`, `required_tools: [text_input, github_write_artifact]`, `optional_tools: [filesystem_read_recursive, shell_exec, mcp_github, mcp_jira, mcp_linear, mcp_slack]`, `participates_in_workflows: [setup-product, status, plan, dashboard]`, `version: 0.3.15`) → Identity → Core principles (INLINED — `[no-padded-status]`, `[derive-from-state]`, `[living-not-snapshot]`, `[role-boundary]`, `[refuse-escalate]`, `[mechanical-output-verification]`) → 5 task definitions (gate / work / postcondition each; inputs / handoffs declared) → Refusal rules → Framework knowledge (REFERENCED — fetch from `canon.md`) → Output summary contract → Anti-patterns → Host capability degradation table. **Naming note** preserves audit trail: pre-v0.3.15 this agent was Project Manager; archived retros + historical CHANGELOG/improvements entries stay verbatim under "Project Manager". **Host preference note** documents the per-task split: markdown drafting works on any host; dashboard regen + token-usage rollup require CLI-class hosts (filesystem + shell). **v0.4 capability-expansion heads-up** documents that Time / Quality / Finance pillars arrive at v0.4 cut — v0.3.15 ships the rename + agent-shape migration only.
- **`[no-padded-status]`** named as a Delivery Manager core principle for the first time. Visibility-discipline pattern; surfaces as 1 instance in this file (delivery-manager agent's anti-padding refusal rule). **Codification-candidate at 1 instance** — promote to canon when 2nd instance accrues elsewhere (e.g., when sprint comms anti-pattern of positive-sounding non-information gets named in its own workflow or agent file).
- **`[tool-wrappers-own-their-cadence]`** surfaced mid-session as a 1-instance codification candidate. **Friction:** the initial v0.3.15 plan included `.claude/skills/{status,plan,dashboard,retro}/SKILL.md` description-line updates in the rename surface. User course-corrected: `.claude/` is a Claude Code-specific tool wrapper (per SETUP.md "thin wrappers that reference `compass/roles/<role>.md` and `compass/workflows/<workflow>.md`; `compass/` files don't change. Only the wrapper folder is added"). If framework renames have to touch every per-host wrapper (`.claude/`, `.codex/`, `.cursor/`, `.cline/`, …) the v0.3.14 surface-independence promise breaks: surface-independence is bidirectional — wrappers point at the framework; renames in the framework don't need to chase every wrapper. **Mechanism:** the 2 already-edited skill files (`status`, `plan`) were reverted in-session; the other 2 (`dashboard`, `retro`) were never touched; rename scope was tightened to `compass/` + AGENTS.md + CHANGELOG + improvements.md + top-level `README.md` only. **Codification candidate** at 1 instance — promote to canon when 2nd framework rename surfaces the same boundary, or when adding a third per-host wrapper (.cursor/, .cline/, …) triggers the same question.

### Changed

- **`compass/roles/project-manager.md` signposted as superseded + renamed.** Top-of-file warning banner: pointer to `compass/agents/delivery-manager.md` as source-of-truth; names the rename (Project Manager → Delivery Manager) and the migration together; explicit "the agent file wins on divergence"; lists workflows still loading the legacy file during v0.3.x grace period (`/status`, `/plan`, `/dashboard`, `/retro` — embed step bodies as of v0.3.15); "removed in v0.4" deadline (at which point Delivery Manager also acquires Time / Quality / Finance pillar ownership). **No content deleted** — banner only; legacy body intact.
- **`compass/workflows/setup-product.md` updated for migration + rename.** "Roles invoked" list, Step 4 details (dispatch + task definition + migration-status note), verification checklist line, and "What changed" notes section all flipped from `project-manager`-shape to `delivery-manager`-shape. Dispatch graph reference moved from `project-manager.update-status` → `delivery-manager.update-status` (rename) with lookup target moving from `compass/roles/` to `compass/agents/` (migration). **No behavior change** — same task ownership, same postconditions, same HITL gate boundary. **Note** on the v0.3.14 promise: the simple-migration test would have kept the dispatch reference identical; the rename test moves the reference but preserves the workflow ↔ agent-task contract — both surface the same downstream invariant (workflows don't need to know agent-file internals).
- **`AGENTS.md` 13-agents/roles table row updated.** Row 76 flips from "Project Manager (→ Delivery Manager v0.4)" / `compass/roles/project-manager.md` / `legacy` → "Delivery Manager (was Project Manager)" / `compass/agents/delivery-manager.md` / `✅ v0.3.15`. Row 48 (the snake-case host-group line) swaps `project-manager` → `delivery-manager` in the chatgpt/claude/codex/gemini group. Migration-status column now shows 4 migrated agents (pm, researcher, engineer, delivery-manager) and 9 legacy roles (support, designer, ux-writer, architect, enterprise-architect, reviewer, security-reviewer, tech-writer, scanner).
- **`compass/agents/pm.md` handoff updated.** Line 87 reference to `project-manager.update-status` flipped to `delivery-manager.update-status`; the "until project-manager agent migrates in v0.3.15+" caveat removed (migration is the current change).
- **`compass/config.yaml.tool_assignments:` legacy key renamed.** `project_manager: claude` → `delivery_manager: claude` with grace-period comment noting the rename (block deprecated for v0.4 removal anyway, so this is cosmetic but keeps the snake-case key consistent with the agent name).
- **7 workflow files updated** (`status.md`, `plan.md`, `dashboard.md`, `retro.md`, `advance.md`, `create-brief.md`, `create-story.md`): role-load-instruction prose flipped from "Load Project Manager role context (`compass/roles/project-manager.md`)" → "Load Delivery Manager agent (`compass/agents/delivery-manager.md`)"; status-update prose flipped from "Project Manager updates ..." → "Delivery Manager updates ...". These workflows remain in v0.3.0-alpha shape (step bodies embedded; not yet dispatch-graph refactored) — the load instruction flips but the methodology body stays.
- **3 templates updated** (`compass/templates/retro.md`, `compass/templates/plan.md`, `compass/templates/workflow-template.md`): example author labels and DRI-log role names flipped from Project Manager / `project-manager` → Delivery Manager / `delivery-manager`.
- **`compass/scripts/README.md` ownership convention updated.** "Owner convention: ... operated by the Project Manager role" → "Operated by the Delivery Manager agent". Bottom-of-file pointer flipped from `compass/roles/project-manager.md` → `compass/agents/delivery-manager.md` (Task `rollup-token-usage`).
- **Top-level `README.md` skill-list pointer updated.** Line 63 "/status → Project Manager's rolling status" → "/status → Delivery Manager's rolling status".

### Not changed (deliberate — per the in-session `[tool-wrappers-own-their-cadence]` boundary discovery)

- **`.claude/skills/{status,plan,dashboard,retro}/SKILL.md`** description lines — Claude Code-specific tool wrappers; not part of the framework-canonical rename surface. They continue to say "Project Manager" until their tool maintainer (Claude Code skill registry) gets touched. Same principle applies to `.codex/` (no project-manager references there today; nothing to do).
- **Historical CHANGELOG entries** below v0.3.15, **archived retros** (`compass/workflows/retros/*.md`), and **historical improvements.md entries** stay verbatim under "Project Manager" — append-only convention; archive immutability per Retro #006 framing.
- **Task scope of Delivery Manager** stays at v0.3.14 Project Manager scope (visibility — status, plan, dashboard, sprint comms, token rollup). Time / Quality / Finance pillar acquisition is **declared** in the v0.4 capability-expansion heads-up note, **not bundled** here per `[declare-not-implement]`.
- **`/status`, `/plan`, `/dashboard`, `/retro` workflow file step-bodies** still in v0.3.0-alpha shape (embedded methodology); their LOAD instruction was updated but their inline step content stays. Refactoring them to dispatch-graph shape is the natural next v0.3.15+ improvement — declared, not bundled.

### Notes

- **Migration #4 of 13.** Pattern is mechanical now — agent file, banner on legacy, AGENTS.md row flip, downstream workflow dispatch updates. The v0.3.14 spec is doing what it was designed to do: incremental, low-risk, reversible-individually, no big-bang. **Honest stretch:** this migration also performs a rename, so the dispatch graph reference itself moves (`project-manager.update-status` → `delivery-manager.update-status`). The simple-migration test would have kept the reference identical; the rename test moves the reference but preserves the workflow ↔ agent-task contract. Both surface the same downstream invariant.
- **`/setup-product` is now FULLY migrated** — all 3 agents it dispatches (pm, researcher, delivery-manager) source from `compass/agents/`. First workflow whose entire dispatch graph resolves to migrated agent files. Other 13 workflows refactor incrementally as their owning agents migrate.
- **In-session course-correct count: 2.** (1) Initial drafting kept the `project-manager` name with a "v0.4 rename heads-up" callout; user re-read the v0.3.14 spec target wording and flagged the rename was supposed to land at the migration, not be deferred — plan was re-scoped to bundle the rename. (2) Initial plan included `.claude/skills/` updates in the rename surface; user flagged tool wrappers as out-of-scope per SETUP.md — plan was tightened to framework-canonical files only; surfaces `[tool-wrappers-own-their-cadence]` as a 1-instance codification candidate. Both course-corrects honest signals of how `[user-as-load-bearing-oversight]` (Retro #006 candidate, 3+ instances pre-session) operates structurally — adds a 4th and 5th instance, making the canon promotion case even stronger for Retro #007.
- **Counter ticks to #32. Next retro fires after #35** (Retro #007). 3 of 5 remaining. Hard line still in effect from Retro #006.
- **Cadence:** v0.3.15 = single-agent rename + migration, ~16 framework-canonical files touched, ~1 session-hour from session start. Validates that v0.3.14 made subsequent migrations cheap, even when they bundle a rename.

## [0.3.14] — 2026-06-04

-

### Added

-

## [0.1.0] — 2026-05-22

Initial release. 72 files. 12 roles, 13 workflows, 10 templates, 3 cross-cutting principles.

## [0.1.4] — 2026-05-24

### Added

- Documentation in SETUP.md and README.md explaining how AI tool memory persists across folder deletion at the same path, with cleanup instructions per tool.

## [0.1.8] — 2026-05-24

### Added
- Researcher role gained 6-category source guide (user pain, competitive, technical, quantitative, trends, moat).
- Moat / defensibility analysis added as mandatory step for foundational product bets — all 9 classic moat types must be evaluated (network effects, switching costs, data, scale, brand, regulatory, distribution, talent, speed).
- `docs/foundation/product.md` template includes a Defensibility / Moat section.
- Brief template includes optional Defensibility section for feature bets.
- AI tools (Claude, ChatGPT, Codex with browser) acknowledged as first-class research tools across all categories.

### Changed
- Researcher role's "Where to research" section completely rewritten with current (2025-2026) sources, replacing generic guidance.

### Fixed
- Source quality hierarchy now explicit; AI summaries placed below primary sources to discourage AI-only research.

## [0.1.9] — 2026-05-24

### Changed
- `/setup-product` step 3 now explicitly bans "log-and-walk-away" — Researcher must produce evidence in at least User pain, Competitive, and Moat categories. Filing missing research as open DRI Issues is no longer a valid substitute for doing the research.
- `/setup-product` verification checklist tightened: empty moat rows fail; Researcher DRI must include ≥1 Decision AND ≥1 Risk (Issues-only no longer satisfies); findings must cite evidence, not point at TBDs.
- HITL approval gate cannot pass while any verification item is unchecked — made explicit.

### Added
- Researcher role gained "When the source is vision-only" subsection: vision-only sources are the normal starting state for foundational bets, not a reason to defer research.

### Fixed
- Closed an enforcement gap surfaced by a real `/setup-product` run where vision-only source material allowed the Researcher to ship Issues-as-deliverable rather than evidence-as-deliverable.

## [0.1.10] — 2026-05-24

### Changed
- Completed the architecture rename: `compass/workflows/setup-architecture.md` → `setup-foundation-architecture.md` (file + skill directory). The earlier rename had updated docs and the create-architecture half but left this half on the old name.
- All command references standardized on hyphen-slug form (`/setup-product`, `/setup-foundation-architecture`, `/create-bet-architecture`) across README, AGENTS, CLAUDE, PROJECT, SETUP, docs/status, and every role + workflow file. Space-form (`/setup product`, `/setup architecture`) eliminated.

### Fixed
- `.claude/skills/setup-foundation-architecture/SKILL.md` had `name: setup-architecture` while pointing at a workflow path that didn't exist — would have failed silently on first invocation. Skill name now matches its directory and the workflow file it executes.
- Removed duplicate `compass/improvements.md`; merged its contents into the canonical `compass/workflows/improvements.md`.

## [0.1.11] — 2026-05-24

### Changed
- `/setup-foundation-architecture` split into two explicit phases separated by a HITL approval gate. Phase A decides and documents the architecture; Phase B scaffolds the repo. **Scaffolding now waits on explicit human approval of the architecture document — previously it ran before HITL.**
- Enterprise/Solution Architect role now owns a canonical 6-category architecture-research framework (prior art / benchmarks / vendor health / failure modes / pillar fit / reversibility honesty), mirroring the Researcher's 6-category guide.
- Every stack choice in the foundational architecture template must be scored on all 6 AWS Well-Architected pillars (reliability, security, performance efficiency, cost optimization, operational excellence, sustainability) with per-row rationale + cited research. "Smart default" / "team preference" no longer satisfies.
- Alternatives table in the architecture template evaluated against declared fitness functions and pillar tradeoffs — generic Pros / Cons columns dropped; strawmen explicitly disallowed.

### Added
- **Fitness Functions** section in the foundational architecture template — ≥1 measurable target per Well-Architected pillar (6 minimum). These are the architecture bet's falsification criteria.
- **Per-row pillar evaluation + research citations** subsection per stack choice in the template.
- **Architecture Research** section in the template (or pointer to standalone `docs/foundation/architecture-research.md`).
- **"When the product bet is vision-only on workloads"** subsection in the Enterprise/Solution Architect role — workload-shape derivation is the architect's job, not a reason to ask the user or punt.
- Phase A Verification gate (mirrors `/setup-product`'s pattern): empty pillar cells fail; every choice cites research; alternatives tied to fitness functions; EA DRI has Decision + Risk breadth; HITL cannot pass with any unchecked item.
- Phase B Verification gate: scaffold plan listed before write; user confirms; written-files summary produced.
- State-detection table at the top of the workflow routes between Phase A, refusal (proposed-pending-approval), and Phase B based on artifact status.

### Fixed
- Closed the parallel anti-pattern to the Researcher fix: Architect could pick stack choices from "smart defaults" without deriving them from product constraints. The workflow now requires fitness-function derivation, pillar scoring, and cited research before any stack row is accepted.
- Closed the scaffolding-before-approval bug: the prior workflow's HITL gate was the last step, running after the repo had already been scaffolded — backwards.

## [0.1.12] — 2026-05-24

### Added
- **Foundational Data Model** section in the architecture template and a matching Phase A workflow step (#7). Covers core entities (traced to product bet — no inventions), identity strategy, tenancy model, audit / event-sourcing posture, delete posture, PII handling, timestamps convention, migration strategy, and a Mermaid `erDiagram`. Decided **before** the DB choice so the stack is informed by data shape, not the reverse.
- "Deriving the foundational data model" subsection in the Enterprise/Solution Architect role — explains how each data-model decision is derived from the product bet (entities from nouns, tenancy from personas + moats, audit from compliance, PII from user segment, migration from Reliability + Ops fitness functions).
- Phase A Verification items: data model section present; every entity traces back to product bet; identity / tenancy / audit / delete / PII / timestamps / migration all decided; Mermaid ERD with cardinality; Database row in Stack cites the data model.

### Changed
- Phase A workflow step ordering: research → **data model** → stack choices (was: research → stack choices). Database row in the Stack table now must cite the foundational data model — DB choice that ignores entity shape, tenancy, or audit posture fails verification.
- Phase B step numbers shifted (13–16) to accommodate the new Phase A step. Enterprise Architect role's process list renumbered to match.

### Fixed
- Closed the same decide-before-derive anti-pattern at the data-modeling layer: DB choice was being made as a stack preference rather than derived from the data shape it has to hold. Same pattern as fitness-functions-before-stack and HITL-before-scaffold, now applied at one finer grain.

## [0.1.13] — 2026-05-24

### Added
- **`/create-bet-portfolio` workflow** (bootstrap-only). Runs once per project after foundation product + architecture are approved. PM + Researcher draft the MVP wedge as 3-6 stub briefs with a Mermaid dependency graph and parallel-build candidates. After portfolio HITL approval, individual stubs are promoted to full briefs via `/create-brief <bet-id>`.
- **MVP forcing question** in the new workflow: "What does this product need to do for one real user to complete the core value loop once?" Verbatim user answer becomes the load-bearing scope statement.
- **"Deliberately out of MVP" section** in the portfolio doc — captured one-liners for post-MVP items so they aren't lost, but no stub briefs created. Empty section logs a DRI Risk (MVP scope probably padded).
- New template `compass/templates/portfolio.md`.
- New skill `.claude/skills/create-bet-portfolio/SKILL.md`.
- New brief frontmatter fields: `portfolio_stub` (boolean), `depends_on` (list of bet IDs), `parallel_with` (list of bet IDs).

### Changed
- `/create-brief` gained a **promote-stub mode**: when invoked with a bet ID that has a `portfolio_stub: true` brief, it fills in the full content and clears the flag (rather than refusing or creating fresh). Original "create fresh from source" mode is unchanged.
- `/setup-foundation-architecture` final note now points at `/create-bet-portfolio` as the next step for new projects (with `/create-brief` as the path for non-bootstrap single-bet additions).
- AGENTS.md workflow count: 13 → 14. New workflow inserted in the table between `/setup-foundation-architecture` and `/create-brief`.
- SETUP.md "First run" section renumbered (new step 3 = portfolio; old step 3 = step 4; etc.) to slot the bootstrap portfolio between foundation arch and bet-level work.

### Fixed
- Closed the serialization gap during project bootstrap: PM was previously forced to decompose bets one-at-a-time, which meant foundational architecture had to decide knowing only bet 1's needs, teams sat idle waiting for the previous bet to clear, and cross-bet dependencies stayed invisible. The MVP portfolio surfaces the wedge upfront with a dependency graph so parallel build streams can start as soon as portfolio HITL passes.

## [0.1.14] — 2026-05-24

### Added
- **`/plan` workflow** + **living `docs/foundation/plan.md`** artifact. Derived from per-bet artifacts (portfolio, briefs, architectures, stories, build state). Refreshed on every `/advance`. Sections: Currently in flight / Next up / Blocked / Done / Full schedule / Calendar view / Refinement log. Status is `living` — never `proposed` or `approved`.
- **Estimate model** that sharpens as phases complete: stub → brief approval (scope) → architecture approval (effort) → stories (count) → build PRs (actuals). Each refinement writes a new `estimate` block to the bet's `brief.md` frontmatter (`duration_weeks`, `confidence`, `refined_by`, `refined_at`).
- **Refinement log** in `plan.md` — every date that moves writes a row naming the triggering artifact. This is the audit trail for "output → input" causality.
- New template `compass/templates/plan.md`.
- New skill `.claude/skills/plan/SKILL.md`.
- `estimate` block added to `compass/templates/brief.md` frontmatter.
- Project Manager role gained `/plan` ownership (alongside `/status` and sprint comms).

### Changed
- `/advance` now auto-runs `/plan` as its final step. This is the load-bearing mechanic that makes "each phase's output is an input to the next phase's plan" real instead of aspirational — users don't have to remember to refresh the plan.
- `/status` now reads `docs/foundation/plan.md` for ETAs / in-flight / next-up rather than recomputing schedule data. Adds a plan-freshness signal (`last_refreshed` age) to the health metrics.
- `/create-bet-portfolio` Output section now points at `/plan` as the next step after portfolio HITL approval (seeds the initial schedule).
- AGENTS.md workflow count: 14 → 15.

### Fixed
- Closed the time-planning gap: the portfolio had a *logical* plan (dependency graph) but no *temporal* plan (dates, calendar, parallel streams visible on a timeline). "When can we ship the MVP?" was unanswerable in concrete dates; parallel-build candidates sat unused; estimates never tightened; slip detection was reactive. `/plan` makes the schedule first-class and refines it as each phase's output lands.

## [0.2.0] — 2026-05-24

> Major: continuous quality scanner for the product lifecycle. Modeled on Snyk / Semgrep / GitHub Advanced Security.

### Added
- **New `/scan` workflow** + **Scanner role** + **`scan-report.md` template**. Snyk-style continuous quality scanner across six SDLC phases (Product, Architecture, Build, **Production Ready** (new), GTM, Operate). Findings, not failures. Severity (Critical / High / Medium / Low) + confidence (High / Medium / Low) + location + reason + fix per finding. Read-only role — owners decide; the scanner informs.
- **Production Ready phase formally introduced** — previously silent in Compass. Eight checks covering runbook, SLO, monitoring, rollback, on-call, backup, cost, compliance.
- **Cross-cutting principle #13** in AGENTS.md: continuous quality scanning with confidence levels. Names the six phases, the finding shape, and the "measurement is automatic — no manual self-assessment" rule.
- **Check catalog** (44 checks across six phases) lives in `compass/workflows/scan.md` as the single source of truth. New checks added there, not improvised by the role.
- **Confidence derivation** is canonical: content depth + source freshness + cross-artifact corroboration. Each finding's Reason field states the reasoning briefly.
- **Suppression policy** in `compass/config.yaml`: HITL-approval-required for Critical (with non-suppressible carve-outs for PII / legal); DRI-justification for High; owner-acceptance-logged for Medium; silent-dismissal-logged for Low.
- **Open Findings section** in `/metrics` output — total by severity, top patterns, suppressions, time-to-remediate, trends.
- **Scan summary section** in brief template — points at the latest `scan-report.md`, shows current open-findings count.
- New skill `.claude/skills/scan/SKILL.md`.
- Role count: 12 → **13** (Scanner). Workflow count: 15 → **16**.

### Changed
- **`/advance` now runs `/scan` before any phase transition.** In `strict` mode (default for Product / Architecture / Build / Production Ready), open Critical findings block advancement. In `advisory` mode (default for GTM / Operate), Critical findings warn loudly and auto-log as DRI Risks. Non-suppressible Critical findings always block.
- **`/build` invokes `/scan` at phase boundaries** — Build → Production Ready, Production Ready → GTM, GTM → Operate. Catches missing production-readiness work *before* the bet is treated as shipped.
- **`/metrics` reads all `docs/bets/*/scan-report.md`** for the new Open Findings posture roll-up.
- **`compass/config.yaml`** gained a `scanner:` section: mode (strict/advisory), per-phase overrides, suppression policy, cron schedule.
- **AGENTS.md** workflow count 15 → 16; role count 12 → 13; principle count 12 → 13.
- **README.md** principles updated with the scanner framing; flow diagram includes `/scan`.

### Fixed
- Closed the "what gates production?" gap. Compass v0.1 had no explicit Production Ready phase — runbook, SLO, monitoring, rollback, backup, on-call, cost, compliance lived as vague intentions across role docs or in nobody's responsibility. v0.2 makes Production Ready a first-class scanned phase with eight checks, several non-suppressible for regulated data.
- Closed the "rubric vs scanner" framing gap. Previous quality-checklist patterns in workflow verification gates were checklists the owner self-applies (boolean: did I do this?). The scanner replaces that for SDLC-wide quality with a Snyk-shaped output engineers already trust — findings with locations, fixes, severity, confidence, suppression with rationale.

## [0.2.1] — 2026-05-24

### Added
- **`/dashboard` workflow** + **`docs/dashboard.html`** single-file browser view of all living Compass artifacts (foundation, plan, portfolio, scan reports, metrics, status). One self-contained HTML file. Opens via `file://`. Shareable as an attachment. Six tabs, marked.js + mermaid.js via jsDelivr CDN. CORS-safe — markdown content inlined at generation time, no `fetch()` of local files.
- New template `compass/templates/dashboard.html.template` with `<!-- COMPASS-INSERT:* -->` markers the `/dashboard` workflow fills in.
- New skill `.claude/skills/dashboard/SKILL.md`.
- Project Manager role gained `/dashboard` ownership (fits the rolling-visibility mandate alongside `/status` and `/plan`).

### Changed
- **`/scan`, `/metrics`, `/plan`, `/status` auto-invoke `/dashboard`** as their final step. `/advance` triggers it transitively via its `/plan` step. Browser view never goes stale during normal workflow usage.
- AGENTS.md workflow count: 16 → **17**.
- README.md flow diagram + SETUP.md "Anytime" section mention `/dashboard` for stakeholder sharing.

### Notes
- **Zero-toolchain.** No Node, no Python, no Pandoc, no `node_modules`. AI agent (Claude running `/dashboard`) reads markdown reports and inlines them into the HTML template via the Write tool. Browser renders client-side from CDN-loaded dependencies.
- **Mermaid diagrams** (dependency graphs, ERDs, future Gantt) inside the inlined markdown render as actual diagrams in the dashboard — same Mermaid that GitHub/Confluence render.

## [0.2.2] — 2026-05-24

### Changed
- **`docs/dashboard.html` now gitignored by convention.** Added to the Compass framework's root `.gitignore` and documented the same recommendation in `SETUP.md` for consuming projects. First real `/dashboard` run produced a ~2500-line HTML file inlining 9 artifacts; every `/scan`, `/plan`, `/metrics`, `/status` rewrites it. Committing produced large, non-meaningful diffs that grow linearly with project size and risked review fatigue masking real template bugs.

### Added
- Explicit rule in the dashboard workflow notes + improvements log: **gitignore only pure views derived from other tracked files with no user-relevant state of their own.** Dashboard fits; other living artifacts (`plan.md` with refinement log, `scan-report.md` with suppressions, dated metrics snapshots, `status.md` history) stay tracked because they carry user state.
- Root `.gitignore` created (didn't exist before).

## [0.2.3] — 2026-05-25

### Changed
- **`/dashboard` workflow now forbids silent summarization.** First real `/dashboard` run in a consuming project (aura-app) produced a 42 KB HTML file with 4 of 9 artifacts silently summarized ("executive summaries of the larger sections") to "keep file size manageable." That's a spec violation, not an optimization — summaries make the dashboard a second source of truth that drifts from the underlying markdown. Workflow step 7 now says verbatim is **load-bearing**: do NOT summarize, do NOT truncate, do NOT reword (even for clarity). The only permitted transformation is escaping `</script>` to `<\/script>` inside inlined content.

### Added
- New Verification item in `/dashboard`: every inlined artifact must match source byte-for-byte. Spot-check by `diff`-ing inlined blocks against source `.md` files.
- New anti-pattern in dashboard workflow Notes: "Silent summarization is the failure mode." Names the framing trap ("small file is reviewable") and points at `/dashboard --summary` as a future opt-in if size genuinely becomes a problem.

### Notes
- **No `--summary` flag added yet.** Deferred until real friction emerges at very large project scale (30+ bets, hundreds of artifacts). Don't pre-build escape hatches before the constraint has been tested.
- **No other workflows touched.** `/scan`, `/metrics`, `/plan`, `/status`, `/advance`, `/create-bet-portfolio` are unaffected; the fix is strictly inside `dashboard.md`.

## [0.2.4] — 2026-05-26

> Two fixes from real-world aura-app friction, both same anti-pattern shape (load-bearing checks that weren't load-bearing in the spec).

### Changed
- **`/build` Phase 2 step 7 + Engineer Definition of Done now require a green production build** (`pnpm build` or framework-equivalent) before opening a PR. Typecheck + unit tests genuinely can't see bundling errors, dead-import elimination, env-var requirements, asset pipeline issues, or monorepo workspace resolution. Real PR from aura-app shipped because these checks weren't required.
- **`/create-bet-architecture` gained a foundational-stack deviation gate** (new step 7). If a bet introduces tools/services/frameworks/data stores/runtimes/dependencies not in `docs/foundation/architecture.md` Stack table, the Architect **must refuse to draft bet architecture** and tell the user to run `/setup-foundation-architecture` in amend mode first. Foundational scope decisions live at foundational level by design; bet architecture is constrained to operate within the foundational stack.
- **`/setup-foundation-architecture` Phase A gained a 4-category signal-consultation step** (production observability / recent PR feedback / prior architectural decisions across bets / bet-architecture deviation pressure). Especially load-bearing for amend flows. Each category produces a citation OR explicit "n/a — <reason>" note. Mirrors Researcher 6-category and Architect 6-pillar enforcement shape.
- **Architect role's Input and Definition of Done** updated to reference the foundational Stack table as canonical and require an explicit "no deviation from foundational stack" assertion (or escalation note).

### Added
- New **`ADR / Amendments` section in `foundation-architecture.md` template** — Architecture Decision Record entries with structured shape (Triggered by / What changed / Why / Reversibility / Cited signal). Required to have ≥1 entry for any foundational version > 1. The foundational arch IS the ADR ledger; no separate ADR file convention.
- Phase A Verification gate items: signal consultation present across all 4 categories; ADR / Amendments entry required when version > 1.

### Fixed
- Closed the "Architect quietly widened the foundational stack inside a bet doc" failure mode. Bets that need new tooling now hit a refuse-and-escalate path that produces a proper foundational ADR — drift becomes structurally impossible without a recorded decision.
- Closed the "Architect made recommendations without consulting available signal" failure mode. Same anti-pattern shape as Researcher v0.1.9 (log-and-walk-away) and dashboard v0.2.3 (silent summarization): soft spec → agent rationalization → fix is making the constraint load-bearing + adding verification + naming the anti-pattern.

## [0.2.5] — 2026-05-26

> Three fixes from real-world aura-app friction (13 issues triaged → 3 Compass-relevant gaps; the other 10 were app-specific Expo/pnpm/Metro tooling concerns).

### Added
- **`/build` step 7 + Engineer DoD gained a runtime-config audit.** All public-namespace env vars (`*_PUBLIC_*` / `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` / `VITE_*` / etc.) must have explicit values for the target deploy environment. Dev-only defaults (`localhost`, mock-mode toggles) must **fail loudly at module load** rather than silently fall back. Catches the "default works in dev, app boots into broken state on real device / deployed function" failure mode that prod-build can't see.
- **`/setup-foundation-architecture` Phase B gained a deploy-canary gate** (new step 16). After scaffolding completes, deploy a hello-world from the freshly scaffolded repo to the target environment. URL captured in `compass/config.yaml` under `ci_cd.deploy_canary_url`. If deploy fails, return to Phase A with an ADR entry naming the cause — the architecture doesn't actually deploy yet. Catches the "Turborepo + pnpm + Vercel doesn't compose; doubled output path; missing pnpm-lock; no Next.js detected" multi-round-debug failure mode that burns days mid-project.
- **New scanner check `PROD_READY-09`: Vendor capability claims unverified for deployment context** (High severity, suppressible with DRI). Every vendor feature the architecture depends on — DB extensions, region-specific services, plan-tier features, SDK capabilities — needs a doc citation that confirms availability for the *specific* deployment context (region, SKU, plan-tier, runtime version). Not "Supabase has it" if you mean "Supabase US-East has it." Catches the `pg_uuidv7 missing in ap-south-1` class of failure.
- `compass/config.yaml` `ci_cd` section gained `deploy_canary_url` field.

### Changed
- Phase B Verification gate updated to require deploy-canary green before workflow completes.
- Production Ready scanner check count: 8 → 9.

### Notes
- **Out of scope (per user):** the other 10 aura-app issues — Babel runtime / Metro module resolution / React 18 vs 19 / Expo SDK pinning / pnpm strict isolation interactions — are app-specific tooling choices, not Compass's concern.
- **Deferred:** "stack composition matrix" (issues #1, #2, #4, #5, #8 reveal a meta-pattern of foundational stack choices not composing). The deploy-canary gate catches most of this at integration time; revisit if it doesn't catch enough.
- **Same anti-pattern as v0.2.4:** load-bearing checks that weren't load-bearing in the spec. Fix shape is consistent — explicit constraint + verification gate + named anti-pattern.

## [0.2.6] — 2026-05-26

> Story template gained a Standard Experience Checklist after a missed back-button shipped in aura-app and led to a UX-cleanup mini-bet. Surfaced a Compass gap I initially miscategorized as "app-specific" — user correctly identified it as a story-AC structural omission.

### Added
- **`compass/templates/story.md` gained a "Standard Experience Checklist" section** between Acceptance Criteria and Tech notes. Six categories that PM must address when writing the story — each either covered by ≥1 AC item OR explicitly marked `n/a — <reason>`:
  - **Navigation** — back / exit / cancel / dismiss paths for every navigable surface
  - **States** — loading / empty / error / success / disabled each has an AC
  - **Feedback** — error type discrimination + success acknowledgment + destructive confirmation
  - **Accessibility** — focus management + keyboard nav + screen reader labels
  - **Edge cases** — offline / slow network / permissions-denied / missing-data
  - **Cross-surface consistency** (multi-target stacks) — behavior matches across surfaces
- Same `cite-or-mark-n/a` enforcement shape as Researcher 6-category, Architect 6-pillar, signal-consultation 5-category.

### Changed
- **`/create-story` step 7 now requires the Standard Experience Checklist filled** before the story can reach `status: ready`. Empty categories (no AC reference AND no `n/a` note) block the gate.
- **New refusal case in `/create-story`:** "Standard Experience Checklist has any empty category."
- **Designer role DoD** gained explicit "coordinate with PM on Standard Experience Checklist" — design completeness and story-AC completeness must match. If something's in the Figma but not in the AC, it ships missing.
- **UX Writer role DoD** gained explicit "error copy discriminates error type" — generic "something went wrong" or mislabelling validation as "network errors" fails the Feedback category.

### Fixed
- Closed the **story-AC-omission failure mode**: Designer drew the back button; the story's AC didn't say "back navigation present"; Engineer didn't implement; Codex E2E didn't test; shipped without. The new checklist makes "covered in design but missing from AC" structurally impossible at story-creation time.
- Closed the **error-message-quality omission**: aura-app's Passkey screen showed misleading "network" errors when the actual failure was passkey-specific. New checklist's Feedback category forces error-type discrimination in the AC, which forces Engineer to implement type-specific handling and UX Writer to draft type-specific copy.

### Notes
- **Aura-app trigger:** PM was correct that the UX cleanups weren't just "app-specific" — they revealed a structural gap in story AC completeness. I initially miscategorized; user corrected.
- **Out of scope (deferred from earlier triage rounds):** team playbooks signal-consultation category, stack-aware canary artifact, cross-story E2E pattern. Each warrants its own focused patch.

## [0.2.7] — 2026-05-26

> Two improvements promoted from earlier deferrals after the aura-app 2026-05-26 state-of-play update gave direct evidence both gaps were real.

### Added
- **Stack-aware canary artifacts.** `compass/config.yaml` `ci_cd.deploy_canary_url` (single string) → `ci_cd.canary_artifacts[]` (list of `{kind, url, verified_at, notes?}`). Kinds: `web | mobile | container | other`. Multi-target projects (web + mobile + service + …) now require one canary entry per target. Catches the "web canary green, mobile canary missing" failure mode that blocked aura-app's AC4 on the first feature bet.
- **Team playbooks signal-consultation category.** `/setup-foundation-architecture` step 6 signal consultation gained a 5th category — search `docs/playbooks/*` for prior stack-specific learnings; cite or mark `n/a — empty directory` (valid for first-project bootstrap). Mandatory citation once the team has accumulated playbooks across projects. Same `cite-or-mark-n/a` enforcement shape as the prior 4 categories (Researcher 6, Architect 6, signal-consultation now 5, story standard-experience 6 — **5th instance of the pattern; codify in AGENTS.md when a 6th lands**).
- **New `docs/playbooks/` convention** — per-stack-combo or per-topic learnings, distinct from per-bet runbooks and per-incident postmortems. Living artifacts; `last_validated` date bumped each re-use.
- **New template `compass/templates/playbook.md`** — frontmatter with `stack_combo` tags, `related_bets`, `last_validated`; sections: When this applies / Symptoms / Steps / Gotchas / References / Maintainer note.
- **`/measure` Phase 4 step 11a soft prompt** — when a bet's outcome resolves with notable technical learnings, prompt for playbook capture while the learning is freshest. Soft prompt, not gate.
- **Foundation architecture template** Boundaries/Scaffolding now creates `docs/playbooks/` as an empty directory (with a README pointing at the template). Stays empty until learnings accumulate.

### Changed
- **`/setup-foundation-architecture` Phase B step 16** rewritten from single-URL deploy-canary to **multi-target deploy canaries** — one per deploy target in the foundational stack. Phase B Verification updated to require every target in `canary_artifacts[]` with `verified_at` populated; partial coverage fails.
- **`/setup-foundation-architecture` Phase A Verification** updated: signal consultation is now 5 categories (was 4).

### Notes
- **aura-app evidence** for both improvements: AC4 dev-build sprint (Improvement 1); proposed 3 runbooks (`pnpm-monorepo-rn`, `vercel-pnpm-monorepo`, `expo-go-vs-dev-build`) framed as "captures today's learnings for the next Compass project" (Improvement 2).
- **Out of scope (still deferred):** cross-story E2E pattern; stack composition matrix; playbook-coverage scanner check.

## [0.2.8] — 2026-05-26

> **Framework self-instrumenting.** First patch about Compass's own learning cadence rather than a specific workflow gap. Codifies the foundational pattern shaping ~70% of the framework's 15 prior improvements; institutes retro cadence; backfills 3 retros covering all prior work.

### Added
- **New `/retro` workflow + Scanner-role skill + `compass/templates/retro.md`.** Periodic batch retro of improvements, fires every 5 entries in `compass/workflows/improvements.md`. Reports patterns (positive), recurring anti-patterns (soft-spec-rationalization surfaces), convention candidates, drift signals, watch-for list. **Reports — does not prescribe.** No HITL gate.
- **New `compass/workflows/retros/` directory convention** — archived retros (`status: archive`, immutable once written).
- **Three backfilled retros covering improvements 1-15:**
  - Retro #001 (v0.1.8 → v0.1.12) — surfaced N-category, refuse-escalate, soft-spec-recipe as convention-ready at improvement #5.
  - Retro #002 (v0.1.13 → v0.2.2) — surfaced `status: living`, state-detection-table, auto-trigger-chain. Major capability expansion.
  - Retro #003 (v0.2.3 → v0.2.7) — confirmed soft-spec-rationalization at 18+ cumulative instances; flagged `/advance: 0 uses` drift signal; flagged aura-app trigger-origin concentration risk.
- **Three new cross-cutting principles in AGENTS.md** (now 16 principles, was 13):
  - **#14 (foundational): Soft spec → AI rationalization is a vulnerability surface, not flexibility.** User's verbatim formulation: *"Anywhere an AI agent has interpretive room, it will exercise judgment that diverges from intent. The fix is never 'tell the AI to be better' — it's explicit constraint + mechanical verification gate + named anti-pattern in the workflow file."* This is the foundational principle that #15 and #16 instantiate. ~18 instances across the framework's history. Worst convention-discovery lag observed (17 improvements between visible and codified).
  - **#15: N-category `cite-or-mark-n/a` enforcement** for structured consultation. 5+ instances (Researcher 6, Architect 6-pillar + 6-research, Architect signal 5-category, Story standard-experience 6, playbook frontmatter).
  - **#16: Refuse + escalate to upstream artifact.** 5+ instances (Researcher refuse, HITL before scaffold, data model before DB, bet-arch deviation gate, Story Standard Experience gates `status: ready`).
- **`compass/workflows/improvements.md` header** now tracks retro cadence + next-retro-fires-after counter (currently #20).

### Changed
- **AGENTS.md workflow count:** 17 → 18 (`/retro` added). Cross-cutting principle count: 13 → 16.

### Notes
- **Meta-observation:** The convention-discovery lag of v0.1.8 → v0.2.8 (17 improvements to name the dominant pattern) was the worst it will ever be. Every retro from here forward should shrink it.
- **The user's verbatim formulation is preserved in Principle #14.** The user crystallized the pattern more precisely than the framework had named it; honoring the wording maintains attribution and accuracy.
- **First *live* retro fires after improvement #20** (v0.2.8 is improvement #16; 4 more entries needed before automatic fire). The retro workflow as-written will meet reality then; today's backfilled retros are the proof-of-shape.
- **No new role added.** Retros are owned by Project Manager (for project retros) or framework-Architect persona (for framework retros — Compass on Compass). Existing roles cover the work.

## [0.3.0-alpha] — 2026-05-26

> **Two-part alpha for the v0.3 line.** Part 1: `/advance` deprecated (first retro-driven decision, framework subtracts surface). Part 2: workflow hardening template established + `/setup-product` translated as the first validation. Together these establish v0.3 as the *hardening-by-structure* line — every workflow eventually translates to the gate/work/postcondition template.

### Part 1 — `/advance` deprecated

> First action on a retro-surfaced drift signal. Convention-discovery lag = hours, not 17 improvements. Principle #14 applied recursively to framework design.

### Changed
- **`/advance` workflow deprecated.** Retro #003 (shipped in v0.2.8) flagged `/advance: 0 uses in aura-app over 4 days of active dev` as a drift signal. The framework was over-engineering a "canonical phase advance" command that real users don't invoke — phase transitions happen naturally via status-field flips, and the auto-trigger chain (`/advance` → `/plan` → `/scan` → `/dashboard`) was load-bearing in the spec but irrelevant in practice. **This is itself an instance of Principle #14 applied to framework design** — the framework designer rationalized that a canonical advance command was needed; reality showed it wasn't.
- **`compass/workflows/advance.md`** rewritten with deprecation notice at top + migration table + historical Process section preserved for archaeology. Skill registered (don't fail silently) but the workflow now prints the migration table on invocation rather than performing any phase advance, scan, or refresh.
- **Auto-chain references removed** from active surface across `/plan`, `/scan`, `/dashboard`, `/status`, `/create-bet-portfolio`, `/build`, Project Manager role, Scanner role, scan-report template, brief template, plan template, and `/plan` + `/scan` skill descriptions. What remains independent of `/advance`: `/build` phase-boundary auto-invocation of `/scan`; `/dashboard` auto-refresh from `/scan` + `/plan` + `/metrics` + `/status`; cron-driven `/scan` per `compass/config.yaml`.
- **AGENTS.md workflow table:** 18 → 17 (removed `/advance` row).
- **README.md flow diagram:** removed the "Navigate" bucket (which had `/advance` as its only member); now 4 buckets (Bootstrap / Plan / Execute / Observe). Added note: phase transitions are direct `status:` field flips — no canonical "advance" command.
- **CLAUDE.md + SETUP.md:** removed `/advance` references.

### Migration

| What you used to do | What to do now |
|---|---|
| `/advance` to move to next phase | Flip the artifact's `status:` field directly (`proposed` → `approved` → `in-build` → `shipped` → etc.) |
| `/advance` to refresh the plan | `/plan` directly |
| `/advance` to run the scanner | `/scan <bet-id>` directly (auto-invoked at `/build` phase boundaries) |
| `/advance` to refresh the dashboard | `/dashboard` directly (auto-invoked by `/scan`, `/plan`, `/metrics`, `/status`) |
| `/advance` to see current state | `/status` directly (auto-refreshes `/dashboard`) |

### Notes
- **No replacement command.** The whole insight from the drift signal is that this command was unneeded. Replacing it with a renamed equivalent would re-introduce the same loophole.
- **Drift-signal-to-action lag = hours.** Retro #003 (shipped 2026-05-26) → v0.3.0-alpha (same day). The retro cadence's promised lag-shrinking is real on its first try.
- **Files NOT touched:** all 3 retro archives, historical CHANGELOG entries (v0.1.14 through v0.2.8), historical improvements.md entries — they reference `/advance` as an active workflow because it *was* active when they were written. Editing history retroactively would violate the archive-immutability convention established for retros.
- **`scanner.per_phase` config + `blocking_advance` field on scan reports retained** — they're informational signal for users reading scan reports, not enforcement mechanisms tied to `/advance`. The user (or `/build`) consumes them to decide whether to advance.

### Part 2 — Workflow hardening template + framework grounding + `/setup-product` translated (first validation)

### Added
- **Workflow hardening template established.** New `compass/templates/workflow-template.md` defines the gate/work/postcondition structure every v0.3+ workflow adopts. Sections: Header (status / owner / auto_invokes / invoked_by / version) · **Framework grounding** · Purpose · Workflow-level Preconditions (GATE) · Roles invoked · Steps as gate/work/postcondition triplets · Verification checklist (final GATE) · Output summary contract · Notes (anti-patterns + edge cases + migration). Template includes inline `<!-- … -->` commentary so future translators inherit intent.
- **New required template section: Framework grounding.** Every v0.3+ workflow cites the canonical frameworks it operationalizes (industry standards with year + source; books with author/title/year; Compass-originals honestly labeled; cross-cutting principles enforced). Anchors each workflow's gates in auditable lineage rather than ad-hoc invention.
- **`compass/framework/canon.md` created** — reference doc with one-paragraph entries for canonical frameworks Compass cites. Sectioned: Strategy/discovery foundations · Competitive position · Bet-based commitment · Communication discipline · Goal-setting · Compass-original patterns. Short-form citations from workflows (`[working-backwards]`, `[helmer-7-powers]`, `[okrs]`, etc.) resolve to canon entries.
- **`/setup-product` hardened as first translation.** `compass/workflows/setup-product.md` rewritten to template shape with full Framework grounding section. **Structural change only — same steps, same artifacts, same HITL gates, same refusal cases.** Implicit preconditions made explicit; missing postconditions added; Verification items reference Principles #14 / #15 / #16 specifically.
- **`AGENTS.md` new section "Workflow structure"** — explains the gate/work/postcondition pattern, points at `compass/templates/workflow-template.md` as canonical, articulates the hardening rollout, **and codifies the density-based budget**: hardened workflows checked by load-bearing density (≥ 1 per ~4 lines), not raw length.

### Changed
- **Hardening budget recalibrated from raw length to load-bearing density.** Original heuristic ("hardened workflow ≤ 40% longer; 2x = hard fail") was a proxy that didn't survive first contact: hardened `/setup-product` is **161 lines = 2.24x original (72 lines)**, but **density rose from 1 per 3.6 lines (original) to 1 per 3.2 lines (hardened)**. Raw length grew because new sections (Framework grounding, Roles invoked, per-step Postconditions, Migration) added load-bearing content — not ceremony. The recalibrated check: does each line earn its place by adding mechanically-checkable constraint, named convention, or auditable lineage? Density measure documented in AGENTS.md "Workflow structure" and `compass/workflows/improvements.md`.

### Notes
- **`/setup-product` picked first** because it was already the most-disciplined workflow (had Verification gate from v0.1.9, named anti-patterns inline). Low translation risk → ideal for validating the template on the easy case before harder workflows (`/build`, `/create-brief`) translate.
- **No behavior changes.** Diff against v0.2.8 setup-product confirms: same 9 steps in the same order, same artifacts (`docs/foundation/product.md` + optional `docs/foundation/research.md` + `docs/status.md` update), same HITL gate, same refusal cases (now expressed as workflow-level Preconditions).
- **`canon.md` is reference material, not an essay.** Each framework gets one paragraph (name, originator, year, one-sentence contribution). Additions follow the same shape.
- **v0.3 hardening rollout will proceed one workflow per session, deliberate pace** — per the slow-pace commitment from this conversation. Next candidate likely `/create-brief` (less disciplined, tests template against weaker baseline + against the density measure on a different workflow shape).

## [0.3.14] — 2026-06-04

> **Agents become self-sufficient, surface-independent units — `[agent-as-surface-independent-unit]` codified as the 12th Compass-original (7th pattern shape, 1st architecture-discipline class member).** New `compass/agents/` directory ships with 3 self-sufficient agent files (`pm.md`, `researcher.md`, `engineer.md`); `/setup-product` workflow refactored to a thin dispatch graph that sequences `<agent>.<task>` references; `CLAUDE.md` slimmed dramatically from role-authority document to host-runtime-notes only; `config.yaml.tool_assignments:` formally deprecated (grace-period kept through v0.3.x, removed in v0.4). **Minimum viable scaffolding to unblock new-project kickoff under the v0.4 cross-host architecture** — PM / Researcher / Delivery Manager / UX on ChatGPT, Engineer + Architect on Claude Code, Reviewer + Security Reviewer on Codex. Same agent files work on any LLM host; host becomes a runtime, not a role authority.

### Added

- **`compass/agents/` directory created** with 3 self-sufficient agent files. Each file is structured per the surface-independent spec: YAML frontmatter (`name`, `preferred_hosts:`, `required_tools:`, `optional_tools:`, `participates_in_workflows:`, `version:`) → Identity → Core principles (INLINED — must hold without external file load) → Tasks owned (gate/work/postcondition per task; inputs/outputs/handoffs declared) → Refusal rules → Framework knowledge (REFERENCED — fetch from `canon.md` if host has access; operate degraded otherwise) → Output summary contract → Anti-patterns → Host capability degradation table.
  - **`compass/agents/pm.md`** — PM agent owning tasks `setup-product-foundation` (full gate/work/postcondition for `/setup-product` PM steps; 3 mandatory Access & Data Posture elicitations inlined), `draft-brief`, `decompose-bet-to-story`, `arbitrate-dispute`. `preferred_hosts: [chatgpt, claude, codex, gemini]`. Required tools: `text_input`, `web_search`, `github_write_artifact`. Optional: `mcp_confluence`, `mcp_jira`, `mcp_gdrive`, `mcp_notion`, `mcp_linear`. Participates in: `setup-product`, `create-bet-portfolio`, `create-brief`, `create-story`.
  - **`compass/agents/researcher.md`** — Researcher agent owning task `cite-evidence-6-category-9-moat` (6-category research framework + 9-moat classification inlined verbatim; mandatory moat evaluation for foundational product bets with verdict + rationale per row). `preferred_hosts: [chatgpt, claude, codex, gemini]`. Participates in: `setup-product`, `create-bet-portfolio`, `create-brief`, `create-bet-architecture`.
  - **`compass/agents/engineer.md`** — Engineer agent owning tasks `implement-story`, `fix-bug`. `preferred_hosts: [claude, codex, gemini]` (CLI-class hosts with filesystem + shell access — pure-chat hosts are degraded). Required tools: `filesystem_read`, `filesystem_write`, `shell_exec`, `git`, `github_write_artifact`. `[mechanical-output-verification]` discipline inlined (Next.js 16+ functions-config-manifest.json check, pre-v16 middleware-manifest.json cross-check, etc.). Participates in: `build`, `fix`, `ops`, `triage`.
- **`compass/framework/canon.md` gained `[agent-as-surface-independent-unit]` entry** as 12th Compass-original. Names `host-coupled-role-definition` as the anti-pattern it closes. **First architecture-discipline class member — introduces 7th pattern shape** in the catalog. Body cites 3 instances at codification: (1) config.yaml `tool_assignments:` audit reaffirming v0.3.8's foreshadowed gap; (2) CHATGPT.md proposal collapse on its own logic; (3) v0.4 multi-host orchestration vision (v0.3.12 spec target). Forward links named: `[task-ownership-locality]` and `[workflow-as-dispatch-graph]` (both candidates surfaced in v0.3.14 design — each at 1 instance, codify after 2nd). **Catalog: 7 shapes / 12 patterns:** enforcement (4) · interaction (1) · freshness (1) · observability (1) · handoff (2) · scope-discipline (2) · **architecture-discipline (1 — this)**.

### Changed

- **`compass/workflows/setup-product.md` refactored from 169-line full methodology body → thin dispatch graph (~140 lines, mostly headers + verification + notes; step BODIES moved out).** Heavy gate/work/postcondition content moved INTO `compass/agents/pm.md` (task `setup-product-foundation`) and `compass/agents/researcher.md` (task `cite-evidence-6-category-9-moat`). Workflow file now declares: (1) workflow-level preconditions, (2) dispatch graph (ordered `<agent>.<task>` invocations + HITL gates), (3) workflow-level verification (cross-agent invariants). **Behavior unchanged.** Every refusal case, gate, and verification item preserved — now distributed across agent task files where they belong. Workflow version bumped 0.3.0-alpha → 0.3.14. **Project Manager Step 4 (`/setup-product` Step 9 legacy) still references `compass/roles/project-manager.md`** as interim — agent migration deferred to v0.3.15+.
- **`CLAUDE.md` slimmed dramatically** from role-authority document to host-runtime-notes only. Old content "you play every Compass role EXCEPT Reviewer/Security Reviewer" REMOVED — role authority now lives in agent files (`preferred_hosts:` per agent). Reading discipline updated: "When invoked with a workflow command, read the workflow dispatch graph, then load the agent file for the current step from `compass/agents/<agent>.md`." Refusal rules section pruned to host-runtime-generic rules (don't amend commits, don't force-push, don't skip hooks, don't commit secrets). Per-task refusal rules (don't review your own code, don't paraphrase UX Writer copy, don't improvise architecture) moved to agent files. Claude-specific tool preferences kept (Read over fetch, Edit over Write, Bash for long-running, GitHub MCP if connected). Cross-host review independence preserved structurally — Reviewer agent (when migrated v0.3.15+) will declare `preferred_hosts: [codex, gemini]` excluding claude. Until then, legacy `.codex/prompts/` + `compass/roles/reviewer.md` + `compass/roles/security-reviewer.md` remain Codex-assigned.
- **`README.md` updated** to reflect v0.3.14 architecture. "What Compass is" section names `compass/agents/<agent>.md` as source-of-truth + enumerates host surfaces (ChatGPT Custom GPT Instructions, Claude session, Codex prompt, Gemini, CrewAI / LangGraph). Core ideas — "Roles, not job titles" bullet replaced by two bullets: "Agents own tasks; workflows sequence agents" + "Surface-independent by design" (covers `preferred_hosts:` mechanism, human-dispatched cross-host mode today, v0.4 orchestrator vision, Reviewer ≠ Implementer preserved, `tool_assignments:` deprecation note).
- **`AGENTS.md` propagated to v0.3.14 architecture.** Multiple sections updated to derive from agent files rather than `tool_assignments:`: (1) Top of file — directory listing names `compass/agents/` as primary; `compass/roles/` marked legacy. (2) "Tool division of labor" renamed to "Host division of labor" — registry framing replaced with per-agent `preferred_hosts:` framing; legacy v0.3.8 paragraph marked as deprecated (grace-period support). (3) "The 13 roles" table renamed "The 13 agents / roles" with migration-status column. (4) Patterns section gained `[agent-as-surface-independent-unit]` description; catalog totals updated to 7 shapes / 12 patterns. (5) "When you're unsure" reading-discipline lines updated to point at agent files first, role files as legacy fallback. The propagation closes the deferred prose-derivation gap that `[agent-agnostic-role-assignment]` v0.3.8 named explicitly ("downstream prose still hardcodes the Claude+Codex split in ~10 files; this AGENTS.md section being the first to derive from config"). v0.3.14 is the first time AGENTS.md derives from the new source-of-truth (per-agent `preferred_hosts:`) instead of the deprecated `tool_assignments:`.
- **3 migrated role files signposted as superseded.** `compass/roles/pm.md`, `compass/roles/researcher.md`, `compass/roles/engineer.md` each gained a top-of-file warning banner: pointer to the agent file as source-of-truth; named workflows that still load this legacy file (unmigrated workflows that haven't refactored to dispatch-graph shape); explicit "agent file wins on divergence"; "removed in v0.4" deadline. **No content deleted** — banners only; legacy bodies intact for the unmigrated workflows still loading them.

### Decided

- **L2 dissolves into v0.4.** v0.3.13 CHANGELOG declared L2 (`compass://` protocol handler + Compass CLI for one-click workflow execution) as the v0.3.14 target. v0.3.14 shipped the architectural pivot to `[agent-as-surface-independent-unit]` instead. **Post-pivot review of L2 surfaced that its dispatch contract was always going to be v0.4-shape** — pre-pivot L2 was framed as "CLI dispatches to a generic orchestration runtime (CrewAI/LangGraph)"; post-pivot the runtime contract is precise (walk dispatch graph → per step, look up agent's `preferred_hosts:` → call host's API with agent file as system prompt). The L1.5 intermediate was cosmetic; v0.4 absorbs L2's content. **v0.3.15+ continues incremental agent migrations** (project-manager / "Delivery Manager" naming first per v0.4 spec target; then designer, ux-writer, architect, enterprise-architect, reviewer, security-reviewer, scanner, tech-writer, support; refactor each owning workflow to dispatch-graph shape). **v0.4 ships the orchestrator**: LangGraph integration recipe per `[declare-not-implement]` (agent files map directly to LangGraph nodes; dispatch graphs become LangGraph graphs; HITL gates become checkpoints) + `compass://` protocol handler as orchestrator entry point + dashboard Actions tab buttons firing those URLs + per-host dispatch + per-host cost tracking (Finance pillar). **1 commitment slip** (L2 originally targeted v0.3.14; now v0.4). Defensible — the architectural pivot is what made L2's contract precise enough to build; building L2 to its v0.3.13 framing would have shipped a CLI dispatching to a nonexistent runtime. **Not yet a `[hard-line-declaration]` instance** (2-slip threshold for hard-line treatment); worth tracking. **Watch for codification-candidate weakening:** `[L-layered-progressive-rollout]` (Retro #006 candidate, 2 instances: v0.3.13 dashboard L1/L2/L3 + v0.3.7 freshness pull-bridge rounds 1/2/3) drops to 1 instance with the L2 dissolution. Re-examine codification readiness when next 2-instance pattern surfaces.

### Deprecated

- **`compass/config.yaml` `tool_assignments:` block formally deprecated.** Block remains for v0.3.x grace period as legacy override mechanism; **removed in v0.4.** Replacement: per-agent `preferred_hosts:` in agent file YAML frontmatter (source-of-truth). The audit confirming `tool_assignments:` was documentation-only (zero programmatic reads; 10 files hardcode Claude+Codex split in prose) was foreshadowed in `[agent-agnostic-role-assignment]` v0.3.8 entry and reaffirmed in 2026-06-04 user-driven cross-host-shift conversation. The same audit is now cited as Instance #1 in the new `[agent-as-surface-independent-unit]` canon entry.

### Notes

- **12th Compass-original codified · 7th pattern shape introduced · 1st architecture-discipline class member.** Catalog grows from 6 shapes / 11 patterns (post-v0.3.10) to 7 shapes / 12 patterns. **Architecture-discipline shape is distinct from scope-discipline** — scope-discipline governs what Compass declares vs delegates (declare-not-implement, hard-line-declaration); architecture-discipline governs the structural composition of agents / workflows / hosts. Different scope; same family (meta-discipline about framework shape, not workflow execution).
- **Release class:** Compass-original codification + capability-extension (extends `compass/agents/` directory + refactors first workflow). Two-class release, consistent with v0.3.13's two-class pattern. 7 release classes named (taxonomy stable since v0.3.13).
- **What this kills structurally:** (1) `CLAUDE.md` (and would-be `CHATGPT.md` / `CODEX.md` / etc.) owning role authority — they become thin runtime-notes. (2) `config.yaml.tool_assignments:` as routing config — deprecated; agents own their host preference. (3) Per-host role definition duplication — single agent file is the canonical source.
- **What this enables:** (1) Cross-host orchestration without host-wrapper proliferation. (2) CrewAI / LangGraph / AutoGen orchestrator drops in naturally (agent files map directly to their agent definitions). (3) Adding a new agent = write one file (no CLAUDE.md edits, no config.yaml routing). (4) Forking agents (Senior PM, domain-specialized Researcher) = copy + edit. (5) Surface-independent paste-into-any-host operation — paste `pm.md` into ChatGPT Custom GPT Instructions OR Claude session OR Codex prompt → it works.
- **Migration path:** v0.3.14 ships 3 agents (pm, researcher, engineer) + 1 refactored workflow (`/setup-product`) — the minimum to unblock the new-project kickoff with cross-host architecture (PM / Researcher / UX on ChatGPT, Engineer on Claude Code). **Other 10 agents migrate as the new project surfaces need** (v0.3.15+): project-manager, designer, ux-writer, architect, enterprise-architect, reviewer, security-reviewer, scanner, tech-writer, support. **Other 13 workflows refactor as their owning agents migrate.** Legacy `compass/roles/<role>.md` files kept during v0.3.x grace period as content sources for unmigrated agents — removed in v0.4 once all agents migrated. **Dispatch graph references stay stable across migrations** — `project-manager.update-status` in `/setup-product` Step 4 works whether `project-manager` is an agent file (v0.3.15+) or a legacy role file (today).
- **Forward-link candidates surfaced in v0.3.14 design:** `[task-ownership-locality]` (one task = one owner agent) and `[workflow-as-dispatch-graph]` (workflows are thin dispatch contracts, not methodology bodies). Each at 1 instance — codify after 2nd per Compass rule.
- **Watch for in new-project usage:** (1) Do Custom GPT Instructions fit within OpenAI's ~8000-char limit when an agent file is pasted? — informs hybrid-inlining trade-off (more reference, less inline). (2) Does the cross-host handoff between PM Custom GPT and Claude Code feel discontinuous? — informs L2 protocol-handler priority. (3) Do agents on ChatGPT actually fetch `canon.md` from GitHub when Knowledge / connector available? — informs whether framework-reference fetch is reliable vs needs more inlining. (4) Are the dispatch graphs readable without the agent task definitions? — informs whether workflow file slimming went too far.
- **Counter ticks to #31. Next retro fires after #35** (Retro #007). Per `[hard-line-declaration]` (canon v0.3.10) — counter visibility creates structural pressure. Hard line still in effect from Retro #006: if Retro #007 slips, treat as 2nd retro-cadence regression; deepen `[hard-line-declaration]` mechanism (counter visible in dashboard Actions tab as Retro #006 suggested).
- **Cadence:** 14 sessions, 10 Compass-originals + 5 non-codification releases (v0.3.7 infrastructure · v0.3.11 artifact-pruning · v0.3.12 architectural-direction · v0.3.13 capability-extension · v0.3.14 codification + capability-extension hybrid). Substantive-progress-per-session holds.

## [0.3.13] — 2026-06-02

> **Dashboard becomes the orchestrator entry point — Actions tab with clipboard-copy buttons ships as L1 of the v0.4 spec target (v0.3.12).** `docs/dashboard.html` gains a 7th "Actions" tab containing project state summary · pending HITL gates · quick-action workflow launchers (grouped by Create / Build / Observe semantics) · Finance summary if cost data exists. Solopreneur opens browser bookmark → sees what's next → clicks a button → command copied to clipboard with visual feedback → pastes into ChatGPT / Claude.ai → Compass-aware AI runs the workflow → outputs commit back to repo → dashboard regenerates. **First concrete user-facing v0.4-shaped deliverable.** No CLI required; no infrastructure; no new dependencies; works today.

### Added

- **`compass/templates/dashboard.html.template` gained 7th "Actions" tab** — `<button role="tab" data-tab="actions">` is now the **default initially-active tab** (changed from Foundation) so the dashboard opens directly to the orchestrator surface. Matching `<section role="tabpanel">` with `<!-- COMPASS-INSERT:actions-block -->` marker. New CSS classes (`.action-section`, `.action-btn`, `.action-row`, `.hitl-gate`, `.finance-summary`, `.project-state`, `.action-help`) reuse existing design-system CSS variables (`--fg`, `--border`, `--accent`). New vanilla JS function `compassCopy(command, button)` uses `navigator.clipboard.writeText()` API with two-state visual feedback (`copied` class → green "✓ Copied!" message for 2s; `failed` class → red error fallback for 3.5s if Clipboard API unavailable). **No new CDN dependencies; no new framework.**
- **`compass/workflows/dashboard.md` gained step 8 "Populate the Actions block"** between artifact-inlining (step 7) and empty-tab fallback (step 9). Four sub-sections specified: (8a) project state summary — computed from artifact existence + statuses; (8b) pending HITL gates — scan artifacts for `status: proposed` frontmatter; (8c) quick-action workflow launchers grouped by Bootstrap / Create / Build & ship / Observe & report semantics with state-aware visibility; (8d) Finance summary if `docs/usage/current.json` exists (omit entirely if missing — do not fabricate). Recommended action grouping documented as HTML with `compassCopy()` clipboard-copy handlers. **Seven new verification checklist items** for Actions tab presence + initially-active state + COMPASS-INSERT marker resolution + minimum launcher button presence + clipboard-copy JS presence + HITL-gate conditional rendering + Finance summary conditional rendering. Workflow preamble updated to note dashboard's dual role: viewer AND orchestrator entry point.
- **`AGENTS.md` Workflow Structure section gained note** about the dashboard as orchestrator entry point — first concrete user-facing piece of v0.4 vision; L1 ships in v0.3.13; L2 / L3 deferral framing preserved.

### Changed

- **`docs/dashboard.html` is now both VIEW and ENTRY POINT.** Previously read-only (artifact-inlining tabs). Now also surfaces actionable launchers. **The v0.2.3 byte-for-byte verbatim rule remains intact for the 6 artifact tabs** — Actions tab is a new feature layer orthogonal to artifact faithfulness; the verbatim rule was about not summarizing inlined markdown, not about excluding interactive features (per Retro #005 lesson that established release-class distinctions are real).
- **Default initially-active tab changed from "Foundation" to "Actions"** — the orchestrator surface is the primary use case for solopreneurs. Stakeholders skimming the dashboard can still click any tab; the change just makes the launcher the first thing they see.

### Notes

- **New release class introduced: capability-extension.** Joins the 6 named in v0.3.12 (Compass-original codification · infrastructure release · PR correction · same-day correction · artifact-pruning release · architectural-direction crystallization) + **capability-extension = 7 release classes** after v0.3.13. Worth Retro #006 examination — taxonomy is growing; does it collapse or stay distinct? Or do release-class proliferation patterns themselves become a meta-pattern worth codification?
- **No new Compass-original codified.** Catalog unchanged at 6 shapes / 11 patterns. This is a capability extension to an existing workflow (same shape as v0.3.11 artifact-pruning and v0.3.7 infrastructure shipping which weren't codifications either).
- **Counter ticks to #30 → triggers Retro #006.** Per `[hard-line-declaration]` (v0.3.10) — counter mechanism is the structural visibility. Hard line from Retro #005 in effect: Retro #006 must fire on time. **Retro #006 fires next session** (own session per cadence pattern matching v0.3.8 → Retro #005 separation).
- **First concrete user-facing v0.4-shaped deliverable.** v0.3.12 logged the v0.4 spec target; v0.3.13 ships the dashboard-as-orchestrator-entry-point pattern that the v0.4 Delivery Manager will eventually drive. **Solopreneur experiences the v0.4 UX shape today** even though the full orchestration runtime is months away. The dashboard's Actions tab IS what the v0.4 Delivery Manager will populate from running orchestration state; L1 just generates it statically via the existing dashboard regeneration cycle.
- **L1 only this release. L2 deferred to v0.3.14.** L2 will ship `compass://` protocol handler + a Compass CLI package (`pip install compass-cli` or similar) that registers the protocol on user's machine + dispatches to a CrewAI/LangGraph orchestration runtime. Same buttons; same dashboard; one-click execution instead of click-and-paste. L3 (localhost server with real-time updates) deferred indefinitely.
- **Cadence:** v0.3.1 → v0.3.13 = **13 sessions, 9 Compass-originals + 4 non-codification releases (v0.3.7 infrastructure · v0.3.11 artifact-pruning · v0.3.12 architectural-direction · v0.3.13 capability-extension) + corrections.** Substantive-progress-per-session holds. **One-Compass-original-per-session broken 4 times now** — each for legitimate non-codification work; the cadence is meaningfully "substantive progress per session," not strict Compass-original codification.
- **What this enables for the new project user is about to start:** open `docs/dashboard.html` in browser → bookmark it → henceforth open bookmark → click "What's next?" action → paste into preferred web app → workflow runs → commits back to repo → dashboard regenerates next time `/dashboard` runs (or auto-runs via `/scan`, `/plan`, `/status`, `/metrics`). **Multi-host orchestration is manual today (user is the dispatcher), but the dashboard tells them what to do next and makes acting one click + paste.**
- **Watch for in new-project usage:** (1) Which Actions tab sub-section is most useful? — informs whether the layout/grouping should evolve. (2) Do users actually use clipboard-copy + paste, or do they switch tabs and re-type commands? — informs whether L2 (one-click) is high-priority. (3) Does the dashboard re-render frequency feel right (only on workflow runs), or does staleness become friction? — informs whether L3 (live updates) becomes needed sooner.

## [0.3.12] — 2026-06-02

> **v0.4 spec target crystallized: Delivery Manager + Time/Quality/Finance + moat-layer positioning + 4 sub-problems named.** No framework code changes — this is **architectural-direction capture before the new project starts** (the project becomes the friction-discovery vehicle that informs which sub-problem to tackle first). Compass's v0.4 work concentrates on the orchestration layer; the moat is the integration (declarative workflows + filesystem-as-state + cross-host dispatch + surface-aware role-task fit + discipline-as-orchestration-input). **No other framework combines these.**

### Added

- v0.4 architectural-direction crystallization in `compass/workflows/improvements.md` (entry below). Names the **Delivery Manager** role evolution, the **Time / Quality / Finance** mandate, the **moat positioning**, and the **4 sub-problems** to solve under-the-surface (cross-host task dispatch · state synchronization · real-time cost tracking · HITL gate routing). Implementation scope estimated at ~6-8 framework files + per-host watcher implementations; not a 6-month rebuild — **3-4 design sessions + implementation sessions within v0.3.x cadence territory** once new-project friction signals validate sub-problem priorities.

### Notes

- **No Compass-original codified** — pure architectural-direction capture. Catalog unchanged at 6 shapes / 11 patterns. **New release class introduced: architectural-direction crystallization** joins the existing release-class taxonomy (Compass-original codification · infrastructure release · PR correction · same-day correction · artifact-pruning release · architectural-direction crystallization). **6 distinct release classes** as of v0.3.12.
- **Counter ticks to #29** because architectural-direction commitments are substantive — they constrain future framework evolution and inform what gets shipped at v0.4. Similar shape to a Compass-original codification (commits the framework to a specific direction) but without immediate framework-file changes.
- **The new project is the friction-discovery vehicle.** Pre-emptive v0.4 implementation work would be soft-spec-rationalization (Principle #14). Manual orchestration during new-project usage will surface which sub-problem causes the most friction → that becomes the v0.4 implementation priority. User IS Delivery Manager today; v0.4 automates that role.
- **Delivery Manager mandate is mutually exclusive with content decisions** — Time / Quality / Finance only. What to build (PM/Product), how to architect (Architect), how to implement (Engineer), what's a bug (Reviewer) all stay with their respective roles. **No authority creep risk by design.** This is structurally distinct from "Project Manager evolved to include orchestration" — Delivery Manager is a sharper role mandate (three measurable axes; three reportable surfaces; three places the user can override).
- **The moat framing is now explicit.** Methodology + markdown + roles is widely replicable; orchestration layer is what Compass differentiates on. The integration (filesystem as state · declarative workflow as orchestration spec · cross-host role dispatch · surface-aware role-task fit · discipline-as-orchestration-input) is what no other framework combines. **Compass's strategic positioning is now an engineering commitment, not just methodology.**
- **v0.3.x line continues during v0.4 design phase.** v0.4 doesn't block v0.3.x; methodology + markdown + filesystem layer continue working; orchestration is additive when ready. Likely v0.3.x ships 5-10 more incremental codifications + infrastructure pieces while v0.4 design + implementation runs in parallel. **Retro #006 should examine** whether v0.3.x cadence holds, slips, or naturally collapses into v0.4 work.
- **3 of 5 Retro #005 recommendations now acted on across v0.3.9-v0.3.11; v0.3.12 adds the v0.4 spec capture as the 4th retro-driven action.** Remaining 2 deferred: `[framework-on-framework]` codification (3 instances past threshold) and `setup-agent.py` propagation script (small scope post v0.3.8 correction).
- **Cadence note.** v0.3.1 → v0.3.12 = **12 sessions across 9 Compass-originals + 1 infrastructure release + 1 artifact-pruning release + 1 architectural-direction crystallization + corrections.** Cadence broke from strict-Compass-original-per-session early (v0.3.7 infrastructure); v0.3.12 confirms the broader framing: **substantive-progress-per-session, where "substantive" includes new release classes as they emerge.**
- **Codification candidate when v0.4 ships:** `[moat-as-integration]` or `[orchestration-as-differentiation]` — a strategic/positioning pattern, distinct from existing 6 shapes. Worth retro examination after v0.4's first 3-5 real projects to see whether the integration actually feels differentiated or whether the framing was over-claimed.

## [0.3.11] — 2026-06-02

> **`compass/roles/reviewer.md` pruned per Retro #005 artifact analysis (rated 7/10).** Three structural changes targeting per-Codex-review cognitive cost without losing v0.3.6 codification value: (1) **Step 0 gains a decision tree at the top** — pure-logic PRs skip the framework-registration check entirely; framework-discovered surfaces continue to the detailed checks. (2) **Step 4 scoped to NEW load-bearing claims** — already-verified claims within their `last_verified` window inherit prior verification; the operational-cost failure mode the freshness-check pattern was designed to AVOID is now explicitly named. (3) **Anti-patterns consolidated from 9 → 7** — `direct-import-test-suspicious` and `narrow-bug-focus` folded into `polished-but-broken` as concrete sub-examples; their separate identity didn't add signal beyond what `polished-but-broken` already encompassed. **Not a Compass-original codification** — pure artifact cleanup. Every Codex review now pays a smaller reading cost.

### Changed

- **`compass/roles/reviewer.md` Step 0** — added decision tree skipping framework-registration check for pure-logic PRs. Detail-block compressed (removed "REQUIRED vs OPTIONAL" tail since decision tree handles that gating). Cross-references `polished-but-broken` instead of separately naming `direct-import-test-suspicious`.
- **`compass/roles/reviewer.md` Step 4** — scoped from "every load-bearing framework claim" to "NEW load-bearing claims only" (claims not already verified in prior PRs against the same external source, OR claims whose `last_verified` window has expired). Names the operational-cost failure mode explicitly: "re-verifying every load-bearing claim on every PR is the operational-cost failure mode the freshness-check pattern is designed to AVOID, not perpetuate."
- **`compass/roles/reviewer.md` Anti-patterns section** — consolidated 9 → 7. `direct-import-test-suspicious` and `narrow-bug-focus` now live as concrete sub-examples under `polished-but-broken` (they're failure modes that share the same diagnostic shape: mechanical artifact inspection closes the gap). Story-claim-trust anti-pattern preserved separately because it's structurally distinct (about NEW claims at Step 4 review-time freshness, not framework registration). Original 5 anti-patterns unchanged.

### Notes

- **No Compass-original codified — pure artifact cleanup.** Catalog unchanged at 6 shapes / 11 patterns. Counter ticks to #28 because the change is substantive (Retro #005 surfaced it as actionable; structural pruning of a load-bearing artifact); maintenance bumps (e.g., the `last_verified` bump after Codex v0.136.0 verification) don't tick the counter.
- **Retro #005 artifact analysis acted on within 4 sessions.** Rated reviewer.md 7/10; recommendations: trim Step 0, scope Step 4, consolidate anti-patterns. All three actioned in v0.3.11. **First artifact-pruning release** triggered by retro artifact analysis (vs. by friction or codification readiness).
- **What was preserved:**
  - The codified `[mechanical-output-verification]` Step 0 framework-registration check (decision tree adds conditional gating but doesn't remove the substance)
  - The codified `[freshness-check]` Step 4 review-time application (now scoped to NEW claims — same pattern, sharper scope)
  - The four named anti-patterns (`polished-but-broken` parent + `direct-import-test-suspicious` and `narrow-bug-focus` as sub-examples; Story-claim-trust kept separate)
  - All freshness markers and the "Expected Codex output shape" contract
  - All other Steps 1-3, 5-7 and the Hard rules section
- **What was reduced:**
  - Step 0 reading cost on pure-logic PRs: decision tree exits at the top
  - Step 4 operational cost: scope limited to NEW claims rather than every load-bearing claim
  - Anti-patterns reading cost: 9 → 7 with semantic consolidation (sub-examples rather than separate items)
- **Expected impact** — every Codex review pays a smaller reading cost; framework-discovered-surface checks remain rigorous when they apply; review-time freshness check stops being an operational deterrent (the failure mode Principle #14 warns about — soft specs that get rationalized under pressure). **Watch for whether `polished-but-broken` recurrence rate stays the same after consolidation** — if it rises, the consolidation under-named the failure modes; if stable or falls, the consolidation captured the right semantic level.
- **Retro #005 deferred recommendations status:** (a) `[declare-not-implement]` codification ✅ v0.3.9; (b) `[hard-line-declaration]` codification ✅ v0.3.10; (c) reviewer.md pruning ✅ v0.3.11; (d) `[framework-on-framework]` codification — still deferred (3 instances past threshold); (e) `setup-agent.py` propagation script — still deferred. **3 of 5 acted on in 3 consecutive sessions.** Retro-to-release pipeline working as designed.
- **Cadence note.** v0.3.1 → v0.3.11 = **11 sessions, 9 Compass-originals + 1 infrastructure release (v0.3.7) + 1 PR correction (PR #1) + 1 same-day correction (v0.3.8 adapter-upstream) + 1 artifact-pruning release (v0.3.11)**. One-Compass-original-per-session cadence broken twice now (v0.3.7 infrastructure, v0.3.11 artifact-pruning) — both legitimate non-codification work surfaced by the retro cycle. The cadence isn't strict-Compass-original-only; it's substantive-progress-per-session.

## [0.3.10] — 2026-06-02

> **`[hard-line-declaration]` codified as 2nd scope-discipline class member.** When Compass commits to shipping something in a future release, the commitment gets **explicit slip-counters + named consequences** in CHANGELOG entries and `compass/workflows/improvements.md` headers — creating structural pressure that overcomes the diffuse "next substantive release is more important" rationalization. **Two instances at codification:** (1) freshness detection 3-slip → v0.3.7 ship (v0.3.6 CHANGELOG declared "if it slips a 4th time, the workflow-side defense must be re-examined"; v0.3.7 shipped ON TIME). (2) Retro cadence 2-slip → Retro #005 on time (Retro #004 declared "if retro slips again, retro rationalization is no longer one-off"; Retro #005 fired ON TIME at improvement #25). **Catalog grows from 6 shapes / 10 patterns → 6 shapes / 11 patterns.** Scope-discipline class grows from 1 → 2 members — **the new shape introduced in v0.3.9 is now structurally validated, not a one-off.**

### Added

- **New `[hard-line-declaration]` Compass-original entry** in `compass/framework/canon.md`. Names the pattern + mechanical three-part structure (counter visibility + named consequence + structural pressure) + the 2 instances accumulated + classification as scope-discipline 2nd member + anti-pattern closed (`commitment-drift`) + distinction from Principle #16 refuse-escalate (within-workflow vs across-releases scope) + tracking note ("worth tracking how often the pattern fires successfully in future release-planning sessions").
- **`AGENTS.md` Workflow Structure section** restructured for the scope-discipline class — top paragraph explains the class as a whole (Compass's own scope at framework design time, distinct from workflow-execution shapes); subsequent paragraphs document each member (`[declare-not-implement]` then `[hard-line-declaration]`). Catalog count updated to 6 shapes / 11 patterns; ratio 9 workflow-execution : 2 scope-discipline.

### Changed

- **Compass-originals catalog grows from 10 → 11 patterns; 6 shapes unchanged.** Scope-discipline class: 1 → 2 members. Workflow-execution patterns total 9 (unchanged). Ratio shifts from 9:1 → 9:2. **Worth examining in Retro #006 whether the workflow-execution:scope-discipline ratio continues to hold or whether scope-discipline grows further.** Forward candidates named in canon: orchestrator selection (v0.4+); consumer distribution (v0.4+).

### Notes

- **Codification rule satisfied — 2 structurally-distinct instances.** (1) freshness detection commitment slipped through 3 versions before v0.3.6's hard-line-in-CHANGELOG declaration produced an on-time v0.3.7 ship. (2) retro-cadence slipped through 2 cycles before Retro #004's hard-line declaration produced an on-time Retro #005. Both surfaced in Retro #005 codification readiness ranking; v0.3.10 acts on the 2nd recommendation after v0.3.9 acted on the 1st.
- **Scope-discipline class structurally validated.** v0.3.9 introduced the shape; v0.3.10 confirms it's not a one-off. Both members govern framework-design-time scope decisions; both fire during release planning rather than workflow execution; both have user as load-bearing oversight (the framework's reflex is real but not infallible). **The class as an organizing axis is meaningful** — workflow-execution and scope-discipline patterns serve different audiences (workflow executors vs framework contributors) and fire at different times (workflow run vs release planning).
- **Anti-pattern named: `commitment-drift`.** When Compass commits to a future release and lets it slip silently, the commitment drifts indefinitely. Each individual slip is defensible ("substantive work is more important than this commitment"); the cumulative pattern is rationalization. `[hard-line-declaration]` is the structural countermeasure: name the consequence explicitly in a load-bearing visible place so the next slip can't be silent. **Worth tracking application frequency** — each on-time ship after a declared hard line is a successful application; each slip past a declared consequence is data that the pattern needs sharpening.
- **Cadence: 10 sessions running.** v0.3.1 → v0.3.10 = 10 sessions, 9 Compass-originals + 1 infrastructure release (v0.3.7) + 1 PR correction (PR #1) + 1 same-day correction (v0.3.8 adapter-upstream). **One-Compass-original-per-session cadence holds for 10 sessions running** — exactly the pattern `[hard-line-declaration]` is designed to enforce, applied implicitly to the cadence commitment itself.
- **Retro #005 deferred recommendations status update:** (a) `[declare-not-implement]` codification ✅ shipped v0.3.9; (b) `[hard-line-declaration]` codification ✅ shipped v0.3.10; (c) `[framework-on-framework]` codification (3 instances past threshold) — still deferred to v0.3.11+; (d) `compass/roles/reviewer.md` pruning — still deferred to v0.3.11+; (e) `compass/scripts/setup-agent.py` propagation script — still deferred to v0.3.11+. **2 of 5 Retro #005 recommendations acted on in 2 consecutive sessions.** Counter ticks to #27; next retro fires after #30 (3 more substantive improvements needed).
- **Recursive observation: the improvements.md "Next retro fires after #30" counter is itself an instance of `[hard-line-declaration]`** that v0.3.10 just codified. The counter mechanism that has been carrying the retro cadence is the pattern being named. Framework retroactively recognizing what it's been doing. **3rd instance arguably** (but only the 2 explicit "hard line" declarations are cited in the canon entry; the counter mechanism is the implicit form). Worth noting in next retro whether the implicit counter form should be considered a 3rd instance for codification-confidence purposes.

## [0.3.9] — 2026-06-02

> **`[declare-not-implement]` codified as 1st scope-discipline class Compass-original — introduces the 6th pattern shape.** When Compass would need to build an integration with external tools/agents/services, it **declares the pattern + registry + manual fallback; does NOT write the integration itself.** Upstream libraries, vendor CLIs, or consumer-side wiring handle actual integrations. **Two instances at codification:** (1) v0.3.5 `[agent-handoff]` — declared 5-piece handoff shape + shipped template with 4 commented reviewer blocks; consumer wires per-CLI integration. (2) v0.3.8 same-day correction — declared `agents:` registry + delegated API-based-agent adapter layer to LiteLLM / Vercel AI SDK / OpenRouter / LangChain; refused to ship per-agent adapter docs that would duplicate upstream. **Catalog now spans 6 shapes / 10 patterns** (enforcement 4 · interaction 1 · freshness 1 · observability 1 · handoff 2 · **scope-discipline 1**). First Compass-original that governs **framework design-time scope** rather than workflow execution.

### Added

- **New `[declare-not-implement]` Compass-original entry** in `compass/framework/canon.md`. Names the pattern, the 2 instances accumulated, the `integration-creep` anti-pattern it closes, the "applied at framework design time not workflow execution time" framing, the "user as load-bearing oversight" honesty about framework fallibility, and the forward-compatibility note (future scope-discipline candidates: orchestrator selection v0.4+; consumer distribution v0.4+).
- **`AGENTS.md` Workflow Structure section gained scope-discipline pattern note** — names it as the 6th pattern shape (first non-workflow-execution shape), cites both instances, names the `integration-creep` anti-pattern, names user as load-bearing oversight.
- **`compass/templates/workflow-template.md` gained inline `SCOPE-DISCIPLINE` commentary block** — gives workflow authors a heuristic ("would this duplicate upstream work?") for invoking the pattern when about to add per-X documentation or adapter code.

### Changed

- **Compass-originals catalog grows from 5 shapes / 9 patterns → 6 shapes / 10 patterns.** Scope-discipline (1 — `[declare-not-implement]`) joins enforcement (4) · interaction (1) · freshness (1) · observability (1) · handoff (2). Workflow-execution shapes total 9; scope-discipline (framework-design shape) totals 1. **Worth examining in Retro #006 (after improvement #30) whether the workflow-execution/scope-discipline split holds or whether scope-discipline grows additional members.** Forward candidates named explicitly: orchestrator selection + consumer distribution.

### Notes

- **Codification rule satisfied — 2 structurally-distinct instances.** (1) v0.3.5 `[agent-handoff]` reviewer-CLI parameterization without per-CLI integrations. (2) v0.3.8 same-day adapter-upstream correction delegating to LiteLLM-class libraries. Both surfaced in Retro #005 codification readiness ranking. **Top retro recommendation acted on within next-session cycle** — same shape as v0.3.6 codifying `[mechanical-output-verification]` after Retro #004's surfacing.
- **First Compass-original whose audience is framework contributors, not workflow executors.** The pattern fires when Compass's own scope is being decided (release planning, codification, roadmap deferrals). Unlike enforcement / interaction / freshness / observability / handoff — which fire during workflow runs — `[declare-not-implement]` fires during framework-evolution work. This is a meaningful structural distinction; the canon entry + AGENTS.md note + workflow-template inline commentary all explicitly call it out.
- **Anti-pattern named: `integration-creep`.** Integration surfaces expand linearly; Compass-maintainer scope does not. The result of unchecked `integration-creep` is stale Compass docs, brittle Compass adapters, and a framework whose maintenance burden grows past its sustainable size. `[declare-not-implement]` is the structural countermeasure. **Worth tracking how often the pattern fires in future release-planning sessions** — each catch is a successful application; each miss (user catching it) is data for the load-bearing-oversight observation.
- **User as load-bearing oversight is preserved explicitly.** v0.3.8 same-day correction was caught by user, not by the framework's own discipline. The canon entry names this honestly: "the framework's `[declare-not-implement]` reflex is real but not infallible; user judgment is part of the system." Future v0.4+ multi-agent architecture must preserve this user-as-oversight role; orchestrator agency does not replace it. **First Compass-original that explicitly names user judgment as part of the structural system** — prior originals named user as approver (HITL gates) or arbiter (PM disputes), but not as load-bearing oversight against framework's own scope creep.
- **No new infrastructure shipping** — v0.3.9 is a pure pattern-codification release, similar shape to v0.3.6 (`[mechanical-output-verification]`). Smaller file count than v0.3.7 (freshness detection infrastructure) or v0.3.8 (registry + reframing). Per the cadence: **8 sessions / 8 Compass-originals + 1 infrastructure release.** Cadence holds; one-Compass-original-per-session pattern recurs.
- **Retro #005 recommendations not-yet-acted-on (deferred to next sessions):** (a) `[hard-line-declaration]` codification — 2 instances accumulated, ready; deferred to v0.3.10+ unless user prioritizes earlier; (b) `[framework-on-framework]` codification — 3 instances past threshold; ready on owner discretion; (c) `compass/roles/reviewer.md` pruning per artifact analysis (Step 0 decision tree, Step 4 scope to NEW claims, consolidate 10 anti-patterns → 5-6); (d) propagation script `compass/scripts/setup-agent.py` for CLI-agent prompt directories (was originally v0.3.9 commitment per v0.3.8 same-day correction, but user picked codification over script). **All carried forward as v0.3.10+ candidates.** Counter ticks to #26; next retro fires after improvement #30 (4 more substantive improvements needed).

## [0.3.8] — 2026-06-02

> **`[agent-agnostic-role-assignment]` codified as 2nd handoff-class Compass-original + `compass/config.yaml` gains `agents:` registry + `defaults:` + per-role `tool_assignments` validated against the registry.** Generalizes the `[agent-handoff]` v0.3.5 pattern (agent-agnostic for reviewer only) to **every role**. 8 supported agents in initial registry: `claude`, `codex`, `openai` (ChatGPT/GPT API), `gemini`, `deepseek`, `codestral`, `apple` (honestly marked `unsupported: true`), `custom`. Defaults match pre-v0.3.8 behavior (Claude implements, Codex reviews) — no behavior change at ship; migration is opt-in via 1-line `tool_assignments` edit per role.

### Added

- **New `[agent-agnostic-role-assignment]` Compass-original entry** in `compass/framework/canon.md`. Names the pattern + the 8 supported agents in initial registry + the codification rationale (2nd structurally-distinct instance of agent-agnosticism — reviewer-only in v0.3.5, generalized to all roles in v0.3.8).
- **`compass/config.yaml` gained `agents:` registry block** — each agent declares its `invocation` pattern (`cli` / `api` / `manual`), `context_loading` convention (`local-files` / `api-system-prompt` / `manual-paste`), `auth_env` (API key env var), `maturity` flag, and a brief `note:` describing the integration path. Apple Intelligence flagged `unsupported: true` with documented reason (system-level features, no open API for arbitrary role-playing) — honest rather than faked.
- **`compass/config.yaml` gained `defaults:` block** — `implements: claude`, `reviews: codex`, `product: claude`, `tech-writes: claude`. Categorizes roles by job-shape; serves as fallback when `tool_assignments` doesn't enumerate a role. Matches Compass's empirically-validated Claude+Codex split per AGENTS.md "Tool division of labor" structural rationale.
- **`compass/config.yaml` `tool_assignments:` validated against the registry** — comments mark which `defaults:` category each role falls under; structural constraint (`reviewer` and `security_reviewer` must use different model than implementer) explicit in the comment.
- **`AGENTS.md` "Tool division of labor" reframed** — from hardcoded `Claude | All roles EXCEPT...` + `Codex | Reviewer, Security Reviewer` to a registry table (8 agents with maturity flags) + a defaults table (4 role categories) + structural rationale for the reviewer-must-be-different-model constraint + override examples. **First of the 10 hardcoding files to derive from config** (per the `[agent-agnostic-role-assignment]` canon entry's deferred-to-v0.3.9/v0.3.10 propagation roadmap).
- **`compass/templates/workflow-template.md` gained inline commentary** on `[agent-agnostic-role-assignment]` — workflow steps that load a role can now reference `tool_assignments` for which agent plays it; the registry shape is forward-compatible with the v0.4+ orchestrator vision.
- **`README.md` "Core ideas" — Claude+Codex line updated** to "Agent-agnostic by design; defaults built in" with the registry agents enumerated. Preserves the "default = Claude implements, Codex reviews" framing for the empirical validation argument.
- **`SETUP.md` gained "Picking which agent plays which role" section** — step-by-step override guide with an example showing ChatGPT for PM + Gemini for designer + Claude for engineer + Codex for reviewer. Names the reviewer-different-model constraint inline. Also notes that non-default agents may require manual prompt-directory setup until v0.3.10 propagation script ships.

### Changed

- **Compass-originals catalog balance shifts.** Before v0.3.8: 4 enforcement : 4 usability (interaction · freshness · observability · handoff). After v0.3.8: **4 enforcement : 5 usability** (interaction · freshness · observability · 2 handoff). The handoff class gains a 2nd member; usability shapes now slightly outpace enforcement. **Worth examining in next `/retro` as drift signal** — was 5:4 enforcement-lean (v0.3.6's `[mechanical-output-verification]` codification); v0.3.7 (infrastructure release, no new Compass-original) preserved balance; v0.3.8 swings to 5-usability lean. Whether this signals framework bias toward "make itself usable" over "make itself harder to violate" is a retro question.
- **Roadmap clarification (corrected same-day, see Notes).** v0.3.8 ships L1 (pattern + registry + defaults). **L2 (per-agent adapter docs at `compass/agents/<agent>.md`) is NOT shipping — Compass uses upstream adapter libraries instead** (LiteLLM recommended; Vercel AI SDK / OpenRouter / LangChain alternatives). Writing per-agent adapter docs would duplicate upstream documentation. **What was previously L3 becomes the new L2 (v0.3.9 candidate):** `compass/scripts/setup-agent.py` propagation script reading `tool_assignments` and generating per-agent prompt directories for **CLI-based agents only** (`.codex/prompts/`, `.gemini/prompts/`) — API-based agents go through the upstream adapter with `compass/roles/<role>.md` as system prompt, no per-agent prompt directory needed. The 3-surface drift resolution becomes smaller scope as a result.

### Notes

- **Codification rule satisfied — 2 structurally-distinct instances.** (1) `[agent-handoff]` v0.3.5 = agent-agnostic for one role (reviewer) via the GitHub Actions template's 4 commented blocks. (2) v0.3.8 = agent-agnostic for all roles via the config-driven registry. Same shape (pattern + registry + manual fallback documented), generalized scope. Same shape as `[mechanical-output-verification]` v0.3.6's codification path (2 instances accumulated, codification ready).
- **Per-agent maturity honestly named in registry.** `claude` + `codex` + `gemini` = production CLI integrations. `openai` + `deepseek` + `codestral` = API-mature (no first-party CLI matching Codex/Claude depth). `apple` = explicitly `unsupported: true` with documented reason — Apple Intelligence is system-level (Writing Tools, Summarization) without an open API for arbitrary role-playing. The pattern lists it for visibility while being honest about its limitations.
- **No behavior change at ship.** Defaults match pre-v0.3.8 Claude+Codex split. Existing consumers (aura-app, crypto-app) continue to work without edits. Migration to non-default agents is opt-in via `tool_assignments` edits.
- **3-surface drift resolution is in-progress, not complete.** AGENTS.md "Tool division of labor" now derives from `compass/config.yaml` registry (first of 10 hardcoding files). Other 9 (`README.md`, `CLAUDE.md`, `SETUP.md`, `.claude/skills/build/SKILL.md`, `.codex/prompts/reviewer.md`, `.codex/prompts/security-reviewer.md`, `compass/framework/canon.md`, `compass/workflows/build.md`, `compass/workflows/fix.md`) update over v0.3.9 + v0.3.10 as L2/L3 land.
- **Orchestrator vision deferred to v0.4+.** User raised the architectural reframing mid-planning: "ideally there should be an orchestrator agent in the list that runs point and controls — something like what came out in Claude's latest version of dynamic workflows. Ideally each workflow is a different agent type." This is a fundamental Compass rearchitecture (methodology + markdown → multi-agent system + orchestrator + workflow-agents) and was explicitly deferred. **v0.3.8's `agents:` registry shape is forward-compatible with this vision** — naturally extends to declare an `orchestrator` entry; per-workflow-agent declarations follow the same shape as per-tool-agent declarations. Key questions for v0.4/v0.5: unit of agency (per-workflow vs per-role vs hybrid); where orchestrator runs (Compass-side declarative vs runtime-layer); what "controlling" means (just routing vs full conductor); how Compass principles #14/#15/#16 survive as agent constitutions; cost/latency reality of multi-agent invocation; MVP shape; lock-in risk (Claude Agent SDK vs generic abstraction).
- **First time an architectural-rearchitecture decision was explicitly deferred AND framing-captured rather than silently dropped or implicitly absorbed.** Worth surfacing in next `/retro` as positive pattern — deferral with framework-on-framework reasoning preserved.
- **Cadence note.** v0.3.1 → v0.3.6 = 6 sessions, 6 Compass-originals shipped (one per session). v0.3.7 = infrastructure release (freshness detection), no new Compass-original — first cadence break, legitimate. v0.3.8 = **back to one-Compass-original-per-session cadence** with `[agent-agnostic-role-assignment]`. 7 Compass-originals total across v0.3.x line.
- **Improvement counter at #25 — Retro #005 fires as side-effect.** This is the cadence-promised retro after #20. Should specifically examine: (1) catalog balance shift to 5-usability lean — bias signal or natural emergence? (2) v0.3.6 → PR#1 correction → v0.3.7 → v0.3.8 trajectory — what pattern? (3) whether "infrastructure releases" (v0.3.7) and "Compass-original releases" (v0.3.8) should be tracked separately in cadence accounting. (4) the orchestrator deferral as the framework's first explicit architectural-rearchitecture deferral with reasoning preserved — pattern or one-off?
- **Same-day correction (2026-06-02): adapter layer is upstream, not Compass-side.** Per user direction: "we are not creating per agent adapter we will use an existing adapter like litellm and other competitors for the adapters." The originally-planned L2 (per-agent adapter docs at `compass/agents/<agent>.md`) is **not a Compass deliverable** — it would duplicate upstream documentation. **LiteLLM** is the recommended adapter for API-based agents (`openai`, `deepseek`, `codestral`); **Vercel AI SDK**, **OpenRouter**, and **LangChain** are documented alternatives. For full-agent CLIs (`claude` via Claude Code, `codex` via Codex CLI, `gemini` via Gemini CLI), the CLI tool IS the adapter — no upstream library needed. Registry entries for API-based agents gained an `adapter: litellm` field + updated `note:` referencing LiteLLM model strings (e.g., `openai/gpt-5`, `deepseek/deepseek-chat`, `mistral/codestral-latest`). **Forward roadmap simplified:** v0.3.9 becomes the (smaller-scoped) propagation script for CLI-agent prompt directories only — was previously planned as v0.3.10's work. Compass becoming smaller, not bigger, by leveraging upstream adapters — **same shape as v0.3.5's `[agent-handoff]`**, which parameterized over reviewer CLIs without writing per-CLI integrations. Worth surfacing in next `/retro` as positive scope-discipline pattern: the framework's reflex to declare patterns rather than build implementations stays intact when the user reality-checks scope. **First v0.3.x release with a same-day correction to the deferred roadmap (not just to the substance)** — distinct from v0.3.5's same-day extension (3 implementation lessons) and v0.3.6's PR#1 correction (Next 16 anchor); this is a roadmap-shape correction.

## [0.3.7] — 2026-06-01

> **Freshness detection shipped — pull-bridge round 2 closes the 3-slip commitment.** `compass/scripts/check-freshness.py` (single-file Python 3 stdlib) walks `compass/` for files with `last_verified:` frontmatter, queries external sources via GitHub API or HTTP Last-Modified, auto-bumps where source is unchanged, flags otherwise. `.github/workflows/freshness-check.yml` runs the script weekly on the Compass repo itself. First-run validation immediately surfaced real value — `compass/roles/reviewer.md` flagged because Codex GitHub had a release on 2026-06-01 (same day as ship), suggesting the documented review format may need re-verification. **Closes the freshness-detection commitment after 3 consecutive slips** (v0.3.4 → v0.3.5+ → v0.3.6+). Multi-consumer reality observed during planning (aura-app at v0.2.x + crypto-app at v0.3.x with no sync mechanism) strengthens round-3 (distribution, v0.4+) deferral.

### Added

- **`compass/scripts/check-freshness.py`** — single-file Python 3 stdlib script. Walks `compass/` for files with `last_verified:` frontmatter; for each, queries the file's `external_source`:
  - **GitHub repo URLs** (e.g., `https://github.com/openai/codex`) → GitHub API `/releases/latest` (primary) · `/tags` (fallback) · `/commits` (last-resort)
  - **Generic URLs** → HTTP HEAD/GET for `Last-Modified` header
  - **Comparison:** if external source date ≤ `last_verified` → auto-bump `last_verified` to today (safe — source unchanged); if external > `last_verified` → flag for manual review (source changed; Compass doc may be stale); errors flag without action.
  - Flags `--apply` (mutate files; default is dry-run), `--today YYYY-MM-DD` (deterministic CI), `--out PATH` (write report to file), `--root DIR` (default `compass`).
  - Exit code 0 = all fresh/safely-bumped; exit 1 = flags or errors present (signals CI to open PR/Issue).
- **`.github/workflows/freshness-check.yml`** — runs `check-freshness.py --apply` weekly (Mondays 06:00 UTC) on Compass repo itself. Manual trigger via `workflow_dispatch` also supported. On weeks with bumps → opens PR with diff + report. On weeks with flags only (no bumps) → opens Issue with report. On weeks with everything fresh → no action. Report artifact uploaded for 90-day retention regardless.
- **`compass/scripts/README.md` gained `check-freshness.py` section** — usage, exit codes, detection strategies, accuracy honesty (HTTP-level not semantic), automation note (GitHub Actions weekly), when-to-use guidance.

### Changed

- **`compass/framework/canon.md` `[freshness-check]` entry** — pull-bridge round 2 status updated from "deferred" to "shipped v0.3.7"; round 2 mechanism described concretely (script + workflow); round 3 (v0.4+ distribution) still deferred but with strengthened motivation citing multi-consumer reality.
- **`AGENTS.md` Workflow Structure freshness note** — round 2 status updated from "v0.3.5+ deferred" to "shipped v0.3.7"; mechanism described.

### Notes

- **3-slip commitment closed honestly.** v0.3.3 committed round 2 to v0.3.4; slipped to v0.3.5+; slipped to v0.3.6+; v0.3.6 CHANGELOG set a hard line that a 4th slip would trigger re-examination of whether the workflow-side defense from v0.3.3 was still sufficient. v0.3.7 ships before the 4th slip. **The hard line worked** — it created structural pressure that overcame the rationalization-toward-higher-leverage-substantive-releases pattern. Worth noting as a pattern: explicit slip-counters + hard-line declarations are themselves a form of soft-spec-hardening applied to roadmap commitments.
- **First-run validation surfaced real value immediately.** Dry-run on Compass repo (`python compass/scripts/check-freshness.py`) flagged `compass/roles/reviewer.md` because Codex GitHub had a release published 2026-06-01 (same day as ship); `last_verified` was 2026-05-27. This is the precise scenario the v0.3.3 workflow-side defense was designed for — but it would have caught it at next `/build` invocation, not in the framework repo itself. Round 2 catches it at the source. **First detection event in the framework's history; Codex review format may genuinely need re-verification.** Surface this as a Compass-side action item independent of v0.3.7.
- **Honest scope.** Detection is HTTP-level — timestamp comparison, not content semantic analysis. A doc page may change cosmetically without affecting Compass; the script flags it anyway. Auto-bump only happens when external is UNCHANGED (directional bias toward "flag rather than silently mark fresh"). Semantic-level detection (did the Codex CLI surface ACTUALLY change?) requires LLM + structured-output prompting — round 2.5+ territory if false-positive flagging becomes noisy.
- **Multi-consumer reality named.** During v0.3.7 planning, we observed that aura-app (at framework v0.2.x) and crypto-app (at framework v0.3.x active) have no sync mechanism — manual copy at consumer bootstrap, then drift indefinitely. **This is the round-3 distribution problem from v0.3.3's original framing.** Round 2 detects in the framework repo; round 3 propagates to consumers. Still deferred because round 3 requires real distribution infrastructure (auto-PR to consuming repos, version markers in consumer `compass/config.yaml`, sync tooling). v0.4+ candidate.
- **No new Compass-original this release.** v0.3.7 is infrastructure shipping a previously-named pattern's round-2 mechanism, not a new pattern itself. Catalog still spans 5 shapes / 4 enforcement : 4 usability. **First v0.3.x release without a new Compass-original** — the cadence "one Compass-original per session" broke here for legitimate reason (the round-2 commitment was overdue). Worth surfacing in next `/retro` whether infrastructure releases should count toward the cadence or be tracked separately.
- **GitHub Actions setup notes for Compass repo:** the workflow requires `contents: write` + `pull-requests: write` + `issues: write` permissions. The `GITHUB_TOKEN` provided to Actions by default has these by default; no additional secret required. **First time `.github/workflows/` is being used in the Compass framework repo itself** — previously, the framework repo had no CI; this is the first workflow.
- **What the next `/retro` should examine:**
  - Whether 3-slip commitment closure is the framework's first observed instance of "hard-line declarations creating structural pressure that overcomes rationalization"
  - Whether the first-detection-event (Codex GitHub release on ship day) is coincidence or signal about external-tool change velocity
  - Whether infrastructure-only releases (no new Compass-original) should be tracked separately from substance releases in the per-session cadence promise

## [0.3.6] — 2026-06-01

> **`[mechanical-output-verification]` codified as 4th enforcement-class Compass-original + Codex review process gains Step 0 framework-registration check + 3 new named anti-patterns in `compass/roles/reviewer.md`.** Retro #004 (overdue 2 cycles, fired at improvement #22) surfaced the codification as ready — CB-1.4 build-artifact inspection (1st instance, shipped in v0.3.5 same-day extension) + Codex's own retrospective ("Start with framework registration checks before reading functional tests" + "Prefer 'is this actually deployed by the framework?' over 'do the tests pass?'") = 2 instances of the same shape. Catalog now spans 5 shapes; enforcement class gains a 4th member, **resetting balance to 4 enforcement : 4 usability**.

### Added

- **New `[mechanical-output-verification]` Compass-original entry** in `compass/framework/canon.md`. When a workflow requires a build, deploy, or framework-discovery step, the postcondition is inspection of the build OUTPUT or runtime artifact, not just the build PROCESS exit code. Framework anchors: Next.js manifests · Vercel Functions output · Expo prebuild native config · general principle (when runtime config is data-driven, source ≠ runtime). Sharper version of Principle #14 — the soft spec being rationalized is now subtler ("the build succeeded" / "the tests pass" / "the principle is cited").
- **`compass/roles/reviewer.md` gained Step 0 framework-registration check.** Before functional analysis, Codex verifies build output / runtime artifact for changes touching framework-discovered surfaces (file-based routing, middleware auto-registration, plugin discovery, asset bundling). REQUIRED for routing-layer / discovery-layer changes; OPTIONAL for pure logic changes. Direct extension of Codex's own self-critique from CB-1.4 ("Start with framework registration checks before reading functional tests").
- **`compass/roles/reviewer.md` gained Step 4 review-time freshness check.** When a story or DRI Decision names a runtime behavior or file convention as load-bearing, Codex re-verifies the claim against current primary docs of the named tool/framework — does not trust story-as-written. This is `[freshness-check]` applied at review time, not just doc-load time. Promoted to BLOCKER status when the claim is wrong regardless of how cleanly the implementation follows the (incorrect) story.
- **`compass/roles/reviewer.md` gained 4 new named anti-patterns** that Codex actively looks for: `polished-but-broken` (formalized from v0.3.5; tests pass + build green + narrative coherent + behavior wrong), `direct-import-test-suspicious` (framework-discovery-dependent features with direct-import tests bypass the discovery mechanism), story-claim-trust-without-primary-doc-verification (load-bearing story claims must be re-verified), narrow-bug-focus (finding real bugs at functional layer while missing higher-altitude framework-legality issues — Codex's own self-named failure mode from CB-1.4).
- **`compass/workflows/build.md` Phase 2 step 7** gained explicit `[mechanical-output-verification]` citation linking the existing build-artifact inspection sub-bullet (shipped in v0.3.5 same-day extension) to the canon entry. Retrofit of the formal pattern name onto the prior implementation.
- **`AGENTS.md` "Workflow structure" section gained note** about `[mechanical-output-verification]` as 4th enforcement-class Compass-original. Explicit balance framing: 4 enforcement (cite-or-mark-n/a · refuse-escalate · soft-spec-hardening · mechanical-output-verification) : 4 usability (interaction · freshness · observability · handoff).
- **`compass/templates/workflow-template.md` gained inline commentary** about applying `[mechanical-output-verification]` when workflows include build/deploy/framework-discovery steps.
- **`compass/framework/canon.md` `[freshness-check]` entry extended** with review-time application note (the pattern applies to story claims at review time, not just to Compass-doc-load time).

### Changed

- **Roadmap status update (3rd consecutive slip).** Freshness detection (CI on Compass repo watching external tools and auto-bumping `last_verified` markers) was committed to v0.3.4 (slipped to v0.3.5+) (slipped to v0.3.6+) (still not landing in v0.3.6). Codified into canon.md `[freshness-check]` entry as "v0.3.6+" rather than naming a specific next version. **Per Retro #004 drift signal: if it slips a 4th time, the workflow-side date check from v0.3.3 must be re-examined to confirm it's still sufficient.** Hard line.

### Notes

- **Codification rule satisfied — 2 instances.** Per the 2-3-instance rule, `[mechanical-output-verification]` is the first deferred-candidate to graduate to canon entry in the v0.3 cycle. (Prior canon entries either landed with their first instance, like `[elicitation-with-options]` v0.3.2, or like `[freshness-check]` v0.3.3 where the pattern itself was novel enough to ship at 1st instance with the principle named.) v0.3.6 is the first time a *deferred* pattern was codified after accumulating 2 instances in the wild.
- **Retro #004 informed this release directly.** The retro fired at improvement #22 (2 cycles overdue — itself a Principle #14 instance applied to the framework's own cadence). It surfaced `[mechanical-output-verification]` as ready and ranked it as the top v0.3.6 candidate. The retro framing held ("reports — does not prescribe"); v0.3.6 is the *prescriptive response* to the retro's *informational findings*. Direct framework-on-framework working.
- **Codex's own self-critique drove half the changes.** The 5 self-improvement points from CB-1.4 cycle informed: Step 0 framework-registration check (points 1 + 5) · Step 4 review-time freshness (point 3) · `direct-import-test-suspicious` anti-pattern (point 2) · `narrow-bug-focus` anti-pattern (Codex's own self-named failure). Point 4 (AC consistency check earlier) NOT integrated this round — single instance only, defer to a 2nd instance per codification rule. **First time Compass evolution was driven by a reviewer agent's own retrospective**, not user friction or framework-on-framework reflection alone. Worth watching whether this pattern recurs.
- **Other deferred Compass-originals (per Retro #004 codification readiness ranking):**
  - `[implementation-use-verification]` — 2 arguable instances (lesson 3 from v0.3.5 same-day + Codex point #3 partially); codified into reviewer.md Step 4 in this release as a practical application but NOT promoted to standalone canon entry. If/when it becomes structurally distinct from review-time freshness, promote then.
  - `[defense-in-depth-marker]` — still 1 instance (CB-1.4 only). Defer.
  - `[ac-consistency-check]` — still 1 instance (Codex point #4). Defer.
  - Multi-model review as numbered AGENTS.md principle — already hardened structurally in v0.3.5 same-day extension; promotion to numbered principle still premature.
- **5-shape catalog framing held.** v0.3.6 added 1 member to the existing 5 shapes (enforcement class gained `[mechanical-output-verification]`); did not introduce a 6th shape. Worth continuing to validate against the next 2-3 Compass-originals.
- **One Compass-original per session discipline.** 6 sessions running (v0.3.1 → v0.3.6). Cadence holds.
- **Correction (PR #1, 2026-06-02 — consumer-driven, crypto-app):** the Next.js anchors in `[mechanical-output-verification]` (canon.md + reviewer.md Step 0 + build.md Phase 2 step 7 + AGENTS.md) originally cited `.next/server/middleware-manifest.json` as the load-bearing artifact. Correct for Next 13–15; **wrong for Next 16+**. Next 16 relocated middleware/proxy registration to `.next/server/functions-config-manifest.json` (`/_middleware` entry with `runtime: "nodejs"` + matchers); the legacy file still exists but is **empty by design** in 16.x — anchoring on it would create exactly the `polished-but-broken` failure mode the canon entry was designed to close. PR #1 leads with the Next 16 anchor + retains pre-v16 anchor with the "empty by design on 16.x" caveat. **Discovered organically by crypto-app's CB-1.4 cycle on Next 16** — downstream Codex reviewer flagged the institutionalized-wrong-artifact during the v0.3.5 → v0.3.6 sync PR. **Distribution round-3 flowing organically in reverse** — consumer → framework correction, where the v0.3.7 roadmap was thinking framework → consumer propagation. Worth surfacing in next `/retro`: parallel-testbed consumer arrangements (aura-app pre-v16 + crypto-app v16) surface version-sensitivity in framework codifications that single-testbed development can't see. **The codification stands; the citation correction strengthens it** — this is also arguably a 2nd structurally-distinct instance of `[mechanical-output-verification]` (same pattern, different framework version), reinforcing the v0.3.6 codification rather than challenging it.

## [0.3.5] — 2026-06-01

> **`[agent-handoff]` Compass-original pattern + agent-agnostic GitHub Actions reviewer template + `/build` Phase 5 automated path.** User reported the Claude → Codex handoff as the last manual seam in an otherwise automated `/build` loop — terminal switch + manual prompt paste + manual return signal three times per review cycle. Compass ships the pattern (5-piece handoff shape) and a reference GitHub Action that consuming repos drop into `.github/workflows/` to remove the seam. **Agent-agnostic by design** per user direction ("AI → AI where AI can be Claude, Codex, or any other"). **5th Compass-original shape: handoff** (how the workflow PASSES BATON across agents).

### Added

- **New `[agent-handoff]` Compass-original entry** in `compass/framework/canon.md`. Names the 5-piece handoff shape: trigger artifact · trigger event · context window · output medium · loop signal. Agent-agnostic — the pattern abstracts over which AI plays the reviewer role. Compass ships the protocol + a parameterized GitHub Actions template; consumers customize per their reviewer.
- **`compass/scripts/agent-handoff.yml`** — GitHub Actions template. Triggers via `workflow_run` after CI succeeds on a `pull_request` event; resolves PR number; captures diff with `gh pr diff`; invokes the reviewer agent (one of four blocks: **Codex (default-enabled)** · Claude headless · Gemini · generic); posts findings as PR comment via `gh pr comment`. Permissions: `contents: read` + `pull-requests: write`. Falls through cleanly if no open PR found for the branch.
- **`compass/scripts/README.md` gained `agent-handoff.yml` section** with setup steps, handoff-shape table, agent-agnostic blocks summary, accuracy honesty (vendor CLI drift, replay/cost caveats, auth model), and manual-fallback note. Section includes freshness markers (`last_verified: 2026-06-01`, `freshness_window_days: 30`) tracking the Codex / Claude Code / Gemini CLI external sources — per `[freshness-check]`.
- **`/build` Phase 5 step 13 updated** to reference the automated path: "If `.github/workflows/ai-review.yml` is installed (per `compass/scripts/agent-handoff.yml`), the reviewer fires automatically on CI-green; otherwise the reviewer is invoked manually." Both paths terminate at the same place (structured findings as PR comment); automation removes tool-switch + manual prompt paste only. Manual fallback retained — automation is opt-in per consuming repo.
- **`compass/roles/reviewer.md` gained "How you're invoked" section** documenting both paths (automated via CI / manual fallback). Notes that freshness-check precondition (`/build` Phase 5 step 12a) runs before either path — stale `last_verified` blocks review entirely.
- **`compass/templates/workflow-template.md` gained inline commentary** on the agent-handoff pattern as an optional addition when workflows route work across agents. Notes the manual-fallback-stays-documented convention and that vendor CLI flags drift (sibling README tracks `last_verified`).
- **`AGENTS.md` "Workflow structure" section gained note** about `[agent-handoff]` as 5th Compass-original. Explicitly names the catalog spanning **five shapes**: enforcement · interaction · freshness · observability · handoff.
- **`compass/scripts/` directory framing in AGENTS.md updated** to reflect mixed contents (script + template): "Reference utility scripts AND templates that complement workflows. Each script/template single-file + stdlib-only + operator-friendly. Current entries: `token-usage.py` · `agent-handoff.yml`."

### Changed

- **Roadmap adjustment (2nd consecutive bump).** v0.3.3 committed v0.3.4 to freshness detection; v0.3.4 already bumped that to v0.3.5+; this round bumps it again to **v0.3.6+**. Token tracking (v0.3.4) and handoff automation (v0.3.5) were higher-leverage given user friction. Two consecutive bumps is a yellow flag — worth a `/retro` mention next time. Freshness-check workflow-side defense (v0.3.3) and `agent-handoff.yml` README's own freshness markers (v0.3.5) stand as user-side defense until detection ships.

### Notes

- **Agent-agnostic by user direction.** User said: *"ideally - AI → AI where AI can be Claude, Codex, or any other."* Template ships with four reviewer blocks (Codex default-enabled, Claude headless / Gemini / generic commented). Consumers pick one + set the matching API-key secret. The pattern generalizes; the YAML ships ready-to-customize.
- **Manual fallback always supported.** Pre-v0.3.5 behavior (open terminal, run `codex` against the reviewer prompt) is documented in `compass/roles/reviewer.md` and `/build` Phase 5. Automation is opt-in per repo. The framework does not assume CI infrastructure exists.
- **Vendor CLI drift is real and named.** The `npm install` packages and CLI flags shipped in the template are best-effort references; CLI surfaces drift. `compass/scripts/README.md` carries explicit freshness markers tracking Codex / Claude Code / Gemini CLI external sources. Verify before adoption; bump `last_verified` after confirming.
- **No replay protection in v0.3.5.** Every CI green triggers a reviewer invocation; CI re-runs trigger re-reviews. Acceptable for most projects; high-volume teams should add `concurrency:` groups or label gating. README names this as a future-script candidate.
- **`[agent-handoff]` is 1st instance.** Per codification rule (≥2-3 instances before promoting to AGENTS.md principle), wait for a 2nd workflow adopting it before considering principle #17 status. Likely 2nd instance: a future `/research` or `/triage` workflow needing cross-agent handoff (Researcher → Architect, Triager → Engineer).
- **No regression.** v0.3.4 `[role-boundary]` markers in `/build` still in place; v0.3.3 freshness-check precondition still in place; v0.3.2 elicitation-with-options + foundation-architecture intact; v0.3.1 Access & Data Posture intact.
- **Compass-originals catalog now spans five shapes.** Enforcement (cite-or-mark-n/a · refuse-escalate · soft-spec-hardening — what the workflow REQUIRES); interaction (elicitation-with-options — how the workflow ASKS); freshness (freshness-check — how the workflow STAYS CURRENT); observability (role-boundary — how the workflow EXPOSES STRUCTURE); **handoff (agent-handoff — how the workflow ROUTES across agents)**. The split between "what the framework demands" (enforcement) vs. "how the framework makes itself usable" (interaction · freshness · observability · handoff) is increasingly the load-bearing organization axis.
- **v0.3 cadence held: one Compass-original per session.** v0.3.1 (Access & Data Posture) · v0.3.2 (elicitation-with-options) · v0.3.3 (freshness-check) · v0.3.4 (role-boundary) · v0.3.5 (agent-handoff). Worth a retro after the next release lands (v0.3.6) — that will be improvement #21 cumulatively, near the next `/retro` fire counter.
- **Real-world validation — same day as ship (2026-06-01).** During aura-app CB-1.4's `/build` Phase 2, the Vercel routing-middleware skill (loaded by the Engineer agent independently of Compass freshness markers) surfaced **CVE-2025-29927** and the "middleware/proxy auth as sole protection" anti-pattern. Engineer captured the defense-in-depth design as a DRI Decision + source-code marker at the top of `proxy.ts`; future protected route handlers MUST re-verify session themselves rather than trusting the proxy's injected `x-session-user-id` / `x-session-id` headers as auth claims. **Four patterns fired together:** skill discipline (AGENTS.md) · soft-spec hardening (#14 — middleware-auth-as-sole-protection is exactly the rationalization surface) · DRI logging (#4 — captures *why* not *what*) · role-boundary source-code marker (file-level convention encoding). First observed evidence that framework discipline + skill ecosystem + tool currency compose to catch a CVE-relevant insight at design time, before deploy. Worth citing in next `/retro` as concrete validation of the freshness-check-class + skill-load-class composition. **Codification candidate** (defer per 2-3-instance rule): a `[defense-in-depth-marker]` Compass-original — source-code marker + DRI Decision + future-handler obligation. Would be 4th enforcement-class member if it ships, resetting catalog balance to 4:4 enforcement-vs-usability. Wait for 2nd instance.

## [0.3.4] — 2026-05-27

> **`[role-boundary]` Compass-original pattern + reference token-usage parser + new `compass/scripts/` framework directory.** User asked for per-role token tracking ("a way to capture the tokens used at every role"). Token tracking is genuinely the AI tool's job, but Compass can help by defining a role-boundary marker protocol and shipping a sample parser that attributes Claude Code session tokens to roles using the markers as anchors. **PM-owned** by convention (matches existing `/status` + `/plan` ownership of "make work visible" jobs).

### Added
- **New `[role-boundary]` Compass-original entry** in `compass/framework/canon.md`. Workflow steps that load or transition roles include HTML-comment markers — `<!-- COMPASS_ROLE_BOUNDARY: <enter|exit> | role=<name> | workflow=<id> | step=<N> -->`. Markers serve two purposes: documentation (translators see explicit role transitions) and parser anchors (the reference script attributes session tokens). Accuracy is rough, not exact — heuristics named explicitly in the parser's Confidence footer.
- **New `compass/scripts/` framework directory.** Reference utility scripts that complement workflows. First convention: single-file, stdlib-only, PM-operable. Justified by token tracking being structurally hard to solve with markdown docs alone. Sibling `README.md` per script for usage docs.
- **`compass/scripts/token-usage.py`** — single-file Python 3 stdlib parser. Reads a Claude Code session log + the workflow's role-boundary markers; produces a markdown report with per-workflow cost / per-role rollup / per-step breakdown. Default pricing $3/M input + $15/M output (Anthropic Sonnet 4.x family, 2026-05); configurable via `--price-in` / `--price-out`. Auto-detects workflow from session's first slash-command; can override via `--workflow`. Writes to stdout or `--out <path>`.
- **`compass/scripts/README.md`** — usage docs. Common Claude Code session-log locations per OS; invocation examples; accuracy honesty (linear-step assumption, multi-message approximation, user-interrupt sensitivity, pricing assumption); how the markers work; PM-ownership convention; candidates for future scripts (freshness detector, multi-session aggregator, marker linter).
- **`/build` workflow gained `[role-boundary]` markers** as the first instance. Engineer enters at Phase 2 step 3; exits at Phase 2 step 7. Reviewer enters at Phase 3 step 8; exits at Phase 3 step 10. Engineer re-enters at Phase 4 step 11; exits at step 12. Reviewer enters at Phase 5 step 12a; exits at step 16. Engineer re-enters at Phase 5 step 17; exits at step 18. Tech Writer enters at Phase 7 step 24; exits at step 28. Six matched enter/exit pairs across the multi-role workflow.
- **`compass/roles/project-manager.md` gained token-usage rollup as a PM responsibility.** New "When you play this role" bullet (manual invocation, no schedule). New "Output artifacts" entry for `docs/usage/<session-id>.md` when PM archives a report. Reference parser noted as adaptable for team-specific reporting needs.
- **`AGENTS.md` "Workflow structure" section gained note** about `[role-boundary]` as the third Compass-original interaction-class pattern (after `[elicitation-with-options]` v0.3.2 and `[freshness-check]` v0.3.3). Also brief mention of `compass/scripts/` as a new framework directory.
- **`compass/templates/workflow-template.md` gained inline commentary** on role-boundary markers as an optional addition when role transitions happen within the workflow.

### Changed
- **Roadmap adjustment:** v0.3.3 release notes committed v0.3.4 to **freshness detection** (CI on Compass repo watching external tools, auto-bumping `last_verified` markers). This round prioritizes token tracking instead. **Freshness detection bumps to v0.3.5+** — noted in canon.md `[freshness-check]` entry and AGENTS.md Workflow Structure note. The freshness-check workflow-side defense from v0.3.3 stands as the user-side defense until detection ships.

### Notes
- **Accuracy honesty.** The parser is a rough estimator. Round 1 = workflow-marker + parser; Round 2+ accuracy lands when richer AI-tool integration matures (Claude Code feature request territory). The Confidence footer in the report names the heuristics used so consumers know the bounds.
- **PM ownership = light touch this round.** PM manually invokes the parser when token-usage visibility is wanted. **No new `/usage` workflow.** Future v0.3.x can promote to a workflow if integration becomes load-bearing.
- **No regression.** v0.3.3 `[freshness-check]` intact (build.md Phase 5 step 12a still present); v0.3.2 `[elicitation-with-options]` intact; v0.3.1 Access & Data Posture intact.
- **`[role-boundary]` is 1st instance.** Per codification rule (≥2-3 instances before promoting to AGENTS.md principle), wait for a 2nd workflow adopting it before considering principle #17 status. Likely 2nd instance: retroactive marker application to `/create-brief` or `/setup-product` (both multi-role).
- **Compass-originals catalog now spans four shapes.** Enforcement (cite-or-mark-n/a · refuse-escalate · soft-spec-hardening — what the workflow REQUIRES); interaction (elicitation-with-options — how the workflow ASKS); freshness (freshness-check — how the workflow STAYS CURRENT); observability (role-boundary — how the workflow EXPOSES STRUCTURE). Worth watching whether a 5th shape surfaces as the framework grows.

## [0.3.3] — 2026-05-27

> **`[freshness-check]` Compass-original pattern + Codex format as first application (pull-bridge round 1 of 3).** User ran `/build`; Codex review failed because Codex's format had changed and Compass's docs about the format had gone stale. Class problem — same drift surface hits MCP APIs, library versions, vendor conventions, cloud platform docs. Establishes a structural defense.

### Added
- **New `[freshness-check]` Compass-original entry** in `compass/framework/canon.md`. Compass docs that reference external-tool formats / APIs / conventions get frontmatter markers (`last_verified`, `freshness_window_days`, `external_source`); workflows that depend on those docs add a Precondition that refuses if stale. Missing `last_verified` treated as infinitely stale (forces one-time backfill on first use). Closes the soft-spec-rationalization surface where Compass docs silently go stale against evolving external tools.
- **`compass/roles/reviewer.md` gained freshness frontmatter** — `last_verified: 2026-05-27`, `freshness_window_days: 30`, `external_source: https://github.com/openai/codex`. Existing "Review output format" section renamed to **"Expected Codex output shape"** with explicit field-by-field expectations (severity tag brackets, File:line format, three labeled sub-fields per finding, terminal verdict block, top-checklist order). The structured format gives `[freshness-check]` something semantically verifiable in future rounds.
- **`/build` Phase 5 gained step 12a — freshness-check precondition.** Before Codex review begins, reads `reviewer.md` frontmatter; refuses with pointer to external source + file to update if stale or markers missing. Per Principle #16 — refuse + escalate to the doc that owns the external-tool reference.
- **`AGENTS.md` "Workflow structure" section gained note** about `[freshness-check]` as the second Compass-original interaction-class pattern (after `[elicitation-with-options]`).

### Notes
- **Pull-bridge model toward push.** User's framing was *"compass should always check for latest changes and update the user or the doc … it should ideally be a push from compass to the repo owners."* Push is right long-term but requires two pieces of infrastructure that don't exist today: **detection** (something watches external tools) and **distribution** (something delivers updates to consuming repos). v0.3.3 is round 1 — workflow-side check at invocation time. **v0.3.4** will add detection (CI on Compass repo watches Codex / MCP / library / Vercel changelogs; auto-updates Compass docs + bumps `last_verified`). **v0.4+** will add distribution (Compass framework updates auto-propagate as PRs to consuming repos, per user pick *"pushed doc updates"*). Each step delivers value; final state is push.
- **No detection infrastructure this round.** v0.3.3 is mechanical date-based check only. User manually verifies + updates after checking external source. Detection is v0.3.4 territory; bundling now would push back the immediate unblock.
- **No application beyond Codex format.** MCP connector specs, library versions in `/setup-foundation-architecture` elicitation options, Vercel deploy conventions all get freshness markers when each becomes a load-bearing concern in a future session (same one-per-session discipline as workflow hardening).
- **`[freshness-check]` not codified as AGENTS.md cross-cutting principle yet.** Per codification rule — wait for ≥2 applications. This is instance 1; next instance (likely MCP or library) triggers principle #17 status.
- **Trigger:** real Codex format drift broke a `/build` invocation in aura-app. Same dogfood-driven evidence trail as v0.3.0-alpha, v0.3.1, v0.3.2.

## [0.3.2] — 2026-05-27

> **`/setup-foundation-architecture` hardened to v0.3 template + interactive elicitation pattern introduced.** Second workflow translation in the v0.3 cycle. Bundles three things in one release per user direction: (1) v0.3 hardening (gate/work/postcondition template translation), (2) framework grounding section (per v0.3.0-alpha Part 2 — every v0.3+ workflow has it), (3) **NEW `[elicitation-with-options]` Compass-original pattern** — workflow asks user about each architecture decision, presents 3 widely-used options with "Other (specify)" escape, captures pick + rationale + per-pillar implication.

### Added
- **`compass/framework/canon.md` gained 3 entries:**
  - **New top-level section "Architecture frameworks"** with: `[well-architected]` (AWS Well-Architected Framework — 6 pillars; 2015 + sustainability added 2021) and `[evolutionary-architecture]` (*Building Evolutionary Architectures* — Ford / Parsons / Kua, 2017; fitness functions as continuous architectural tests).
  - **Compass-originals section gained `[elicitation-with-options]`** — interaction pattern for surfacing choices to the user. Static anchor (3 options) + cascading subsequent decisions (3 options biased by prior picks) + "Other (specify)" escape valve. Each pick captured with rationale + per-pillar implication. First applied in `/setup-foundation-architecture`.
- **`/setup-foundation-architecture` translated to v0.3 hardening template** — full gate/work/postcondition structure (16 Phase A steps + 5 Phase B steps); framework grounding section; preserved all v0.1.11 / v0.1.12 / v0.2.4 / v0.2.7 behavior (Phase A/B HITL gate split, foundational data model derived before stack picks, bet-arch deviation gate reference, multi-target canary, ADR / Amendments).
- **NEW interactive elicitation behavior:** anchor decision (primary language + deployment model) + 4 cascading stack-layer elicitations (frontend / backend / data / ops). Each presents 3 widely-used options + Other. Layer cascades bias options by prior picks (e.g., anchor=TS+Vercel → frontend options favor Next.js + Turbopack + Tailwind). Backend elicitation's auth model derives from foundation-product Access & Data Posture (v0.3.1); divergence triggers refuse + escalate (Principle #16). Data stack elicitation cites Foundational Data Model (v0.1.12); DB pick that ignores entity shape fails postcondition. Each pick records per-pillar implication (replaces v0.1.11 separate pillar-scoring step; pillar scoring now baked into each elicitation step's Postcondition).
- **`compass/templates/foundation-architecture.md` gained "Stack picks (elicited)" section** between Foundational Data Model and Stack — captures anchor + 4 layer picks with cited option, cascade rationale, one-line rationale, one-line per-pillar implication per pick.
- **`compass/templates/workflow-template.md` gained inline commentary** on elicitation steps as a valid Steps pattern (when the workflow's job is to capture user choices).
- **`AGENTS.md` "Workflow structure" section gained note** about the elicitation pattern as a named Compass-original; pointer to `canon.md` entry.

### Changed
- **Deliberate violation of v0.3.0-alpha "preserve all existing behavior" hardening rule.** The elicitation pattern is a real behavior change (replaces "draft with smart defaults, ask for approval" with "ask user, present curated options, capture pick"). Per user direction. Documented as precedent break in `compass/workflows/improvements.md` so future translators don't quietly assume the rule still binds.
- **Pillar scoring restructured** — previously a separate concern in the old "Make project-level choices" step (v0.1.11). Now baked into each of the 5 elicitation steps' Postconditions (anchor + 4 layers each capture per-pillar implication). No loss of pillar discipline; restructured for the elicitation flow.
- **Phase A step count: 12 → 16** (added 5 elicitation steps; removed 1 old "Make project-level choices" step). Phase B unchanged (5 steps, renumbered 17-21).

### Notes
- **Scoping discipline preserved.** This is the 2nd workflow translation in v0.3; one workflow per session, deliberate pace. `/create-brief` (every-bet declares Access & Data per v0.3.1 pattern) and `/create-bet-architecture` (deviation gate semantics + bet-level data model) are next candidates — separate sessions.
- **`[elicitation-with-options]` is 1st instance** of a new Compass-original pattern. Per codification rule (≥2-3 instances before promoting to AGENTS.md principle), wait for a 2nd workflow adopting it before considering principle #17 status. Likely 2nd instance: retroactive enhancement of `/setup-product` Access & Data Posture fields (v0.3.1) to use elicitation-with-options for the 3 enums — would land as v0.3.3 or later.
- **Density measure** (v0.3.0-alpha) applied: each elicitation step is load-bearing (captures a decision + rationale + pillar implication). Density check after translation should hold or improve vs original.
- **Trigger:** user picked `/setup-foundation-architecture` as the next workflow to harden per v0.3 cadence + requested the elicitation pattern as new behavior. Same dogfood-driven evidence trail as v0.3.0-alpha and v0.3.1.

> **Foundational issue named: every product bet declares Access & Data Posture.** First time auth/identity gets named at the framework level. Aura-app dogfooding revealed `/setup-foundation-architecture` skipped auth entirely; Explore-agent triage confirmed the gap is upstream at the foundation-product layer (template has no auth/access section; Verification has zero auth gates; 16 AGENTS.md principles, none names this).

### Added
- **New "Access & Data Posture" section in `compass/templates/foundation-product.md`**, placed after Personas. Three foundational fields: auth posture (anonymous · registered · authenticated · MFA-required · regulated-identity) · data sensitivity (none · public · PII · sensitive · regulated) · regulatory regime (none · GDPR · HIPAA · SOC 2 · PCI DSS · sector-specific · combination). Closed enums; mandatory; `n/a — <reason>` allowed for genuinely non-applicable cases (e.g., internal build tooling); per Principle #15 — empty / unjustified-n/a fails.
- **`/setup-product` Step 5 gained explicit elicitation sub-bullet.** Workflow now **asks the user the 3 questions conversationally** rather than trusting the agent to populate the section silently. Per Principle #14 — silent skipping is the failure mode; explicit elicitation closes the rationalization surface.
- **Verification gate item** added to `/setup-product`: section populated, all 3 fields with value or `n/a — <reason>`; HITL gate cannot pass otherwise.

### Notes
- **Scoped tight on purpose.** `/setup-product` only this round. `/create-brief` (every-bet declares Access & Data) and `/setup-foundation-architecture` (auth model derived from product posture) deferred to v0.3.2+. Decide-before-derive: product sets posture; downstream derives.
- **No new AGENTS.md principle yet.** The "every bet declares access & data" pattern would be principle #17, but only one instance exists (foundational product). Per the codification rule (≥3-5 instances before promoting), wait for `/create-brief` treatment in v0.3.2 to land a 2nd instance, then codify.
- **Pattern reuse:** closed enums + n/a-with-reason mirrors Story Standard Experience checklist (v0.2.6). Cite-or-mark-n/a per Principle #15. Conversational elicitation step mirrors how Researcher's 6-category framework (v0.1.8) catches the soft-spec-rationalization failure mode.
- **Aura-app trigger:** user ran `/setup-foundation-architecture` on a project, observed it neither asked about authentication nor scaffolded any auth-related boundary. Explore-agent triage confirmed: template silent, workflow silent, no prior improvements entry, no principle naming it. First-time-named at framework level.
