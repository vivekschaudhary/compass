"""Test helper: a SpecSource built from the repo's own compass/ files.

Tests only. The product path has no disk implementation; this loads the shipped agents, workflows
and stacks into an `InMemorySpecSource` so a test can drive `_run_workflow` without a database.
"""
from pathlib import Path

from compass.orchestrator.spec_source import InMemorySpecSource, DEFAULT_ORG

COMPASS = Path(__file__).resolve().parents[2]


def compass_specs(extra=None, engagement_id=None) -> InMemorySpecSource:
    rows = []
    for sub in ("agents", "workflows", "stacks"):
        for f in sorted((COMPASS / sub).glob("*.md")):
            rows.append({"path": f"{sub}/{f.name}", "org_id": DEFAULT_ORG, "engagement_id": None,
                         "content": f.read_text(encoding="utf-8")})
    rows.extend(extra or [])
    return InMemorySpecSource(specs=rows, engagement_id=engagement_id)
