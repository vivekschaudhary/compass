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
  3. Version self-claims — no hardcoded "alpha-<N>" in the doc/code surfaces
     that should point to CHANGELOG.md as the single source (README, CLAUDE,
     orchestrator run.py + README). CHANGELOG / improvements / retros are
     exempt (they are the record).
  4. Host-list — every host the router enumerates as supported (its
     "Supported: ..." dispatch error string) is documented in AGENTS.md's host
     table. Added after Retro #025 caught `claude-code` missing from the table
     by hand — a new host must be added in code AND docs together.
  5. Version unified — config.yaml `framework_version` (the single source, #38)
     agrees with pyproject's `version`, normalized for rc/dash formatting.
  6. Config declares checks — the shipped compass/config.yaml resolves a
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


def check_dispatch_graph_count(repo_root: Path) -> list:
    actual = sum(
        1 for p in _workflow_files(repo_root)
        if "## Dispatch graph" in p.read_text(encoding="utf-8")
    )
    # The DENOMINATOR is computed too. It was hardcoded as 18, so adding a workflow made the check
    # itself the stale claim — it demanded "N of 18" from a repo that no longer had 18. A checker
    # that carries a literal it is policing cannot police it.
    total = len(_workflow_files(repo_root))

    agents = (repo_root / "AGENTS.md").read_text(encoding="utf-8")
    m = re.search(r"(\d+) of (\d+) workflows", agents)
    if not m:
        return ["AGENTS.md: could not find the 'N of M workflows' dispatch-graph claim"]
    claimed, claimed_total = int(m.group(1)), int(m.group(2))

    problems = []
    if claimed != actual:
        problems.append(
            f"dispatch-graph count drift: AGENTS.md claims {claimed} in dispatch-graph shape, "
            f"actual is {actual}. Update AGENTS.md.")
    if claimed_total != total:
        problems.append(
            f"workflow total drift: AGENTS.md claims {claimed_total} workflows, "
            f"actual is {total} (compass/workflows/*.md, excluding improvements.md). Update AGENTS.md.")
    return problems


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
_HOST_ALIASES = {"chatgpt": "openai"}


def _router_supported_hosts(repo_root: Path):
    """The host tokens from router.py's authoritative 'Supported: ...' error
    string (kept next to the dispatch arms). None if the string moved."""
    text = (repo_root / "compass" / "orchestrator" / "hosts" / "router.py").read_text(encoding="utf-8")
    m = re.search(r"Supported:\s*([a-z0-9,\- ]+)", text)
    if not m:
        return None
    return [h.strip() for h in m.group(1).split(",") if h.strip()]


def check_host_list(repo_root: Path) -> list:
    hosts = _router_supported_hosts(repo_root)
    if hosts is None:
        return ["router.py: could not find the 'Supported: <hosts>' enumeration "
                "(dispatch_to_host error string) to verify the host list against."]
    agents = (repo_root / "AGENTS.md").read_text(encoding="utf-8")
    problems = []
    for h in hosts:
        token = _HOST_ALIASES.get(h, h)
        if f"`{token}`" not in agents:
            problems.append(
                f"host-list drift: router.py supports '{h}' but AGENTS.md has no "
                f"`{token}` host entry. Add it to the Supported hosts table "
                f"(a new host lands in code AND docs together — Retro #025)."
            )
    return problems


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
        check_dispatch_graph_count(repo_root)
        + check_version_self_claims(repo_root)
        + check_version_unified(repo_root)
        + check_host_list(repo_root)
        + check_config_declares_checks(repo_root)
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=".", metavar="PATH")
    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    problems = run_all(repo_root)
    if not problems:
        print("CONSISTENT — dispatch-graph count, version self-claims, "
              "version unified, host list, config checks all check out.")
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
