// What the agent is given: who it is, what it reads, and when it is done.
//
// PINNED AT START, NOT RESOLVED AT READ. When a task starts, the documents its step declares are
// recorded in `task_input` with the exact version that was live at that moment. Everything after
// reads the pin, not the path. Without this a citation means "whatever that document says now",
// which is not provenance — it is a dangling pointer that silently rewrites history every time
// someone edits a source.
//
// A pin can also be MISSING, and that is information rather than an error: the step declares three
// documents and only one has been drafted. The agent is told exactly that, because an agent that
// quietly proceeds on a third of its inputs produces a confident answer built on nothing.
//
// Split into `loaders.ts` (everything that touches the database) and `prompts.ts` (pure string
// builders over an already-loaded `AgentContext`) — `../context.ts` re-exports this module so every
// existing import path keeps working unchanged.

import "server-only";

export {
  ASK_BATCH,
  ASK_ROUNDS_MAX,
  type PinnedInput,
  type AgentContext,
  type SprintContext,
  type PhaseRow,
  type WorkflowSummary,
} from "./types";

export {
  pinInputs,
  loadDocumentText,
  doneCriteriaFor,
  agentMarkdown,
  buildContext,
} from "./loaders";

export {
  withoutTaskCatalogue,
  systemPrompt,
  revisionPrompt,
  inputPrompt,
} from "./prompts";
