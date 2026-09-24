// Start a task over HTTP — additively.
//
// The same `startTask` the server actions already call in-process. `startTaskAction` and
// `startWorkflowAction` keep calling it directly and always will; nothing about the button click
// gets slower or gains a new failure mode to get this. This route exists for whatever isn't a
// Server Action — an external caller, a future non-Next client — the same reason `measureTask` is
// both a direct call (from `recheckAction`) and a route (`/api/agent/measure`).

import { NextRequest } from "next/server";
import { resolveActor } from "@/app/lib/data/actor";
import { startTask } from "@/app/lib/data/tasks";
import { ok, refuse } from "@/app/lib/http";

export async function POST(req: NextRequest) {
  const { engagement, role, taskId } = await req.json();
  const actor = await resolveActor(engagement, role);
  if (!actor) return refuse("no such role on this engagement", 400);

  const result = await startTask(actor, taskId);
  if (!result.ok) return refuse(result.error);

  return ok({});
}
