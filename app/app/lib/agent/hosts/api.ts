// The metered Anthropic API host — what v2 has always done, now behind the seam.
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
      tools: req.tools,
      messages: req.messages,
    });
    const message = await stream.finalMessage();

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
