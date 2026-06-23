# Compass — `scripts/`

Reference utility scripts and templates that complement Compass workflows. Each entry is single-file. Adopt as-is or fork for team-specific needs.

**Owner convention:** scripts in this directory are operated by the **Delivery Manager** agent (matching the existing `/status` + `/plan` ownership of "make work visible" jobs). Renamed from Project Manager in v0.3.15. The `agent-handoff.yml` template is consumed by Engineer / Reviewer agents through CI rather than invoked by Delivery Manager directly — it lives here because it ships with Compass as a reference, alongside `token-usage.py`.

---

## `sync-into-consumer.py` — sync a consumer's embedded Compass copy (#114)

Keeps a consumer project's **embedded** framework copy current with the live framework, for teams that use the interactive `/skills` surface (which reads the embedded `compass/` + `.claude/skills`) alongside the orchestrator. **Dry-run by default**; `--apply` performs it after backing up the consumer's `compass/`. Overwrites the framework machinery, preserves the consumer's own files (`config.yaml`, `docs/`, `.github/`, …), prunes the framework's meta-logs. See MIGRATION.md → "Keeping a consumer in sync."

```bash
python3 compass/scripts/sync-into-consumer.py <consumer-dir>            # dry-run (plan only)
python3 compass/scripts/sync-into-consumer.py <consumer-dir> --apply    # perform + backup
```

---

## `token-usage.py` — per-role token rollup

Parses a Claude Code session log and a Compass workflow markdown file; attributes tokens to roles using the workflow's `COMPASS_ROLE_BOUNDARY` markers as anchors (per the `[role-boundary]` Compass-original pattern in `compass/framework/canon.md`); produces a markdown report.

### What it produces

- **Per-workflow cost** — total input + output tokens, $ estimate at current Anthropic Sonnet 4.x pricing
- **Per-role rollup** — table of input/output/total/$ by role, sorted by total descending
- **Per-step breakdown** — table mapping each workflow step to its attributed tokens with cumulative %
- **Confidence footer** — names the heuristics used so readers know the accuracy bounds

### Usage

```bash
# Stdout
python compass/scripts/token-usage.py ~/.config/claude-code/sessions/<session>.jsonl

# Write to file (PM archive)
python compass/scripts/token-usage.py <session-log> --out docs/usage/build-2026-05-27.md

# Force a specific workflow file (otherwise auto-detected from the first slash-command in the session)
python compass/scripts/token-usage.py <session-log> --workflow compass/workflows/build.md

# Custom pricing (defaults: $3/M input, $15/M output — adjust to your model)
python compass/scripts/token-usage.py <session-log> --price-in 3.0 --price-out 15.0
```

### Finding Claude Code session logs

The exact path depends on your Claude Code version + OS. Common locations:

- **macOS:** `~/.config/claude-code/sessions/` or `~/Library/Application Support/claude-code/sessions/`
- **Linux:** `~/.config/claude-code/sessions/`
- **Windows:** `%APPDATA%\claude-code\sessions\`

If you can't find them, check Claude Code settings or run `claude-code --help` for the current session-log path. The script accepts either JSON or JSONL format; Claude Code typically writes JSONL.

### Accuracy honesty

This is a **rough estimator**, not exact attribution. Heuristics used:

- **Linear step assumption** — messages mapped to workflow steps by ordinal position. Out-of-order execution = off attribution.
- **Multi-message-per-step approximation** — divides total messages evenly across steps. Heavy steps are under-counted; light steps are over-counted.
- **User-interrupt sensitivity** — user messages mid-session shift the mapping.
- **Tool-call attribution** — per step, not per tool call within a step.
- **Pricing assumption** — Anthropic Sonnet 4.x current rates (configurable).

The report's Confidence footer names all of these explicitly so consumers know the bounds.

**For exact attribution, AI-tool integration is required** (Claude Code feature request territory). This script is the reference round-1 implementation per the `[role-boundary]` pattern — round 2+ accuracy lands when richer AI-tool instrumentation matures.

### How the markers work

Compass workflows in v0.3.4+ include HTML-comment markers at role load/transition points:

```markdown
### 3. Engineer implements

