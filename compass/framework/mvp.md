# Compass MVP Scope

**Target:** ship by end of June 2026 — "start sending"
**Unlock:** orchestrator v0.4-alpha makes Compass executable end-to-end without manual host-switching
**Strategy:** orchestrator-first, then vertical slice through agent pack. Don't build every agent before the orchestrator; build the orchestrator + one working vertical, then fill the pack.

---

## The MVP unlock: orchestrator v0.4-alpha

The orchestrator is what makes Compass shippable — without it, Compass is a doc framework that requires a human to manually switch between Claude Code / Claude Desktop / Codex and interpret workflow prose. With it, a single CLI command runs a workflow end-to-end.

**v0.4-alpha scope (single-host):**
- Reads `compass/workflows/<workflow>.md` dispatch graph
- Iterates steps; for each step loads `compass/agents/<agent>.md` as system prompt
- Sends task inputs as user message to Claude API (`claude-opus-4-8`)
- Receives output; writes artifact to `docs/` or prints to stdout
- HITL gate handler: pauses + prompts user when a gate fires, resumes on approval
- Git automation: commits artifacts with conventional-commit messages after each phase
- CLI entry: `compass run <workflow> [--dry-run]`

**v0.4-alpha explicitly defers:**
- Multi-host dispatch (all steps → Claude API in alpha; preferred_hosts routing in beta)
- Async / parallel step execution
- Full artifact registry (structured I/O schema per step)
- Authentication management for non-Claude hosts

---

## MVP agent pack

Organized by pack. ✅ = agent file exists in `compass/agents/`. ❌ = needs migration from `compass/roles/` or creation from scratch.

### Product pack
| Agent | Status | Notes |
|---|---|---|
| PM | ✅ `agents/pm.md` (v0.3.23) | Trimmed to cap; participates in /build |
| Researcher | ✅ `agents/researcher.md` (v0.3.21) | Trimmed to cap |
| Designer | ❌ migrate `roles/designer.md` | UX/visual design tasks |
| UX Writer | ❌ migrate `roles/ux-writer.md` | Copy + content tasks |

### Build pack
| Agent | Status | Notes |
|---|---|---|
| Architect | ❌ migrate `roles/architect.md` | Highest-leverage unblock; owns /create-bet-architecture |
| Engineer | ✅ `agents/engineer.md` (v0.3.23) | Has respond-to-review task |
| Reviewer | ✅ `agents/reviewer.md` | Cross-host: preferred_hosts: [codex, gemini] |
| Automation | ❌ new agent (no legacy role) | Scope: E2E tests + CI/CD + deploy + release engineering; split from Reviewer |

### GTM pack
| Agent | Status | Notes |
|---|---|---|
| Launch Engineer | ❌ new agent | Composite: launch checklist + comms + distribution; no direct legacy role |

### Support pack
| Agent | Status | Notes |
|---|---|---|
| Triage | ❌ migrate `roles/support.md` | Bug triage + incident response |
| Observability | ❌ new agent | Logging patterns + monitoring + alerting; [agent-file-compression] 3rd observability-class member |

### In-pack but deferred (post-MVP)
| Agent | Decision | Rationale |
|---|---|---|
| Security Reviewer | Defer | Load-bearing for PII/payments — but post-alpha; cross-host integrity preserved in `roles/security-reviewer.md` |
| Delivery Manager | Defer | ✅ already migrated (`agents/delivery-manager.md`); include when orchestrator can route multi-agent coordination |
| Tech Writer | Out | Changelog accumulation absorbed into Engineer commit conventions; no dedicated agent needed in alpha |
| Enterprise Architect | Out | Niche; use Architect for MVP scope |
| Scanner | Out | Pure mechanical script; no agent needed |

---

## Connecting workflows

Workflows that need to be in dispatch-graph shape before the orchestrator can run them:

| Workflow | Status | Priority |
|---|---|---|
| `/setup-product` | ✅ dispatch-graph (v0.3.14) | Done |
| `/build` | ✅ dispatch-graph (v0.3.23) | Done |
| `/create-bet-architecture` | ❌ legacy prose | High — Architect agent unlock |
| `/create-brief` | ❌ legacy prose | High — Product pack vertical slice |
| `/create-story` | ❌ legacy prose | Medium — follows brief |
| `/triage` | ❌ legacy prose | Medium — Support pack |
| All others | ❌ legacy prose | Post-MVP |

---

## Build order (vertical slice)

Don't build horizontal (all agents, then orchestrator). Build vertical: one working end-to-end slice, then widen.

**Slice 1 — Product vertical (first shippable demo):**
1. Orchestrator v0.4-alpha-0 skeleton (CLI + graph parser + Claude adapter + HITL stub)
2. Orchestrator first dispatch: `pm.setup-product-foundation` via `/setup-product` Step 1
3. Architect agent migration (unlocks `/create-bet-architecture`)
4. `/create-bet-architecture` → dispatch-graph shape
5. Full `/setup-product` + `/create-bet-architecture` running end-to-end via orchestrator

**Slice 2 — Build vertical:**
6. Designer + UX Writer migration (complete Product pack)
7. Automation agent (new)
8. Full `/build` running end-to-end via orchestrator

**Slice 3 — GTM + Support:**
9. Launch Engineer agent (new)
10. Triage agent migration
11. Observability agent (new)
12. `/triage` → dispatch-graph shape

---

## Open questions (best-guess defaults — revise as needed)

| Question | Default | Confidence |
|---|---|---|
| Automation agent scope | E2E + CI/CD + deploy + release; split from Reviewer | High |
| GTM shape | Launch Engineer (single composite agent) | Medium |
| Security Reviewer in MVP | Defer to post-alpha | Medium |
| Delivery Manager in MVP | Defer (already migrated; include in v0.4-beta) | Medium |
| Multi-host in v0.4-alpha | All → Claude API; routing in beta | High |

---

## What "start sending" means

MVP is shippable when:
- [ ] `python3 -m compass.orchestrator.run setup-product` runs end-to-end without human host-switching
- [ ] `python3 -m compass.orchestrator.run build` runs end-to-end without human host-switching
- [ ] All Product pack + Build pack agents present in `compass/agents/`
- [ ] Orchestrator handles HITL gates correctly (doesn't skip, doesn't loop)
- [ ] A new user can clone the repo, set `ANTHROPIC_API_KEY`, run `python3 -m compass.orchestrator.run setup-product`, and get an artifact
