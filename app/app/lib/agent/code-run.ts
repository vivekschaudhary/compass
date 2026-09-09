// Handing a build to the orchestrator.
//
// v2's agent has four tools and none of them touches a repo — it drafts documents and returns
// structure. The machinery that actually writes code already exists and is v1's: it creates the
// work branch, dispatches the engineer, runs the project's CI-parity checks, and opens a pull
// request ONLY on green. Porting that into the model loop would mean rebuilding a year of learned
// behaviour; calling it is the smaller and more honest move.
//
// WHY THIS IS NOT `lib/orchestrator.ts`. That one is the v1 surface: it resolves the repo through
// v1's `story` and `epic` tables, transitions a v1 Jira ticket, and writes `run`, `job` and
// `activity` rows. None of those describe a v2 build — a v2 build is a `work_task` in a
// `workflow_run` whose SUBJECT is the story, and its record is a document behind a gate. So this
// takes the same spawn and gives it v2's inputs and v2's outputs, rather than bending either.
//
// NOTHING HERE DECIDES WHETHER THE BUILD WAS GOOD. It reports what happened — exit code, branch,
// pull request, the tail of the log — and the gate reads that. A function that both ran the build
// and judged it would be the maker checking its own work, which is the arrangement every gate in
// this repo exists to prevent.

import "server-only";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";
import { supabaseAdmin } from "../supabase";

const REPO = process.env.COMPASS_REPO || resolve(process.cwd(), "..");
const COMPASS_DIR = process.env.COMPASS_DIR || `${REPO}/compass`;

export type CodeRun = {
  ok: boolean;
  /** The orchestrator's exit code. Null when it never started. */
  exit: number | null;
  /** The work branch, when the log named one. */
  branch: string | null;
  /** The pull request, when one was opened. Null is the loud answer: no PR means nothing shipped. */
  prUrl: string | null;
  /** Everything the orchestrator wrote, for the record and for diagnosis. */
  log: string;
  /** Why it could not run at all. Null when it ran, whatever the exit code. */
  refusal: string | null;
  repoName: string | null;
};

/**
 * Which repo this engagement builds in.
 *
 * `local_path` is the discriminator, not the presence of a row: a repo configured with a remote and
 * no checkout cannot be built in, and spawning against a path that does not exist would fail deep
 * inside the orchestrator with a message about a missing workflow file. Refusing here says the
 * true thing — nobody set a local path — and says where to set it.
 */
async function repoFor(engagementId: string): Promise<{ path: string; name: string } | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("repo")
    .select("key, name, local_path").eq("engagement_id", engagementId).order("ord");
  for (const r of data ?? []) {
    const p = (r.local_path as string | null)?.trim();
    if (p && existsSync(p)) return { path: p, name: (r.name as string) || (r.key as string) };
  }
  return null;
}

/** What a build step needs to know about itself: the story, its position, and its run. */
type Placement = { story: string | null; ord: number | null; runId: string | null };

async function placementOf(taskId: string): Promise<Placement> {
  const sb = supabaseAdmin();
  const none: Placement = { story: null, ord: null, runId: null };
  if (!sb) return none;

  const { data: task } = await sb.from("work_task")
    .select("workflow_run_id, workflow_step_id").eq("id", taskId).maybeSingle();
  if (!task?.workflow_run_id) return none;

  const { data: run } = await sb.from("workflow_run")
    .select("id, subject_key").eq("id", task.workflow_run_id).maybeSingle();
  const { data: step } = task.workflow_step_id
    ? await sb.from("workflow_step").select("ord").eq("id", task.workflow_step_id).maybeSingle()
    : { data: null };

  return {
    // The TRACKER's key, never the agent's ref. `--story` is passed to a process that looks the
    // issue up in Jira; handing it `E1-S3` would send it looking for an issue that does not exist.
    story: (run?.subject_key as string | null) ?? null,
    ord: (step?.ord as number | null) ?? null,
    runId: (run?.id as string | null) ?? null,
  };
}

/** The story this run is about — the subject, which is what makes a build per-story. */
export async function storyFor(taskId: string): Promise<string | null> {
  return (await placementOf(taskId)).story;
}