<!-- COMPASS_ROLE_BOUNDARY: enter | role=engineer | workflow=build | step=3 -->

**Work (Claude):** Engineer implements the story...

<!-- COMPASS_ROLE_BOUNDARY: exit | role=engineer | workflow=build | step=7 -->
```

The script reads these markers from the workflow file referenced by the session's initial slash-command. If a workflow has no markers (most v0.2.x and pre-v0.3.4 workflows), the script falls back to attributing everything to `(unattributed)`. Add markers to a workflow when you want per-role visibility for it.

### When to use this

- **Cost transparency** — periodic check of what Compass costs in your project
- **Role optimization** — identify role docs that consume disproportionate tokens (candidates for tightening)
- **Debugging / explainability** — when a workflow run feels expensive, see where the tokens went
- **Team reporting** — aggregate across many sessions (current script handles one at a time; team-wide rollup is v0.3.x+ territory)

Delivery-Manager-owned by convention — see `compass/agents/delivery-manager.md` (Task `rollup-token-usage`) for token-usage rollup as a Delivery Manager responsibility. (Renamed + migrated v0.3.15; legacy role file `compass/roles/project-manager.md` retained during v0.3.x grace period.)

---

---

## `agent-handoff.yml` — GitHub Actions reviewer template

> Last verified against vendor CLIs: **2026-06-01**. Freshness window: **30 days**.
> External sources tracked: `https://github.com/openai/codex` · `https://docs.anthropic.com/claude/docs/claude-code` · `https://github.com/google/gemini-cli`.
> Re-verify install commands + invocation flags before the window expires; bump `last_verified` after confirmation. Per `[freshness-check]` (canon.md).

Automates the Engineer → Reviewer handoff for `/build`. When CI passes on a PR, the workflow runs the reviewer agent against the diff and posts findings as a PR comment. The sending agent (Claude) reads the comment back via GitHub MCP the next session — no terminal switch, no manual prompt paste.

Per the `[agent-handoff]` Compass-original pattern in `compass/framework/canon.md` (v0.3.5).

### Setup in your consuming repo

1. **Copy the template** to your repo: `cp compass/scripts/agent-handoff.yml .github/workflows/ai-review.yml` (in the consuming repo, not the Compass repo).
2. **Set the CI workflow name** in the `workflows:` line near the top of the file to match YOUR CI workflow's `name:` value (the human-readable name, not the YAML file name).
3. **Add the API-key secret** matching the reviewer block you enable, in your repo's GitHub Settings → Secrets:
   - `OPENAI_API_KEY` (Option A — Codex)
   - `ANTHROPIC_API_KEY` (Option B — Claude headless)
   - `GOOGLE_API_KEY` (Option C — Gemini)
   - Your provider's key (Option D — generic)
4. **Pick ONE reviewer block** in the YAML; leave the others commented out.
5. **Verify the install command + CLI flags** for your chosen reviewer against current vendor docs. The values shipped are best-effort references; CLI surfaces drift.

After the first PR opens, the action runs on CI completion; findings post as a PR comment. Claude (next session) reads them via GitHub MCP and addresses BLOCKERs / ISSUEs.

### Handoff shape (per [agent-handoff])

| Piece | Value |
|---|---|
| **Trigger artifact** | The PR (opened or synchronized) |
| **Trigger event** | `workflow_run` on CI completion |
| **Context window** | `pr.diff` + your reviewer prompt file |
| **Output medium** | PR comment (posted via `gh pr comment`) |
| **Loop signal** | Claude reads PR comments via GitHub MCP next session |

### Agent-agnostic by design

The template ships with four reviewer blocks (Codex / Claude headless / Gemini / generic CLI). Each block: install CLI · invoke with prompt + diff · capture findings to `review.md`. The default-enabled block is Codex (matching the canonical Compass tool division: Claude implements, Codex reviews); the alternatives match alternate setups.

