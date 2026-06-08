"""
OpenAI API host adapter for the Compass orchestrator.

Used for agents whose preferred_hosts includes 'codex', 'chatgpt', or 'openai'.
Requires OPENAI_API_KEY environment variable and the openai package.

Install: pip3 install openai
"""
import os
from pathlib import Path


def dispatch(
    agent_file_path: str,
    task_name: str,
    user_message: str,
    model: str = "gpt-4o",
    max_tokens: int = 8096,
) -> str:
    """
    Dispatch a task to OpenAI API.

    Loads the agent .md file as the system prompt. Returns the model's text response.
    Raises RuntimeError if OPENAI_API_KEY is unset; ImportError if openai not installed.
    """
    try:
        import openai
    except ImportError:
        raise ImportError(
            "openai package not installed.\n"
            "  Run: pip3 install openai --break-system-packages"
        )

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set.\n"
            "  export OPENAI_API_KEY=sk-..."
        )

    system_prompt = Path(agent_file_path).read_text(encoding="utf-8")
    client = openai.OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )
    return response.choices[0].message.content
