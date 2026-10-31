// Handing a build to the orchestrator.
//
// The app's agent has four tools and none of them touches a repo — it drafts documents and returns
// structure. The machinery that actually writes code already exists and is v1's: it creates the
// work branch, dispatches the engineer, runs the project's CI-parity checks, and opens a pull
// request ONLY on green. Porting that into the model loop would mean rebuilding a year of learned
// behaviour; calling it is the smaller and more honest move.
//
// WHY THIS DID NOT REUSE v1's `lib/orchestrator.ts` (since deleted with v1). That one resolved the
// repo through v1's `story` and `epic` tables, transitioned a v1 Jira ticket, and wrote `run`, `job`
// and `activity` rows. None of those describe a build here — a build is a `work_task` in a
// `workflow_run` whose SUBJECT is the story, and its record is a document behind a gate. So this
// takes the same spawn and gives it the app's inputs and outputs, rather than bending either.
//
// NOTHING HERE DECIDES WHETHER THE BUILD WAS GOOD. It reports what happened — exit code, branch,
// pull request, the tail of the log — and the gate reads that. A function that both ran the build
// and judged it would be the maker checking its own work, which is the arrangement every gate in
// this repo exists to prevent.

import "server-only";
import { spawn } from "child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { supabaseAdmin } from "../supabase";
import type { PinnedInput } from "./context/types";

const REPO = process.env.COMPASS_REPO || resolve(process.cwd(), "..");
const COMPASS_DIR = process.env.COMPASS_DIR || `${REPO}/compass`;

/**
 * The text of inputs Compass has no document for, as the file the orchestrator reads
 * (`--inputs-file`): `{ "<path>": { title, source, text } }`. `source` says where it came from
 * (`confluence`, `jira CT-288`) because a ticket's text is not a Compass version and must not be
 * cited as one. Null when there is nothing to hand over. A private directory, removed by the caller.
 */
export function writeExternalInputs(external: PinnedInput[]): string | null {
  const usable = external.filter((e) => e.body);
  if (!usable.length) return null;
  const dir = mkdtempSync(join(tmpdir(), "compass-inputs-"));
  const file = join(dir, "inputs.json");
  const payload = Object.fromEntries(
    usable.map((e) => [e.path, { title: e.title, source: e.version, text: e.body }]),
  );
  writeFileSync(file, JSON.stringify(payload), { mode: 0o600 });
  return file;
}

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
 * Which repo this build goes into.
 *
 * `local_path` is the discriminator, not the presence of a row: a repo configured with a remote and
 * no checkout cannot be built in, and spawning against a path that does not exist would fail deep
 * inside the orchestrator with a message about a missing workflow file. Refusing here says the
 * true thing — nobody set a local path — and says where to set it.
 *
 * `key` names the repo the build is for. WITHOUT one this used to take the first repo that had a
 * checkout, which put a backend story into whichever repo happened to be registered first. Now it
 * does that only when there is exactly one to take; with several, it refuses and lists them, because
 * a guess here lands one team's work in another team's repository.
 */
export async function repoFor(
  engagementId: string,
  key?: string | null,
): Promise<{ ok: true; path: string; name: string; key: string } | { ok: false; refusal: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, refusal: "Supabase is not configured." };
  const { data } = await sb.from("repo")
    .select("key, name, local_path").eq("engagement_id", engagementId).order("ord");

  const usable = (data ?? [])
    .map((r) => ({
      key: r.key as string,
      name: ((r.name as string | null) || (r.key as string)),
      path: ((r.local_path as string | null) ?? "").trim(),
    }))
    .filter((r) => r.path && existsSync(r.path));

  if (key) {
    const hit = usable.find((r) => r.key === key);
    if (hit) return { ok: true, ...hit };
    const known = (data ?? []).map((r) => r.key as string);
    return {
      ok: false,
      refusal: known.includes(key)
        ? `Repository '${key}' has no working local checkout. Set its local path in Settings → Repositories.`
        : `No repository '${key}' is registered for this engagement. Registered: ${known.join(", ") || "none"}.`,
    };
  }
  if (usable.length === 1) return { ok: true, ...usable[0] };
  if (usable.length === 0) {
    return {
      ok: false,
      refusal:
        "No repository with a working local path is configured for this engagement. Set one in " +
        "Settings → Repositories; without a checkout there is nowhere to build.",
    };
  }
  return {
    ok: false,
    refusal: `This engagement has ${usable.length} repositories (${usable.map((r) => r.key).join(", ")}) and the build did not name one. ` +
      `Pass the repo the story is built in; a build is never put in "the first" one.`,
  };
}

