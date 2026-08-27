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
import { cliHost } from "./cli";
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
    if (!available("claude")) {
      throw new HostUnavailable(
        requested,
        "COMPASS_CLAUDE_HOST asks for the `claude` CLI, but the binary is not on PATH. " +
          `Install it and log in, or set it to 0. ${WHERE}`,
      );
    }
    return cliHost;
  }

  throw new HostUnavailable(
    requested,
    `Unknown host '${requested}'. COMPASS_CLAUDE_HOST accepts 'cli'/1 or 'api'/0 (the default). ` +
      WHERE,
  );
}

/**
 * Where the value came from, because that is the half a reader cannot see.
 *
 * A real environment variable OUTRANKS `.env.local` in Next, and this cost a live debugging session:
 * `.env.local` said 0, the server came up `cli` anyway, and the message said only "unset
 * COMPASS_CLAUDE_HOST" — so the obvious move was to edit the file, which could never win. The
 * export was in `~/.zshrc`, left over from v1, which uses the SAME variable name.
 *
 * A halt that sends the reader to the wrong file is only half a halt.
 */
const WHERE =
  "Note the value may come from your shell rather than .env.local — a real environment variable " +
  "overrides the file, so check `echo $COMPASS_CLAUDE_HOST` and your shell profile too.";

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
