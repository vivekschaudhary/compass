# Compass MVP Scope

**Target:** ship by end of June 2026 — "start sending"
**Unlock:** orchestrator v0.4-alpha makes Compass executable end-to-end without manual host-switching
**Status (2026-06-24): MVP functionally complete.** The original "start sending" bar (below) is met; the orchestrator runs the core lifecycle end-to-end, all agents are migrated, multi-host routing is live, and the cockpit/dashboard + cost controls shipped *beyond* the original alpha scope. Remaining work is hardening + the post-MVP roadmap, not the MVP itself. Exact build state lives in `CHANGELOG.md` + `compass/workflows/improvements.md` (single sources); this file is the scope map, not a version log.

---

## The MVP unlock: orchestrator v0.4-alpha — SHIPPED

The orchestrator is what makes Compass shippable — without it, Compass is a doc framework that needs a human to switch between Claude Code / Codex / Gemini and interpret workflow prose. With it, one CLI command runs a workflow end-to-end.

**Shipped (exceeds the original single-host alpha scope):**
- Reads `compass/workflows/<workflow>.md` dispatch graphs; iterates steps; loads `compass/agents/<agent>.md` as system prompt
- **Multi-host dispatch** via each agent's `preferred_hosts:` (`router.py` → Claude / OpenAI-family / Gemini APIs) — *was deferred to beta; delivered in MVP*
- **Tool-using executor** (Claude) under `--allow-write` (read→write→verify loop, `hosts/tools.py`)
- **HITL gates** — interactive AND async (`--non-interactive` pause-and-resume, #118); the gate floor never auto-decides
- **The cockpit** — user-local event spine (`events.py`) + portfolio-wide views: text, HTML snapshot, and a live `--serve` browser feed (#104/#111/#113)
- **Dashboard-as-orchestrator** — launch + approve/route from the browser (#119), runs paused at gates you decide async
- **Cost controls** — Sonnet-by-default (#115), `--max-cost` budget cap (#116), cockpit spend rollup (#106)
- **Flat-cost dispatch** — the `claude-code` host runs on the `claude` CLI subscription, no `ANTHROPIC_API_KEY` (#120)
- CLI entry: `python3 -m compass.orchestrator.run <workflow> [--dry-run]`

**Still deferred (post-MVP — see roadmap below):** OpenAI/Gemini tool-use adapters · async/parallel step execution · LLM-as-driver autonomous orchestration (DESIGN surface 3).

---

## "Start sending" criteria — ALL MET

- [x] `python3 -m compass.orchestrator.run setup-product` runs end-to-end without human host-switching
- [x] `python3 -m compass.orchestrator.run build` runs end-to-end without human host-switching
- [x] All Product pack + Build pack agents present in `compass/agents/`
- [x] Orchestrator handles HITL gates correctly (doesn't skip, doesn't loop)
- [x] A new user can clone, set `ANTHROPIC_API_KEY` (or use `--claude-cli` for the subscription), run a workflow, and get an artifact

---

## Agent pack — all 14 migrated (v0.3.36)

Every agent lives in `compass/agents/` with self-sufficient frontmatter (`preferred_hosts:`, tasks, refusal rules). `compass/roles/` is grace-period only (removed in v0.4).

| Pack | Agents (all ✅ in `compass/agents/`) |
|---|---|
| Product | `pm` · `researcher` · `designer` · `ux-writer` |
| Build | `architect` · `enterprise-architect` · `engineer` · `reviewer` (codex/gemini) · `automation` · `tech-writer` |
| Support | `support` · `scanner` |
| Delivery | `delivery-manager` |
| Security | `security-reviewer` (codex/gemini) |

Reviewer + security-reviewer declare `preferred_hosts: [codex, gemini]` — cross-model review independence enforced at the file level.

---

## Connecting workflows — core lifecycle orchestratable

9 of 17 workflows are in dispatch-graph shape (the count `consistency-check.py` verifies against `AGENTS.md`). The full bootstrap→build→fix/triage chain runs via the orchestrator:

| Workflow | Status |
|---|---|
| `/setup-product` · `/setup-foundation-architecture` · `/create-brief` · `/create-bet-architecture` · `/create-story` · `/build` · `/fix` · `/triage` · `/ops` | ✅ dispatch-graph |
| Visibility/analysis (`/status`, `/plan`, `/dashboard`, `/metrics`, `/measure`, `/scan`, `/retro`) | prose (run interactively; orchestration post-MVP) |

---

## Post-MVP roadmap (open items)

Hardening + expansion, tracked as normal improvements. 🟡 should-have · 🟢 later. Overlaid with Retro #025's watch-fors + codification candidates.

| Item | Kind | Priority |
|---|---|---|
| `dispatch-on-outcome` — a step's refusal halts, not cascades | correctness | 🟡 |
| Branch discipline on the interactive surface (agents/CLAUDE.md, not just `run.py`) | consistency | 🟡 |
| ~~Codify `[failure-direction-inversion]`~~ → codified as `[fail-loud-not-silent]` (#127) | convention | ✅ |
| Codify `[surface-independent-mechanism]` + `[economy-by-default]` (≥3 instances) | convention | 🟢 |
| CLI-host tool streaming (`claude -p --output-format stream-json` → per-tool events) | cockpit polish | 🟢 |
| OpenAI/Gemini tool-use adapters (only Claude has `dispatch_with_tools`) | host parity | 🟢 |
| Worktree isolation (#102) · testable-preview canary (#101) | build hardening | 🟢 |
| LLM-as-driver / autonomous orchestrator (DESIGN surface 3, #87) | vision | 🟢 |
| A second consumer signal (break single-session concentration) | validation | 🟢 |
| Smaller: `sync --check` drift mode · gemini `max_tokens` check · drafted-handoff-prompt · `[continue-not-fork-on-resume]` 2nd instance | opportunistic | 🟢 |

---

## What "start sending" means

MVP is shippable when the criteria above are met — **they are.** A new user clones the repo, sets a key (or `--claude-cli`), and runs a real workflow end-to-end with the orchestrator conducting host handoffs and pausing at the decisions that matter.
