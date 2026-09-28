// The sweep's target — called by `compass_sweep_due_tasks()` (a Postgres function, via `pg_net`),
// never by a browser. See the migration `run_retry_and_sweep.sql` for the whole mechanism.
//
// Same shape as `/api/agent/run`, with one difference: the caller has no session, so there is no
// engagement/role to trust from a query string — everything is re-derived from the task row itself,
// and the request must carry the shared secret the migration's `app.sweep_secret` setting was given.
//
// DETACHED, same reasoning as `/api/agent/run` — see that route's own header. `pg_net` does not wait
// on the response body either way, but on a real deployment the function itself can be frozen shortly
// after responding, so this needs the same fix for the same eventual reason.

import { NextRequest } from "next/server";
import { taskOwner } from "@/app/lib/data/job";
import { resolveActor } from "@/app/lib/data/actor";
import { runAgent } from "@/app/lib/agent/run";
import { detach } from "@/app/lib/agent/detach";
import { ok, refuse, fail } from "@/app/lib/http";

export const maxDuration = 800;

export async function POST(req: NextRequest) {
  // Checked before anything else touches the database — an unauthenticated caller must not be able
  // to force a model run on an arbitrary task id, which is exactly what this route does once past
  // this line.
  const secret = req.headers.get("x-compass-sweep-secret");
  if (!process.env.SWEEP_SECRET || secret !== process.env.SWEEP_SECRET) {
    return refuse("Not authorised.", 401);
  }

  const { taskId } = await req.json();
  if (!taskId) return refuse("taskId is required.", 400);

  const task = await taskOwner(taskId);
  if (!task) return refuse("No such task.", 400);

  const actor = await resolveActor(task.engagementId, task.roleCode);
  if (!actor) return refuse("That role does not exist on this engagement.", 400);

  detach(() => runAgent(actor, taskId));
  return ok({ kind: "accepted" as const, taskId });
}
