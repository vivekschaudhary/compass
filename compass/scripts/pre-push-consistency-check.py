#!/usr/bin/env python3
"""
pre-push-consistency-check.py — mechanical sweep for stale phrasing after a
load-bearing amendment, per [pre-push-grep-discipline] (canon v0.3.38).

After amending a load-bearing concept — a rename, a split, a count ("11 of 14"),
a version string, a task-ownership change — run this with the OLD phrasing
before committing. Any hit is a sweep miss per
[cross-artifact-sweep-on-contract-shift] (AGENTS.md Principle #17).

Usage:
  python3 compass/scripts/pre-push-consistency-check.py "old phrase" ["another" ...]
  python3 compass/scripts/pre-push-consistency-check.py -i "Old Phrase"   # case-insensitive
  python3 compass/scripts/pre-push-consistency-check.py --include-history "old phrase"

Exit codes: 0 clean · 1 stale mentions found · 2 usage error.

History files (CHANGELOG.md, compass/workflows/improvements.md,
compass/workflows/retros/) are excluded by default — they are append-only
records and legitimately keep old phrasing. --include-history overrides.
"""
import argparse
import subprocess
import sys
from pathlib import Path

HISTORY_PREFIXES = (
    "CHANGELOG.md",
    "compass/workflows/improvements.md",
    "compass/workflows/retros/",
)

TEXT_SUFFIXES = {".md", ".py", ".yaml", ".yml", ".json", ".txt", ".toml", ".sh"}


def tracked_files(repo_root: Path) -> list:
    out = subprocess.run(
        ["git", "ls-files"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return [f for f in out.splitlines() if Path(f).suffix in TEXT_SUFFIXES]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Grep tracked files for stale phrasing of an amended concept."
    )
    parser.add_argument("terms", nargs="+", metavar="TERM", help="Old phrasing to hunt")
    parser.add_argument("-i", "--ignore-case", action="store_true")
    parser.add_argument(
        "--include-history",
        action="store_true",
        help="Also search append-only history files (CHANGELOG, improvements, retros)",
    )
    parser.add_argument(
        "--repo-root", default=".", metavar="PATH", help="Repo root (default: cwd)"
    )
    args = parser.parse_args(argv)

    repo_root = Path(args.repo_root).resolve()
    files = tracked_files(repo_root)
    if not args.include_history:
        files = [f for f in files if not f.startswith(HISTORY_PREFIXES)]

    hits = []
    for rel in files:
        path = repo_root / rel
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for n, line in enumerate(lines, 1):
            haystack = line.lower() if args.ignore_case else line
            for term in args.terms:
                needle = term.lower() if args.ignore_case else term
                if needle in haystack:
                    hits.append((rel, n, term, line.strip()))

    if not hits:
        print(f"CLEAN — no stale mentions of: {', '.join(repr(t) for t in args.terms)}")
        return 0

    print(f"STALE MENTIONS FOUND ({len(hits)}) — sweep before pushing:\n")
    for rel, n, term, line in hits:
        print(f"  {rel}:{n}  [{term}]  {line[:120]}")
    print(
        "\nPer [cross-artifact-sweep-on-contract-shift] (Principle #17): fix these "
        "in the SAME commit as the amendment, or justify each in a DRI Decision."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
