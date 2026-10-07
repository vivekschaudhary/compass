import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../../jira", () => ({ resolveJira: () => null, remoteLinks: async () => null, issueStatus: async () => null, searchIssues: async () => [] }));
vi.mock("../../sprint", () => ({ sprintJql: () => "", sprintNoOf: async () => null }));

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { work_task: [], workflow_run: [], event: [], engagement: [] };

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
vi.mock("../../../supabase", () => ({ supabaseAdmin: () => ({ from: (t: string) => chainFor(t) }) }));

const { evaluateTicket } = await import("./ticket");
const ACTOR = { engagementId: "e1" } as never;
const CRIT = { subjectRef: "pr-linked" } as never;

beforeEach(() => { db.work_task = []; db.workflow_run = []; db.event = []; });

describe("pr-linked on a materialized per-repo task (scaffold-repo's inline fan-out)", () => {
  it("reads the TASK's own subject, not the parent run's (which has none)", async () => {
    db.work_task = [{ id: "t1", workflow_run_id: "run-1", subject_ref: "backend" }];
    db.workflow_run = [{ id: "run-1", subject_key: null, subject_ref: null }]; // foundation-architecture: no subject
    db.event = [{ subject_id: "t1", verb: "agent.run.finished", payload: { pr: "https://github.com/o/r/pull/1" } }];

    const v = await evaluateTicket(ACTOR, CRIT, "t1");
    expect(v.state).toBe("satisfied");
    if (v.state === "satisfied") expect(v.detail).toContain("pull/1");
  });

  it("is unmeasurable, not unsatisfied, when neither the task nor the run has a subject", async () => {
    db.work_task = [{ id: "t1", workflow_run_id: "run-1", subject_ref: null }];
    db.workflow_run = [{ id: "run-1", subject_key: null, subject_ref: null }];

    const v = await evaluateTicket(ACTOR, CRIT, "t1");
    expect(v.state).toBe("unmeasurable");
  });

  it("still falls back to the run's own subject when the task has none (a real per-run build)", async () => {
    db.work_task = [{ id: "t1", workflow_run_id: "run-1", subject_ref: null }];
    db.workflow_run = [{ id: "run-1", subject_key: null, subject_ref: "app" }];
    db.event = [{ subject_id: "t1", verb: "agent.run.finished", payload: { pr: "https://github.com/o/r/pull/2" } }];

    const v = await evaluateTicket(ACTOR, CRIT, "t1");
    expect(v.state).toBe("satisfied");
  });

  it("reports unsatisfied, not unmeasurable, when the subject exists but no PR was recorded", async () => {
    db.work_task = [{ id: "t1", workflow_run_id: "run-1", subject_ref: "backend" }];
    db.workflow_run = [{ id: "run-1", subject_key: null, subject_ref: null }];

    const v = await evaluateTicket(ACTOR, CRIT, "t1");
    expect(v.state).toBe("unsatisfied");
  });
});
