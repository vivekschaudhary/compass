#!/usr/bin/env python3
"""
Compass — check-freshness.py

Per [freshness-check] — pull-bridge round 2 (v0.3.7).

Walks compass/ for files with `last_verified:` frontmatter; fetches each
external_source; compares timestamps; auto-bumps last_verified where safe;
flags otherwise. Single-file Python 3 stdlib script (no pip install).

Round 1 (v0.3.3): workflow-side date check at doc-load time.
Round 2 (THIS, v0.3.7): framework-side detection — script runs on the
                       Compass repo via GitHub Actions; auto-bumps stale-
                       but-still-correct docs; flags actually-changed ones
                       for human review by opening a PR.
Round 3 (v0.4+):     distribution — Compass framework updates auto-propagate
                       to consuming repos as PRs. Multi-consumer reality
                       (aura-app + crypto-app at different framework versions,
                       observed in v0.3.7 cycle) strengthens this case.

Honest accuracy bounds:
- Detection is HTTP-level (Last-Modified, GitHub release timestamps).
  Semantic correctness (did the Codex CLI surface actually change?) requires
  LLM, not stdlib. Auto-bump happens only when external source is UNCHANGED.
- GitHub release timestamp is the primary signal; falls back to latest
  commit date for repos without releases (noisier).
- HTTP Last-Modified is secondary; many doc sites don't return it accurately
  or at all — those flag rather than bump.
- Network errors flag rather than bump. Safer to ask user than to silently
  mark stale docs fresh.

Exit codes:
- 0: every checked file is fresh or safely auto-bumped (no human attention needed)
- 1: at least one file flagged or errored (human review needed; CI should open PR)
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone, date
from pathlib import Path

USER_AGENT = "compass-freshness-check/0.3.7"
TIMEOUT = 15

GITHUB_REPO_URL = re.compile(r"https?://github\.com/([^/]+)/([^/]+?)/?$")
FRONTMATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)


# ─── Frontmatter ──────────────────────────────────────────────────────────

def parse_frontmatter(content):
    """Extract simple `key: value` pairs from YAML frontmatter. Returns dict or None."""
    m = FRONTMATTER_RE.match(content)
    if not m:
        return None
    result = {}
    for raw in m.group(1).split("\n"):
        line = raw.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        result[key.strip()] = value.strip()
    return result


def has_freshness_markers(fm):
    return bool(fm) and "last_verified" in fm and "external_source" in fm


def bump_last_verified(content, new_date):
    """Replace the first `last_verified: <value>` line with new_date."""
    return re.sub(
        r"(last_verified:\s*)\S+",
        lambda m: m.group(1) + new_date,
        content,
        count=1,
    )


# ─── Date parsing ─────────────────────────────────────────────────────────

def parse_date(value):
    """Parse ISO 8601, plain date, or HTTP-date to a date. Returns None on failure."""
    if not value:
        return None
    if isinstance(value, date):
        return value
    s = str(value).strip().strip('"').strip("'")
    # ISO 8601 with Z
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S.%fZ"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    # ISO 8601 with offset
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    # Plain date
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        pass
    # HTTP-date (RFC 7231)
    try:
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(s).date()
    except Exception:
        return None


# ─── External source detection ────────────────────────────────────────────

def _http_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read())


def fetch_github_latest(owner, repo):
    """Latest release published_at; falls back to latest default-branch commit date."""
    repo = repo.rstrip(".git")
    try:
        data = _http_json(f"https://api.github.com/repos/{owner}/{repo}/releases/latest")
        return data.get("published_at"), "github:release"
    except urllib.error.HTTPError as e:
        if e.code != 404:
            return None, f"github error: HTTP {e.code}"
        # No releases — try tags
        try:
            tags = _http_json(f"https://api.github.com/repos/{owner}/{repo}/tags?per_page=1")
            if tags:
                tag_sha = tags[0]["commit"]["sha"]
                commit = _http_json(
                    f"https://api.github.com/repos/{owner}/{repo}/commits/{tag_sha}"
                )
                return commit["commit"]["committer"]["date"], "github:tag"
        except Exception:
            pass
        # No tags either — latest commit on default branch
        try:
            commits = _http_json(
                f"https://api.github.com/repos/{owner}/{repo}/commits?per_page=1"
            )
            if commits:
                return commits[0]["commit"]["committer"]["date"], "github:commit"
        except Exception as e2:
            return None, f"github fallback error: {e2}"
        return None, "github: no releases / tags / commits"
    except Exception as e:
        return None, f"github error: {e}"


def fetch_last_modified(url):
    """HTTP HEAD for Last-Modified header. Falls back to GET if HEAD unsupported."""
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(
                url, method=method, headers={"User-Agent": USER_AGENT}
            )
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                lm = resp.headers.get("Last-Modified")
                if lm:
                    return lm, f"http:{method.lower()}:last-modified"
                if method == "GET":
                    return None, "http: no last-modified header"
        except urllib.error.HTTPError as e:
            if e.code == 405 and method == "HEAD":
                continue
            return None, f"http error: HTTP {e.code}"
        except Exception as e:
            return None, f"http error: {e}"
    return None, "http: no last-modified header"


def detect_external_change(url):
    """Returns (iso_date_str_or_None, signal_source_or_error_str)."""
    m = GITHUB_REPO_URL.match(url.rstrip("/"))
    if m:
        return fetch_github_latest(m.group(1), m.group(2))
    return fetch_last_modified(url)


# ─── Walk + classify ──────────────────────────────────────────────────────

def walk_compass(root):
    """Yield (Path, frontmatter, content) for every .md with freshness markers."""
    for path in sorted(Path(root).rglob("*.md")):
        try:
            content = path.read_text()
        except Exception:
            continue
        fm = parse_frontmatter(content)
        if has_freshness_markers(fm):
            yield path, fm, content


# ─── Report rendering ─────────────────────────────────────────────────────

def relpath(path, root_str):
    try:
        return str(path.relative_to(root_str))
    except ValueError:
        return str(path)


def render_report(today, mode, bumped, flagged, fresh, errors, root_str):
    lines = []
    lines.append("# Compass Freshness Check Report")
    lines.append(f"_Ran: {today} · Mode: {mode}_")
    lines.append("")
    lines.append(
        f"**Summary:** {len(bumped)} bumped · {len(flagged)} flagged · "
        f"{len(fresh)} already fresh · {len(errors)} errors"
    )
    lines.append("")

    if bumped:
        lines.append("## Auto-bumped (safe — external source unchanged since last_verified)")
        lines.append("")
        lines.append("| File | last_verified → today | external_source | signal |")
        lines.append("|---|---|---|---|")
        for path, fm, _, signal in bumped:
            lines.append(
                f"| `{relpath(path, root_str)}` | `{fm['last_verified']}` → `{today}` "
                f"| `{fm['external_source']}` | `{signal}` |"
            )
        lines.append("")

    if flagged:
        lines.append("## Flagged — manual review needed")
        lines.append("")
        lines.append(
            "External source has changed since `last_verified`. Review the source against the Compass doc:"
        )
        lines.append("- If Compass doc still reflects current reality → bump `last_verified` manually.")
        lines.append("- If the doc needs updating → update + bump.")
        lines.append("")
        lines.append("| File | last_verified | external last change | external_source | signal |")
        lines.append("|---|---|---|---|---|")
        for path, fm, ext_date, signal in flagged:
            lines.append(
                f"| `{relpath(path, root_str)}` | `{fm['last_verified']}` | `{ext_date}` "
                f"| `{fm['external_source']}` | `{signal}` |"
            )
        lines.append("")

    if errors:
        lines.append("## Errors (network / parse failure — no action taken)")
        lines.append("")
        lines.append("| File | external_source | error |")
        lines.append("|---|---|---|")
        for path, fm, err in errors:
            lines.append(
                f"| `{relpath(path, root_str)}` | `{fm['external_source']}` | {err} |"
            )
        lines.append("")

    if fresh and not (bumped or flagged or errors):
        lines.append("## Already fresh (no action needed)")
        lines.append("")
        lines.append("| File | last_verified | external last change | external_source |")
        lines.append("|---|---|---|---|")
        for path, fm, ext_date, _ in fresh:
            lines.append(
                f"| `{relpath(path, root_str)}` | `{fm['last_verified']}` | `{ext_date}` "
                f"| `{fm['external_source']}` |"
            )
        lines.append("")

    lines.append("## Honest accuracy bounds")
    lines.append("")
    lines.append(
        "- **Detection is HTTP-level**, not semantic. The script knows when the external source TIMESTAMP changed, not whether the actual content matters. A doc page may change cosmetically without affecting Compass; the script flags it anyway. Auto-bump only happens when external is UNCHANGED."
    )
    lines.append(
        "- **GitHub release timestamp** is the primary signal for tracked CLI tools; falls back to latest tag, then latest commit. Releases > tags > commits in accuracy."
    )
    lines.append(
        "- **HTTP Last-Modified header** is the secondary signal. Many doc sites don't return it accurately or at all — those flag rather than bump."
    )
    lines.append(
        "- **Network errors flag** rather than bump. Safer to ask user than to silently mark stale docs fresh."
    )
    lines.append("")
    return "\n".join(lines)


# ─── Main ─────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Compass freshness detection — pull-bridge round 2 (v0.3.7)"
    )
    parser.add_argument("--root", default="compass", help="Root dir to walk (default: compass)")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually bump dates in files; otherwise dry-run (preview only)",
    )
    parser.add_argument(
        "--today",
        help="Override today's date (YYYY-MM-DD). For deterministic CI testing.",
    )
    parser.add_argument(
        "--out",
        help="Write report to this file (in addition to stdout)",
    )
    args = parser.parse_args()

    if not os.path.isdir(args.root):
        print(f"error: root directory '{args.root}' does not exist", file=sys.stderr)
        sys.exit(2)

    today_str = args.today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today = parse_date(today_str)
    if today is None:
        print(f"error: invalid --today value: {today_str}", file=sys.stderr)
        sys.exit(2)

    bumped = []
    flagged = []
    fresh = []
    errors = []

    for path, fm, content in walk_compass(args.root):
        last_verified = parse_date(fm["last_verified"])
        if last_verified is None:
            errors.append((path, fm, f"unparseable last_verified: {fm['last_verified']}"))
            continue

        external_iso, signal = detect_external_change(fm["external_source"])
        if external_iso is None:
            errors.append((path, fm, signal))
            continue

        external_date = parse_date(external_iso)
        if external_date is None:
            errors.append(
                (path, fm, f"unparseable external date: {external_iso} ({signal})")
            )
            continue

        if external_date <= last_verified:
            # External unchanged since last_verified → safe to bump
            bumped.append((path, fm, external_date, signal))
            if args.apply:
                try:
                    path.write_text(bump_last_verified(content, today_str))
                except Exception as e:
                    errors.append((path, fm, f"write failed: {e}"))
        else:
            flagged.append((path, fm, external_date, signal))
            # If last_verified is also already fresh enough to track, still classify as flagged
        # No "fresh" classification today — every file either bumps (safe) or flags (changed)
        # or errors. Could add stricter "within window AND unchanged AND already-today" detection later.

    mode = "apply" if args.apply else "dry-run"
    report = render_report(today_str, mode, bumped, flagged, fresh, errors, args.root)
    print(report)

    if args.out:
        try:
            Path(args.out).write_text(report)
        except Exception as e:
            print(f"warning: could not write --out {args.out}: {e}", file=sys.stderr)

    sys.exit(0 if (not flagged and not errors) else 1)


if __name__ == "__main__":
    main()
