// The sweep's target — called by `compass_sweep_due_tasks()` (a Postgres function, via `pg_net`),
// never by a browser. See the migration `run_retry_and_sweep.sql` for the whole mechanism.
//
// Same shape as `/api/agent/run`, with one difference: the caller has no session, so there is no
// engagement/role to trust from a query string — everything is re-derived from the task row itself,
// and the request must carry the shared secret the migration's `app.sweep_secret` setting was given.

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { resolveActor } from "@/app/lib/data/actor";
import { runAgent } from "@/app/lib/agent/run";
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

  const sb = supabaseAdmin();
  if (!sb) return fail("Supabase is not configured.");

  const { data: task } = await sb
    .from("work_task")
    .select("engagement_id, role_code")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return refuse("No such task.", 400);

  const actor = await resolveActor(task.engagement_id as string, task.role_code as string);
  if (!actor) return refuse("That role does not exist on this engagement.", 400);

  const outcome = await runAgent(actor, taskId);
  // Same rule as `/api/agent/run`: only `kind: "error"` leaves the domain vocabulary and becomes a
  // 5xx — a refusal or a completed ask/draft is a run that happened, not a route failure.
  if (outcome.kind === "error") return fail(outcome.message);
  return ok(outcome);
}
