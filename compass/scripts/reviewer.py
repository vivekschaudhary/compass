#!/usr/bin/env python3
"""
Compass reviewer dispatch — v0.1

Calls the OpenAI API with an agent prompt file + a PR diff.
Used by compass/scripts/agent-handoff.yml (Option A) instead of the Codex CLI,
whose headless flags are unverified and drift with each CLI release.

This script uses the same openai SDK pattern as compass/orchestrator/hosts/openai.py
(which is already validated end-to-end). Zero new dependencies.

Usage:
    python3 compass/scripts/reviewer.py \\
      --prompt-file .codex/prompts/reviewer.md \\
      --diff-file pr.diff \\
      --output review.md \\
      [--model gpt-4o]

Environment:
    OPENAI_API_KEY — required
"""
import argparse
import os
import sys
from pathlib import Path


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Compass reviewer — dispatch PR diff to OpenAI API",
    )
    parser.add_argument("--prompt-file", required=True, metavar="PATH",
                        help="Agent prompt file (e.g. .codex/prompts/reviewer.md)")
    parser.add_argument("--diff-file", required=True, metavar="PATH",
                        help="PR diff file (e.g. pr.diff from gh pr diff)")
    parser.add_argument("--output", required=True, metavar="PATH",
                        help="Output file for the review (e.g. review.md)")
    parser.add_argument("--model", default="gpt-4o", metavar="MODEL",
                        help="OpenAI model to use (default: gpt-4o)")
    parser.add_argument("--max-tokens", type=int, default=8096, metavar="N")
    args = parser.parse_args(argv)

    try:
        import openai
    except ImportError:
        print(
            "Error: openai package not installed.\n"
            "  Run: pip3 install openai",
            file=sys.stderr,
        )
        sys.exit(1)

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY is not set.", file=sys.stderr)
        sys.exit(1)

    prompt_path = Path(args.prompt_file)
    diff_path = Path(args.diff_file)

    if not prompt_path.exists():
        print(f"Error: prompt file not found: {prompt_path}", file=sys.stderr)
        sys.exit(1)
    if not diff_path.exists():
        print(f"Error: diff file not found: {diff_path}", file=sys.stderr)
        sys.exit(1)

    system_prompt = prompt_path.read_text(encoding="utf-8")
    diff_content = diff_path.read_text(encoding="utf-8")

    if not diff_content.strip():
        print("[reviewer] diff is empty — no review needed.", file=sys.stderr)
        Path(args.output).write_text("", encoding="utf-8")
        sys.exit(0)

    user_message = (
        f"Review the following PR diff. Apply your reviewer discipline exactly "
        f"as defined in your prompt.\n\n"
        f"```diff\n{diff_content}\n```"
    )

    print(f"[reviewer] dispatching to {args.model} "
          f"(prompt: {len(system_prompt)} chars, diff: {len(diff_content)} chars) …")

    client = openai.OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model=args.model,
        max_tokens=args.max_tokens,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )
    result = response.choices[0].message.content

    Path(args.output).write_text(result, encoding="utf-8")
    print(f"[reviewer] wrote {len(result)} chars → {args.output}")


if __name__ == "__main__":
    main()
