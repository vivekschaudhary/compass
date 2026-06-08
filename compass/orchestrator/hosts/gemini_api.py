"""
Google Gemini API host adapter for the Compass orchestrator.

Used for agents whose preferred_hosts includes 'gemini'.
Requires GEMINI_API_KEY (or GOOGLE_API_KEY) environment variable
and the google-generativeai package.

Install: pip3 install google-generativeai --break-system-packages
"""
import os
from pathlib import Path


def dispatch(
    agent_file_path: str,
    task_name: str,
    user_message: str,
    model: str = "gemini-2.0-flash",
    max_tokens: int = 8096,
) -> str:
    """
    Dispatch a task to Google Gemini API.

    Loads the agent .md file as the system instruction. Returns the model's text response.
    Raises RuntimeError if no API key is set; ImportError if package not installed.
    """
    try:
        import google.generativeai as genai
    except ImportError:
        raise ImportError(
            "google-generativeai package not installed.\n"
            "  Run: pip3 install google-generativeai --break-system-packages"
        )

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY (or GOOGLE_API_KEY) is not set.\n"
            "  export GEMINI_API_KEY=AIza..."
        )

    system_prompt = Path(agent_file_path).read_text(encoding="utf-8")
    genai.configure(api_key=api_key)

    gen_model = genai.GenerativeModel(
        model_name=model,
        system_instruction=system_prompt,
    )
    response = gen_model.generate_content(
        user_message,
        generation_config=genai.types.GenerationConfig(max_output_tokens=max_tokens),
    )
    return response.text
