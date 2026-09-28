// Initiating a phase, and working a row that nests a workflow.
//
// This replaces `materialiseBacklog`, which read the kickoff-backlog DOCUMENT and opened a workflow
// run per row. That was v1's `createSprint0` ported faithfully, and it was faithful to the wrong
// thing: it made every row a peer workflow, which is how one engagement ended up with nine runs
// holding six tasks. A row is a unit of work inside a phase, not a phase of its own.
//
// Two cases, and they are the whole surface:
//
//   initiatePhase   the delivery manager starts a phase — setup, sprint-0, sprint. Every row
//                   becomes a task in ONE run, up front, because a phase's rows are known when it
//                   begins and the point of a kickoff backlog is that nothing in it is a surprise.
//
//   openNested      a row whose dispatch is `workflow: <code>` opens a CHILD run when someone
//                   starts it. The child closes its parent task when it closes (migration 034).
//
// Both go through database routines. Nothing here inserts a task.
//
// Split into `lifecycle.ts` (opening a phase), `nested.ts` (opening a child run) and `read.ts`
// (display-only reads) — `../phases.ts` re-exports this module so every existing import path keeps
// working unchanged.

import "server-only";

export type { BoardResult, Initiated, FanOutResult } from "./types";

export { initiatePhase, remirrorPhase } from "./lifecycle";

export { openNested, openNestedFanOut } from "./nested";

export { nestedWorkflowOf, childRunsOf, phasesFor } from "./read";
