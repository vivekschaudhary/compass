"""The survey: read a codebase, report what is in it, with a file behind every claim.

Why this exists. The app's agent returns one structured answer per turn and has no tool that opens
a file, so a technical design drafted by it cannot name a real module — the design contract calls
that a hard requirement, and the agent was right to refuse. Giving the agent a file reader inside
the model loop would mean rebuilding that loop. This does what `generate` does for scaffolding
instead: a step the agent hands off, run by Python, recorded as a handoff call, whose result the
gate reads.

What runs is the logged-in `claude` CLI restricted to `Read`, `Glob` and `Grep` — named, not
"default", because the CLI's defaults include Edit and Bash and a survey must not change anything.
Hosts are resolved the way `claude_code.py` resolves them; no SDK is called from here.

What makes the result trustworthy is checked, not asked for. Every claim cites a file in backticks
(`path/to/file.ts:42`); each backticked file path is looked up in the checkout, and one that does
not exist fails the survey. A model that invented a module name is caught here, before the finding
is filed. The format is the one a model writes unprompted — an earlier draft demanded a bespoke
`{{path}}` marker, and a live run ignored it and cited correctly in plain backticks, so the check
found nothing to verify and failed a good survey.
"""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Callable, Optional

from .hosts.claude_code import _cli_model, _default_runner, _parse_result
from .survey_contract import (
    ContractError, Section, SurveyRequest, SurveyResult, result_to_dict,
)

READ_ONLY_TOOLS = "Read,Glob,Grep"
DEFAULT_MODEL = "sonnet"

# A backticked token is a FILE CITATION when it ends in a known source/config extension, or in "/"
# (a directory), with an optional `:LINE` or `:LINE-LINE`. Deliberately narrow: `/api/auth/login`
# (a route), `useSession` (an identifier) and `npm run build` (a command) are things a finding
# mentions and are not claims about a file, so they are not looked up.
_EXTS = (
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "kt", "swift", "m", "cs",
    "php", "sql", "sh", "md", "mdx", "json", "yaml", "yml", "toml", "env", "css", "scss", "html",
    "xml", "gradle", "plist", "csv", "lock", "graphql", "proto", "tf",
)
_CITE_RE = re.compile(
    r"`([A-Za-z0-9_@~.\-][A-Za-z0-9_@~.\-/\[\]()]*(?:\.(?:" + "|".join(_EXTS) + r")|/))(?::\d+(?:-\d+)?)?`"
)
_LINE_SUFFIX_RE = re.compile(r":\d+(?:-\d+)?$")
_REFUSE_RE = re.compile(r"^\s*REFUSE:\s*(.+)", re.IGNORECASE)

_SYSTEM = """\
You are surveying an existing codebase so that an engineer can design a change to it. You READ; you do
not change anything, and you have no tool that could. Report what the code is, not what it should be.

Rules:
1. Every factual claim about the code cites the file it came from, in backticks, as `path/to/file.ext:LINE`
   (a repo-relative path from the repository root; the line or a LINE-LINE range is optional). A claim you
   cannot cite does not belong.
2. A path you cite must be one you actually opened or listed. Do not cite a file you only expect to exist.
3. If something the focus asks about is not in the code, say "Not found" and say where you looked. Absence
   is a finding. Never fill a gap with what such a codebase usually contains.
4. Structure the report as markdown sections, each starting with a `## ` heading.
5. Do not propose a design, write code, or recommend changes. The engineer designs; you report.
6. If you cannot read the code at all, reply with one line `REFUSE: <reason>` and nothing else.
"""


def _log_path(handoff_call_id: str) -> Path:
    """Where the run's log goes. Per handoff call, outside the repo and outside the framework."""
    root = Path(os.environ.get("COMPASS_HANDOFF_DIR") or Path.home() / ".compass" / "handoff")
    d = root / handoff_call_id
    d.mkdir(parents=True, exist_ok=True)
    return d / "survey.log"


def _argv(model: str, repo_paths: list) -> list:
    argv = [
        "claude", "-p",
        "--output-format", "stream-json", "--verbose", "--include-partial-messages",
        # A consumer repo's .claude/settings.json must not reach into a survey.
        "--setting-sources", "",
        "--model", _cli_model(model),
        # THE READ-ONLY GUARANTEE. Named tools, so Edit/Write/Bash are not merely denied but absent.
        "--tools", READ_ONLY_TOOLS,
        "--allowedTools", READ_ONLY_TOOLS,
        "--append-system-prompt", _SYSTEM,
    ]
    for p in repo_paths:
        argv += ["--add-dir", str(p)]
    return argv


def _prompt(req: SurveyRequest) -> str:
    repos = "\n".join(f"- `{r.key}` — {r.local_path}" for r in req.repos)
    parts = [
        f"Subject: {req.subject_ref}",
        f"Repositories you may read (paths are absolute; cite them repo-relative):\n{repos}",
    ]
    if req.context.strip():
        parts.append(f"What the surrounding documents say:\n\n{req.context.strip()}")
    parts.append(f"What to find out:\n\n{req.focus.strip()}")
    return "\n\n".join(parts)


