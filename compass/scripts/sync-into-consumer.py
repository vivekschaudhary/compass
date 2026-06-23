#!/usr/bin/env python3
"""
sync-into-consumer.py (#114) — sync a consumer project's EMBEDDED Compass copy to
the current framework, safely and repeatably.

Why: the orchestrator uses the live framework via `--compass-dir`, but a consumer's
**interactive** surface (VS Code Claude Code `/skills`, the embedded `compass/`,
`AGENTS.md`/`CLAUDE.md`) reads the *embedded* copy — which drifts. Manual syncing
(MIGRATION.md) is error-prone: get the overwrite/preserve split wrong and you clobber
the consumer's `docs/`, `config.yaml`, or `.github/` CI.

Policy (the load-bearing part):
  OVERWRITE  framework machinery → compass/{agents,workflows,framework,templates,
             scripts,orchestrator}, AGENTS.md, CLAUDE.md, .claude/skills, .codex/prompts
  PRESERVE   the consumer's own → compass/config.yaml, compass/roles, docs/, PROJECT.md,
             README.md, .claude/settings*.json, .codex/config.toml, .github/, .mcp.json,
             and everything else (the script ONLY ever writes paths in the overwrite set)
  PRUNE      the framework's own meta-logs (meaningless in a consumer), after copying
             workflows → compass/workflows/improvements.md, compass/workflows/retros/

Safety: DRY-RUN by default (prints the plan, writes nothing). `--apply` performs it and
first backs up the consumer's compass/ to <consumer>/.compass-backups/<ts>/.

Usage:
  python3 compass/scripts/sync-into-consumer.py <consumer-dir>            # dry-run
  python3 compass/scripts/sync-into-consumer.py <consumer-dir> --apply    # do it
  python3 compass/scripts/sync-into-consumer.py <consumer-dir> --apply --no-backup
  python3 compass/scripts/sync-into-consumer.py <consumer-dir> --framework /path/to/compass-repo
"""
import argparse
import shutil
import sys
from datetime import datetime
from pathlib import Path

# Framework machinery copied over the consumer's embedded copy.
FRAMEWORK_OVERWRITE = [
    "compass/agents",
    "compass/workflows",
    "compass/framework",
    "compass/templates",
    "compass/scripts",
    "compass/orchestrator",
    "AGENTS.md",
    "CLAUDE.md",
    ".claude/skills",
    ".codex/prompts",
]

# The framework's OWN meta-logs — removed from the consumer copy after sync (a consumer
# has no use for the framework's improvement log / retros).
PRUNE_AFTER = [
    "compass/workflows/improvements.md",
    "compass/workflows/retros",
]

# Documented for the dry-run printout — the script never writes outside FRAMEWORK_OVERWRITE,
# so these are preserved by construction. Listed so the user sees what's protected.
PRESERVE_NOTE = [
    "compass/config.yaml", "compass/roles/", "docs/", "PROJECT.md", "README.md",
    ".claude/settings.json", ".claude/settings.local.json", ".codex/config.toml",
    ".github/", ".mcp.json",
]


def framework_root() -> Path:
    """Default framework root = repo containing this script (scripts → compass → root)."""
    return Path(__file__).resolve().parents[2]


def plan_sync(framework: Path, consumer: Path) -> dict:
    """Pure: classify what a sync would do. No writes (only exists() checks).

    Returns {"overwrite": [(rel, kind)], "prune": [rel], "missing_in_framework": [rel]}
    where kind is "dir" | "file".
    """
    overwrite, missing = [], []
    for rel in FRAMEWORK_OVERWRITE:
        src = framework / rel
        if not src.exists():
            missing.append(rel)
            continue
        overwrite.append((rel, "dir" if src.is_dir() else "file"))
    prune = [rel for rel in PRUNE_AFTER if (consumer / rel).exists()]
    return {"overwrite": overwrite, "prune": prune, "missing_in_framework": missing}


def apply_plan(plan: dict, framework: Path, consumer: Path, backup: bool = True) -> dict:
    """Perform the sync. Backs up consumer/compass first (unless backup=False).
    Returns a summary dict."""
    backup_path = None
    if backup and (consumer / "compass").exists():
        ts = datetime.now().strftime("%Y%m%dT%H%M%S")
        backup_path = consumer / ".compass-backups" / ts
        backup_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(consumer / "compass", backup_path / "compass")

    for rel, kind in plan["overwrite"]:
        src, dst = framework / rel, consumer / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if kind == "dir":
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)

    for rel in plan["prune"]:
        target = consumer / rel
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()

    return {"overwritten": len(plan["overwrite"]), "pruned": len(plan["prune"]),
            "backup": str(backup_path) if backup_path else None}


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="sync-into-consumer",
        description="Sync a consumer's embedded Compass copy to the current framework (dry-run by default).",
    )
    ap.add_argument("consumer", help="Path to the consumer project root.")
    ap.add_argument("--framework", default=None, help="Framework repo root (default: this script's repo).")
    ap.add_argument("--apply", action="store_true", help="Perform the sync (default is dry-run).")
    ap.add_argument("--no-backup", action="store_true", help="Skip backing up the consumer's compass/ on --apply.")
    args = ap.parse_args(argv)

    framework = Path(args.framework).resolve() if args.framework else framework_root()
    consumer = Path(args.consumer).resolve()

    if not (framework / "compass" / "agents").exists():
        print(f"Error: {framework} doesn't look like a Compass framework (no compass/agents).", file=sys.stderr)
        return 2
    if not consumer.exists():
        print(f"Error: consumer dir not found: {consumer}", file=sys.stderr)
        return 2

    plan = plan_sync(framework, consumer)

    print(f"Sync plan: {framework}  →  {consumer}\n{'─' * 60}")
    print("OVERWRITE (framework machinery):")
    for rel, kind in plan["overwrite"]:
        print(f"  ⤿ {rel}{'/' if kind == 'dir' else ''}")
    if plan["missing_in_framework"]:
        print("  (skipped — not in this framework: " + ", ".join(plan["missing_in_framework"]) + ")")
    print("\nPRUNE from the consumer copy (framework's own meta-logs):")
    for rel in (plan["prune"] or ["  (none present)"]):
        print(f"  ✗ {rel}" if plan["prune"] else f"  {rel}")
    print("\nPRESERVED (never touched):")
    print("  " + " · ".join(PRESERVE_NOTE))

    if not args.apply:
        print(f"\n[dry-run] nothing written. Re-run with --apply to perform the sync.")
        return 0

    summary = apply_plan(plan, framework, consumer, backup=not args.no_backup)
    print(f"\n[applied] overwrote {summary['overwritten']} path(s), pruned {summary['pruned']}.")
    if summary["backup"]:
        print(f"  backup: {summary['backup']}")
    print("  verify:")
    print(f"    python3 {consumer}/compass/scripts/consistency-check.py")
    print(f"    python3 -m compass.orchestrator.run <workflow> --dry-run --project-dir {consumer} --compass-dir {consumer}/compass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
