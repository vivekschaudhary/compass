"""Compass orchestrator test suite.

Hermeticity guard (#149). Many tests exercise code that shells out to `git` inside a
temp fixture directory — `_place_work`, `_work_branch`, `_review_diff`,
`_uncommitted_code`, the worktree helpers. Git's own environment variables OVERRIDE the
working directory, so if the suite inherits `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE`
from an ambient git process, every one of those subprocesses silently retargets whatever
repo that context names instead of the fixture: a "non-git dir" fixture reports as a git
repo, `_place_work` cannot create its worktree, and ~16 tests fail with nonsense.

That is not hypothetical. Git exports these to its hooks, so it is exactly what happens
when the suite runs from the pre-commit hook — the way CLAUDE.md rule 9 prescribes
running it. And it is not merely a red suite: these tests run `git stash`, `git checkout`,
`git clean` and `git worktree`, so an inherited `GIT_WORK_TREE` pointing at a real
checkout means those commands execute AGAINST that checkout. Observed once: a repo left
with `core.worktree` aimed at a deleted temp dir, 15 fixture branches, a moved HEAD, and
deleted untracked files.

The hook scrubs these too, but the guard belongs here: the suite must be correct however
it is invoked. A suite that passes standalone and fails (destructively) under a hook is
worse than one that just fails.
"""
import os

# Every variable git uses to locate a repository independently of cwd.
_GIT_LOCATION_VARS = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_PREFIX",
    "GIT_OBJECT_DIRECTORY",
    "GIT_COMMON_DIR",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
    "GIT_CEILING_DIRECTORIES",
)

for _var in _GIT_LOCATION_VARS:
    os.environ.pop(_var, None)
