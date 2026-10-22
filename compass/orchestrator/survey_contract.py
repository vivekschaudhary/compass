"""The survey's contract: one request in, one result out.

A survey reads a codebase and reports what is in it, with a file behind every claim. It is the
generator's sibling (`generate_contract.py`): same envelope, same rule that a failure names its
reason, and the TS side mirrors it field for field in `app/app/lib/data/survey-contract.ts`, with
shared fixtures in `tests/fixtures/`.

It differs in one way that matters. The generator makes no model call, so its `usage` is always
null; a survey IS a model call, so `usage` is reported and the row that ran it can say what it cost.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

CONTRACT_VERSION = 1

# `surveyed` is the only status that carries findings. Everything else names why there are none.
STATUSES = frozenset({"surveyed", "survey_failed", "refused"})

CALLER_KINDS = frozenset({"ts", "python"})


class ContractError(ValueError):
    """A request or result that does not match the contract. Raised, never defaulted."""


@dataclass(frozen=True)
class Caller:
    kind: str
    handoff_call_id: str


@dataclass(frozen=True)
class Repo:
    key: str
    local_path: str


@dataclass(frozen=True)
class SurveyRequest:
    repos: tuple          # of Repo — at least one; a survey with nothing to read is refused
    subject_ref: str
    focus: str            # what the agent wants to know about the code
    context: str          # the pinned documents the focus came from; may be empty
    caller: Caller


@dataclass(frozen=True)
class Section:
    heading: str
    body: str


@dataclass(frozen=True)
class SurveyResult:
    status: str
    sections: tuple       # of Section — empty unless status is `surveyed`
    files_cited: tuple    # repo-relative paths the findings cite, every one verified to exist
    refusal: Optional[str]
    log_ref: str
    usage: Optional[dict] = None  # {"input_tokens": int, "output_tokens": int} when the model ran


def _require_str(d: dict, key: str, where: str) -> str:
    v = d.get(key)
    if not isinstance(v, str) or not v.strip():
        raise ContractError(f"{where}.{key} must be a non-empty string")
    return v


def _optional_str(d: dict, key: str, where: str) -> str:
    """Absent means empty. Present but not a string is an error, not a silent empty."""
    if key not in d or d[key] is None:
        return ""
    v = d[key]
    if not isinstance(v, str):
        raise ContractError(f"{where}.{key} must be a string when present")
    return v


def _require_obj(d: dict, key: str, where: str) -> dict:
    v = d.get(key)
    if not isinstance(v, dict):
        raise ContractError(f"{where}.{key} must be an object")
    return v


def parse_request(data: dict) -> SurveyRequest:
    """Validate a request dict. Anything off raises ContractError; nothing is defaulted silently."""
    if not isinstance(data, dict):
        raise ContractError("request must be an object")
    if data.get("version") != CONTRACT_VERSION:
        raise ContractError(f"request.version must be {CONTRACT_VERSION}")

    raw_repos = data.get("repos")
    if not isinstance(raw_repos, list) or not raw_repos:
        raise ContractError("request.repos must be a non-empty list")
    repos = []
    for i, r in enumerate(raw_repos):
        if not isinstance(r, dict):
            raise ContractError(f"request.repos[{i}] must be an object")
        repos.append(Repo(
            key=_require_str(r, "key", f"request.repos[{i}]"),
            local_path=_require_str(r, "local_path", f"request.repos[{i}]"),
        ))
    keys = [r.key for r in repos]
    if len(set(keys)) != len(keys):
        raise ContractError("request.repos names the same key twice")

    caller = _require_obj(data, "caller", "request")
    kind = _require_str(caller, "kind", "request.caller")
    if kind not in CALLER_KINDS:
        raise ContractError(f"request.caller.kind '{kind}' must be one of {sorted(CALLER_KINDS)}")

    return SurveyRequest(
        repos=tuple(repos),
        subject_ref=_require_str(data, "subject_ref", "request"),
        focus=_require_str(data, "focus", "request"),
        context=_optional_str(data, "context", "request"),
        caller=Caller(kind=kind, handoff_call_id=_require_str(caller, "handoff_call_id", "request.caller")),
    )


def result_to_dict(r: SurveyResult) -> dict:
    """The result as the wire shape. `version` is included so a reader can refuse a mismatch."""
    if r.status not in STATUSES:
        raise ContractError(f"result.status '{r.status}' is not one of {sorted(STATUSES)}")
    if r.status == "surveyed" and not r.sections:
        # The rule every caller relies on: a survey that found nothing to report surveyed nothing.
        raise ContractError("result.status 'surveyed' requires at least one section")
    if r.status == "surveyed" and not r.files_cited:
        raise ContractError("result.status 'surveyed' requires at least one cited file")
    if r.status != "surveyed" and not r.refusal:
        raise ContractError(f"result.status '{r.status}' requires a reason")
    return {
        "version": CONTRACT_VERSION,
        "status": r.status,
        "sections": [{"heading": s.heading, "body": s.body} for s in r.sections],
        "files_cited": list(r.files_cited),
        "refusal": r.refusal,
        "log_ref": r.log_ref,
        "usage": r.usage,
    }
