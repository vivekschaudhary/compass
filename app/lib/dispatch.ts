import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "child_process";
import { tmpdir } from "os";

// Built-in tools disabled for a pure generation call: no tool call (which would trip `--max-turns 1`
// and non-zero-exit), and the CLI can never touch our repo.
const NO_TOOLS = ["Bash", "Read", "Edit", "Write", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "TodoWrite", "NotebookEdit"];

// The AI dispatch seam — one place every AI generation goes through, so the backend is swappable:
//   cli (default): spawn the local `claude` CLI headless → bills the SUBSCRIPTION login (flat cost)
//   api          : the Anthropic API (metered) + prompt caching
// CLI-first for flat-cost BYO-license delivery; auto-falls back to api when the CLI isn't available.
// See app/api/*/route.ts (callers) and GitHub issue #1.

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export type GenerateOpts = { system: string; user: string; model?: string; maxTokens?: number };

function backend(): "cli" | "api" {
  return (process.env.COMPASS_AI_BACKEND || "cli").toLowerCase() === "api" ? "api" : "cli";
}

// Spawn `claude -p` headless. ANTHROPIC_API_KEY is STRIPPED from the child env so the CLI uses the
// logged-in subscription (flat cost) instead of the metered key — the whole point. Prompt on stdin.
function generateCli({ system, user, model }: { system: string; user: string; model: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    // Give the CLI a clean env: strip ALL ANTHROPIC_* vars the app loaded from .env.local
    // (API key, model, any base-url/auth-token) so the CLI uses the subscription login, not the
    // app's metered config. This is the key difference between a plain shell (works) and the dev
    // server (inherits .env.local → CLI exits 1).
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (/^ANTHROPIC_/i.test(k)) delete env[k];
    const args = ["-p", "--system-prompt", system, "--model", model, "--output-format", "json",
                  "--max-turns", "1", "--disallowed-tools", ...NO_TOOLS];
    // Run in a neutral dir, NOT our repo — so the CLI never loads compass-app's project config
    // (CLAUDE.md / .mcp.json with auth-required MCP servers), which makes headless `-p` exit 1.
    const child = spawn("claude", args, { env, cwd: tmpdir() });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => reject(e)); // ENOENT when `claude` isn't on PATH → triggers fallback
    child.on("close", (code) => {
      // surface stdout too — the CLI often writes the real error there while stderr stays empty
      if (code !== 0) return reject(new Error(`claude exit ${code}: ${(err || out).slice(-300) || "(no output)"}`));
      try {
        const j = JSON.parse(out);
        if (j.is_error || typeof j.result !== "string") return reject(new Error(`claude returned an error: ${String(j.subtype ?? j.result ?? "").slice(0, 200)}`));
        resolve(j.result);
      } catch {
        reject(new Error(`claude output not parseable: ${out.slice(0, 200)}`));
      }
    });
    child.stdin.write(user);
    child.stdin.end();
  });
}

// The Anthropic API, with prompt caching on the (repeated) system prefix — the metered fallback.
async function generateApi({ system, user, model, maxTokens }: { system: string; user: string; model: string; maxTokens?: number }): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("No AI backend available: the `claude` CLI isn't usable and ANTHROPIC_API_KEY isn't set.");
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens ?? 2500,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

// Generate text from a system + user prompt. CLI-first (flat cost); auto-fallback to the API.
export async function generate(opts: GenerateOpts): Promise<string> {
  const model = opts.model || AI_MODEL;
  if (backend() === "cli") {
    try {
      return await generateCli({ system: opts.system, user: opts.user, model });
    } catch (e) {
      console.warn(`[dispatch] cli backend unavailable (${e instanceof Error ? e.message : e}) — falling back to api`);
    }
  }
  return generateApi({ system: opts.system, user: opts.user, model, maxTokens: opts.maxTokens });
}
