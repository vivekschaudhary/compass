"""The one Python entry point the app and Tauri call.

    python3 -m compass.orchestrator.handoff <verb>     # JSON request on stdin, JSON result on stdout

Every verb takes the same envelope in and returns the same envelope out, so a caller reads one
shape and never a traceback. A verb not in VERBS is refused, so nothing is reachable from outside
that is not listed here. `generate` is the first verb; `run_call` (build) joins it later.
"""

from __future__ import annotations

import json
import sys
from typing import Callable

from .generate import generate_json
from .generate_contract import CONTRACT_VERSION

# Error codes a caller can switch on. Anything else is a bug in this module.
ERRORS = frozenset({"unknown_verb", "invalid_input", "internal"})

VERBS: dict = {
    "generate": generate_json,
}


def _envelope(verb: str, ok: bool, *, result=None, code=None, message=None) -> dict:
    out = {"verb": verb, "version": CONTRACT_VERSION, "ok": ok}
    if ok:
        out["result"] = result
    else:
        out["error"] = {"code": code, "message": message}
    return out


def dispatch(verb: str, request: dict) -> dict:
    """Run one verb. Input problems come back as `invalid_input`; nothing is raised to the caller."""
    handler: Callable | None = VERBS.get(verb)
    if handler is None:
        return _envelope(verb, False, code="unknown_verb",
                         message=f"'{verb}' is not a handoff verb. Known: {', '.join(sorted(VERBS))}.")
    try:
        result = handler(request)
    except ValueError as e:  # ContractError is a ValueError: a request the contract refuses
        return _envelope(verb, False, code="invalid_input", message=str(e))
    except Exception as e:  # a bug, not a bad request: say so, with the type
        return _envelope(verb, False, code="internal", message=f"{type(e).__name__}: {e}")
    return _envelope(verb, True, result=result)


def main(argv: list | None = None, stdin=None, stdout=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    stdin = sys.stdin if stdin is None else stdin
    stdout = sys.stdout if stdout is None else stdout
    verb = argv[0] if argv else ""

    try:
        request = json.loads(stdin.read() or "null")
    except json.JSONDecodeError as e:
        out = _envelope(verb, False, code="invalid_input", message=f"request is not JSON: {e}")
    else:
        if not isinstance(request, dict):
            out = _envelope(verb, False, code="invalid_input", message="request must be a JSON object")
        else:
            out = dispatch(verb, request)

    stdout.write(json.dumps(out) + "\n")
    return 0 if out["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
