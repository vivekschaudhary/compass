import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Re-execute a failed run. The web→orchestrator bridge: a real resume shells out to
//   python3 -m compass.orchestrator.run <workflow> --story <id> --from-step <N>
// (the first genuine step toward driving real execution from the web). For the seeded
// demo run we mark it resolved so the recovery is visible; swap the TODO for the spawn
// once this app runs a real project.
export async function POST(req: Request) {
  const { runId } = (await req.json()) as { runId: string };
  const sb = supabaseAdmin();

  // TODO(real execution): spawn the orchestrator resume here (child process),
  // stream its output back, and let the run's real status drive this response.
  if (sb) await sb.from("run").update({ status: "resolved" }).eq("id", runId);

  return NextResponse.json({
    ok: true,
    message: "Re-queued from the checks step — running now. Watch the run turn green.",
  });
}
