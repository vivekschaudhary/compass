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
