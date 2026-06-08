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

        is_hitl = bool(
            re.search(r'\*\*Dispatches:\*\*\s+HUMAN', step_body, re.IGNORECASE)
        )

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
            )
        )

    return steps
