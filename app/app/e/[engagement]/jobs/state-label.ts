// What a row's state means, in words — shared by all three start controls so they describe the
// same state the same way rather than drifting into three slightly different vocabularies.
//
// `running` means someone clicked start. It does NOT mean an agent is working — an agent has the
// task only once an executor has picked it up. Saying "agent working…" with no executor attached
// is the exact false green this model exists to prevent, and it was here until someone read the
// screen carefully. Until the agent loop lands, every started task honestly says so.

export function labelFor(state: string, executor?: string | null): string {
  switch (state) {
    case "running":
      return executor ? "agent working…" : "started · no agent attached yet";
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
