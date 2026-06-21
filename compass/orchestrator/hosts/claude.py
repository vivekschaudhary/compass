"""Claude API adapter for the Compass orchestrator."""
import os

# Default tool-loop sink (#97) now lives in the unified event spine (#104) so
# tool events and run/step/gate lifecycle events render the same way. Aliased
# here for back-compat (the #97 tests + the dispatch_with_tools default).
from ..events import terminal_sink as _default_tool_event


def dispatch(
    agent_file_path: str,
    task_name: str,
    user_message: str,
    model: str = "claude-opus-4-8",
    max_tokens: int = 8096,
) -> str:
    """
    Load agent_file_path as system prompt, dispatch user_message to Claude API.

    Raises RuntimeError if ANTHROPIC_API_KEY is not set.
    Raises ImportError if the anthropic SDK is not installed.
    """
    try:
        import anthropic
    except ImportError as exc:
        raise ImportError(
            "anthropic SDK not found. Install it: pip install anthropic"
        ) from exc

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY environment variable is not set. "
            "Export it before running the orchestrator:\n"
            "  export ANTHROPIC_API_KEY=sk-ant-..."
        )

    with open(agent_file_path, encoding="utf-8") as fh:
        system_prompt = fh.read()

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    return response.content[0].text


def dispatch_with_tools(
    agent_file_path: str,
    task_name: str,
    user_message: str,
    project_dir,
    model: str = "claude-opus-4-8",
    max_tokens: int = 8192,
    tool_schemas: list = None,
    allow_write: bool = False,
    max_iterations: int = 50,
    client=None,
    on_event=None,
) -> str:
    """
    Tool-using dispatch (#87 slice 1): load agent_file as system prompt, run a
    read-tool loop so the agent grounds itself in the real repo before answering.

    Loops while the model asks for tools (stop_reason == "tool_use"), executing
    each read tool sandboxed to project_dir via hosts.tools.execute_tool, until
    the model returns final text. `max_iterations` is a runaway backstop.

    `client` is injectable for tests; defaults to a real Anthropic client.
    Returns the final assistant text (same contract as `dispatch`).
    """
    from pathlib import Path

    from . import tools as repo_tools

    if tool_schemas is None:
        tool_schemas = repo_tools.TOOL_SCHEMAS
    project_dir = Path(project_dir)
    emit = on_event or _default_tool_event

    if client is None:
        try:
            import anthropic
        except ImportError as exc:
            raise ImportError(
                "anthropic SDK not found. Install it: pip install anthropic"
            ) from exc
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY environment variable is not set.")
        client = anthropic.Anthropic(api_key=api_key)

    with open(agent_file_path, encoding="utf-8") as fh:
        system_prompt = fh.read()

    messages = [{"role": "user", "content": user_message}]

    for _ in range(max_iterations):
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
            tools=tool_schemas,
        )
        if response.stop_reason != "tool_use":
            return "".join(
                block.text for block in response.content
                if getattr(block, "type", None) == "text"
            )
        # Echo the assistant turn (text + tool_use blocks), then answer each tool call.
        messages.append({"role": "assistant", "content": response.content})
        tool_results = []
        for block in response.content:
            if getattr(block, "type", None) == "tool_use":
                emit({"type": "tool_use", "name": block.name, "input": block.input})
                result = repo_tools.execute_tool(
                    block.name, block.input, project_dir, allow_write=allow_write
                )
                emit({
                    "type": "tool_result",
                    "name": block.name,
                    "is_error": isinstance(result, str) and result.startswith("error"),
                    "summary": result.splitlines()[0] if result else "",
                })
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })
        messages.append({"role": "user", "content": tool_results})

    # Cap reached (#100): don't raise-and-discard (a thorough run may have already
    # finished the work on disk). Do ONE final tools-disabled turn to force a text
    # summary — the work + state get captured and the workflow advances to review,
    # where HITL decides. A genuinely-stuck run summarizes "incomplete" and is
    # caught downstream; a complete-but-thorough run reports what it did.
    emit({"type": "note", "text": f"max tool iterations ({max_iterations}) reached — forcing final summary"})
    messages.append({
        "role": "user",
        "content": (
            "You've reached the tool-use limit for this step. Stop using tools and "
            "give your final answer now: what you changed (files), the test / "
            "typecheck / lint / build results you saw, and any remaining steps or risks."
        ),
    })
    final = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=messages,
    )
    text = "".join(
        block.text for block in final.content if getattr(block, "type", None) == "text"
    )
    return (
        text
        + f"\n\n[note: hit the {max_iterations}-iteration tool cap; the above is a "
        f"forced wrap-up summary — review the diff to confirm completeness.]"
    )
