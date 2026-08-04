"""Review-independence tests (#155).

Compass used to buy reviewer independence by forcing a different MODEL
(`reviewer.preferred_hosts: [codex, gemini]`, claude excluded). Research did not
support that, so the host is now a free per-engagement choice — which makes the
REMAINING independence the only independence there is, and therefore load-bearing:

  1. **Fresh context.** A review step is dispatched with NO implementation history.
     Prior step outputs carry the Engineer's own account of what it built and why;
     feeding that to the reviewer anchors it to the implementer's narrative.
  2. **Maker ≠ checker survives in the audit.** CTRL-1 must still be satisfiable —
     evaluating model-disjointness as a pass condition would report a permanent
     breach on every Claude-only run, on a client-facing compliance artifact.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import run as runmod
from compass.orchestrator.logger import evaluate_conformance

COMPASS_DIR = Path(__file__).resolve().parents[2]
AGENTS = COMPASS_DIR / "agents"


class TestFreshContext(unittest.TestCase):
    """The reviewer must never receive the implementer's account of its own work."""

    PRIOR = [
        {"step": 1, "agent": "engineer", "task": "implement-story", "workflow": "build",
         "output": "## Output summary\n**TL;DR** I refactored the auth guard and it is correct."},
    ]

    def test_review_agents_are_declared_fresh_context(self):
        self.assertIn("reviewer", runmod._FRESH_CONTEXT_AGENTS)
        self.assertIn("security-reviewer", runmod._FRESH_CONTEXT_AGENTS)

    def test_implementer_narrative_is_withheld_from_the_reviewer(self):
        withheld = [] if "reviewer" in runmod._FRESH_CONTEXT_AGENTS else self.PRIOR
        msg = runmod._build_user_message("review-pr", "the diff", withheld)
        self.assertNotIn("I refactored the auth guard", msg)
        self.assertNotIn("Prior step outputs", msg)
        self.assertIn("review-pr", msg)
        self.assertIn("the diff", msg)          # the reviewer still gets diff + specs

    def test_non_review_agents_still_receive_prior_context(self):
        # Withholding history everywhere would break the pipeline — only review steps.
        self.assertNotIn("engineer", runmod._FRESH_CONTEXT_AGENTS)
        self.assertNotIn("pm", runmod._FRESH_CONTEXT_AGENTS)
        msg = runmod._build_user_message("implement-story", "", self.PRIOR)
        self.assertIn("Prior step outputs", msg)
        self.assertIn("I refactored the auth guard", msg)

    def test_empty_prior_outputs_produce_no_context_header(self):
        msg = runmod._build_user_message("review-pr", "the diff", [])
        self.assertNotIn("Prior step outputs", msg)


class TestReviewerHostIsFree(unittest.TestCase):
    """The cross-model pin is gone: every agent may run on claude."""

    def _hosts(self, agent: str) -> str:
        for line in (AGENTS / f"{agent}.md").read_text(encoding="utf-8").splitlines():
            if line.startswith("preferred_hosts:"):
                return line
        self.fail(f"{agent}.md declares no preferred_hosts")

    def test_reviewer_no_longer_excludes_claude(self):
        for agent in ("reviewer", "security-reviewer"):
            self.assertIn("claude", self._hosts(agent), agent)

    def test_claude_cli_remap_now_covers_the_reviewer(self):
        # Pre-#155 the reviewer could not use the flat-cost CLI because it was pinned
        # off claude. It can now.
        self.assertEqual(runmod._remap_claude_cli(["claude", "codex", "gemini"]),
                         ["claude-code", "codex", "gemini"])


class TestControlNoLongerReportsFalseBreach(unittest.TestCase):
    """CTRL-1 on a same-model run is CONFORMANT, not a breach."""

    def _audit(self, impl_model, rev_model, roles=("implementer", "reviewer")):
        return {
            "steps": [{"role": r} for r in roles],
            "gates": [],
            "cross_model_independence": {
                "implementer": [["claude", impl_model]],
                "reviewer": [["claude", rev_model]] if rev_model else [],
                "independent": impl_model != rev_model,
            },
        }

    def test_same_model_review_is_met(self):
        # The regression this whole test file exists for: pre-#155 this returned
        # "unmet — reviewer shares a model with the implementer".
        conf = evaluate_conformance(
            self._audit("claude-opus", "claude-opus"),
            [{"id": "CTRL-1", "title": "Independent code review", "check": "independent-review"}])
        c = conf["controls"][0]
        self.assertEqual(c["status"], "met")
        self.assertIn("maker ≠ checker", c["evidence"])

    def test_legacy_check_name_still_accepted(self):
        # Consumer docs/controls.md files in the wild still say cross-model-review.
        conf = evaluate_conformance(
            self._audit("claude-opus", "claude-opus"),
            [{"id": "CTRL-1", "title": "Independent code review", "check": "cross-model-review"}])
        self.assertEqual(conf["controls"][0]["status"], "met")

    def test_different_models_are_reported_as_extra_evidence(self):
        conf = evaluate_conformance(
            self._audit("claude-opus", "gpt-5"),
            [{"id": "CTRL-1", "title": "Independent code review", "check": "independent-review"}])
        c = conf["controls"][0]
        self.assertEqual(c["status"], "met")
        self.assertIn("models also disjoint", c["evidence"])

    def test_no_review_step_at_all_is_still_unmet(self):
        # The control must still catch the thing that actually matters.
        conf = evaluate_conformance(
            self._audit("claude-opus", None, roles=("implementer",)),
            [{"id": "CTRL-1", "title": "Independent code review", "check": "independent-review"}])
        c = conf["controls"][0]
        self.assertEqual(c["status"], "unmet")
        self.assertIn("no independent review step", c["evidence"])

    def test_security_review_alone_satisfies_the_control(self):
        conf = evaluate_conformance(
            self._audit("claude-opus", "claude-opus",
                        roles=("implementer", "security-reviewer")),
            [{"id": "CTRL-1", "title": "Independent code review", "check": "independent-review"}])
        self.assertEqual(conf["controls"][0]["status"], "met")


if __name__ == "__main__":
    unittest.main()
