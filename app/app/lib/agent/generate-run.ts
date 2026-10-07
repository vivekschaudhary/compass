// Running the generator from the app: the TS half of a `scaffold` tool call.
//
// The model chooses the framework and the options; this builds the request from the repo row, opens
// the handoff record BEFORE the spawn, runs the one Python entry point, and closes the record with
// what came back. Nothing here decides whether the run was good. It reports what the generator
// returned, validated against the contract, and the gate reads that record.
//
// The spawn is injectable so the mapping from the process's output to a closed record can be tested
// without Python or a repository.

import "server-only";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { resolve } from "path";
import { supabaseAdmin } from "../supabase";
import { parseResult, type GenerateResult } from "./generate-contract";
import { openHandoffCall, closeHandoffCall } from "./handoff-call";

const REPO = process.env.COMPASS_REPO || resolve(process.cwd(), "..");
const TIMEOUT_MS = 45 * 60 * 1000;

export type SpawnFn = (stdin: string) => Promise<{ exit: number | null; stdout: string; stderr: string }>;

const defaultSpawn: SpawnFn = (stdin) =>
  new Promise((done) => {
    const child = spawn("python3", ["-m", "compass.orchestrator.handoff", "generate"], {
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

/** The result when nothing came back: the record still closes, as generator_failed, with the reason. */
function failedResult(reason: string, logRef = ""): GenerateResult {
  return {
    version: 1, status: "generator_failed", branch: null, pr_url: null, files_changed: 0,
    checks: { ran: [], failed: null, tail: null }, refusal: reason, log_ref: logRef, usage: null,
  };
}

export type ScaffoldInput = { summary: string; framework: string; options: string };

export async function runScaffold(
  engagementId: string,
  taskId: string,
  input: ScaffoldInput,
  deps: { spawn?: SpawnFn } = {},
): Promise<GenerateResult> {
  const sb = supabaseAdmin();
  if (!sb) return failedResult("Supabase is not configured.");

  const { data: task } = await sb.from("work_task")
    .select("org_id, subject_ref").eq("id", taskId).eq("engagement_id", engagementId).maybeSingle();
  const key = (task?.subject_ref as string | null) ?? null;
  if (!task || !key) return failedResult("This task names no repo, so there is nothing to scaffold into.");

  const { data: repo } = await sb.from("repo")
    .select("key, local_path").eq("engagement_id", engagementId).eq("key", key).maybeSingle();

  const id = randomUUID();
  const request = {
    version: 1,
    framework: input.framework,
    repo: { key, local_path: (repo?.local_path as string | null)?.trim() ?? "" },
    subject_ref: key,
    options: input.options,
    caller: { kind: "ts", handoff_call_id: id },
  };

  // Written before anything runs, so a call that dies still leaves a row saying it was attempted.
  await openHandoffCall(sb, {
    id, orgId: task.org_id as string, engagementId, taskId, kind: "generate", request,
  });

  // A repo with no checkout is refused here, without spawning: the record says why, and the generator
  // never sees a path that cannot exist.
  if (!request.repo.local_path) {
    const refused: GenerateResult = {
      ...failedResult(`No local checkout is set for repo '${key}'. Set its local_path before scaffolding.`),
      status: "refused",
    };
    await closeHandoffCall(sb, id, refused);
    return refused;
  }

  const run = deps.spawn ?? defaultSpawn;
  let result: GenerateResult;
  try {
    const out = await run(JSON.stringify(request));
    let envelope: { ok?: boolean; result?: unknown; error?: { message?: string } } | null = null;
    try { envelope = JSON.parse(out.stdout.trim().split("\n").pop() ?? ""); } catch { envelope = null; }
    if (!envelope) {
      result = failedResult(`The generator printed no result (exit ${out.exit}). ${out.stderr.slice(-800)}`.trim());
    } else if (!envelope.ok) {
      result = failedResult(`The generator refused the request: ${envelope.error?.message ?? "unknown error"}`);
    } else {
      result = parseResult(envelope.result);
    }
  } catch (e) {
    result = failedResult(e instanceof Error ? e.message : String(e));
  }

  await closeHandoffCall(sb, id, result);
  return result;
}
