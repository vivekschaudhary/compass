"""Parses Compass dispatch-graph workflow .md files into ordered step lists."""
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class WorkflowStep:
    number: int
    title: str
    is_hitl: bool = False
    agent: Optional[str] = None
    task: Optional[str] = None
    agent_file: Optional[str] = None
    artifact_target: Optional[str] = None  # canonical path promoted on HITL approval
    routes: Optional[list] = None          # [(label, target)] — routing gate (#96/#103);
                                           # target is int (inline step), "/<workflow>"
                                           # (cross-workflow hand-off), or "close" (terminal)


def load_workflow_meta(workflow_file: Path) -> dict:
    """
    Parse machine-readable workflow frontmatter without a YAML dependency.

    Currently extracts `requires_approved:` — the list of artifact paths that
    must be HITL-approved before this workflow may dispatch (improvement #70
    gate redesign). Supports both inline (`requires_approved: [a, b]`) and
    block list forms. Paths may contain a `<bet-id>` placeholder.
    """
    text = workflow_file.read_text()
    fm_match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    requires = []
    if fm_match:
        fm = fm_match.group(1)
        inline = re.search(r"^requires_approved\s*:\s*\[(.*?)\]", fm, re.MULTILINE)
        if inline:
            requires = [p.strip().strip("'\"") for p in inline.group(1).split(",") if p.strip()]
        else:
            block = re.search(
                r"^requires_approved\s*:\s*\n((?:\s+-\s+.*\n?)+)", fm, re.MULTILINE
            )
            if block:
                requires = [
                    re.sub(r"^\s+-\s+", "", line).strip().strip("'\"")
                    for line in block.group(1).splitlines()
                    if line.strip()
                ]
    return {"requires_approved": requires}


def _parse_route_target(raw: str):
    """
    Normalize a routing-gate target string into its runtime form (#103):
      "Step 7" / "step 7" → 7 (int — inline forward-skip, #96)
      "/fix"              → "/fix" (str — cross-workflow hand-off)
      "close"            → "close" (str — terminal)
    """
    raw = raw.strip()
    m = re.match(r"Step\s+(\d+)$", raw, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return raw.lower() if raw.lower() == "close" else raw


def load_workflow(workflow_file: Path) -> list:
    """
    Parse a dispatch-graph workflow .md file.

    Extracts steps from '### Step N. ...' headers inside the ## Dispatch graph
    section. Returns an ordered list of WorkflowStep.
    """
    text = workflow_file.read_text()

    # Scope parsing to the dispatch graph section so we don't pick up
    # illustrative references in Notes / Edge cases.
    dispatch_match = re.search(r'^## Dispatch graph', text, re.MULTILINE)
    if dispatch_match:
        # Cut off at the next top-level section (## that is NOT a sub-heading)
        after_dispatch = text[dispatch_match.start():]
        next_section = re.search(r'^##\s+(?!#)', after_dispatch[3:], re.MULTILINE)
        if next_section:
            graph_text = after_dispatch[: next_section.start() + 3]
        else:
            graph_text = after_dispatch
    else:
        # Workflow may not use the heading; fall back to full text
        graph_text = text

    step_pattern = re.compile(r'^### Step (\d+)\.\s+(.+?)$', re.MULTILINE)
    matches = list(step_pattern.finditer(graph_text))

    steps = []
    for i, match in enumerate(matches):
        step_num = int(match.group(1))
        step_title_raw = match.group(2).strip()

        # Body of this step = content between this header and the next
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(graph_text)
        step_body = graph_text[start:end]

        # HITL detection must be formatting-tolerant: a human gate silently
        # becoming a "workflow-level step" because someone wrote
        # `Dispatches: **HUMAN**` instead of `**Dispatches:** HUMAN` would
        # delete the gate without anyone noticing. Accept any bold/colon/dash
        # placement on the Dispatches line, and a HITL marker in the title.
        is_hitl = bool(
            re.search(
                r'^[*_>\s-]*Dispatches[*_\s:—–-]*HUMAN\b',
                step_body,
                re.IGNORECASE | re.MULTILINE,
            )
            or re.search(r'\bHITL\b', step_title_raw)
        )

        # Canonical path promoted when this gate approves. Tolerant of bold /
        # colon placement, same rationale as the Dispatches parsing above.
        artifact_target = None
        target_match = re.search(
            r"^[*_>\s-]*Artifact target[*_\s:]*`?([^`\n]+?)`?\s*$",
            step_body,
            re.IGNORECASE | re.MULTILINE,
        )
        if target_match:
            artifact_target = target_match.group(1).strip()

        # Routing gate (#96/#103, [conditional-dispatch]): a HITL step whose
        # outcome chooses what happens next. A route target is one of:
        #   `Step N`      → inline forward-skip within this graph (#96)
        #   `/<workflow>` → cross-workflow hand-off (#103) — recommend + end run
        #   `close`       → terminal, no action (#103)
        # Parse `- <label> → <target>` lines (tolerant of ->/→, backticks, case).
        # Forward-only; the human picks at the gate.
        routes = None
        if is_hitl:
            route_pairs = re.findall(
                r'^\s*[-*]\s*`?([\w-]+)`?\s*(?:→|->)\s*`?(Step\s+\d+|/[\w-]+|close)`?',
                step_body,
                re.IGNORECASE | re.MULTILINE,
            )
            if route_pairs:
                routes = [(label, _parse_route_target(raw)) for label, raw in route_pairs]

        agent = task = agent_file = None
        if not is_hitl:
            # agent.task from backtick pair in title: `agent.task_name`
            at_match = re.search(r'`([\w-]+)\.([\w-]+)`', step_title_raw)
            if at_match:
                agent = at_match.group(1)
                task = at_match.group(2)

            # Prefer explicit Task definition line for agent file resolution
            tdef = re.search(
                r'Task definition.*?`compass/agents/([\w-]+)\.md`',
                step_body,
                re.DOTALL,
            )
            agent_file = f"{tdef.group(1)}.md" if tdef else (f"{agent}.md" if agent else None)

        # Strip markup from title for display
        title = re.sub(r'[`*]', '', step_title_raw).strip()

        steps.append(
            WorkflowStep(
                number=step_num,
                title=title,
                is_hitl=is_hitl,
                agent=agent,
                task=task,
                agent_file=agent_file,
                artifact_target=artifact_target,
                routes=routes,
            )
        )

    return steps
