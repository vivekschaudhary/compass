import { describe, it, expect, vi, beforeEach } from "vitest";

// A run ABOUT one epic hangs its tasks under that epic. What is under test is what it must not do —
// create an epic of its own, describe the real one, or create the same task twice — and what it must
// say when the board would not take something.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async () => {} }));
vi.mock("./actor", () => ({ holdersOn: async () => roster }));

const createIssue = vi.fn();
const updateIssue = vi.fn(async () => true);
const findUser = vi.fn(async () => ({ accountId: "acc-1", displayName: "Om" }));
vi.mock("../jira", () => ({
  resolveJira: () => creds,
  createIssue: (...a: unknown[]) => createIssue(...a),
  updateIssue: (...a: unknown[]) => updateIssue(...(a as [])),
  findUser: (...a: unknown[]) => findUser(...(a as [])),
  transitionIssue: async () => true,
  projectStatuses: async () => ["To Do", "In Progress", "Done"],
}));

let creds: unknown = { baseUrl: "https://x", email: "e", token: "t", project: "CT" };
let roster: { role: string; name: string }[] = [];

type Row = Record<string, unknown>;
let db: Record<string, Row[]> = {};
const updates: { table: string; patch: Row; id: unknown }[] = [];

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      let rows = db[table] ?? [];
      let patch: Row | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          if (patch) { updates.push({ table, patch, id: val }); for (const r of rows.filter((x) => x[col] === val)) Object.assign(r, patch); return q; }
          rows = rows.filter((r) => r[col] === val); return q;
        },
        update: (p: Row) => { patch = p; return q; },
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (res: (v: { data: Row[] }) => unknown) => res({ data: rows }),
      };
      return q;
    },
  }),
}));

const { mirrorEpicTasks } = await import("./tracker");

beforeEach(() => {
  vi.clearAllMocks();
  creds = { baseUrl: "https://x", email: "e", token: "t", project: "CT" };
  roster = [{ role: "product-owner", name: "Om" }, { role: "product-manager", name: "Nishi" }];
  updates.length = 0;
  let n = 300;
  createIssue.mockImplementation(async () => ({ key: `CT-${++n}` }));
  db = {
    engagement: [{ id: "e1", jira_project: "CT" }],
    workflow_run: [{ id: "run1", subject_ref: "ACC-E1", subject_key: "CT-288", parent_task_id: null }],
    work_task: [
      { id: "t2", workflow_run_id: "run1", title: "Approve the epic stories — CT-288 Sign-in", role_code: "product-manager", state: "idle", ticket_key: null, workflow_step: { ord: 2 } },
      { id: "t1", workflow_run_id: "run1", title: "Create stories for an epic — CT-288 Sign-in", role_code: "product-owner", state: "idle", ticket_key: null, workflow_step: { ord: 1 } },
    ],
  };
});

describe("mirrorEpicTasks", () => {
  it("creates one Task per row, under the epic the run is about", async () => {
    const out = await mirrorEpicTasks("e1", "run1", "product-owner");

    expect(out.epic).toBe("CT-288");
    expect(out.stories.map((s) => s.taskId)).toEqual(["t1", "t2"]);
    expect(out.expected).toBe(2);
    for (const call of createIssue.mock.calls) {
      const o = call[1] as { type: string; parentKey: string };
      expect(o.type).toBe("Task");
      expect(o.parentKey).toBe("CT-288");
    }
  });

  it("never creates an epic, whatever it is given", async () => {
    await mirrorEpicTasks("e1", "run1", "product-owner");
    const types = createIssue.mock.calls.map((c) => (c[1] as { type: string }).type);
    expect(types).not.toContain("Epic");
  });

  it("goes in step order, not the order the rows came back", async () => {
    await mirrorEpicTasks("e1", "run1", "product-owner");
    const summaries = createIssue.mock.calls.map((c) => (c[1] as { summary: string }).summary);
    expect(summaries[0]).toMatch(/^Create stories/);
    expect(summaries[1]).toMatch(/^Approve/);
  });

  it("stores each key on its own row and labels it with its role", async () => {
    await mirrorEpicTasks("e1", "run1", "product-owner");
    expect(updates.filter((u) => u.table === "work_task").map((u) => [u.id, u.patch.ticket_key])).toEqual([
      ["t1", "CT-301"], ["t2", "CT-302"],
    ]);
    expect((createIssue.mock.calls[0][1] as { labels: string[] }).labels).toEqual(["product-owner"]);
  });

  it("assigns each task to whoever holds its role", async () => {
    await mirrorEpicTasks("e1", "run1", "product-owner");
    expect(updateIssue).toHaveBeenCalledTimes(2);
  });

  it("creates only what is missing when run again", async () => {
    db.work_task[1].ticket_key = "CT-299";
    const out = await mirrorEpicTasks("e1", "run1", "product-owner");
    expect(createIssue).toHaveBeenCalledTimes(1);
    expect(out.stories).toHaveLength(2);
  });

  it("says which task Jira refused, and keeps going", async () => {
    createIssue.mockResolvedValueOnce(null);
    const out = await mirrorEpicTasks("e1", "run1", "product-owner");
    expect(out.reason).toBe("story-refused");
    expect(out.problems.join(" ")).toMatch(/Create stories for an epic/);
    expect(out.stories).toHaveLength(1);
  });

  it("reports an unassigned task rather than silently leaving it so", async () => {
    roster = [];
    const out = await mirrorEpicTasks("e1", "run1", "product-owner");
    expect(out.problems.join(" ")).toMatch(/No one is on the roster as `product-owner`/);
    expect(updateIssue).not.toHaveBeenCalled();
  });
});

describe("mirrorEpicTasks — what it will not guess", () => {
  it("hangs nothing under a run whose epic has no ticket", async () => {
    db.workflow_run[0].subject_key = null;
    const out = await mirrorEpicTasks("e1", "run1", "product-owner");
    expect(createIssue).not.toHaveBeenCalled();
    expect(out.reason).toBe("no-parent-ticket");
    expect(out.problems.join(" ")).toMatch(/ACC-E1/);
  });

  it("owes nothing to an engagement with no tracker", async () => {
    creds = null;
    const out = await mirrorEpicTasks("e1", "run1", "product-owner");
    expect(out.reason).toBe("no-tracker");
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("reports a run that is not there", async () => {
    const out = await mirrorEpicTasks("e1", "nope", "product-owner");
    expect(out.reason).toBe("no-run");
  });
});
