"""Claude API adapter for the Compass orchestrator."""
import os


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
    max_iterations: int = 25,
    client=None,
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
                result = repo_tools.execute_tool(block.name, block.input, project_dir)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })
        messages.append({"role": "user", "content": tool_results})

    return (
        "[tool loop hit max_iterations without a final answer — "
        "the agent may need a tighter task or higher cap]"
    )
