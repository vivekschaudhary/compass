#!/usr/bin/env python3
"""
consistency-check.py — mechanize the drift classes the retro audits keep catching.

Three consecutive full-surface audits (Retro #017/#018/#019) caught the same
shapes of drift — stale counts and hardcoded version self-claims — that a
commit-time check computes for free. This is that check, the mechanical
complement to `pre-push-consistency-check.py` (which needs the human to name the
old phrasing; this one needs nothing — it computes the truth and compares).

Checks (all COMPUTABLE, no human input):
  1. Dispatch-graph count — AGENTS.md "N of 17 workflows" == actual count of
     workflows containing a "## Dispatch graph" section.
  2. Catalog count — AGENTS.md "7 shapes / N patterns" == number of "### "
     entries under canon.md "## Compass-original patterns".
  3. Version self-claims — no hardcoded "alpha-<N>" in the doc/code surfaces
     that should point to CHANGELOG.md as the single source (README, CLAUDE,
     orchestrator run.py + README). CHANGELOG / improvements / retros are
     exempt (they are the record).

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
]


def _workflow_files(repo_root: Path):
    wdir = repo_root / "compass" / "workflows"
    return [p for p in wdir.glob("*.md") if p.name != "improvements.md"]


def check_dispatch_graph_count(repo_root: Path) -> list:
    actual = sum(
        1 for p in _workflow_files(repo_root)
        if "## Dispatch graph" in p.read_text(encoding="utf-8")
    )
    agents = (repo_root / "AGENTS.md").read_text(encoding="utf-8")
    m = re.search(r"(\d+) of 17 workflows", agents)
    if not m:
        return ["AGENTS.md: could not find the 'N of 17 workflows' dispatch-graph claim"]
    claimed = int(m.group(1))
    if claimed != actual:
        return [
            f"dispatch-graph count drift: AGENTS.md claims {claimed} of 17, "
            f"actual is {actual}. Update AGENTS.md."
        ]
    return []


def check_catalog_count(repo_root: Path) -> list:
    canon = (repo_root / "compass" / "framework" / "canon.md").read_text(encoding="utf-8")
    section = canon.split("## Compass-original patterns", 1)
    if len(section) < 2:
        return ["canon.md: '## Compass-original patterns' section not found"]
    actual = len(re.findall(r"^### ", section[1], re.MULTILINE))
    agents = (repo_root / "AGENTS.md").read_text(encoding="utf-8")
    m = re.search(r"7 shapes / (\d+) patterns", agents)
    if not m:
        return ["AGENTS.md: could not find the '7 shapes / N patterns' catalog claim"]
    claimed = int(m.group(1))
    if claimed != actual:
        return [
            f"catalog count drift: AGENTS.md claims {claimed} patterns, canon.md has "
            f"{actual} Compass-original entries. Update AGENTS.md (or add the canon entry)."
        ]
    return []


def check_version_self_claims(repo_root: Path) -> list:
    problems = []
    for rel in VERSION_SELF_CLAIM_FILES:
        path = repo_root / rel
        if not path.exists():
            continue
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"alpha-[0-9]", line):
                problems.append(
                    f"{rel}:{n}: hardcoded orchestrator 'alpha-N' version — say "
                    f"'v0.4-alpha' and let CHANGELOG.md be the single source "
                    f"(de-duplication, Principle #17)."
                )
    return problems


def run_all(repo_root: Path) -> list:
    return (
        check_dispatch_graph_count(repo_root)
        + check_catalog_count(repo_root)
        + check_version_self_claims(repo_root)
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=".", metavar="PATH")
    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    problems = run_all(repo_root)
    if not problems:
        print("CONSISTENT — dispatch-graph count, catalog count, version self-claims all check out.")
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
