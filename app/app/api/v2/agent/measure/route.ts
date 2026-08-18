// Re-measure a task's criteria without running the agent.
//
// The gate is only as current as its last measurement, and after a draft lands the machine can
// decide things it could not before. This is the "check it again" that does not cost a model run.

import { NextRequest, NextResponse } from "next/server";
import { resolveActor } from "@/app/lib/data/actor";
import { measureTask } from "@/app/lib/data/gates";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { engagement, role, taskId } = await req.json();
  const actor = await resolveActor(engagement, role);
  if (!actor) return NextResponse.json({ error: "no such role on this engagement" }, { status: 400 });

  const statuses = await measureTask(actor, taskId);
  return NextResponse.json({
    checks: statuses.map((s) => ({
      criterion: s.statement || `${s.subjectKind} ${s.subjectRef}`,
      kind: s.kind,
      state: s.verdict.state,
      detail: s.verdict.state === "unmeasurable" ? s.verdict.why : s.verdict.detail,
    })),
  });
}
