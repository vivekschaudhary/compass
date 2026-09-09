import { describe, expect, it, vi, beforeEach } from "vitest";

// Handing a build to the orchestrator, and what counts as having built something.
//
// The failure this guards is the one v1 already learned and named: a run can complete every step,
// exit 0, and ship NOTHING. "A run that produced no pull request shipped nothing" is in run.py
// because it happened. Exit 0 is activity; a pull request is the outcome, and only the second one
// may close a gate.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const state: { tasks: Row[]; runs: Row[]; repos: Row[] } = { tasks: [], runs: [], repos: [] };

/** What the fake orchestrator prints, and what it exits with. */
const proc = { stdout: "", exit: 0 as number | null, spawned: [] as string[][] };

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let rows = table === "work_task" ? state.tasks : table === "workflow_run" ? state.runs : state.repos;
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

function seed(opts: { subjectKey?: string | null; localPath?: string | null } = {}) {
  state.tasks = [{ id: "t1", workflow_run_id: "r1" }];
  state.runs = [{ id: "r1", subject_key: opts.subjectKey === undefined ? "KAN-42" : opts.subjectKey, subject_ref: "E1-S3" }];
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
