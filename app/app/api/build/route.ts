import { runOrchestrator } from "@/app/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Build bridge: resolve the story's target repo, spawn the REAL orchestrator against it, stream it,
// and on green gate the story on its PR (not auto-Done) + clear the job card that launched it.
//
// #148: this used to re-implement the spawn/finalize inline — a near-copy of runOrchestrator that
// had already drifted. It lacked the #123 exit-3 Jira revert, so a build the orchestrator REFUSED
// before dispatching anything left the board reading "In Progress" for work that never started.
// Two spawn paths, one of which lied about a refused run, is the class this codebase keeps paying
// for. One path now.
export async function POST(req: Request) {
  const { jobId, story, actor } = (await req.json()) as { jobId: string; story: string; actor?: string };
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(c) {
      await runOrchestrator({
        storyKey: story,
        workflow: "build",
        // unique per launch, so two builds of the same story can't collide on one run row
        runId: `build-${story}-${Date.now().toString(36)}`,
        actor,
        clearJobId: jobId,
        emit: (s) => c.enqueue(enc.encode(s)),
      });
      c.close();
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