### Accuracy honesty + caveats

- **Vendor CLI drift is real.** The `npm install` packages and CLI flags shown are placeholder references. Verify against current vendor docs before adoption; the freshness markers above name the window.
- **No replay protection.** If CI re-runs, the workflow re-runs and posts another review comment. Acceptable for most teams; if noisy, add a `concurrency:` group or check for existing review comments before posting.
- **Cost.** Every PR (and every `git push` while CI re-runs) triggers a reviewer invocation. Budget accordingly — for high-PR-volume repos, consider gating on a label (`needs-review`) instead of every CI-green.
- **Auth model.** GitHub Actions writes the review comment using `secrets.GITHUB_TOKEN`. The reviewer agent uses YOUR API key (one of the secrets above). Both must be set.

### Manual fallback always supported

If the template isn't installed, the Engineer → Reviewer handoff stays manual exactly as it was pre-v0.3.5: terminal → `codex` → reviewer prompt → PR. Both paths terminate at the same place (findings as PR comment); automation removes the tool-switch only. See `compass/agents/reviewer.md` task `review-pr` for the full review process (migrated from `compass/roles/reviewer.md` in v0.3.16).

---

---

## `check-freshness.py` — `[freshness-check]` pull-bridge round 2 (v0.3.7)

Walks `compass/` for files with `last_verified:` frontmatter; queries each file's `external_source` (GitHub API or HTTP Last-Modified); auto-bumps where the external source is unchanged since `last_verified`; flags where it has changed; errors when it can't tell.

**Closes the 3-slip commitment** (v0.3.3 promised round 2 for v0.3.4; slipped to v0.3.5+, v0.3.6+, finally landed v0.3.7).

### What it produces

- **Auto-bumped** files (safe — external unchanged) — `last_verified` updated to today
- **Flagged** files (external changed — needs human review) — Compass doc may be stale; verify against external source
- **Errors** (network / parse failure) — no action taken; surface to human
- Markdown report at stdout + (optionally) a file via `--out`

### Usage

```bash
# Dry-run (preview only — does not mutate files)
python compass/scripts/check-freshness.py

# Apply mode (mutates files in-place)
python compass/scripts/check-freshness.py --apply

# Write report to a file (in addition to stdout)
python compass/scripts/check-freshness.py --apply --out report.md

# Override "today" for deterministic CI testing
python compass/scripts/check-freshness.py --today 2026-06-01
```

### Exit codes

- `0` — every checked file is fresh or safely auto-bumped (no human attention needed)
- `1` — at least one file flagged or errored (human review needed; CI uses this to open PR/Issue)
- `2` — usage error (e.g., bad `--root` path)

### Detection strategies

| External source pattern | Signal used | Accuracy |
|---|---|---|
| `https://github.com/<owner>/<repo>` | Latest release `published_at` (primary) · latest tag commit date (fallback) · latest commit date on default branch (last-resort) | High for releases, medium for tags, noisy for commits |
| Any other URL | HTTP `Last-Modified` header (HEAD, fallback GET) | Variable — many doc sites don't return it accurately |
| Anything else | Flag + error | — |

### Accuracy honesty

This is **HTTP-level** detection, not semantic. The script knows when external source timestamps changed, not whether the actual content matters:
- A doc page may change cosmetically without affecting Compass; the script flags it anyway.
- A CLI tool may publish a release that doesn't change its surface; the script flags it anyway.
- **Auto-bump only happens when external is UNCHANGED** — the directional bias is "safer to flag than to silently mark stale docs fresh."
- **Network errors flag** rather than bump.

For semantic verification (did the Codex CLI surface ACTUALLY change?), an LLM is required — not stdlib. Round 2 ships HTTP-level detection only; semantic-level detection is a future candidate (would likely need MCP servers like the Anthropic/OpenAI MCPs that LLMs already use for current-state queries).

### Automated execution

`.github/workflows/freshness-check.yml` runs the script weekly (Mondays 06:00 UTC) on the Compass repo itself. On any week with bumps OR flags, it opens a PR (if bumps applied) or an Issue (if flags only). Manual trigger via Actions UI also supported.

