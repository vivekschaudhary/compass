import { describe, expect, it, vi, beforeEach } from "vitest";

// Handing a build to the orchestrator, and what counts as having built something.
//
// The failure this guards is the one v1 already learned and named: a run can complete every step,
// exit 0, and ship NOTHING. "A run that produced no pull request shipped nothing" is in run.py
// because it happened. Exit 0 is activity; a pull request is the outcome, and only the second one
// may close a gate.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const state: { tasks: Row[]; runs: Row[]; repos: Row[]; steps: Row[]; workflows: Row[] } =
  { tasks: [], runs: [], repos: [], steps: [], workflows: [] };

/** What the fake orchestrator prints, and what it exits with. */
const proc = { stdout: "", exit: 0 as number | null, spawned: [] as string[][] };

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let rows =
        table === "work_task" ? state.tasks
        : table === "workflow_run" ? state.runs
        : table === "workflow_step" ? state.steps
        : table === "workflow" ? state.workflows
        : state.repos;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return chain; },
        order: () => chain,
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (res: (v: { data: Row[] }) => unknown) => res({ data: rows }),
      };
      return chain;
    },
  }),
}));

// Every path the module probes exists, so `existsSync` is not what any of these tests are about.
vi.mock("fs", () => ({ existsSync: () => true }));

vi.mock("child_process", () => ({
  spawn: (_cmd: string, args: string[]) => {
    proc.spawned.push(args);
    const handlers: Record<string, ((x: unknown) => void)[]> = {};
    const child = {
      stdout: { on: (_e: string, cb: (b: Buffer) => void) => cb(Buffer.from(proc.stdout)) },
      stderr: { on: () => {} },
      kill: () => {},
      on: (e: string, cb: (x: unknown) => void) => {
        (handlers[e] ??= []).push(cb);
        if (e === "close") setTimeout(() => cb(proc.exit), 0);
      },
    };
    return child as never;
  },
}));

const { runCode } = await import("./code-run");

function seed(opts: { subjectKey?: string | null; localPath?: string | null; ord?: number; workflow?: string } = {}) {
  state.tasks = [{ id: "t1", workflow_run_id: "r1", workflow_step_id: "s1" }];
  state.steps = [{ id: "s1", ord: opts.ord ?? 1 }];
  state.workflows = [{ id: "w1", code: opts.workflow ?? "build" }];
  state.runs = [{ id: "r1", workflow_id: "w1", subject_key: opts.subjectKey === undefined ? "KAN-42" : opts.subjectKey, subject_ref: "E1-S3" }];
  state.repos = opts.localPath === null ? [] : [{ engagement_id: "e1", key: "web", name: "acme-web", local_path: opts.localPath ?? "/tmp/acme", ord: 0 }];
}

beforeEach(() => { proc.stdout = ""; proc.exit = 0; proc.spawned = []; });

describe("running a build", () => {
  it("reports a pull request as the outcome, not the exit code", async () => {
    seed();
    proc.stdout = "…\nopened https://github.com/acme/web/pull/12\n";
    const r = await runCode("e1", "t1");
    expect(r.ok).toBe(true);
    expect(r.prUrl).toBe("https://github.com/acme/web/pull/12");
  });

  // THE ONE THAT MATTERS. Green and empty is the failure that looks most like success.
  it("is NOT ok when the orchestrator exits 0 and opens no pull request", async () => {
    seed();
    proc.stdout = "ran every step, committed nothing\n";
    proc.exit = 0;
    const r = await runCode("e1", "t1");
    expect(r.exit).toBe(0);
    expect(r.prUrl).toBeNull();
    expect(r.ok, "exit 0 with no PR must not read as a successful build").toBe(false);
  });

  it("is not ok when it fails, even if an old pull request URL is in the log", async () => {
    seed();
    proc.stdout = "reusing https://github.com/acme/web/pull/9\nHALT\n";
    proc.exit = 1;
    expect((await runCode("e1", "t1")).ok).toBe(false);
  });

  // Refusals, not crashes — and each names the one next move.
  it("refuses when the run has no story on the tracker", async () => {
    seed({ subjectKey: null });
    const r = await runCode("e1", "t1");
    expect(r.refusal).toMatch(/no story on the tracker/i);
    expect(proc.spawned, "nothing should have been spawned").toEqual([]);
  });

  it("refuses when no repo has a local path", async () => {
    seed({ localPath: null });
    const r = await runCode("e1", "t1");
    expect(r.refusal).toMatch(/local path/i);
    expect(proc.spawned).toEqual([]);
  });

  // The tracker's key, never the agent's ref: `--story` is handed to a process that looks the issue
  // up in Jira, and `E1-S3` would send it looking for something that does not exist.
  it("passes the Jira key to the orchestrator, not the backlog ref", async () => {
    seed();
    proc.stdout = "https://github.com/a/b/pull/1";
    await runCode("e1", "t1");
    const args = proc.spawned[0];
    expect(args).toContain("KAN-42");
    expect(args).not.toContain("E1-S3");
    expect(args).toContain("--non-interactive");
  });
});

