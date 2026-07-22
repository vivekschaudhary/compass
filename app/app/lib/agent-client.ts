import type { AgentEvent } from "./agent-loop";
import type { Anchor } from "./agent-thread";

export type { AgentEvent, Anchor };

// Client reader for the agentic assistant's NDJSON stream: POST a turn, parse one JSON AgentEvent
// per line, and hand each to onEvent as it arrives. Mirrors runStreamed but for line-delimited events.
export async function streamAgent(
  body: { threadId?: string; engagementId?: string; role?: string; anchor?: Anchor; message?: string; confirm?: { toolUseId: string; approved: boolean } },
  onEvent: (e: AgentEvent) => void,
): Promise<void> {
  const res = await fetch("/api/agent/turn", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.body) throw new Error("no stream");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const flush = (line: string) => { const s = line.trim(); if (s) { try { onEvent(JSON.parse(s) as AgentEvent); } catch { /* skip partial */ } } };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) { flush(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
  }
  flush(buf);
}

// The dock's client-side transcript model — what gets rendered as the conversation scrolls.
export type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming?: boolean }
  | { kind: "tool"; name: string; phase: "start" | "done" | "error"; summary?: string }
  | { kind: "exec"; log: string }
  | { kind: "confirm"; toolUseId: string; name: string; input: unknown; summary: string; state: "pending" | "approved" | "denied" };
