// The subscription host — one agent turn through the logged-in `claude` binary.
//
// Same contract as the API host, different transport and a different bill. `claude -p` runs against
// the CLI's OAuth login rather than an API key, so a turn costs nothing marginal.
//
// It is NOT a port of v1's `compass/orchestrator/hosts/claude_code.py`. That host deliberately
// passed no tool schemas and let Claude Code run its own Read/Edit/Bash loop, returning prose —
// correct when the output is a commit, useless here, where the output has to come back as `ask` or
// `draft` to become questions and document versions. What is carried over is v1's hard-won process
// discipline, which cost real incidents to learn; see the guards below.
//
// The flags are verified against the real binary, not recalled. Two are load-bearing in ways that
// are not obvious:
//
//   --tools ""        Claude Code ships Read/Edit/Bash ON. A drafting agent has no business
//                     touching the filesystem, and the deliverable must come from the pinned
//                     documents in the prompt rather than from whatever it can find on disk.
//
//   NEVER --bare      It reads like the right flag for a minimal invocation and silently defeats
//                     the entire host: its own help says OAuth and keychain are never read, so the
//                     subscription login is ignored and the run fails "Not logged in".

import "server-only";
import { spawn, type SpawnOptions } from "node:child_process";
import type Anthropic from "@anthropic-ai/sdk";
import type { Host, HostRequest, HostResult } from "./types";
import { unionSchema } from "./tools";

/**
 * Silence, not duration, is what "stuck" looks like.
 *
 * v1 shipped a blunt wall-clock cap and it killed a healthy 448-second drafting run — a cap cannot
 * tell "hung" from "long but working", and this spike's own draft took 91 seconds. A stuck CLI
 * emits nothing; a working one emits an event every few seconds. So the idle timer is the real
 * guard and the wall clock is only a backstop against a pathological emit-forever loop.
 */
const IDLE_MS = 300_000;
const HARD_MS = 3_600_000;

/** stdout of one `claude -p` run: newline-delimited JSON events. */
export type Runner = (
  argv: string[],
  opts: { env: Record<string, string | undefined>; idleMs: number; hardMs: number },
) => Promise<string>;

/**
 * The child's environment, with every metered credential removed.
 *
 * v1 calls this the flat-cost guarantee rather than a nicety, and it is right: the `claude` CLI
 * PREFERS an env API key over the subscription login, so leaving one set bills the metered API and
 * inherits its usage cap — defeating the only reason this host exists. v1 caught it live, as a
 * `400 usage limit` from a capped key where a subscription run was expected.
 */
export function subscriptionEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out = { ...env };
  delete out.ANTHROPIC_API_KEY;
  delete out.ANTHROPIC_AUTH_TOKEN;
  delete out.ANTHROPIC_BASE_URL;
  return out;
}

/**
 * The conversation as one prompt.
 *
 * The CLI takes a single prompt, not a message array, so the turns are flattened with their roles
 * marked. Content blocks are REFUSED rather than coerced: every caller passes strings today, and a
 * block array silently stringified to "[object Object]" would send the agent a prompt that looks
 * full and says nothing. If blocks ever arrive, this should fail loudly and be taught to render
 * them.
 */
export function flattenMessages(messages: Anthropic.MessageParam[]): string {
  return messages
    .map((m) => {
      if (typeof m.content !== "string") {
        throw new Error(
          `cli host: message content is a block array, which this host cannot render. ` +
            `Only string content is supported — teach flattenMessages before sending blocks.`,
        );
      }
      return m.role === "assistant" ? `[assistant]\n${m.content}` : `[user]\n${m.content}`;
    })
    .join("\n\n");
}

/** The argv for one dispatch. Pure, so the flags are testable without spawning anything. */
export function buildArgv(req: HostRequest): string[] {
  return [
    "-p",
    // Streaming is not for progress — it is what gives the idle guard something to watch. With
    // buffered `--output-format json` a killed run leaves no trace of whether it was stuck.
    "--output-format", "stream-json",
    "--verbose",
    "--model", req.model,
    // Parity with the API host's `output_config: { effort: "high" }`.
    "--effort", "high",
    // A consumer repo's .claude/settings.json must not reach into a Compass run.
    "--setting-sources", "",
    // See the header: built-ins are ON by default and a drafting agent must not have them.
    "--tools", "",
    "--json-schema", JSON.stringify(unionSchema(req.tools)),
    "--append-system-prompt", req.system,
  ];
}

/**
 * The `result` event out of the NDJSON stream, mapped onto `HostResult`.
 *
 * Structured output arrives as a JSON STRING inside the result event, so it needs a second parse.
 * A failure to parse is not thrown: `run.ts` already handles a turn with no tool call by recording
 * what was said and leaving the task open for a human, which is a better outcome than an exception
 * that discards minutes of model work.
 */
