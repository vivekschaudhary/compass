// Which start control a row gets — the one place that decides, so every caller answers it
// identically instead of carrying its own copy of the branch.
//
// A row that NESTS a workflow is never passed here — that's a `WorkflowsTable` entry, not a task
// row (see `workflows-view.ts`), so this only ever has two real cases left:
//   machine    measured, not performed — no agent, see StartMachineButton
//   otherwise  an agent actually runs — see StartTaskButton

import type { TaskCard } from "@/app/lib/data/tasks";
import type { StoredStatus } from "@/app/lib/data/gates";
import { StartMachineButton } from "./StartMachineButton";
import { StartTaskButton } from "./StartTaskButton";

export function controlFor(
  t: TaskCard,
  opts: {
    engagement: string;
    role: string;
    href?: string;
    /** Kept on the signature even though this branch no longer reads it — `TasksTable` still
        passes it, and every caller of `controlFor` should be free to pass the same options object. */
    statuses?: StoredStatus[];
    /** Omit to leave Start disabled — callers that have not measured Ready keep today's behaviour. */
    readyMet?: boolean;
  },
) {
  const { engagement, role, href, readyMet } = opts;

  if (t.stepKind === "machine") {
    return (
      <StartMachineButton
        engagement={engagement}
        role={role}
        taskId={t.id}
        state={t.state}
      />
    );
  }

  return (
    <StartTaskButton
      taskId={t.id}
      engagement={engagement}
      role={role}
      state={t.state}
      executor={t.executor}
      href={href}
      openQuestions={t.openQuestions}
      readyMet={readyMet}
    />
  );
}
