import { describe, expect, it, vi, beforeEach } from "vitest";

// `runScaffold` on the ground, today: it can resolve which repo and subject it would scaffold
// into, and it refuses — on purpose, not as a bug — because the orchestrator has no scaffold step
// to target yet. See `scaffold-run.ts`'s own header for why spawning anyway would be worse than
// refusing (it would hit the WRONG step of `foundation-architecture`'s real, live graph).

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const state: { tasks: Row[]; repos: Row[] } = { tasks: [], repos: [] };

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let rows = table === "work_task" ? state.tasks : state.repos;
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

const existing = new Set<string>();
vi.mock("fs", () => ({ existsSync: (p: string) => existing.has(p) }));

/** Nothing should ever reach this — asserted directly, not inferred from the refusal text. */
const spawned: string[][] = [];
vi.mock("child_process", () => ({
  spawn: (_cmd: string, args: string[]) => { spawned.push(args); throw new Error("must not spawn"); },
}));

const { runScaffold } = await import("./scaffold-run");

function seed(opts: { subjectRef?: string | null; repos?: { key: string; localPath: string | null }[] }) {
  state.tasks = [{ id: "t1", subject_ref: opts.subjectRef ?? "app" }];
  state.repos = (opts.repos ?? [
    { key: "app", localPath: "/tmp/app" },
    { key: "api", localPath: "/tmp/api" },
  ]).map((r, i) => ({ engagement_id: "e1", key: r.key, name: r.key, local_path: r.localPath, ord: i }));
  existing.clear();
  for (const r of state.repos) {
    const p = r.local_path as string | null;
    if (p) existing.add(p);
  }
}

beforeEach(() => { spawned.length = 0; });

describe("resolving which repo to scaffold", () => {
  it("picks the repo matching the task's own subject, not just the first one", async () => {
    seed({ subjectRef: "api" });
    const r = await runScaffold("e1", "t1", { framework: "next.js", options: "" });
    expect(r.repoName).toBe("api");
  });

  it("refuses when the subject names a repo with no local checkout", async () => {
    seed({ subjectRef: "app", repos: [{ key: "app", localPath: null }, { key: "api", localPath: "/tmp/api" }] });
    const r = await runScaffold("e1", "t1", { framework: "next.js", options: "" });
    expect(r.refusal).toMatch(/local path/i);
  });

  it("refuses when no repos are registered at all", async () => {
    seed({ repos: [] });
    const r = await runScaffold("e1", "t1", { framework: "next.js", options: "" });
    expect(r.refusal).toMatch(/local path/i);
  });
});

describe("the orchestrator has nothing to target yet", () => {
  it("refuses rather than spawning against the wrong step of a real graph", async () => {
    seed({});
    const r = await runScaffold("e1", "t1", { framework: "next.js", options: "TypeScript" });
    expect(r.refusal).toMatch(/no scaffold step/i);
    expect(r.ok).toBe(false);
    expect(spawned, "nothing should ever be spawned today").toEqual([]);
  });
});
