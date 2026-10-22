// Running the survey from the app: the TS half of a `survey` tool call.
//
// The agent says what it needs to know about the code; this builds the request from the engagement's
// registered repos, opens the handoff record BEFORE the spawn, runs the one Python entry point, and
// closes the record with what came back. Nothing here judges the findings — Python verified that
// every file they cite exists, and the gate reads the filed document.
//
// The spawn is injectable so the mapping from the process's output to a closed record can be tested
// without Python, a model or a repository.

import "server-only";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { resolve } from "path";
import { supabaseAdmin } from "../supabase";
import { parseSurveyResult, type SurveyResult } from "../data/survey-contract";
import { openHandoffCall, closeSurveyCall } from "../data/handoff-call";

const REPO = process.env.COMPASS_REPO || resolve(process.cwd(), "..");
const TIMEOUT_MS = 30 * 60 * 1000;

export type SurveySpawn = (stdin: string) => Promise<{ exit: number | null; stdout: string; stderr: string }>;

const defaultSpawn: SurveySpawn = (stdin) =>
  new Promise((done) => {
    const child = spawn("python3", ["-m", "compass.orchestrator.handoff", "survey"], {
      cwd: REPO,
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("error", (e: Error) => { clearTimeout(timer); done({ exit: null, stdout, stderr: `${stderr}\n${e.message}` }); });
    child.on("close", (code) => { clearTimeout(timer); done({ exit: code, stdout, stderr }); });
    child.stdin.end(stdin);
  });

/** The result when nothing usable came back: the record still closes, with the reason. */
function failedResult(reason: string, status: "survey_failed" | "refused" = "survey_failed"): SurveyResult {
  return { version: 1, status, sections: [], files_cited: [], refusal: reason, log_ref: "", usage: null };
}

export type SurveyInput = { focus: string; context: string };

export async function runSurvey(
  engagementId: string,
  taskId: string,
  input: SurveyInput,
  deps: { spawn?: SurveySpawn } = {},
): Promise<SurveyResult> {
  const sb = supabaseAdmin();
  if (!sb) return failedResult("Supabase is not configured.");

  const { data: task } = await sb.from("work_task")
    .select("org_id, subject_ref").eq("id", taskId).eq("engagement_id", engagementId).maybeSingle();
  if (!task) return failedResult("That task is not in this engagement.");

  const { data: rows } = await sb.from("repo")
    .select("key, local_path").eq("engagement_id", engagementId).order("ord");
  const repos = (rows ?? [])
    .map((r) => ({ key: r.key as string, local_path: ((r.local_path as string | null) ?? "").trim() }))
    .filter((r) => r.local_path);

  const id = randomUUID();
  const request = {
    version: 1,
    // Every checkout the engagement has: an epic is not scoped to one repo, and the agent says in
    // its focus which part it cares about. Empty is refused below, not sent.
    repos,
    subject_ref: ((task.subject_ref as string | null) ?? "").trim() || "(no subject)",
    focus: input.focus,
    context: input.context,
    caller: { kind: "ts", handoff_call_id: id },
  };

  // Written before anything runs, so a call that dies still leaves a row saying it was attempted.
  await openHandoffCall(sb, {
    id, orgId: task.org_id as string, engagementId, taskId, kind: "survey", request,
  });

  // No checkout is refused here, without spawning. The record says why and where to fix it.
  if (!repos.length) {
    const refused = failedResult(
      "No repository on this engagement has a local checkout. Set a local path in Settings → " +
        "Repositories; a survey reads files, and a repo that exists only on GitHub has none to read.",
      "refused",
    );
    await closeSurveyCall(sb, id, refused);
    return refused;
  }

  const run = deps.spawn ?? defaultSpawn;
  let result: SurveyResult;
  try {
    const out = await run(JSON.stringify(request));
    let envelope: { ok?: boolean; result?: unknown; error?: { message?: string } } | null = null;
    // The CLI host prints live progress before the envelope, so the envelope is the LAST line.
    try { envelope = JSON.parse(out.stdout.trim().split("\n").pop() ?? ""); } catch { envelope = null; }
    if (!envelope) {
      result = failedResult(`The survey printed no result (exit ${out.exit}). ${out.stderr.slice(-800)}`.trim());
    } else if (!envelope.ok) {
      result = failedResult(`The survey refused the request: ${envelope.error?.message ?? "unknown error"}`, "refused");
    } else {
      result = parseSurveyResult(envelope.result);
    }
  } catch (e) {
    result = failedResult(e instanceof Error ? e.message : String(e));
  }

  await closeSurveyCall(sb, id, result);
  return result;
}
