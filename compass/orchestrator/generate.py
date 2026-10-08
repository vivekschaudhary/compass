"""The generator: one request in, one result out, no model call.

Scaffolds a greenfield project into a checkout, runs the stack's checks, and opens the pull
request only on green. TS calls it from `handleScaffold` today; a Python LLM call can call
`run_generate` in-process later. Both build the same request and read the same result (see the
contract at the top of this module's sibling, `parse_request` / `result_to_dict`).

Nothing here reads the framework's `compass/` folder. The stack table is code. The checks and the
repo location arrive on the request, so the generator never opens a framework file to find them.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

from .generate_contract import (
    Checks, GenerateRequest, GenerateResult, ContractError, FRAMEWORKS, result_to_dict,
)
from .git_ops import _ensure_work_worktree
from .pr import _ensure_pr

# Pinned, not "latest": a scaffold that changes under us between runs is not reproducible.
NEXTJS_GENERATOR = "create-next-app@15.3.0"

# Files a brand-new GitHub repo may already hold without being a project.
GREENFIELD_OK = frozenset({".git", "README.md", "LICENSE", ".gitignore"})

CHECK_TIMEOUT_S = 1800
GENERATOR_TIMEOUT_S = 900
TAIL_CHARS = 4000


@dataclass(frozen=True)
class Stack:
    argv: tuple            # the generator command, run with the checkout as cwd
    default_checks: tuple  # run in order, stopping at the first failure


# One entry per supported framework. A framework name that is not a key here is refused in
# `parse_request`, so nothing below ever sees an unknown stack.
STACKS = {
    "nextjs-ts": Stack(
        argv=("npx", "--yes", NEXTJS_GENERATOR, ".", "--ts", "--app", "--tailwind", "--eslint",
              "--no-src-dir", "--import-alias", "@/*", "--use-npm", "--yes"),
        default_checks=("npm ci", "npm run lint", "npm run build"),
    ),
}
assert set(STACKS) == set(FRAMEWORKS), "every supported framework needs a stack entry"

# The generator's own flags are fixed above. The request's `options` text is never put on a command
# line; it is recorded in the PR body, so a free-text field cannot change what runs.
Runner = Callable[[list, Path, int], "subprocess.CompletedProcess"]


# Signals Next.js sets on ITS OWN process, not environment the app chose on purpose. The app's dev
# server runs under NODE_ENV=development and --turbopack, which sets process.env.TURBOPACK=1 on
# itself (confirmed in next/dist) — and a generated project's build inherits both unless they are
# stripped, which is how a clean "next build" ran under Turbopack and failed to prerender /404
# (live: TURBOPACK=1 alone reproduces it). Every `NEXT_*` variable is dropped on the same reasoning:
# they are Next's own runtime state (NEXT_PHASE, NEXT_DEPLOYMENT_ID, NEXT_PRIVATE_*, …), not
# something this generator or its caller set deliberately.
_INHERITED_ENV_EXACT = frozenset({"NODE_ENV", "TURBOPACK"})
_INHERITED_ENV_PREFIX = "NEXT_"


def _check_env() -> dict:
    return {
        k: v for k, v in os.environ.items()
        if k not in _INHERITED_ENV_EXACT and not k.startswith(_INHERITED_ENV_PREFIX)
    }


def _default_runner(argv: list, cwd: Path, timeout: int) -> "subprocess.CompletedProcess":
    return subprocess.run(argv, cwd=str(cwd), capture_output=True, text=True, timeout=timeout, env=_check_env())


def _tail(text: str) -> str:
    return text[-TAIL_CHARS:] if text else ""


def _refused(reason: str, log_ref: str = "") -> GenerateResult:
    return GenerateResult(status="refused", branch=None, pr_url=None, files_changed=0,
                          checks=Checks(ran=(), failed=None, tail=None), refusal=reason, log_ref=log_ref)


def _generator_failed(reason: str, branch: str, log_ref: str, ran: tuple = (),
                      failed: Optional[str] = None, tail: Optional[str] = None) -> GenerateResult:
    return GenerateResult(status="generator_failed", branch=branch, pr_url=None, files_changed=0,
                          checks=Checks(ran=ran, failed=failed, tail=tail), refusal=reason, log_ref=log_ref)


def _merge_scratch(scratch: Path, worktree: Path) -> Optional[str]:
    """Move the generator's output into the checkout. A file the repo already has is kept as the repo
    wrote it, when it is one of the files a new repo may hold; any other clash is a refusal, not an
    overwrite."""
    for item in scratch.iterdir():
        target = worktree / item.name
        if target.exists():
            if item.name in GREENFIELD_OK:
                continue
            return f"The generator wrote '{item.name}', which the repo already has. Nothing was merged."
        shutil.move(str(item), str(target))
    return None


def _log_path(handoff_call_id: str) -> Path:
    """Where the run's log goes. Per handoff call, outside the repo and outside the framework."""
    root = Path(os.environ.get("COMPASS_HANDOFF_DIR") or Path.home() / ".compass" / "handoff")
    d = root / handoff_call_id
    d.mkdir(parents=True, exist_ok=True)
    return d / "generate.log"


def _branch_for(repo_key: str) -> str:
    safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in repo_key).strip("-") or "repo"
    return f"feat/scaffold-{safe}"


def _git(cwd: Path, *args: str) -> "subprocess.CompletedProcess":
    return subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, text=True)


