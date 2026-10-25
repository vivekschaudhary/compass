"""Test helper: a SpecSource built from the repo's own compass/ files.

Tests only. The product path has no disk implementation; this loads the shipped agents, workflows
and stacks into an `InMemorySpecSource` so a test can drive `_run_workflow` without a database.
"""
from pathlib import Path

from compass.orchestrator.graph import parse_workflow
from compass.orchestrator.spec_source import InMemorySpecSource, DEFAULT_ORG

COMPASS = Path(__file__).resolve().parents[2]


def compass_specs(extra=None, engagement_id=None) -> InMemorySpecSource:
    rows = []
    for sub in ("agents", "stacks"):
        for f in sorted((COMPASS / sub).glob("*.md")):
            rows.append({"path": f"{sub}/{f.name}", "org_id": DEFAULT_ORG, "engagement_id": None,
                         "content": f.read_text(encoding="utf-8")})
    rows.extend(extra or [])
    return InMemorySpecSource(specs=rows, engagement_id=engagement_id, workflows=workflows_from_md())


def workflows_from_md() -> list:
    """Each shipped workflow as the DB would serve it: `workflow_steps()`'s shape. Test-only — the
    `.md` is parsed here so a test has a graph to run; the product reads `workflow_step` rows."""
    out = []
    for f in sorted((COMPASS / "workflows").glob("*.md")):
        steps = []
        for st in parse_workflow(f.read_text(encoding="utf-8")):
            steps.append({"ord": st.number, "kind": "hitl" if st.is_hitl else "agent",
                          "role_code": st.agent, "agent": st.agent, "task": st.task,
                          "title": st.title, "nests": st.nests, "depends_on": []})
        out.append({"code": f.stem, "engagement_id": None, "steps": steps})
    return out


# ── file-reading conveniences for tests ─────────────────────────────────────────────────────────
# The product parsers take TEXT (the text comes from the spec table). A test that parses one of the
# repo's own files reads it here, so the Path-taking wrappers could be deleted from the product.

def load_workflow(path):
    return parse_workflow(Path(path).read_text(encoding="utf-8"))


def load_workflow_meta(path):
    from compass.orchestrator.graph import parse_workflow_meta
    return parse_workflow_meta(Path(path).read_text(encoding="utf-8"))


def _agent(path):
    return Path(path).read_text(encoding="utf-8")


def _read_preferred_hosts(path):
    from compass.orchestrator.run import parse_preferred_hosts
    return parse_preferred_hosts(_agent(path))


def _read_agent_tools(path):
    from compass.orchestrator.run import parse_agent_tools
    return parse_agent_tools(_agent(path))


def _read_model_tier(path):
    from compass.orchestrator.run import parse_model_tier
    return parse_model_tier(_agent(path))


def _reads_bet_catalog(path):
    from compass.orchestrator.run import parse_reads_bet_catalog
    return parse_reads_bet_catalog(_agent(path))
