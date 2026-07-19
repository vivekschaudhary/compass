import { spawn } from "child_process";
import { supabaseAdmin } from "@/app/lib/supabase";
import { resolveRunPlan } from "@/app/lib/repo";
import { transitionIssue, jiraForStory } from "@/app/lib/jira";
import { logActivity } from "@/app/lib/activity";
import { gateOnPr } from "@/app/lib/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function engagementForStory(storyKey: string): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data: st } = await sb.from("story").select("epic_id").eq("id", storyKey).maybeSingle();
  if (!st?.epic_id) return null;
  const { data: ep } = await sb.from("epic").select("engagement_id").eq("id", st.epic_id).maybeSingle();
  return ep?.engagement_id ?? null;
}

// Build bridge: resolve the story's target repo, spawn the REAL orchestrator against it
// (or the safe CI-parity check if no repo local_path), stream it, and on green mark the
// story built + heal its epic + complete the job.
export async function POST(req: Request) {
  const { jobId, story, actor } = (await req.json()) as { jobId: string; story: string; actor?: string };
  const plan = await resolveRunPlan(story, "build");
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(c) {
      let log = "";
      const push = (s: string) => { log += s; c.enqueue(enc.encode(s)); };
      push(plan.header);

      // build → Jira status: mark In Progress as the run starts
      const jira = await jiraForStory(story);
      if (jira) {
        const ok = await transitionIssue(jira, story, "In Progress");
        push(`[jira] ${story} → In Progress${ok ? "" : " (skipped)"}\n\n`);
      }

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (plan.scrubCreds) {
        for (const k of ["JIRA_API_TOKEN", "JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_PROJECT",
                         "ATLASSIAN_API_TOKEN", "ATLASSIAN_EMAIL", "ATLASSIAN_BASE_URL"]) delete env[k];
      }

      const child = spawn("python3", plan.args, { cwd: plan.cwd, env });
      child.stdout.on("data", (d: Buffer) => push(d.toString()));
      child.stderr.on("data", (d: Buffer) => push(d.toString()));
      child.on("error", (e: Error) => {
        push(`\n[build error: ${e.message}]\n[compass-run exit 1]\n`);
        c.close();
      });
      child.on("close", async (code: number | null) => {
        push(`\n[compass-run exit ${code}]\n`);
        const sb = supabaseAdmin();
        const engId = await engagementForStory(story);
        if (sb && engId) {
          const runId = `build-${story}-${Date.now().toString(36)}`;
          const failed = code !== 0;
          await sb.from("run").insert({
            id: runId, engagement_id: engId, role: "engineer", story, workflow: "build",
            status: failed ? "failed" : "resolved", failed_step: failed ? "check gate" : null,
            error: failed ? `exit ${code}` : null, log, created_at: new Date().toISOString(),
          });
          await logActivity(sb, { engagementId: engId, role: "engineer", actor, kind: "build", title: `Build ${story}${plan.repoName ? ` · ${plan.repoName}` : ""}`, related: story, status: failed ? "failed" : "done", runId });
        }
        if (sb && engId && code === 0) {
          // green → the deliverable is a PR; gate on it (parallel to a doc's approval), not auto-Done.
          // The story is marked good + the epic heals only on APPROVE (see action/route.ts build hook).
          const step = (s: string) => push(s.endsWith("\n") ? s : s + "\n");
          await gateOnPr(sb, jira, { ticket: story, engagementId: engId, workflow: "build", log }, step);
          await sb.from("job").delete().eq("id", jobId); // the build ran; the approve job takes over
        }
        c.close();
      });
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
