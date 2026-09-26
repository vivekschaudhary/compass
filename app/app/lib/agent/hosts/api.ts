// The metered Anthropic API host — what the app has always done, now behind the seam.
//
// Moved verbatim from `run.ts`, deliberately: this is a refactor, and anything that reads
// differently here is a behaviour change smuggled into one. Same model, same 64k, same adaptive
// thinking at high effort, same streaming.
//
// Credentials are the SDK's business, not ours. `new Anthropic()` resolves ANTHROPIC_API_KEY, then
// ANTHROPIC_AUTH_TOKEN, then an `ant auth login` OAuth profile, then WIF, then the default profile
// on disk — so an unset API key does NOT mean this host has no credentials. Worth knowing because
// it is the trap next to the CLI host: every one of those is a METERED credential, and a run that
// silently lands here bills, whatever the operator thought they had configured.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Host, HostRequest, HostResult } from "./types";

export const apiHost: Host = {
  name: "api",

  async dispatch(req: HostRequest): Promise<HostResult> {
    const client = new Anthropic();

    // Streaming because a real task at high effort can run for minutes, and a non-streaming
    // request of this size hits the SDK's HTTP timeout rather than finishing.
    const stream = client.messages.stream({
      model: req.model,
      max_tokens: req.maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: req.system,
      // Anthropic's own server tool, executed on their side — no client loop needed for it. Kept
      // OUT of `req.tools` (see `HostRequest.wantsWebSearch`): that array is the cross-host domain
      // contract every host must carry identically, and this is how THIS host fulfills a capability
      // request, not a tool the app itself calls.
      tools: req.wantsWebSearch
        ? [...req.tools, { type: "web_search_20250305" as const, name: "web_search" as const }]
        : req.tools,
      messages: req.messages,
    });
    const message = await stream.finalMessage();

    // `server_tool_use` (the model invoking web_search) is a distinct block type from `tool_use`
    // (the model calling one of ours, `ask`/`draft`/…) — this already only ever matches the latter.
    const call = message.content.find((b) => b.type === "tool_use");

    return {
      stopReason: message.stop_reason,
      refusalExplanation:
        message.stop_details && "explanation" in message.stop_details
          ? String(message.stop_details.explanation ?? "no explanation given")
          : null,
      text: message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim(),
      toolCall: call ? { name: call.name, input: call.input } : null,
      usage: {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      },
    };
  },
};
