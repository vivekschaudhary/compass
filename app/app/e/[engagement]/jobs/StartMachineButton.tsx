"use client";

// The control for a `machine` row — measured, not performed. There is no agent to start and never
// was, so unlike the other two controls this one has no "start" action at all: idle and non-idle
// look almost the same, because "nothing has checked it yet" and "it ran and here's the verdict"
// are both read off the SAME gate, not off a run someone kicked off.
//
// This is the branch `StartButton` used to be missing for the idle case — an idle machine row fell
// through to "Start with agent", a control that dispatches nothing this row's own file defines.

import { RecheckButton } from "./RecheckButton";
import { labelFor } from "./state-label";

export function StartMachineButton({
  engagement,
  role,
  taskId,
  state,
}: {
  engagement: string;
  role: string;
  taskId: string;
  state: string;
}) {
  return (
    <div className="task-state-row">
      <RecheckButton engagement={engagement} role={role} taskId={taskId} />
      <span className="task-state text-muted">
        {state === "idle" ? "not yet checked" : labelFor(state, null)}
      </span>
    </div>
  );
}
