"""
Classification of a step's raw agent output into run-control signals.

Split out of run.py (which otherwise interleaves this regex-based text
classification with git/branch/PR/Jira plumbing it has nothing to do with).
Pure functions on strings — no project_dir, no subprocess, no filesystem.
"""
import re

# #125 dispatch-on-outcome: a step whose agent REFUSES (per [refuse-escalate])
# must HALT the run, not let the workflow cascade into steps that also refuse
# (live evidence: a misrouted /ops run cascaded 4 refusals then crashed on an API
# limit). Refusals carry a structured sentinel — a line beginning `REFUSE:` /
# `[REFUSE]` / `**Refuse(d/ing):**` — so detection is exact, not a fuzzy scan of
# prose that merely discusses refusing. Only the first few lines are inspected.
_REFUSAL_RE = re.compile(
    r"^\s*(?:\*\*|\[)?\s*REFUS(?:E|ED|ING)\b", re.IGNORECASE
)


def _is_refusal(result: str) -> bool:
    """True if the agent output leads with a refusal sentinel (#125)."""
    if not result:
        return False
    for line in result.strip().splitlines()[:5]:
        if _REFUSAL_RE.match(line):
            return True
    return False


# #96: the Reviewer's verdict lives in its "### Recommendation" section — "Approve" vs
# "Request changes" / "Block until: …". Read it near that heading so a `[BLOCKER]` label
# up in the findings can't be mistaken for the overall verdict.
_REVIEW_BLOCK_RE = re.compile(r"request[\s-]?changes|\bblock(?:ed|s)?\b", re.I)
_REVIEW_APPROVE_RE = re.compile(r"\bapprove", re.I)


def _review_recommendation(output: str):
    """#96: parse the Reviewer's overall verdict. Returns 'approve' | 'request_changes' |
    None (no recognizable recommendation). Scans the window at the Recommendation heading;
    falls back to the whole output if there is no heading."""
    if not output:
        return None
    m = re.search(r"(?im)^\s*#{0,4}\s*Recommendation\b.*", output)
    window = output[m.start():m.start() + 250] if m else output
    if _REVIEW_BLOCK_RE.search(window):
        return "request_changes"
    if _REVIEW_APPROVE_RE.search(window):
        return "approve"
    return None


# #149: a step that *ran* isn't a step that *succeeded*. Beyond the hard REFUSE:
# sentinel (#125, which halts), agents often emit a SOFT non-completion — a plan, a
# confabulated block, a permission claim — yet the step was still marked ✓ done.
# These high-precision phrases (seen repeatedly in live runs) classify such output
# as "incomplete" so the dashboard shows ✗, not ✓. Conservative by design: a normal
# completed step doesn't contain "permission not granted" or "the plan is ready".
_INCOMPLETE_RE = re.compile(
    r"permission(?:s)?\s+(?:to\s+\w+\s+)?(?:is\s+)?not\s+(?:been\s+)?(?:auto-)?(?:granted|approved)"
    r"|write\s+permission[^\n]{0,60}(?:not|grant|approve)"
    r"|not\s+auto-approved"
    r"|can'?t\s+access\s+the\s+(?:codebase|repo|home-app)"
    r"|don'?t\s+have\s+(?:read|write|file)?\s*access"
    r"|the\s+plan\s+is\s+ready"
    r"|here'?s\s+the\s+plan"
    r"|approve\s+the\s+[\"']?(?:exit\s+plan|plan)"
    r"|\bblocker:\s"
    r"|requires?\s+(?:a\s+)?permission\s+grant"
    # #159: the no-TTY write-block class the live create-brief hit — the agent
    # narrates "please click Allow" / "waiting on permission approval" / "the
    # permission dialog should be appearing" instead of writing. High-precision:
    # a completed step never asks the operator to approve a write dialog.
    r"|click\s+[\"']?allow[\"']?"
    r"|permission\s+dialog"
    r"|(?:waiting|pending|blocked)\s+on[^\n]{0,40}permission"
    r"|(?:awaiting|pending)[^\n]{0,30}permission"
    r"|approve\s+(?:the\s+|both\s+|two\s+)?(?:file\s+)?writes?\b"
    r"|please\s+approve[^\n]{0,30}(?:write|file|dialog|prompt)",
    re.IGNORECASE,
)


def _classify_outcome(result: str) -> tuple:
    """Classify a step's output as ('done', '') or ('incomplete', reason) (#149).
    Used to mark each step ✓/✗ in the dashboard — the orchestrator confirms a step
    *did its job*, not just that it returned. Conservative: defaults to done."""
    if not result or not result.strip():
        return ("incomplete", "empty output — the step produced nothing")
    m = _INCOMPLETE_RE.search(result)
    if m:
        return ("incomplete", f"output signals a block/plan, not completed work (\"{m.group(0)[:40]}…\")")
    return ("done", "")
