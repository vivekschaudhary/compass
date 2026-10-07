import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async () => {} }));
vi.mock("./actor", () => ({ holdersOn: async () => [] }));

const createIssue = vi.fn(async (_creds: unknown, args: { summary: string }) => ({ key: `JIRA-${args.summary.length}` }));
vi.mock("../jira", () => ({
  resolveJira: () => ({ project: "P" }),
  createIssue: (...a: unknown[]) => createIssue(...a as [unknown, { summary: string }]),
  updateIssue: async () => {},
  transitionIssue: async () => {},
  projectStatuses: async () => [],
  subtaskType: async () => "Sub-task",
  findUser: async () => null,
  searchIssues: async () => [],
}));

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { engagement: [], workflow_run: [], work_task: [] };

function chainFor(table: string) {
  let rows: Row[] = db[table] ?? [];
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return chain; };
  chain.update = (v: Row) => ({
    eq: (col: string, val: unknown) => {
      for (const r of rows) if (r[col] === val) Object.assign(r, v);
      return Promise.resolve({ error: null });
    },
  });
  chain.maybeSingle = async () => ({ data: rows[0] ?? null });
  chain.then = (resolve: (r: unknown) => unknown) => resolve({ data: rows });
  return chain;
}
vi.mock("../supabase", () => ({ supabaseAdmin: () => ({ from: (t: string) => chainFor(t) }) }));

const { mirrorNested } = await import("./tracker");

beforeEach(() => {
  createIssue.mockClear();
  db.engagement = [{ id: "e1", jira_project: "P" }];
  db.workflow_run = [{ id: "run-1", parent_task_id: "parent-1" }];
  db.work_task = [
    { id: "parent-1", ticket_key: "CT-221", workflow_run_id: "parent-run" },
  ];
});

describe("mirrorNested gives a materialized per-subject task its OWN Jira summary", () => {
  it("suffixes the summary with the subject when two siblings share one step title", async () => {
    db.work_task.push(
      { id: "t-backend", workflow_run_id: "run-1", title: "Accept the repo scaffold", role_code: "principal-engineer", state: "hitl", ticket_key: null, subject_ref: "backend", workflow_step: { ord: 1 } },
      { id: "t-ios", workflow_run_id: "run-1", title: "Accept the repo scaffold", role_code: "principal-engineer", state: "hitl", ticket_key: null, subject_ref: "ios", workflow_step: { ord: 2 } },
    );

    await mirrorNested("e1", "run-1", "principal-engineer");

    const summaries = createIssue.mock.calls.map((c) => (c[1] as { summary: string }).summary);
    expect(summaries).toContain("Accept the repo scaffold — backend");
    expect(summaries).toContain("Accept the repo scaffold — ios");
    expect(new Set(summaries).size).toBe(2); // never identical, so Jira can't cross-match them
  });

  it("leaves an ordinary row's summary alone when it has no subject", async () => {
    db.work_task.push(
      { id: "t-plain", workflow_run_id: "run-1", title: "Research the ground", role_code: "staff-engineer", state: "hitl", ticket_key: null, subject_ref: null, workflow_step: { ord: 1 } },
    );

    await mirrorNested("e1", "run-1", "staff-engineer");

    expect((createIssue.mock.calls[0][1] as { summary: string }).summary).toBe("Research the ground");
  });
});
