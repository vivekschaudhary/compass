// What a host is, and what it owes back.
//
// v2 was born calling `new Anthropic()` inline, with one hardcoded model and no way to route a run
// anywhere else. That is the fork v1's router already solved, and the reason the fork matters is
// not cost — it is that review independence needs an author and its reviewer on DIFFERENT hosts,
// and a hardcoded client cannot express that.
//
// The seam is deliberately narrow: one call in, one normalised answer out. Everything the agent
// loop needs to decide what happened is in `HostResult`, and nothing provider-shaped leaks past
// it — so a host that is a subprocess rather than an HTTP client is a peer, not a special case.

import type Anthropic from "@anthropic-ai/sdk";

export type HostRequest = {
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  /**
   * The tool contract, and the thing a host may NOT quietly drop.
   *
   * `ask` and `draft` are how a question reaches a human and how a draft becomes a document
   * version with citations. v1's CLI host passed no tool schemas at all — Claude Code ran its own
   * internal loop and returned prose — which is fine for a host whose output is a commit and
   * fatal for one whose output has to become rows. A host that cannot carry these cannot serve
   * this loop, and must say so rather than returning text.
   */
  tools: Anthropic.Tool[];
  maxTokens: number;
};

export type HostResult = {
  /** Why generation stopped. `refusal` and `max_tokens` are real outcomes the caller branches on. */
  stopReason: string | null;
  /** Present only on a refusal, and only when the host explains itself. */
  refusalExplanation: string | null;
  /** Everything the model said outside a tool call, already joined and trimmed. */
  text: string;
  /** The one tool call this turn, or null when it answered in prose without choosing one. */
  toolCall: { name: string; input: unknown } | null;
  /**
   * NULL is a legitimate answer, not a missing value.
   *
   * A subscription-backed host has no metered usage to report, and v1 learned that inventing one
   * is worse than admitting none: a fabricated usage figure false-trips a cost guard and makes a
   * flat-cost run look like a metered one. So the type says "may not exist" and every reader has
   * to handle it.
   */
  usage: { inputTokens: number; outputTokens: number } | null;
};

/**
 * A host that could not be used, as distinct from a host that ran and failed.
 *
 * The difference is the whole point of `select`: "the `claude` binary is not installed" must not
 * read like "the model errored", because the first is a configuration answer and the second is a
 * run outcome. Carries the host it was asking for so the message can name it.
 */
export class HostUnavailable extends Error {
  constructor(readonly host: string, message: string) {
    super(message);
    this.name = "HostUnavailable";
  }
}

export type Host = {
  /** How this host is named in config and in the record. */
  readonly name: string;
  dispatch(req: HostRequest): Promise<HostResult>;
};
