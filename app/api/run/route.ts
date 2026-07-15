import { spawn } from "child_process";
import { supabaseAdmin } from "@/app/lib/supabase";
import { resolveRunPlan } from "@/app/lib/repo";
import { transitionIssue, jiraForStory } from "@/app/lib/jira";
import { logActivity } from "@/app/lib/activity";
import { gateOnPr } from "@/app/lib/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Re-execute / fix bridge: resolve the failed run's story → target repo, spawn the REAL
// orchestrator (build or fix per the run id), stream it live, set the run status from the exit
// code, and transition the issue's Jira status (In Progress on start, Done on green).
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
  const plan = await resolveRunPlan(storyKey, workflow);
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(c) {
      let log = "";
      const push = (s: string) => { log += s; c.enqueue(enc.encode(s)); };
      push(plan.header);

      const jira = await jiraForStory(storyKey);
      if (jira) { const ok = await transitionIssue(jira, storyKey, "In Progress"); push(`[jira] ${storyKey} → In Progress${ok ? "" : " (skipped)"}\n\n`); }

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (plan.scrubCreds) {
        for (const k of ["JIRA_API_TOKEN", "JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_PROJECT",
                         "ATLASSIAN_API_TOKEN", "ATLASSIAN_EMAIL", "ATLASSIAN_BASE_URL"]) delete env[k];
      }

      const child = spawn("python3", plan.args, { cwd: plan.cwd, env });
      child.stdout.on("data", (d: Buffer) => push(d.toString()));
      child.stderr.on("data", (d: Buffer) => push(d.toString()));
      child.on("error", (e: Error) => {
        push(`\n[spawn error: ${e.message} — is python3 + the compass repo present?]\n[compass-run exit 1]\n`);
        c.close();
      });
      child.on("close", async (code: number | null) => {
        push(`\n[compass-run exit ${code}]\n`);
        const sb = supabaseAdmin();
        const failed = code !== 0;
        let engId: string | null = null;
        if (sb) {
          await sb.from("run").update({ status: failed ? "failed" : "resolved", workflow, log, error: failed ? `exit ${code}` : null }).eq("id", runId);
          const { data: st } = await sb.from("story").select("epic_id").eq("id", storyKey).maybeSingle();
          const { data: ep } = st?.epic_id ? await sb.from("epic").select("engagement_id").eq("id", st.epic_id).maybeSingle() : { data: null };
          engId = ep?.engagement_id ?? null;
          if (engId) await logActivity(sb, { engagementId: engId, role: "engineer", kind: workflow, title: `${workflow === "fix" ? "Fix" : "Re-run"} ${storyKey}`, related: storyKey, status: failed ? "failed" : "done", runId });
        }
        // green → gate on the PR (same as build; parallel to a doc's approval), not auto-Done
        if (sb && engId && code === 0) {
          const step = (s: string) => push(s.endsWith("\n") ? s : s + "\n");
          await gateOnPr(sb, jira, { ticket: storyKey, engagementId: engId, workflow, log }, step);
        }
        c.close();
      });
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
