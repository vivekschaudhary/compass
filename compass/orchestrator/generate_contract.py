"""The generator's contract: one request in, one result out.

TS calls the generator from `handleScaffold` today; a Python LLM call can call it in-process later.
Both callers build the same request dict and read the same result dict, so the shape is defined
once here and mirrored, with a shared fixture, by `app/app/lib/agent/generate-contract.ts`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

CONTRACT_VERSION = 1

# Closed set. A name not in here is refused before anything is spawned or written.
FRAMEWORKS = frozenset({"nextjs-ts"})

STATUSES = frozenset({"shipped", "checks_failed", "generator_failed", "refused"})

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
class GenerateRequest:
    framework: str
    repo: Repo
    subject_ref: str
    options: str
    caller: Caller
    checks: Optional[tuple] = None  # None means "use the stack's default checks"


@dataclass(frozen=True)
class Checks:
    ran: tuple
    failed: Optional[str]
    tail: Optional[str]


@dataclass(frozen=True)
class GenerateResult:
    status: str
    branch: Optional[str]
    pr_url: Optional[str]
    files_changed: int
    checks: Checks
    refusal: Optional[str]
    log_ref: str
    usage: None = None  # the generator makes no model call, so there is never usage to report


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


def parse_request(data: dict) -> GenerateRequest:
    """Validate a request dict. Anything off raises ContractError; nothing is defaulted silently."""
    if not isinstance(data, dict):
        raise ContractError("request must be an object")
    if data.get("version") != CONTRACT_VERSION:
        raise ContractError(f"request.version must be {CONTRACT_VERSION}")

    framework = _require_str(data, "framework", "request")
    if framework not in FRAMEWORKS:
        raise ContractError(f"request.framework '{framework}' is not a supported framework")

    repo = _require_obj(data, "repo", "request")
    caller = _require_obj(data, "caller", "request")

    kind = _require_str(caller, "kind", "request.caller")
    if kind not in CALLER_KINDS:
        raise ContractError(f"request.caller.kind '{kind}' must be one of {sorted(CALLER_KINDS)}")

    checks = data.get("checks")
    if checks is not None:
        if not isinstance(checks, list) or not all(isinstance(c, str) and c.strip() for c in checks):
            raise ContractError("request.checks must be a list of non-empty strings, or absent")
        if not checks:
            raise ContractError("request.checks is empty; omit it to use the stack's defaults")

    return GenerateRequest(
        framework=framework,
        repo=Repo(
            key=_require_str(repo, "key", "request.repo"),
            local_path=_require_str(repo, "local_path", "request.repo"),
        ),
        subject_ref=_require_str(data, "subject_ref", "request"),
        options=_optional_str(data, "options", "request"),
        caller=Caller(
            kind=kind,
            handoff_call_id=_require_str(caller, "handoff_call_id", "request.caller"),
        ),
        checks=tuple(checks) if checks is not None else None,
    )


def result_to_dict(r: GenerateResult) -> dict:
    """The result as the wire shape. `version` is included so a reader can refuse a mismatch."""
    if r.status not in STATUSES:
        raise ContractError(f"result.status '{r.status}' is not one of {sorted(STATUSES)}")
    if r.status == "shipped" and not r.pr_url:
        # The rule every caller relies on: a run that shipped with no PR shipped nothing.
        raise ContractError("result.status 'shipped' requires a pr_url")
    if r.status == "refused" and not r.refusal:
        raise ContractError("result.status 'refused' requires a refusal reason")
    return {
        "version": CONTRACT_VERSION,
        "status": r.status,
        "branch": r.branch,
        "pr_url": r.pr_url,
        "files_changed": r.files_changed,
        "checks": {"ran": list(r.checks.ran), "failed": r.checks.failed, "tail": r.checks.tail},
        "refusal": r.refusal,
        "log_ref": r.log_ref,
        "usage": None,
    }