**Round 3 (v0.4+):** distribution — Compass framework updates auto-propagate to consuming repos as PRs. Multi-consumer reality (multiple consumer projects at different framework versions, observed in v0.3.7 cycle) strengthens the case but is still deferred.

### When to use this

- **Automatic (preferred):** GitHub Actions runs the script weekly; humans review the resulting PR/Issue.
- **Manual:** any time you've updated a Compass doc that references an external tool, run `python compass/scripts/check-freshness.py --apply` locally before committing — the script bumps `last_verified` correctly without requiring you to remember.
- **Pre-release:** before a Compass version bump, run the script to verify all freshness markers are current.

---

## `check-agent-cap.py` — `[agent-file-compression]` mechanical defense (v0.3.22)

Walks `compass/agents/*.md`; checks each file against the OpenAI Custom GPT Instructions ~8000-char cap; reports overages; exits non-zero when any **chatgpt-targeted** agent exceeds the cap.

Per the `[agent-file-compression]` Compass-original pattern in `compass/framework/canon.md` (v0.3.22). Ships with v0.3.22's codification as the mechanical defense Retro #007 named for the drift signal "Custom GPT cap compounding without structural defense."

### What it produces

- **Per-file table** — every agent file with size + overage/headroom + chatgpt-target flag
- **FAIL group** — chatgpt-targeted agents exceeding the cap (these silently truncate on paste into the OpenAI Custom GPT Instructions field)
- **WARN group** — non-chatgpt agents exceeding the cap (cap doesn't strictly apply for them; flagged for future awareness if migration adds chatgpt support)
- **OK group** — agents within cap (chatgpt-targeted) or with cap N/A (non-chatgpt)
- Markdown report at stdout + (optionally) a file via `--out`

### Usage

```bash
# Walk compass/agents/ in current dir; default cap 8000
python compass/scripts/check-agent-cap.py

# Override cap
python compass/scripts/check-agent-cap.py --cap 10000

# Override repo root (for CI running from a different cwd)
python compass/scripts/check-agent-cap.py --root /path/to/compass

# Write report to file
python compass/scripts/check-agent-cap.py --out report.md

# Suppress stdout (still writes --out + still returns exit code) — for CI gating
python compass/scripts/check-agent-cap.py --quiet --out cap-report.md
```

### Exit codes

- `0` — every chatgpt-targeted agent fits the cap (non-chatgpt WARNs are OK)
- `1` — at least one chatgpt-targeted agent exceeds the cap (CI gating signal)
- `2` — usage error (e.g., bad `--root` path; agents directory missing)

### Host-aware enforcement

The OpenAI Custom GPT Instructions cap is OpenAI-specific. Agents whose `preferred_hosts:` excludes `chatgpt` can technically exceed the cap and still function. The script enforces strictly only on chatgpt-targeted agents; non-chatgpt overages are surfaced as WARN (visibility, not failure).

This matches the `[user-as-load-bearing-oversight]` aspirational refinement (canon v0.3.20): mechanical checks should catch the cases they CAN reason about, and report — not fail — the ones they shouldn't unilaterally decide.

### Accuracy honesty

- **Character count is UTF-8 byte length.** OpenAI's actual cap is measured against the Custom GPT Instructions field's storage limit; the script approximates it as 8000 bytes. Real cap may be slightly different — adjust `--cap` if your testing shows OpenAI's threshold is different at the time of measurement.
- **No content-aware analysis.** The script knows when a file is too big; it doesn't suggest cuts (that's LLM work). For compression strategy, see the `[agent-file-compression]` entry in `compass/framework/canon.md` + reference example at `compass/agents/delivery-manager.md` (v0.3.18 trim: 21,714 → 7,960).
- **`preferred_hosts:` parsing is line-regex-based.** Multi-line YAML lists or `&anchor` references in frontmatter would parse as no hosts (treated as non-chatgpt → WARN, not FAIL). Compass-style frontmatter is single-line so this isn't a real issue today.

