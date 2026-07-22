import { supabaseAdmin } from "@/app/lib/supabase";
import { runOrchestrator } from "@/app/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-execute / fix bridge: resolve the failed run's story → target repo, spawn the REAL
// orchestrator (build or fix per the run id), stream it live, set the run status from the exit
// code, and gate on the PR when green. The spawn + finalize live in lib/orchestrator (shared with
// the assistant's rerun_workflow tool); this route is the thin streaming wrapper.
export async function POST(req: Request) {
  const { runId } = (await req.json()) as { runId: string };

  // derive the story key + workflow (fix vs build) from the run row / id
  const sb0 = supabaseAdmin();
  const workflow: "build" | "fix" = runId.startsWith("fix-") ? "fix" : "build";
  let storyKey = runId.replace(/^(build|fix)-/, "");
  if (sb0) {
    const { data: run } = await sb0.from("run").select("story").eq("id", runId).maybeSingle();
    if (run?.story) storyKey = String(run.story).split(" ")[0];
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      await runOrchestrator({ storyKey, workflow, runId, emit: (s) => c.enqueue(enc.encode(s)) });
      c.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