/** What a code step needs to know about itself: the story, its position, its run, its workflow. */
type Placement = {
  story: string | null;
  ord: number | null;
  runId: string | null;
  /** `build`, `fix`, … — which graph the orchestrator walks. Never assumed. */
  workflow: string | null;
  /**
   * True when no EARLIER `renders: code` row exists in this same workflow version — the step
   * that must cut a fresh branch. It is NOT the same test as `ord === 1`: a code row preceded by
   * doc rows has a high `ord` and is still the first code row. `ord > 1` sent such a row down the
   * RESUME path; `_prior_run_branch` found no branch to recover (nothing ran before it) and fell
   * back to "stay on the current branch" — no worktree, no new branch, the agent committing wherever
   * HEAD already was. On a real repo that is `main`.
   */
  isFirstCodeStep: boolean;
};

async function placementOf(taskId: string): Promise<Placement> {
  const sb = supabaseAdmin();
  const none: Placement = { story: null, ord: null, runId: null, workflow: null, isFirstCodeStep: true };
  if (!sb) return none;

  const { data: task } = await sb.from("work_task")
    .select("workflow_run_id, workflow_step_id").eq("id", taskId).maybeSingle();
  if (!task?.workflow_run_id) return none;

  const { data: run } = await sb.from("workflow_run")
    .select("id, subject_key, workflow_id").eq("id", task.workflow_run_id).maybeSingle();
  const { data: wf } = run?.workflow_id
    ? await sb.from("workflow").select("code").eq("id", run.workflow_id).maybeSingle()
    : { data: null };
  const { data: step } = task.workflow_step_id
    ? await sb.from("workflow_step")
        .select("ord, workflow_version_id").eq("id", task.workflow_step_id).maybeSingle()
    : { data: null };

  let isFirstCodeStep = true;
  if (step?.workflow_version_id && step.ord != null) {
    const { data: earlierCodeRows } = await sb.from("workflow_step")
      .select("id")
      .eq("workflow_version_id", step.workflow_version_id as string)
      .eq("renders", "code")
      .lt("ord", step.ord as number);
    isFirstCodeStep = !(earlierCodeRows ?? []).length;
  }

  return {
    // The TRACKER's key, never the agent's ref. `--story` is passed to a process that looks the
    // issue up in Jira; handing it `E1-S3` would send it looking for an issue that does not exist.
    story: (run?.subject_key as string | null) ?? null,
    ord: (step?.ord as number | null) ?? null,
    runId: (run?.id as string | null) ?? null,
    workflow: (wf?.code as string | null) ?? null,
    isFirstCodeStep,
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
  opts: {
    timeoutMs?: number; context?: string; repo?: string | null;
    /** Inputs only the client's own tools could answer, by path — handed to the build as text. */
    external?: PinnedInput[];
  } = {},
): Promise<CodeRun> {
  const empty = { ok: false, exit: null, branch: null, prUrl: null, log: "", repoName: null };

  const { story, ord, runId, workflow, isFirstCodeStep } = await placementOf(taskId);
  if (!story) {
    return {
      ...empty,
      refusal:
        "This build run has no story on the tracker. A build is per story — the run's subject " +
        "must carry a Jira key before there is anything to build.",
    };
  }
  if (ord === null || !runId || !workflow) {
    return {
      ...empty,
      refusal:
        "This task is not a row of a run, so there is no step to execute. Nothing was spawned.",
    };
  }

  const found = await repoFor(engagementId, opts.repo);
  if (!found.ok) return { ...empty, refusal: found.refusal };
  const repo = found;

  // `--compass-dir` is now only where the orchestrator finds `config.yaml` (the checks, the stack,
  // the connectors); the workflow graph, agent prompts and stack profiles come from the database.
  // It used to be omitted when the project vendored `compass/archive/workflows`, because that decided where
  // the graph was read from. Nothing is read from there any more, so it is always passed: the
  // project's own `compass/config.yaml` is still read first, and this is the fallback.

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
  // step N AND takes the reuse path. The FIRST code row of a workflow omits `--from-step` because
  // there is no prior branch to recover; it is the one that records it.
  //
  // GATED ON "first code row of THIS workflow", never on `ord` directly. `ord === 1` and "first code
  // row" are the same test only while every workflow's code rows start at 1; a code row that follows
  // doc rows would be sent down the RESUME path with nothing to resume, and the orchestrator would
  // fall back to "stay on the current branch" — committing wherever HEAD already is, on a real repo
  // `main`. `isFirstCodeStep` looks for an EARLIER `renders: code` row in the same workflow version.
  //
  // THE RUN ID IS DERIVED, NOT STORED. `_prior_run_branch` (run.py:463) finds the branch by scanning
  // for a RUN_START carrying this exact id, so every step of one workflow run must pass the same
  // one — and the workflow run's own id already is that, with no column to add and nothing to keep in step.
  //
  // `--step N` MEANS V1'S STEP NUMBER. Seed ord 1-4 line up with build.md's steps 1-4 today, and
  // nothing enforces it: reorder either side and this sends the wrong step, silently. It is a
  // coupling to a file that is going away with v1, recorded here rather than discovered later.
  const orchestratorRunId = `v2-${runId}`;
  const inputsFile = writeExternalInputs(opts.external ?? []);
  const args = [
    // The RUN's workflow, never a literal. This said `build`, which meant a `fix` step would have
    // walked build's graph — same step numbers, different tasks, and the mismatch is silent
    // because both graphs have a step 2.
    "-m", "compass.orchestrator.run", workflow,
    "--project-dir", repo.path,
    // The orchestrator reads its workflow graph, agent prompts and stack profile from `spec_file`;
    // the engagement is what makes an engagement-tier row win over the org default.
    "--engagement", engagementId,
    "--compass-dir", COMPASS_DIR,
    "--story", story,
    // The task whose pins name the versions of the documents to read. The orchestrator reads the
    // step's `reads` at exactly these versions, so it builds from what the agent was shown.
    "--task-id", taskId,
    // Text for the pins Compass had no document for. Written to a file because it is a document,
    // not an argument; removed once the build is over.
    ...(inputsFile ? ["--inputs-file", inputsFile] : []),
    // THE BRANCH NAME'S KEYWORDS COME FROM HERE. `_work_branch_name` builds
    // `<type>/<story>-<slug>` and `_slug` takes the first six meaningful words of the context —
    // so with nothing passed, every branch came out `feat/KAN-42-` with a trailing hyphen and
    // nothing saying what it was. Passing the agent's own summary makes it `feat/KAN-42-saved-
    // report-definitions`, readable in a branch list without opening the ticket.
    //
    // Only the first code row uses it. Later code rows recover the recorded branch through
    // `--from-step`, so a different summary on a later step cannot rename the branch out from
    // under the work.
    ...(opts.context ? ["--context", opts.context] : []),
    "--step", String(ord),
    ...(isFirstCodeStep ? [] : ["--from-step", String(ord)]),
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

  if (inputsFile) rmSync(dirname(inputsFile), { recursive: true, force: true });

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