### Automated execution

Recommended: add to `.github/workflows/freshness-check.yml` alongside `check-freshness.py`, OR ship as its own `.github/workflows/agent-cap-check.yml` that runs on every PR touching `compass/agents/`. Either way, surfaces cap violations within the PR review loop so they never compound across multiple releases (as they did v0.3.15 → v0.3.18, per Retro #007).

For local pre-commit, wire into `.git/hooks/pre-commit` (CI gating remains the source of truth; local hooks are optional convenience).

### When to use this

- **Automatic (preferred):** CI runs on every PR touching `compass/agents/`. Failure blocks merge until trim lands.
- **Manual pre-edit:** before adding content to an agent file, run the script to see current headroom — gives you the budget you're editing into.
- **Manual post-edit:** after trim work (like v0.3.21's pm.md + researcher.md compression), run to verify the trim closed the overage.
- **Pre-release:** before a Compass version bump, run as a release-gate check.

Delivery-Manager-owned by convention — see `compass/agents/delivery-manager.md` for the visibility-tasks ownership pattern.

---

## `consistency-check.py` — commit-time drift backstop (#93, v0.4.0-alpha-9)

Mechanizes the drift classes the retro full-surface audits kept catching (Retro #017/#018/#019). Computes the truth and compares — **no arguments needed** (unlike `pre-push-consistency-check.py`, which needs the human to name the amended term).

### What it checks
- **Dispatch-graph count** — AGENTS.md "N of 17 workflows" == actual count of `compass/workflows/*.md` containing `## Dispatch graph`.
- **Catalog count** — AGENTS.md "7 shapes / N patterns" == `### ` entries under canon.md `## Compass-original patterns`.
- **Version self-claims** — no hardcoded `alpha-<N>` in README / CLAUDE / `orchestrator/run.py` / `orchestrator/README.md` (CHANGELOG.md is the single source).

### Usage
```bash
python3 compass/scripts/consistency-check.py            # exit 0 consistent, 1 drift
```

### Enable as a shared git hook (once per clone)
```bash
git config core.hooksPath compass/scripts/githooks
```
`compass/scripts/githooks/pre-commit` then runs this check + the orchestrator tests on every commit. Also enforced in CI via `.github/workflows/consistency-check.yml`. This is the commit-time complement to rule 8's term-sweep; together they close the Principle #17 gap for framework-edit sessions.

---

## Future scripts + templates

Reference implementations may join this directory as Compass evolves. Candidates:

- **Multi-session aggregator** — wraps `token-usage.py` across many session logs for team-level reporting
- **Marker linter** — validates `COMPASS_ROLE_BOUNDARY` markers in workflows are well-formed (enter/exit balance, valid role names, no orphans)
- **Handoff replay** — for repos with high PR volume, gates `agent-handoff.yml` invocation on labels or checks existing comments to avoid duplicate reviews
- **Cross-agent codex parser** — `token-usage-codex.py` for attributing Codex CLI session tokens (parallel to `token-usage.py` for Claude Code; same protocol, different log format)
- **Semantic freshness extension** — LLM-driven content-level check for files flagged by `check-freshness.py` (round 2.5 — narrows the false-positive rate when external sources change cosmetically without affecting Compass)
- **Consumer version sync** (v0.4+) — Compass framework updates auto-propagate to consuming repos as PRs. Pull-bridge round 3.
- **`sync-from-gdrive.py`** — for the `[external-primary-with-cached-pointer]` candidate pattern (1 instance observed in consumer work, 2026-06-08): given `primary: gdrive://<file-id>` in artifact frontmatter, refresh the inlined cache from the Doc + bump `last_synced:`. Codify pattern + ship script when 2nd instance appears.

Add scripts here when problems are structurally hard to solve with markdown docs alone. **Keep them single-file and minimal-dependency** — same discipline as `token-usage.py` (stdlib-only Python) and `agent-handoff.yml` (vanilla GitHub Actions).
