import { spawn } from "child_process";
import { supabaseAdmin } from "@/app/lib/supabase";
import { resolveRunPlan } from "@/app/lib/repo";
import { transitionIssue, jiraForStory } from "@/app/lib/jira";
import { logActivity } from "@/app/lib/activity";

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
        if (sb && code === 0) {
          if (jira) { const ok = await transitionIssue(jira, story, "Done"); push(`[jira] ${story} → Done${ok ? "" : " (skipped)"}\n`); }
          await sb.from("story").update({ status: "good", ac_pass_pct: 100, blocked_reason: null }).eq("id", story);
          const { data: st } = await sb.from("story").select("epic_id").eq("id", story).maybeSingle();
          if (st?.epic_id) {
            const { data: sibs } = await sb.from("story").select("status").eq("epic_id", st.epic_id);
            if (sibs && sibs.every((s) => s.status === "good")) {
              await sb.from("epic").update({ status: "good", note: null }).eq("id", st.epic_id);
            }
          }
          await sb.from("job").delete().eq("id", jobId);
        }
        c.close();
      });
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
