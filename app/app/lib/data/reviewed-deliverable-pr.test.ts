import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { work_task: [], workflow_step: [], event: [] };

function chainFor(table: string) {
  let rows: Row[] = db[table] ?? [];
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return chain; };
  chain.in = (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return chain; };
  chain.maybeSingle = async () => ({ data: rows[0] ?? null });
  chain.then = (resolve: (r: unknown) => unknown) => resolve({ data: rows });
  return chain;
}
vi.mock("../supabase", () => ({ supabaseAdmin: () => ({ from: (t: string) => chainFor(t) }) }));

const { reviewedDeliverablePr } = await import("./job");

beforeEach(() => { db.work_task = []; db.workflow_step = []; db.event = []; });

// Two repos materialized in the SAME run (scaffold-repo's inline fan-out): app and backend each
// have their own execute-scaffold + approve-repo-scaffold pair, sharing one workflow_run_id.
function seedTwoRepos() {
  db.workflow_step = [
    { id: "s-exec-app", task: "execute-scaffold" },
    { id: "s-approve-app", task: "approve-repo-scaffold", depends_on: ["execute-scaffold"] },
    { id: "s-exec-backend", task: "execute-scaffold" },
    { id: "s-approve-backend", task: "approve-repo-scaffold", depends_on: ["execute-scaffold"] },
  ];
  db.work_task = [
    { id: "t-exec-app", workflow_run_id: "run-1", subject_ref: "app", workflow_step_id: "s-exec-app" },
    { id: "t-approve-app", workflow_run_id: "run-1", subject_ref: "app", workflow_step_id: "s-approve-app" },
    { id: "t-exec-backend", workflow_run_id: "run-1", subject_ref: "backend", workflow_step_id: "s-exec-backend" },
    { id: "t-approve-backend", workflow_run_id: "run-1", subject_ref: "backend", workflow_step_id: "s-approve-backend" },
  ];
  db.event = [
    { subject_id: "t-exec-app", verb: "agent.run.finished", payload: { pr: "https://github.com/o/app/pull/1" } },
    { subject_id: "t-exec-backend", verb: "agent.run.finished", payload: { pr: "https://github.com/o/backend/pull/1" } },
  ];
}

describe("the PR a code-review row is reviewing", () => {
  it("reads the sibling task's own PR, not another repo's sharing the same run", async () => {
    seedTwoRepos();
    const pr = await reviewedDeliverablePr("t-approve-backend");
    expect(pr).toBe("https://github.com/o/backend/pull/1");
  });

  it("resolves a different repo's review row to its own PR, not the first one found", async () => {
    seedTwoRepos();
    const pr = await reviewedDeliverablePr("t-approve-app");
    expect(pr).toBe("https://github.com/o/app/pull/1");
  });

  it("returns null when the reviewed task has no recorded PR yet", async () => {
    seedTwoRepos();
    db.event = [];
    expect(await reviewedDeliverablePr("t-approve-backend")).toBeNull();
  });

  it("returns null when the row has no depends_on to resolve", async () => {
    db.work_task = [{ id: "t1", workflow_run_id: "run-1", subject_ref: "x", workflow_step_id: "s1" }];
    db.workflow_step = [{ id: "s1", task: "approve-repo-scaffold", depends_on: [] }];
    expect(await reviewedDeliverablePr("t1")).toBeNull();
  });
});
