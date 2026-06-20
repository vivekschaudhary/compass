"""HITL gate handler for the Compass orchestrator."""
from pathlib import Path


def handle_hitl_gate(
    step_num: int,
    step_title: str,
    last_artifact: Path = None,
    last_output: str = "",
) -> dict:
    """
    Pause execution for human review.

    Shows the last artifact path and a brief preview so the reviewer doesn't
    have to scroll up. Captures rejection feedback for the rejection note.

    Returns {"approved": bool, "feedback": str}.
    """
    print(f"\n{'=' * 60}")
    print(f"  HITL GATE — Step {step_num}")
    print(f"  {step_title}")
    print(f"{'=' * 60}")

    if last_artifact and last_artifact.exists():
        print(f"\nReviewing artifact: {last_artifact}")
    elif last_artifact:
        print(f"\nArtifact path: {last_artifact}")

    if last_output:
        preview = last_output.strip()[:600]
        if len(last_output.strip()) > 600:
            preview += "\n\n[... open the artifact file for the full output ...]"
        print(f"\n--- Output preview ---\n{preview}\n--- end preview ---\n")

    print("  y / yes  — approve and continue to the next step")
    print("  n / no   — reject and halt the workflow")
    print()

    while True:
        try:
            response = input("Continue? [y/n]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\nAborted.")
            return {"approved": False, "feedback": ""}
        if response in ("y", "yes"):
            return {"approved": True, "feedback": ""}
        if response in ("n", "no"):
            feedback = _collect_feedback()
            return {"approved": False, "feedback": feedback}
        print("Please enter 'y' or 'n'.")


def _route_target_desc(target) -> str:
    """Human-readable description of a routing-gate target (#103)."""
    if isinstance(target, int):
        return f"continue at Step {target}"
    if target == "close":
        return "close (no action)"
    return f"hand off to {target}"


def handle_routing_gate(
    step_num: int,
    step_title: str,
    routes: list,
    last_output: str = "",
) -> dict:
    """
    Routing gate (#96/#103, [conditional-dispatch]): the human picks which branch
    the workflow takes. `routes` is [(label, target)] where target is an int
    (inline step, #96), a "/<workflow>" hand-off, or "close" (#103). Returns
    {"route": <label>, "target": <int|str>}.

    Forward-only branches; matches /triage's human-driven incident ethos — the
    framework presents options, the human decides.
    """
    print(f"\n{'=' * 60}")
    print(f"  ROUTING GATE — Step {step_num}")
    print(f"  {step_title}")
    print(f"{'=' * 60}")

    if last_output:
        preview = last_output.strip()[:600]
        if len(last_output.strip()) > 600:
            preview += "\n\n[... open the artifact file for the full output ...]"
        print(f"\n--- Output preview ---\n{preview}\n--- end preview ---\n")

    print("  Choose the branch:")
    for label, target in routes:
        print(f"    {label}  → {_route_target_desc(target)}")
    print()

    labels = {label.lower(): (label, target) for label, target in routes}
    prompt = f"Route [{' / '.join(label for label, _ in routes)}]: "
    while True:
        try:
            choice = input(prompt).strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\nAborted — defaulting to the first route.")
            label, target = routes[0]
            return {"route": label, "target": target}
        if choice in labels:
            label, target = labels[choice]
            return {"route": label, "target": target}
        print(f"Please enter one of: {', '.join(label for label, _ in routes)}")


def _collect_feedback() -> str:
    """Prompt the reviewer for rejection notes (end with '.')."""
    print(
        "\nOptional: describe what needs to change (end with a line containing only '.').\n"
        "Press '.' immediately to skip:\n"
    )
    lines = []
    while True:
        try:
            line = input()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if line == ".":
            break
        lines.append(line)
    return "\n".join(lines)
