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
import importlib.util
import os
from typing import Optional

# SDK package each host's adapter needs. A host is only selectable if BOTH its
# key is set AND its package is importable — otherwise the run would die
# mid-dispatch on ImportError instead of falling through (#97 consumer signal:
# OPENAI_API_KEY set but openai not installed → picked chatgpt then crashed).
_HOST_PACKAGE = {
    "claude": "anthropic",
    "codex": "openai",
    "chatgpt": "openai",
    "openai": "openai",
    "gemini": "google.generativeai",
}


def _pkg_importable(pkg: str) -> bool:
    try:
        return importlib.util.find_spec(pkg) is not None
    except (ImportError, ValueError, ModuleNotFoundError):
        return False


def _adapter_importable(host: str) -> bool:
    pkg = _HOST_PACKAGE.get(host)
    return True if pkg is None else _pkg_importable(pkg)


def _has_key(host: str) -> bool:
    if host == "claude":
        return bool(os.environ.get("ANTHROPIC_API_KEY"))
    if host in ("codex", "chatgpt", "openai"):
        return bool(os.environ.get("OPENAI_API_KEY"))
    if host == "gemini":
        return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))
    return False


def select_host(preferred_hosts: list) -> Optional[str]:
    """
    Return the first host in preferred_hosts that is READY — has API credentials
    AND its SDK is importable. Skips hosts whose adapter package is missing
    (falls through to the next) so a run never dies mid-dispatch on ImportError.
    Returns None if none are ready.
    """
    for host in preferred_hosts:
        if _has_key(host) and _adapter_importable(host):
            return "claude" if host == "claude" else ("gemini" if host == "gemini" else host)
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
    allow_write: bool = False,
    max_tool_iterations: int = None,
    on_event=None,
) -> str:
    """
    Dispatch to the named host adapter.

    model is passed only when explicitly overridden by the caller; otherwise
    COMPASS_MODEL_<CLAUDE|OPENAI|GEMINI> env var, then the DEFAULT_MODELS entry.

    When `tools` (executor_tool names) is provided AND the host supports tool-use
    (Claude today, #87), the agent runs a tool loop grounded in project_dir.
    Write tools (write_file, bash) are granted only when allow_write is True
    (the --allow-write opt-in). Other hosts ignore `tools` (single-shot path).
    """
    if host == "claude":
        from . import tools as repo_tools
        from .claude import dispatch, dispatch_with_tools
        if tools:
            schemas = repo_tools.schemas_for(tools, allow_write)
            return dispatch_with_tools(
                agent_file_path, task_name, user_message, project_dir,
                model=model or _default_model("claude"),
                max_tokens=max_tokens,
                tool_schemas=schemas,
                allow_write=allow_write,
                max_iterations=max_tool_iterations or 50,
                on_event=on_event,
            )
        return dispatch(
            agent_file_path, task_name, user_message,
            model=model or _default_model("claude"),
            max_tokens=max_tokens,
            on_event=on_event,
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
