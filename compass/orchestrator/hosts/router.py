"""
Host router — selects the best available host from an agent's preferred_hosts list
and dispatches the step to that host's adapter.

Selection order: first host in preferred_hosts that has credentials available.

Credential check per host:
  claude           → ANTHROPIC_API_KEY
  codex / chatgpt / openai  → OPENAI_API_KEY
  gemini           → GEMINI_API_KEY or GOOGLE_API_KEY

If no host is available, returns None from select_host() — the caller must handle.
"""
import os
from typing import Optional


def select_host(preferred_hosts: list) -> Optional[str]:
    """
    Return the first host in preferred_hosts that has API credentials available.
    Returns None if none are available.
    """
    for host in preferred_hosts:
        if host == "claude":
            if os.environ.get("ANTHROPIC_API_KEY"):
                return "claude"
        elif host in ("codex", "chatgpt", "openai"):
            if os.environ.get("OPENAI_API_KEY"):
                return host
        elif host == "gemini":
            if os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"):
                return "gemini"
    return None


# Per-host default models. Override order: --model flag > COMPASS_MODEL_<HOST>
# env var > these defaults. Env vars keep model pinning out of code per the
# LLM-agnostic-scripts discipline (no SDK/model hardcoding outside hosts/).
DEFAULT_MODELS = {
    "claude": "claude-opus-4-8",
    "openai": "gpt-5",
    "gemini": "gemini-2.5-pro",
}


def _default_model(host_family: str) -> str:
    return (
        os.environ.get(f"COMPASS_MODEL_{host_family.upper()}")
        or DEFAULT_MODELS[host_family]
    )


def dispatch_to_host(
    host: str,
    agent_file_path: str,
    task_name: str,
    user_message: str,
    model: str = None,
    max_tokens: int = 8192,
    tools: list = None,
    project_dir=None,
) -> str:
    """
    Dispatch to the named host adapter.

    model is passed only when explicitly overridden by the caller; otherwise
    COMPASS_MODEL_<CLAUDE|OPENAI|GEMINI> env var, then the DEFAULT_MODELS entry.

    When `tools` is provided AND the host supports tool-use (Claude today,
    #87 slice 1), the agent runs a read-tool loop grounded in project_dir.
    Other hosts ignore `tools` and use the single-shot path unchanged.
    """
    if host == "claude":
        from .claude import dispatch, dispatch_with_tools
        if tools:
            return dispatch_with_tools(
                agent_file_path, task_name, user_message, project_dir,
                model=model or _default_model("claude"),
                max_tokens=max_tokens,
            )
        return dispatch(
            agent_file_path, task_name, user_message,
            model=model or _default_model("claude"),
            max_tokens=max_tokens,
        )
    elif host in ("codex", "chatgpt", "openai"):
        from .openai import dispatch
        return dispatch(
            agent_file_path, task_name, user_message,
            model=model or _default_model("openai"),
            max_tokens=max_tokens,
        )
    elif host == "gemini":
        from .gemini_api import dispatch
        return dispatch(
            agent_file_path, task_name, user_message,
            model=model or _default_model("gemini"),
            max_tokens=max_tokens,
        )
    else:
        raise RuntimeError(f"Unknown host: {host!r}. Supported: claude, codex, chatgpt, openai, gemini")
