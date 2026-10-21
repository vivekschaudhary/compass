// What can open a workflow without a person asking for it.
//
// `workflow.trigger` was a column nothing read. It now names an EVENT the app emits, and a workflow
// that declares one is opened by it. A closed set, like `STEP_OUTPUTS`: a value the app has no
// behaviour for is a workflow that promises to start itself and never does, so the importer refuses
// a typo instead of storing it.
//
//   epic-filed   an epic has just reached the client's board. The workflow must be about one epic
//                (it names `{epic}` in a produced path); one run is opened for it, idle, and its
//                tasks land on the board under that epic. A person still starts the work.
export const WORKFLOW_TRIGGERS = ["epic-filed"] as const;
export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];
