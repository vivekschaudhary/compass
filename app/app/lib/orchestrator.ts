import { spawn } from "child_process";
import { supabaseAdmin } from "./supabase";
import { resolveRunPlan } from "./repo";
import { transitionIssue, issueStatus, jiraForStory, type JiraCreds } from "./jira";
import { logActivity } from "./activity";
import { gateOnPr } from "./lifecycle";

// The shared orchestrator-run seam. Resolve a story → its target repo, spawn the REAL Python
// orchestrator (build|fix), stream every line through `emit`, then finalize: persist the run row,
// log activity, and gate the ticket on its PR when the run goes green (parallel to a doc's approval).
// Both the /api/run bridge and the assistant's rerun_workflow tool go through here — one spawn path.
export async function runOrchestrator(opts: {
  storyKey: string;
  workflow: "build" | "fix";
  runId?: string;              // existing run row to update; a deterministic id is used when omitted
  actor?: string;              // who launched it, for the activity log
  label?: string;              // activity title verb; defaults to the workflow's own name
  clearJobId?: string;         // #148: the job card that launched this — deleted once the run goes
                               // green and the approve job supersedes it
  emit: (s: string) => void;   // receives the header, live stdout/stderr, and the exit sentinel
}): Promise<{ code: number | null; log: string; runId: string }> {
  const { storyKey, workflow, emit } = opts;
  const runId = opts.runId ?? `${workflow}-${storyKey}`;
  const plan = await resolveRunPlan(storyKey, workflow);

  let log = "";
  const push = (s: string) => { log += s; emit(s); };
  push(plan.header);

  const jira = await jiraForStory(storyKey);
  // #123: remember where the ticket was. The transition below happens BEFORE the spawn, so a
  // run the orchestrator refuses at a pre-dispatch gate would otherwise strand the board at
  // "In Progress" for work that never began — the same lie those gates exist to prevent.
  let priorStatus: string | null = null;
  if (jira) {
    priorStatus = await issueStatus(jira, storyKey);
    const ok = await transitionIssue(jira, storyKey, "In Progress");
    push(`[jira] ${storyKey} → In Progress${ok ? "" : " (skipped)"}\n\n`);
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (plan.scrubCreds) {
    for (const k of ["JIRA_API_TOKEN", "JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_PROJECT",
                     "ATLASSIAN_API_TOKEN", "ATLASSIAN_EMAIL", "ATLASSIAN_BASE_URL"]) delete env[k];
  }

  const code: number | null = await new Promise((resolve) => {
    const child = spawn("python3", plan.args, { cwd: plan.cwd, env });
    child.stdout.on("data", (d: Buffer) => push(d.toString()));
    child.stderr.on("data", (d: Buffer) => push(d.toString()));
    child.on("error", (e: Error) => {
      push(`\n[spawn error: ${e.message} — is python3 + the compass repo present?]\n`);
      resolve(1);
    });
    child.on("close", (c: number | null) => resolve(c));
  });
  push(`\n[compass-run exit ${code}]\n`);

  // #123: exit 3 is a pre-dispatch ENTRY gate — the orchestrator refused before dispatching an
  // agent, creating a branch, or touching the repo. Nothing ran, so nothing should look started:
  // put the ticket back where it was.
  if (code === 3 && jira && priorStatus) {
    const reverted = await transitionIssue(jira, storyKey, priorStatus);
    push(`[jira] ${storyKey} → ${priorStatus} (reverted — the run never started)` +
         `${reverted ? "" : " (skipped)"}\n`);
  }

  // finalize — persist the run + gate on the PR when green (same handshake as build)
  await finalize({ runId, storyKey, workflow, code, log, jira, push,
                   actor: opts.actor, label: opts.label, clearJobId: opts.clearJobId,
                   repoName: plan.repoName });
  return { code, log, runId };
}

// #148: where a run stopped, from the orchestrator's exit-code convention (run.py) — 1 in-loop
// halt, 2 missing dispatch prerequisite, 3 pre-dispatch entry gate, 130 interrupt. /api/build used
// to hardcode this as "check gate", which is wrong for every failure that isn't one — and after
// #123, exit 3 is by definition BEFORE the check gate. The field is shown in the run history, so a
// wrong label misdirects triage.
function failedStepFor(code: number | null): string | null {
  if (code === 0 || code === null) return null;
  if (code === 3) return "entry gate (pre-dispatch)";
  if (code === 2) return "dispatch prerequisite";
  if (code === 130) return "interrupted";
  return "run halted";
}

async function finalize(o: {
  runId: string; storyKey: string; workflow: "build" | "fix"; code: number | null; log: string;
  jira: JiraCreds | null; push: (s: string) => void;
  actor?: string; label?: string; clearJobId?: string; repoName?: string;
}) {
  const sb = supabaseAdmin();
  if (!sb) return;
  const failed = o.code !== 0;
  const { data: st } = await sb.from("story").select("epic_id").eq("id", o.storyKey).maybeSingle();
  const { data: ep } = st?.epic_id
    ? await sb.from("epic").select("engagement_id").eq("id", st.epic_id).maybeSingle()
    : { data: null };
  const engId: string | null = ep?.engagement_id ?? null;

  // upsert so a run triggered without a pre-existing row (the assistant tool) still records
  await sb.from("run").upsert({
    id: o.runId, engagement_id: engId, role: "engineer", story: o.storyKey, workflow: o.workflow,
    status: failed ? "failed" : "resolved", failed_step: failedStepFor(o.code),
    error: failed ? `exit ${o.code}` : null, log: o.log,
  });
  if (engId) {
    const verb = o.label ?? (o.workflow === "fix" ? "Fix" : "Build");
    await logActivity(sb, {
      engagementId: engId, role: "engineer", actor: o.actor, kind: o.workflow,
      title: `${verb} ${o.storyKey}${o.repoName ? ` · ${o.repoName}` : ""}`, related: o.storyKey,
      status: failed ? "failed" : "done", runId: o.runId,
    });
    // green → gate on the PR (not auto-Done)
    if (o.code === 0) {
      const step = (s: string) => o.push(s.endsWith("\n") ? s : s + "\n");
      await gateOnPr(sb, o.jira, { ticket: o.storyKey, engagementId: engId, workflow: o.workflow, log: o.log }, step);
      // the run happened; the approve job supersedes the card that launched it
      if (o.clearJobId) await sb.from("job").delete().eq("id", o.clearJobId);
    }
  }
}
