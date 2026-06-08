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


def dispatch_to_host(
    host: str,
    agent_file_path: str,
    task_name: str,
    user_message: str,
    model: str = None,
    max_tokens: int = 8096,
) -> str:
    """
    Dispatch to the named host adapter.

    model is passed only when explicitly overridden by the caller; each adapter
    has its own default if model is None.
    """
    if host == "claude":
        from .claude import dispatch
        return dispatch(
            agent_file_path, task_name, user_message,
            model=model or "claude-opus-4-8",
            max_tokens=max_tokens,
        )
    elif host in ("codex", "chatgpt", "openai"):
        from .openai import dispatch
        return dispatch(
            agent_file_path, task_name, user_message,
            model=model or "gpt-4o",
            max_tokens=max_tokens,
        )
    elif host == "gemini":
        from .gemini_api import dispatch
        return dispatch(
            agent_file_path, task_name, user_message,
            model=model or "gemini-2.0-flash",
            max_tokens=max_tokens,
        )
    else:
        raise RuntimeError(f"Unknown host: {host!r}. Supported: claude, codex, chatgpt, openai, gemini")
