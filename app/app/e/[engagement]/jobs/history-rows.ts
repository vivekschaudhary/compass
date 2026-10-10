// Which closed jobs the Jobs screen's History section lists — pure, so the rule is testable.
//
// Only the viewer's own role, however wide their scope is: `history` returns everything an
// everyone-scope role may see, and "everything is mine" is the mistake `TasksTable` already guards
// against for the queue.

import type { DoneJob } from "@/app/lib/data/history";

/** How many rows the section shows before pointing at the full history. */
export const SHOWN = 10;

export function ownHistory(jobs: DoneJob[], myRole: string): { rows: DoneJob[]; total: number } {
  const mine = jobs.filter((j) => j.roleCode === myRole);
  return { rows: mine.slice(0, SHOWN), total: mine.length };
}
