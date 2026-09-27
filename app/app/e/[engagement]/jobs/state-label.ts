// What a row's state means, in words — shared by all three start controls so they describe the
// same state the same way rather than drifting into three slightly different vocabularies.
//
// `running` means someone clicked start. It does NOT mean an agent is working — an agent has the
// task only once an executor has picked it up. Saying "agent working…" with no executor attached
// is the exact false green this model exists to prevent, and it was here until someone read the
// screen carefully. Until the agent loop lands, every started task honestly says so.
//
// A CLAIMED row is not necessarily an ALIVE one either — the same gap the job page's own banner
// closes (see `heartbeat-config.ts`). Scanning the queue must be able to spot a stuck task the same
// way opening it now can, not just say "agent working…" over a claim nobody is behind any more.

import { isStale, formatElapsed } from "@/app/lib/agent/heartbeat-config";

export function labelFor(
  state: string, executor?: string | null, heartbeatAt?: string | null,
): string {
  switch (state) {
    case "running":
      if (!executor) return "started · no agent attached yet";
      return isStale(heartbeatAt ?? null)
        ? `stuck — no response for ${formatElapsed(heartbeatAt!)}`
        : "agent working…";
    case "awaiting":
      return "waiting on you";
    case "hitl":
      return "awaiting approval";
    case "closed":
      return "done";
    default:
      return state;
  }
}