def _split_sections(text: str) -> tuple:
    """Markdown into (heading, body) sections. Text before the first heading becomes `Overview`."""
    sections: list = []
    heading, body = "Overview", []
    for line in text.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            if "".join(body).strip():
                sections.append(Section(heading, "\n".join(body).strip()))
            heading, body = m.group(1), []
        else:
            body.append(line)
    if "".join(body).strip():
        sections.append(Section(heading, "\n".join(body).strip()))
    return tuple(sections)


def _resolve(cited: str, roots: list) -> Optional[str]:
    """The repo-relative path if `cited` exists in a checkout (and stays inside it), else None."""
    rel = _LINE_SUFFIX_RE.sub("", cited.strip())
    if not rel:
        return None
    for root in roots:
        candidate = (root / rel) if not os.path.isabs(rel) else Path(rel)
        try:
            resolved = candidate.resolve()
            inside = resolved.relative_to(root.resolve())
        except (ValueError, OSError):
            continue
        if resolved.exists():
            return str(inside)
    return None


def _verify_citations(text: str, roots: list) -> tuple:
    """-> (files cited, citations that point at nothing). The text is left exactly as written."""
    files: list = []
    missing: list = []
    for m in _CITE_RE.finditer(text):
        cited = m.group(1)
        found = _resolve(cited, roots)
        if found is None:
            missing.append(cited)
        elif found not in files:
            files.append(found)
    return tuple(files), tuple(dict.fromkeys(missing))


def _failed(status: str, reason: str, log_ref: str, usage: Optional[dict] = None) -> SurveyResult:
    return SurveyResult(status=status, sections=(), files_cited=(), refusal=reason, log_ref=log_ref, usage=usage)


Runner = Callable[..., "subprocess.CompletedProcess"]


def run_survey(req: SurveyRequest, *, runner: Runner = _default_runner, model: Optional[str] = None) -> SurveyResult:
    """Survey the repos. Returns a result; never raises for a run's own failure.

    Every exit that is not `surveyed` names its reason, so no caller can read an empty result as a
    finding of "nothing there".
    """
    log_path = _log_path(req.caller.handoff_call_id)
    log_ref = str(log_path)

    roots = []
    for r in req.repos:
        p = Path(r.local_path)
        if p.is_dir():
            roots.append(p)
    if not roots:
        paths = ", ".join(r.local_path for r in req.repos)
        return _failed("refused", f"No repo checkout exists on disk ({paths}). Set local_path first.", log_ref)

    argv = _argv(model or os.environ.get("COMPASS_SURVEY_MODEL") or DEFAULT_MODEL, roots)
    log_path.write_text(f"$ {' '.join(argv[:4])} … --tools {READ_ONLY_TOOLS}\n(cwd {roots[0]})\n")

    try:
        proc = runner(argv, input=_prompt(req), cwd=str(roots[0]))
    except Exception as e:  # the idle guard, a missing binary, a killed process: all a failed survey
        return _failed("survey_failed", f"The survey did not finish: {e}", log_ref)

    out = getattr(proc, "stdout", "") or ""
    if getattr(proc, "returncode", 0) != 0:
        detail = (getattr(proc, "stderr", "") or out).strip()[:400] or "(no output)"
        return _failed("survey_failed", f"claude exited {proc.returncode}: {detail}", log_ref)

    try:
        text, usage, _cost = _parse_result(out)
    except RuntimeError as e:
        return _failed("survey_failed", str(e), log_ref)
    log_path.write_text(log_path.read_text() + f"\n{text}\n")

    used = {"input_tokens": int(usage.get("input_tokens", 0)), "output_tokens": int(usage.get("output_tokens", 0))}

    m = _REFUSE_RE.match(text or "")
    if m:
        return _failed("refused", m.group(1).strip(), log_ref, used)
    if not (text or "").strip():
        return _failed("survey_failed", "The survey came back empty.", log_ref, used)

    cited, missing = _verify_citations(text, roots)
    if missing:
        return _failed(
            "survey_failed",
            "These cited paths do not exist in the checkout, so the findings cannot be trusted: "
            + ", ".join(missing),
            log_ref, used,
        )
    if not cited:
        return _failed(
            "survey_failed",
            "The findings cite no file. A survey of code that names none of it reported nothing real.",
            log_ref, used,
        )

    return SurveyResult(
        status="surveyed", sections=_split_sections(text), files_cited=cited,
        refusal=None, log_ref=log_ref, usage=used,
    )


def survey_json(request: dict) -> dict:
    """The wire entry: a validated request dict in, a result dict out. The handoff verb uses this."""
    from .survey_contract import parse_request
    return result_to_dict(run_survey(parse_request(request)))