// ── which step, on which branch ──────────────────────────────────────────────────────────────
//
// The seed holds the steps and the orchestrator executes ONE. These flags are the whole of that,
// and the one that matters is `--from-step`: it is what makes a later step reuse the branch the
// first step cut. Get it wrong and every step lands on its own branch — tests separated from the
// code they cover, and a pull request containing neither. A unit test can see the flags; only a
// live run can see the branch, which is exactly why the flags are pinned here.
describe("which step it runs, and on which branch", () => {
  it("cuts the branch on step 1 — no --from-step, because there is none to recover", async () => {
    seed({ ord: 1 });
    proc.stdout = "https://github.com/a/b/pull/1";
    await runCode("e1", "t1");
    const args = proc.spawned[0];
    expect(args).toEqual(expect.arrayContaining(["--step", "1"]));
    expect(args, "step 1 has no prior branch to reuse").not.toContain("--from-step");
  });

  it("reuses the branch on every later step", async () => {
    for (const ord of [2, 3, 4]) {
      proc.spawned = [];
      seed({ ord });
      proc.stdout = "https://github.com/a/b/pull/1";
      await runCode("e1", "t1");
      const args = proc.spawned[0];
      const at = args.indexOf("--from-step");
      expect(at, `step ${ord} must pass --from-step or it cuts a new branch`).toBeGreaterThan(-1);
      expect(args[at + 1]).toBe(String(ord));
      // Both filters apply, so this is exactly step N and not "N onwards".
      expect(args[args.indexOf("--step") + 1]).toBe(String(ord));
    }
  });

  // `_prior_run_branch` finds the branch by scanning for a RUN_START carrying this exact id, so
  // every step of one v2 run has to pass the same one. Derived from the run, not stored.
  it("passes the same derived run id from every step", async () => {
    const ids: string[] = [];
    for (const ord of [1, 2, 3, 4]) {
      proc.spawned = [];
      seed({ ord });
      proc.stdout = "https://github.com/a/b/pull/1";
      await runCode("e1", "t1");
      const args = proc.spawned[0];
      ids.push(args[args.indexOf("--run-id") + 1]);
    }
    expect(new Set(ids).size, `every step must share one run id, got ${ids.join(", ")}`).toBe(1);
    expect(ids[0]).toContain("r1");
  });

  it("refuses when the task is not a row of a run — nothing to execute", async () => {
    seed({ ord: 1 });
    state.steps = [];
    const r = await runCode("e1", "t1");
    expect(r.refusal).toMatch(/no step to execute/i);
    expect(proc.spawned).toEqual([]);
  });
});

// ── the branch name ──────────────────────────────────────────────────────────────────────────
//
// `_work_branch_name` builds `<type>/<story>-<slug>` and `_slug` takes the first six meaningful
// words of `--context`. Passing nothing is not neutral: the slug comes out empty and every branch
// is `feat/KAN-42-`, a trailing hyphen and no indication of what the work was.
describe("what the branch gets called", () => {
  it("passes the summary through as the slug source", async () => {
    seed({ ord: 1 });
    proc.stdout = "https://github.com/a/b/pull/1";
    await runCode("e1", "t1", { context: "saved report definitions" });
    const args = proc.spawned[0];
    expect(args[args.indexOf("--context") + 1]).toBe("saved report definitions");
  });

  // Omitted rather than passed empty: `--context ""` and no flag reach the same slug, but only one
  // of them claims a value was supplied.
  it("omits --context when there is nothing to say", async () => {
    seed({ ord: 1 });
    proc.stdout = "https://github.com/a/b/pull/1";
    await runCode("e1", "t1");
    expect(proc.spawned[0]).not.toContain("--context");
  });

  // Steps 2-4 recover the branch step 1 recorded, so a later step's different summary must not be
  // able to rename it — the flag is harmless there, but the recovery is what decides the name.
  it("still reuses the recorded branch on a later step, whatever its summary says", async () => {
    seed({ ord: 3 });
    proc.stdout = "https://github.com/a/b/pull/1";
    await runCode("e1", "t1", { context: "something else entirely" });
    const args = proc.spawned[0];
    expect(args).toEqual(expect.arrayContaining(["--from-step", "3"]));
  });
});

// ── which graph it walks ─────────────────────────────────────────────────────────────────────
//
// `build` and `fix` both have a step 2, and they are different tasks. A hardcoded workflow name
// would send a fix step through build's graph and nothing would say so — the run would report a
// step that ran, just not the one the row asked for.
describe("which workflow it runs", () => {
  it("walks the run's own graph, not a literal", async () => {
    for (const code of ["build", "fix"]) {
      proc.spawned = [];
      seed({ workflow: code });
      proc.stdout = "https://github.com/a/b/pull/1";
      await runCode("e1", "t1");
      const args = proc.spawned[0];
      // `-m compass.orchestrator.run <workflow>` — the module is one argv entry, so the
      // workflow is the one right after it.
      expect(args[args.indexOf("compass.orchestrator.run") + 1]).toBe(code);
    }
  });

  it("refuses when the run names no workflow", async () => {
    seed();
    state.workflows = [];
    const r = await runCode("e1", "t1");
    expect(r.refusal).toMatch(/no step to execute/i);
    expect(proc.spawned).toEqual([]);
  });
});
