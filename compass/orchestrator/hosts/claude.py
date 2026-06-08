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
