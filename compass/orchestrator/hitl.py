"""HITL gate handler for the Compass orchestrator."""


def handle_hitl_gate(step_num: int, step_title: str) -> bool:
    """
    Pause execution for human review.

    Prints a banner, waits for y/n input. Returns True to continue, False to halt.
    """
    print(f"\n{'=' * 60}")
    print(f"  HITL GATE — Step {step_num}")
    print(f"  {step_title}")
    print(f"{'=' * 60}")
    print("Review the output above before proceeding.")
    print("  y / yes  — approve and continue to the next step")
    print("  n / no   — reject and halt the workflow")
    print()
    while True:
        try:
            response = input("Continue? [y/n]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\nAborted.")
            return False
        if response in ("y", "yes"):
            return True
        if response in ("n", "no"):
            return False
        print("Please enter 'y' or 'n'.")
