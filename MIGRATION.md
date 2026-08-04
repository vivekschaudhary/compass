# Compass Migration Guide — v0.1 → current

For projects bootstrapped with Compass before v0.3.14 (June 2026). If your `compass/` directory has a `roles/` subdirectory but no `agents/` subdirectory, you are on v0.1.

---

## What changed

**v0.1:** Role definitions lived in `compass/roles/<role>.md`. Workflow files were fat — they contained all the gate/work/postcondition step content inline. No LLM routing (`preferred_hosts:` didn't exist).

**v0.3.14+ (current):** Role definitions moved to `compass/agents/<agent>.md`. Each agent file is self-sufficient: identity + inlined principles + `preferred_hosts:` frontmatter + task definitions (gate/work/postcondition) + refusal rules. Workflow files became thin dispatch graphs that only sequence `<agent>.<task>` references. The orchestrator reads `preferred_hosts:` to route each step to its assigned model.

The methodology is unchanged. The gates, postconditions, and HITL stops are the same — they moved from workflow files into agent files.

---

## Keeping a consumer in sync (the easy way) — `sync-into-consumer.py`

If you use **both** surfaces — the orchestrator (`--compass-dir` → live framework) **and** interactive Claude Code `/skills` inside your project (which read the *embedded* `compass/` + `.claude/skills`) — the embedded copy drifts. One command keeps it current, safely:

```bash
# dry-run first (prints exactly what it would overwrite / prune / preserve; writes nothing):
python3 /path/to/compass-framework/compass/scripts/sync-into-consumer.py /path/to/your-project

# then perform it (auto-backs up your compass/ to <project>/.compass-backups/<ts>/ first):
python3 /path/to/compass-framework/compass/scripts/sync-into-consumer.py /path/to/your-project --apply
```

**It OVERWRITES** the framework machinery (`compass/{agents,workflows,framework,templates,scripts,orchestrator}`, `AGENTS.md`, `CLAUDE.md`, `.claude/skills`, `.codex/prompts`), **PRESERVES** your own files (`compass/config.yaml`, `docs/`, `PROJECT.md`, `README.md`, `.claude/settings*.json`, `.codex/config.toml`, `.github/`, `.mcp.json` — it only ever writes paths in the overwrite set), and **PRUNES** the framework's own meta-logs from your copy (`compass/workflows/improvements.md`, `retros/`). This is the recommended way to do the manual Path-B copy below.

---

## Path A — Workaround (zero file changes, orchestrator only)

Use `--compass-dir` to point the orchestrator at the current framework while your project's embedded `compass/` stays on v0.1. Your project files (`docs/`, `PROJECT.md`, bets) are untouched.

```bash
# From your project root
python3 -m compass.orchestrator.run <workflow> \
  --project-dir /path/to/your-project \
  --compass-dir /path/to/compass-framework/compass
```

**When it's right:** you want to run orchestrator workflows immediately without touching your project's embedded `compass/`. Interactive Claude Code sessions inside your project will still load the old `compass/roles/` discipline — that's the tradeoff.

**Validated on:** crypto-app (v0.1) with `--compass-dir /Volumes/VivekSSD/apps/compass/compass`. Full CB-4 pipeline ran correctly.

---

## Path B — Full upgrade (recommended)

Replaces your embedded `compass/` with the current version. Interactive Claude Code sessions, GitHub Actions CI (`agent-handoff.yml`), and direct orchestrator calls all use the same up-to-date agent files.

### Step 1 — Back up your current compass/

```bash
cp -r compass/ compass-v0.1-backup/
```

### Step 2 — Copy current agent files into your project

```bash
# From the Compass framework repo
cp -r /path/to/compass-framework/compass/agents/ /path/to/your-project/compass/agents/
```

### Step 3 — Copy current workflow files (thin dispatch graphs)

```bash
cp -r /path/to/compass-framework/compass/workflows/ /path/to/your-project/compass/workflows/
```

> **Note:** Your project's `compass/workflows/improvements.md` has your project's own improvement history. Don't overwrite it — copy it back after this step:
> ```bash
> cp compass-v0.1-backup/workflows/improvements.md compass/workflows/improvements.md
> ```
> Also remove the framework's own retro history if it came along — it's framework-internal, not yours:
> ```bash
> rm -rf compass/workflows/retros/
> ```

### Step 4 — Copy updated templates, scripts, and the orchestrator

```bash
cp -r /path/to/compass-framework/compass/templates/    /path/to/your-project/compass/templates/
cp -r /path/to/compass-framework/compass/scripts/      /path/to/your-project/compass/scripts/
cp -r /path/to/compass-framework/compass/orchestrator/ /path/to/your-project/compass/orchestrator/
```

The orchestrator copy is what makes Step 8's `python3 -m compass.orchestrator.run` verification work from your project root. Skip it only if you exclusively use Path A's `--compass-dir` invocation.

### Step 5 — Update AGENTS.md at your project root

```bash
cp /path/to/compass-framework/AGENTS.md /path/to/your-project/AGENTS.md
```

### Step 6 — Update compass/config.yaml

The `tool_assignments:` section in `config.yaml` is deprecated (v0.3.14). Per-agent `preferred_hosts:` in agent frontmatter is now the source of truth. You can leave the old section — it's ignored — or remove it to avoid confusion.

### Step 7 — Archive or delete compass/roles/

```bash
# Option A: keep as reference (safe)
mv compass/roles/ compass/roles-v0.1-archive/

# Option B: delete (clean)
rm -rf compass/roles/
```

Option A is recommended for your first migration — if something behaves unexpectedly, the old files are there for comparison.

### Step 8 — Verify

```bash
# Dry-run a workflow against your project — confirms agent files load correctly
python3 -m compass.orchestrator.run create-brief --dry-run \
  --project-dir /path/to/your-project
```

Expected: step list prints with `compass/agents/<agent>.md` references. No errors about missing files.

---

## Gotchas

**Half-migrated state is the dangerous one.** If you copy `compass/agents/` but leave old workflow files pointing to `compass/roles/`, the orchestrator will throw file-not-found errors. Always copy agents + workflows together.

**Per-bet artifacts are untouched.** `docs/bets/`, `docs/foundation/`, `docs/status.md` — none of these are touched by the migration. Your project history is safe.

**All 14 legacy roles are now migrated as of v0.3.36.** `compass/agents/` contains the full set — the 14 migrated roles plus `gtm`, `sre`, `product-owner`, declared new at v1.0 (not yet coded; 17 agents total). `compass/roles/` is kept for the v0.3.x grace period and removed in v0.4.

**Interactive Claude Code after migration.** Once `compass/agents/` is present, Claude Code loads agent discipline from there. Verify your `CLAUDE.md` points to the workflows correctly (the `/create-product-brief`, `/create-brief`, etc. commands should still work — workflow filenames are unchanged).

---

## After migration

Run your next workflow the same way you always have:

```bash
# Interactive (Claude Code)
/create-brief

# Orchestrator
python3 -m compass.orchestrator.run create-brief --project-dir .
```

The dispatch graph is the same. The agent task definitions are the same. The gates and HITL stops are the same. Only the file locations changed.
