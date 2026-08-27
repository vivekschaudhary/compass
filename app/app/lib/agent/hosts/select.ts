// Which host runs this turn.
//
// v1's shape, kept: `COMPASS_CLAUDE_HOST=cli` opts in, anything else is the metered API. One env
// var rather than a per-run setting, because the choice is a property of where the app is running
// — a Vercel function has no `claude` binary and no interactive login — not of the work.
//
// THE RULE THAT MATTERS: asking for a host you cannot have is a HALT, never a downgrade.
//
// A silent fall back to the API is the exact failure that makes the setting pointless. The operator
// set it to stop paying per token; a fallback bills them anyway and tells them nothing, and they
// find out from an invoice. It is also indistinguishable from success at the only moment anyone
// would check. So an unavailable host raises `HostUnavailable` and the run stops with the reason.

import "server-only";
import { apiHost } from "./api";
import { HostUnavailable, type Host } from "./types";

/**
 * What the operator asked for, normalised. Absent, empty or `api` all mean the API host.
 *
 * Typed to the one key it reads rather than the whole `ProcessEnv`, so a caller — a test, most of
 * all — can hand it a literal without inventing a NODE_ENV it does not care about.
 */
export function requestedHost(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.COMPASS_CLAUDE_HOST ?? "").trim().toLowerCase();
  if (!raw) return "api";

  // Boolean spellings, so the toggle is a ONE-CHARACTER edit in .env.local (`=1` ↔ `=0`) rather
  // than retyping a host name or commenting a line out. Deleting a line to change behaviour is
  // how a line comes back uncommented by accident; flipping a digit is visible in a diff.
  //
  // Only the two ends are aliased. Anything else still has to name a host, so this stays a host
  // selector that happens to accept yes/no — not a boolean that will need rewriting the day a
  // third host exists.
  if (["1", "true", "on", "yes", "cli"].includes(raw)) return "cli";
  if (["0", "false", "off", "no", "api"].includes(raw)) return "api";
  return raw;
}

/**
 * Resolve the host, or refuse.
 *
 * `available` is injected so the refusal path is testable without a machine that happens to lack
 * the binary — the branch that must never silently pass is the one hardest to reproduce.
 */
export function selectHost(
  requested: string = requestedHost(),
  available: (host: string) => boolean = binaryAvailable,
): Host {
  if (requested === "api") return apiHost;

  if (requested === "cli" || requested === "claude-code") {
    // The CLI host is not built yet. Said plainly and as a halt: reporting "cli selected" and then
    // running on the API would be the downgrade this module exists to prevent, and it would look
    // exactly like the feature working.
    if (!available("claude")) {
      throw new HostUnavailable(
        requested,
        "COMPASS_CLAUDE_HOST asks for the `claude` CLI, but the binary is not on PATH. " +
          "Install it and log in, or unset COMPASS_CLAUDE_HOST to use the metered API.",
      );
    }
    throw new HostUnavailable(
      requested,
      "The `claude` CLI host is not implemented yet — the tool contract (`ask`/`draft`) has not " +
        "been proven through it. Unset COMPASS_CLAUDE_HOST to use the metered API.",
    );
  }

  throw new HostUnavailable(
    requested,
    `Unknown host '${requested}'. COMPASS_CLAUDE_HOST accepts 'cli' or 'api' (the default).`,
  );
}

/** Is the binary on PATH? Separated so `selectHost` stays pure and testable. */
function binaryAvailable(bin: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
    execFileSync("which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
