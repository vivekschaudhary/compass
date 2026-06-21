"""Claude API adapter for the Compass orchestrator."""
import os

from .. import events as ev
# Default tool-loop sink (#97) now lives in the unified event spine (#104) so
# tool events and run/step/gate lifecycle events render the same way. Aliased
# here for back-compat (the #97 tests + the dispatch_with_tools default).
from ..events import terminal_sink as _default_tool_event

# ── prompt caching (#105) ───────────────────────────────────────────────────
# The tool loop re-sends the agent-file system prompt + tool schemas on every
# iteration. Anthropic prompt caching marks the static prefix (system + tools)
# and the growing conversation with cache_control → ~10% cost on cache reads,
# 5-minute TTL (covers a tool loop + back-to-back steps using the same agent).
# Below the 1024-token minimum, cache_control is silently ignored — safe.
_CACHE = {"type": "ephemeral"}


def _cached_system(text: str) -> list:
    """System prompt as a single cache-marked text block."""
    return [{"type": "text", "text": text, "cache_control": _CACHE}]


def _cached_tools(tool_schemas):
    """Copy the tool list with cache_control on the last entry (caches the whole
    tools block). Returns the input unchanged if empty/None."""
    if not tool_schemas:
        return tool_schemas
    out = [dict(t) for t in tool_schemas]
    out[-1] = {**out[-1], "cache_control": _CACHE}
    return out


def _cache_last_message(messages: list) -> None:
    """Roll the conversation cache breakpoint onto the last message so the
    growing prefix (prior tool results / file reads) is cached incrementally.

    Keeps EXACTLY ONE rolling breakpoint: Anthropic caps total cache_control
    breakpoints at 4 (here system + tools + this one), so we strip any prior
    rolling marker before setting the new one — otherwise each tool turn would
    add another and a long loop would exceed the limit. Only ever touches dict
    blocks we build; the SDK objects echoed as the assistant turn aren't dicts,
    so they're never mutated."""
    if not messages:
        return
    for m in messages:
        c = m.get("content")
        if isinstance(c, list):
            for b in c:
                if isinstance(b, dict):
                    b.pop("cache_control", None)
    content = messages[-1].get("content")
    if isinstance(content, str):
        messages[-1]["content"] = [
            {"type": "text", "text": content, "cache_control": _CACHE}
        ]
    elif isinstance(content, list) and content and isinstance(content[-1], dict):
        content[-1] = {**content[-1], "cache_control": _CACHE}


def _emit_usage(emit, response, model: str) -> None:
    """Emit a usage event (#105) so cost — incl. prompt-cache hits — is
    observable on the event spine. Best-effort: the fake test client has no
    .usage, so this no-ops gracefully."""
    usage = getattr(response, "usage", None)
    if not usage:
        return
    emit({
        "type": ev.USAGE,
        "model": model,
        "input_tokens": getattr(usage, "input_tokens", 0),
        "output_tokens": getattr(usage, "output_tokens", 0),
        "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0),
        "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", 0),
    })


def dispatch(
    agent_file_path: str,
    task_name: str,
    user_message: str,
    model: str = "claude-opus-4-8",
    max_tokens: int = 8096,
    on_event=None,
) -> str:
    """
    Load agent_file_path as system prompt, dispatch user_message to Claude API.

    The system prompt is cache-marked (#105) so back-to-back steps using the same
    agent (within the 5-min TTL) read it from cache. Token usage is emitted to
    on_event when provided.

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
        system=_cached_system(system_prompt),
        messages=[{"role": "user", "content": user_message}],
    )
    _emit_usage(on_event or (lambda e: None), response, model)
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

    cached_tools = _cached_tools(tool_schemas)
    cached_system = _cached_system(system_prompt)
    messages = [{"role": "user", "content": user_message}]

    for _ in range(max_iterations):
        # Roll the conversation cache breakpoint onto the latest message so the
        # growing prefix (prior tool results) is cached too (#105).
        _cache_last_message(messages)
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=cached_system,
            messages=messages,
            tools=cached_tools,
        )
        _emit_usage(emit, response, model)
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
    _cache_last_message(messages)
    final = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=cached_system,
        messages=messages,
    )
    _emit_usage(emit, final, model)
    text = "".join(
        block.text for block in final.content if getattr(block, "type", None) == "text"
    )
    return (
        text
        + f"\n\n[note: hit the {max_iterations}-iteration tool cap; the above is a "
        f"forced wrap-up summary — review the diff to confirm completeness.]"
    )