def run_generate(
    req: GenerateRequest,
    *,
    runner: Runner = _default_runner,
    open_pr: Callable = _ensure_pr,
    make_worktree: Callable = _ensure_work_worktree,
) -> GenerateResult:
    """Scaffold, check, and open the PR. Returns a result; never raises for a run's own failure.

    Every exit that is not `shipped` names its reason, so no caller can read a missing PR as success.
    The injectable runner, PR opener and worktree factory exist so the tests can drive real git
    without a network or an installed generator.
    """
    stack = STACKS.get(req.framework)
    if stack is None:  # unreachable through parse_request; loud if a caller skips it
        raise ContractError(f"no stack for framework '{req.framework}'")

    log_path = _log_path(req.caller.handoff_call_id)
    log_ref = str(log_path)
    log: list = []

    def note(line: str) -> None:
        log.append(line)
        log_path.write_text("\n".join(log) + "\n")

    project = Path(req.repo.local_path)
    if not project.is_dir():
        return _refused(f"The repo checkout '{req.repo.local_path}' does not exist. Set local_path first.", log_ref)
    if _git(project, "rev-parse", "--is-inside-work-tree").returncode != 0:
        return _refused(f"'{req.repo.local_path}' is not a git repository.", log_ref)

    branch = _branch_for(req.repo.key)
    worktree = make_worktree(project, branch)
    if worktree is None:
        return _refused(
            f"Could not create a worktree for '{branch}'. A repo with no commits has no base to branch "
            "from; add an initial commit first.", log_ref)
    worktree = Path(worktree)
    note(f"worktree {worktree} on {branch}")

    # Greenfield only. A scaffold written over an existing project would mix two histories. A repo
    # created on GitHub often carries a README, licence or .gitignore, and those are not a project.
    if any(p.name not in GREENFIELD_OK for p in worktree.iterdir()):
        return _refused(
            f"The checkout for '{branch}' is not empty. Scaffolding is greenfield: remove the leftover "
            f"files in {worktree} and run again.", log_ref)

    # The generator writes into a scratch directory, not the checkout. create-next-app refuses any
    # non-empty target, and a repo created on GitHub already holds a README; the output is merged in
    # afterwards, keeping the repo's own files.
    scratch = Path(tempfile.mkdtemp(prefix="scaffold-gen-"))
    try:
        gen = runner(list(stack.argv), scratch, GENERATOR_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        note(f"generator timed out after {GENERATOR_TIMEOUT_S}s")
        return _generator_failed(f"The generator timed out after {GENERATOR_TIMEOUT_S}s.", branch, log_ref)
    note(f"$ {' '.join(stack.argv)}  (in a scratch directory)\n{gen.stdout}{gen.stderr}")
    if gen.returncode != 0:
        shutil.rmtree(scratch, ignore_errors=True)
        return _generator_failed(f"The generator exited {gen.returncode}.", branch, log_ref,
                                 tail=_tail(gen.stdout + gen.stderr))

    conflict = _merge_scratch(scratch, worktree)
    shutil.rmtree(scratch, ignore_errors=True)
    if conflict:
        return _generator_failed(conflict, branch, log_ref)

    checks = req.checks if req.checks is not None else stack.default_checks
    ran: list = []
    for cmd in checks:
        ran.append(cmd)
        try:
            r = runner(["sh", "-c", cmd], worktree, CHECK_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            note(f"[check] {cmd} timed out")
            return _generator_failed(f"Check '{cmd}' timed out.", branch, log_ref, tuple(ran), cmd, "timeout")
        note(f"[check] {cmd} -> {r.returncode}\n{r.stdout}{r.stderr}")
        if r.returncode != 0:
            return GenerateResult(status="checks_failed", branch=branch, pr_url=None, files_changed=0,
                                  checks=Checks(ran=tuple(ran), failed=cmd, tail=_tail(r.stdout + r.stderr)),
                                  refusal=None, log_ref=log_ref)

    # Green. Commit and push, then open the PR. A PR is only ever opened after this point.
    _git(worktree, "add", "-A")
    staged = _git(worktree, "diff", "--cached", "--name-only").stdout.split()
    if not staged:
        return _generator_failed("The generator produced no files to commit.", branch, log_ref, tuple(ran))
    commit = _git(worktree, "commit", "-m", f"Scaffold {req.framework} for {req.repo.key}")
    if commit.returncode != 0:
        note(f"commit failed\n{commit.stdout}{commit.stderr}")
        return _generator_failed("Commit failed.", branch, log_ref, tuple(ran), tail=_tail(commit.stderr))
    push = _git(worktree, "push", "-u", "origin", branch)
    if push.returncode != 0:
        note(f"push failed\n{push.stdout}{push.stderr}")
        return _generator_failed("Push failed.", branch, log_ref, tuple(ran), tail=_tail(push.stderr))

    body = f"Scaffolded {req.framework} for `{req.repo.key}`.\n\n{req.options}".strip()
    pr_url = open_pr(worktree, branch, body)
    if not pr_url:
        return _generator_failed("Checks passed and the branch was pushed, but no pull request was opened.",
                                 branch, log_ref, tuple(ran))
    note(f"pull request {pr_url}")
    return GenerateResult(status="shipped", branch=branch, pr_url=pr_url, files_changed=len(staged),
                          checks=Checks(ran=tuple(ran), failed=None, tail=None), refusal=None, log_ref=log_ref)


def generate_json(request: dict) -> dict:
    """The wire entry: a validated request dict in, a result dict out. The CLI and the TS spawn use this."""
    from .generate_contract import parse_request
    return result_to_dict(run_generate(parse_request(request)))
