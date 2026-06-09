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
