#!/usr/bin/env python3
"""
consistency-check.py — mechanize the drift classes the retro audits keep catching.

Three consecutive full-surface audits (Retro #017/#018/#019) caught the same
shapes of drift — stale counts and hardcoded version self-claims — that a
commit-time check computes for free. This is that check, the mechanical
complement to `pre-push-consistency-check.py` (which needs the human to name the
old phrasing; this one needs nothing — it computes the truth and compares).

Two checks were removed when AGENTS.md stopped describing the product's runtime:
a dispatch-graph count and a supported-hosts list, both of which compared a PROSE
CLAIM in AGENTS.md against reality. With no claim to police there is nothing to
check — and seed-consistency-check.py already covers seed-vs-graph drift, which
is the part that mattered. Do not re-add them by re-adding the prose.

Checks (all COMPUTABLE, no human input):
  1. Version self-claims — no hardcoded "alpha-<N>" in the doc/code surfaces
     that should point to CHANGELOG.md as the single source (README, CLAUDE,
     orchestrator run.py + README). CHANGELOG / improvements / retros are
     exempt (they are the record).
  2. Version unified — config.yaml `framework_version` (the single source, #38)
     agrees with pyproject's `version`, normalized for rc/dash formatting.
  3. Config declares checks — the shipped compass/config.yaml resolves a
     non-empty CI-parity suite. It is also the consumer template, and a code
     workflow resolving zero checks HALTS (#122/#123), so shipping it as
     commented-out examples means every new project's first /build or /fix dies.

Exit 0 = consistent; exit 1 = drift (prints each problem). Importable check
functions return a list of problem strings for testing.

Usage: python3 compass/scripts/consistency-check.py [--repo-root PATH]
"""
import argparse
import re
import sys
from pathlib import Path

VERSION_SELF_CLAIM_FILES = [
    "README.md",
    "CLAUDE.md",
    "compass/orchestrator/run.py",
    "compass/orchestrator/README.md",
    "compass/orchestrator/__init__.py",  # Retro #029 audit: stale alpha-0 slipped the scan
]


def _workflow_files(repo_root: Path):
    wdir = repo_root / "compass" / "workflows"
    return [p for p in wdir.glob("*.md") if p.name != "improvements.md"]



def check_version_self_claims(repo_root: Path) -> list:
    problems = []
    for rel in VERSION_SELF_CLAIM_FILES:
        path = repo_root / rel
        if not path.exists():
            continue
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"alpha-[0-9]", line):
                problems.append(
                    f"{rel}:{n}: hardcoded orchestrator 'alpha-N' version — "
                    f"compass/config.yaml `framework_version` is the single source "
                    f"(#38; de-duplication, Principle #17)."
                )
    return problems


def check_version_unified(repo_root: Path) -> list:
    """#38: compass/config.yaml `framework_version` is the single version source; the
    pyproject `version` must agree (normalized to ignore rc/dash formatting differences,
    e.g. 1.0.0-rc.1 == 1.0.0rc1)."""
    problems = []
    cfg = repo_root / "compass" / "config.yaml"
    pyp = repo_root / "pyproject.toml"
    fw = pv = None
    if cfg.exists():
        m = re.search(r"^framework_version:\s*(\S+)", cfg.read_text(encoding="utf-8"), re.M)
        fw = m.group(1) if m else None
    if pyp.exists():
        m = re.search(r'^version\s*=\s*"([^"]+)"', pyp.read_text(encoding="utf-8"), re.M)
        pv = m.group(1) if m else None
    norm = lambda v: re.sub(r"[^a-z0-9]", "", (v or "").lower())
    if fw and pv and norm(fw) != norm(pv):
        problems.append(
            f"version drift: config.yaml framework_version={fw} but pyproject "
            f"version={pv} — config.yaml is the single source (#38)."
        )
    return problems


# chatgpt is an OpenAI-family alias (no own AGENTS.md row); it's documented as
# `openai`. Any other host the router names must have its own backtick mention.


def check_config_declares_checks(repo_root: Path) -> list:
    """#122: the shipped compass/config.yaml must declare a resolvable CI-parity suite.

    This file is simultaneously the framework's own config AND the template every
    consumer starts from (sync-into-consumer.py PRESERVES it, so a consumer's copy
    never receives framework updates). It shipped with `stack:` and `checks:` as
    COMMENTS, so every project began life resolving zero checks — and a code workflow
    that resolves zero checks now HALTS (#123). Regressing this block back to comments
    would ship a framework that cannot build itself, silently.

    Imports the orchestrator's own resolver rather than reimplementing the parse — a
    second parser is precisely the drift this script exists to prevent. The resolver is
    imported from THIS script's own tree, then applied to `repo_root`: the target may be
    any directory (including a synthetic test fixture) and need not be an importable
    package. No config.yaml at all counts as drift — it is the file the check is about."""
    self_root = Path(__file__).resolve().parents[2]
    inserted = str(self_root) not in sys.path
    if inserted:
        sys.path.insert(0, str(self_root))
    try:
        from compass.orchestrator.run import _resolve_checks
    except Exception as e:  # pragma: no cover - import failure is itself the drift
        return [f"config-checks: could not import _resolve_checks to verify the "
                f"shipped config ({e.__class__.__name__}: {e})."]
    finally:
        if inserted and sys.path and sys.path[0] == str(self_root):
            sys.path.pop(0)

    if _resolve_checks(repo_root, repo_root / "compass"):
        return []
    return ["config-checks drift: compass/config.yaml resolves ZERO CI-parity checks. "
            "Declare a top-level `checks:` block (or a `stack:` with a shipped default "
            "suite). This file is also the consumer template — shipping it empty means "
            "every new project's first /build or /fix halts (#122/#123)."]


def run_all(repo_root: Path) -> list:
    return (
        check_version_self_claims(repo_root)
        + check_version_unified(repo_root)
        + check_config_declares_checks(repo_root)
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=".", metavar="PATH")
    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    problems = run_all(repo_root)
    if not problems:
        print("CONSISTENT — version self-claims, "
              "version unified, config checks all check out.")
        return 0
    print(f"DRIFT FOUND ({len(problems)}):\n", file=sys.stderr)
    for p in problems:
        print(f"  ✗ {p}", file=sys.stderr)
    print(
        "\nFix before committing (Principle #17). These are exactly the drift "
        "classes the retro audits keep catching.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