/** `https://github.com/o/r/pull/12` anywhere in the log. Same shape `gateOnPr` already matches. */
const PR_RE = /https?:\/\/github\.com\/[^\s)\]]+\/pull\/\d+/;
/** The orchestrator prints the branch it placed the work on. */
const BRANCH_RE = /(?:work branch|branch)\s+[`'"]?([\w./-]+)[`'"]?/i;

export async function runCode(
  engagementId: string,
  taskId: string,
  opts: { timeoutMs?: number } = {},
): Promise<CodeRun> {
  const empty = { ok: false, exit: null, branch: null, prUrl: null, log: "", repoName: null };

  const { story, ord, runId } = await placementOf(taskId);
  if (!story) {
    return {
      ...empty,
      refusal:
        "This build run has no story on the tracker. A build is per story — the run's subject " +
        "must carry a Jira key before there is anything to build.",
    };
  }
  if (ord === null || !runId) {
    return {
      ...empty,
      refusal:
        "This task is not a row of a run, so there is no step to execute. Nothing was spawned.",
    };
  }

  const repo = await repoFor(engagementId);
  if (!repo) {
    return {
      ...empty,
      refusal:
        "No repository with a working local path is configured for this engagement. Set one in " +
        "Settings → Repositories; without a checkout there is nowhere to build.",
    };
  }

  // `--compass-dir` when the project does not vendor its own projection, exactly as the v1 launcher
  // resolves it. Probing `compass/workflows` rather than `compass/`: a project can carry a
  // `compass/config.yaml` (which every project needs, to declare the checks a code run halts
  // without) and no workflows, and probing the bare directory drops the flag for those.
  const vendored = existsSync(`${repo.path}/compass/workflows`);

  // ── one step per invocation, and the flags are load-bearing ────────────────────────────────
  //
  // The seed holds the steps; the orchestrator executes ONE of them. `--step N` is what makes it a
  // step executor rather than a second workflow engine running its own copy of the graph.
  //
  // `--from-step` IS NOT DECORATION. Branch reuse is keyed on `from_step is not None`
  // (run.py:2562): with it, the run recovers the branch the first step recorded; without it, it
  // regenerates a name and cuts a NEW branch. Every step after the first would then land on its own
  // branch and the previous step's work would be stranded — tests on one branch, the code they
  // cover on another, and a pull request containing neither.
  //
  // Both filters apply independently (run.py:2650-2653), so `--step N --from-step N` runs exactly
  // step N AND takes the reuse path. Step 1 omits `--from-step` because there is no prior branch to
  // recover; it is the one that records it.
  //
  // THE RUN ID IS DERIVED, NOT STORED. `_prior_run_branch` (run.py:463) finds the branch by scanning
  // for a RUN_START carrying this exact id, so every step of one v2 run must pass the same one —
  // and the v2 run's own id already is that, with no column to add and nothing to keep in step.
  //
  // `--step N` MEANS V1'S STEP NUMBER. Seed ord 1-4 line up with build.md's steps 1-4 today, and
  // nothing enforces it: reorder either side and this sends the wrong step, silently. It is a
  // coupling to a file that is going away with v1, recorded here rather than discovered later.
  const orchestratorRunId = `v2-${runId}`;
  const args = [
    "-m", "compass.orchestrator.run", "build",
    "--project-dir", repo.path,
    ...(vendored ? [] : ["--compass-dir", COMPASS_DIR]),
    "--story", story,
    "--step", String(ord),
    ...(ord > 1 ? ["--from-step", String(ord)] : []),
    "--run-id", orchestratorRunId,
    // The app spawns this headless. Without it the orchestrator prompts for per-step context and
    // `input()` deadlocks the run at step 2 with no stdin to answer it.
    "--non-interactive",
  ];

  let log = `$ python3 ${args.join(" ")}\n$ cwd ${REPO}\n\n`;

  const exit = await new Promise<number | null>((done) => {
    const child = spawn("python3", args, { cwd: REPO, env: { ...process.env } });
    // A build that hangs must not hold the task open forever with no explanation. The kill is
    // reported through the log and the exit code, so it reads as a timeout rather than a failure
    // nobody can account for.
    const timer = setTimeout(() => {
      log += `\n[timed out after ${(opts.timeoutMs ?? 1_800_000) / 1000}s — killed]\n`;
      child.kill("SIGTERM");
    }, opts.timeoutMs ?? 1_800_000);
    child.stdout.on("data", (d: Buffer) => { log += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { log += d.toString(); });
    child.on("error", (e: Error) => {
      clearTimeout(timer);
      log += `\n[spawn error: ${e.message} — is python3 present, and the compass repo at ${REPO}?]\n`;
      done(null);
    });
    child.on("close", (c) => { clearTimeout(timer); done(c); });
  });

  const prUrl = log.match(PR_RE)?.[0] ?? null;
  const branch = log.match(BRANCH_RE)?.[1] ?? null;

  // ok means the orchestrator finished green AND opened a pull request. Exit 0 alone is not enough:
  // a run can complete every step and ship nothing, and that is the failure this repo already
  // learned to name — "a run that produced no pull request shipped nothing" (run.py). Treating it
  // as success would put a green gate on an empty branch.
  return {
    ok: exit === 0 && prUrl !== null,
    exit, branch, prUrl, log, refusal: null, repoName: repo.name,
  };
}