export function toHostResult(stdout: string): HostResult {
  const events = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Record<string, unknown>[];

  const result = events.reverse().find((e) => e.type === "result");
  if (!result) {
    throw new Error(
      "cli host: the stream ended with no result event — the CLI produced no verdict. " +
        "Treat this as a failed run rather than an empty one.",
    );
  }

  const raw = typeof result.result === "string" ? result.result : JSON.stringify(result.result);

  // The CLI's own failures (auth, usage limit) arrive here as a successful process with
  // is_error set and the message in `result`. Surfacing it as text beats a generic throw.
  if (result.is_error) {
    return { stopReason: "error", refusalExplanation: null, text: raw, toolCall: null, usage: null };
  }

  let call: { name: string; input: unknown } | null = null;
  try {
    const parsed = JSON.parse(raw) as { tool?: unknown; input?: unknown };
    if (typeof parsed.tool === "string" && parsed.input && typeof parsed.input === "object") {
      call = { name: parsed.tool, input: parsed.input };
    }
  } catch {
    // Not JSON, so not a tool call. `text` carries it and the caller decides.
  }

  return {
    stopReason: call ? "tool_use" : String(result.stop_reason ?? "end_turn"),
    refusalExplanation: null,
    text: call ? "" : raw,
    toolCall: call,
    // Deliberately null. The CLI reports `total_cost_usd`, but that is an API-EQUIVALENT figure,
    // not a charge — writing it here would make a flat-cost run look metered and would false-trip
    // any cost guard built on this field. v1 recorded it as a note and emitted no usage event.
    usage: null,
  };
}

/** Spawn `claude`, guarding on silence. Replaceable in tests so nothing spawns the real binary. */
const defaultRunner: Runner = (argv, { env, idleMs, hardMs }) =>
  new Promise((resolve, reject) => {
    const opts: SpawnOptions = {
      // Cast at the boundary. This project's `ProcessEnv` requires NODE_ENV, which a stripped copy
      // has no business asserting — the plain record above is the honest type for "a set of
      // variables", and Node only needs a string map here.
      env: env as NodeJS.ProcessEnv,
      // Its own process group, so a kill takes anything the CLI spawned with it rather than
      // orphaning it. v1 learned this from dev servers surviving a killed run.
      detached: true,
      // stdin closed. Left open, the CLI waits 3s for input and prefixes a warning to stdout,
      // which corrupts the first JSON parse.
      stdio: ["ignore", "pipe", "pipe"],
    };
    const child = spawn("claude", argv, opts);

    let out = "";
    let err = "";
    let idle: NodeJS.Timeout;
    let settled = false;

    const stop = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      clearTimeout(hard);
      fn();
    };

    const kill = (why: string) =>
      stop(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
        reject(new Error(why));
      });

    const bump = () => {
      clearTimeout(idle);
      idle = setTimeout(
        () =>
          kill(
            `cli host: the claude CLI produced no output for ${idleMs / 1000}s and was killed. ` +
              `It is stuck rather than slow — a working run emits an event every few seconds.`,
          ),
        idleMs,
      );
    };

    const hard = setTimeout(
      () => kill(`cli host: the claude CLI exceeded the ${hardMs / 1000}s backstop and was killed.`),
      hardMs,
    );

    child.stdout!.on("data", (d: Buffer) => {
      out += d;
      bump();
    });
    child.stderr!.on("data", (d: Buffer) => {
      err += d;
      bump();
    });
    child.on("error", (e: Error) => stop(() => reject(e)));
    child.on("close", (code: number | null) =>
      stop(() =>
        // The CLI reports auth and usage-limit failures as JSON on STDOUT with an empty stderr, so
        // a non-zero exit still resolves when there is output to interpret. v1 shipped the opposite
        // and surfaced a useless "(no stderr)" for the errors that matter most.
        out.trim()
          ? resolve(out)
          : reject(new Error(`cli host: claude exited ${code} with no output. ${err.trim()}`)),
      ),
    );

    bump();
  });

export function makeCliHost(runner: Runner = defaultRunner): Host {
  return {
    name: "cli",
    async dispatch(req: HostRequest): Promise<HostResult> {
      // `req.maxTokens` has no CLI equivalent and is IGNORED here. Said out loud because a silently
      // dropped ceiling is the kind of difference between hosts that surfaces as a mystery later.
      const stdout = await runner([...buildArgv(req), flattenMessages(req.messages)], {
        env: subscriptionEnv(process.env),
        idleMs: IDLE_MS,
        hardMs: HARD_MS,
      });
      return toHostResult(stdout);
    },
  };
}

export const cliHost = makeCliHost();
