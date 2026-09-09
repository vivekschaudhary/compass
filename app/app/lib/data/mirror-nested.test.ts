import { describe, expect, it, vi, beforeEach } from "vitest";

// Putting a NESTED run on the board: one sub-task per row, under the parent row's story.
//
// The tests that matter are the refusals. Every one of them has a silent version that looks like
// success — a project with sub-tasks disabled, a parent with no ticket, a run nested two deep. In
// each case the honest outcome is nothing created and a problem said out loud, because the failure
// this whole function exists to remove was work happening where nobody outside Compass could see it.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const state: {
  parentTicket: string | null;
  parentRunNested: boolean;
  subtaskType: string | null;
  tasks: Row[];
  members: Row[];
  users: Record<string, { accountId: string; displayName: string } | null>;
  created: { type: string; parentKey?: string; summary: string; labels?: string[] }[];
  updates: { key: string; opts: Row }[];
  userLookups: string[];
  stored: { id: string; key: string }[];
} = {
  parentTicket: "KAN-8", parentRunNested: false, subtaskType: "Sub-task",
  tasks: [], members: [], users: {}, created: [], updates: [], userLookups: [], stored: [],
};

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      if (table === "work_task") {
        const f: Row = {};
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (c: string, v: unknown) => { f[c] = v; return chain; },
          update: (patch: Row) => ({
            eq: async (_c: string, id: string) => {
              state.stored.push({ id, key: String(patch.ticket_key) });
              const t = state.tasks.find((x) => x.id === id);
              if (t) t.ticket_key = patch.ticket_key;
              return { error: null };
            },
          }),
          // the parent lookup
          maybeSingle: async () => ({
            data: { id: "parent", ticket_key: state.parentTicket, workflow_run_id: "parent-run" },
          }),
          // the rows of the nested run
          then: undefined,
        };
        // `.select(...).eq("workflow_run_id", …)` is awaited directly
        (chain as { then?: unknown }).then = (res: (v: unknown) => void) =>
          res({ data: f.workflow_run_id ? state.tasks : [] });
        return chain;
      }
      if (table === "workflow_run") {
        const f: Row = {};
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (c: string, v: unknown) => { f[c] = v; return chain; },
          maybeSingle: async () => ({
            data: f.id === "parent-run"
              ? { parent_task_id: state.parentRunNested ? "grandparent" : null }
              : { id: "run-1", parent_task_id: "parent" },
          }),
        };
        return chain;
      }
      if (table === "member") {
        const f: Row = {};
        let orEng: string | null = null;
        const result = () => ({
          data: state.members.filter((m) =>
            (f.org_id === undefined || m.org_id === f.org_id) &&
            (orEng === null || m.engagement_id === orEng || m.engagement_id == null)),
        });
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (c: string, v: unknown) => { f[c] = v; return chain; },
          or: (e: string) => { orEng = /engagement_id\.eq\.([^,]+)/.exec(e)?.[1] ?? null; return chain; },
          order: async () => result(),
        };
        return chain;
      }
      if (table === "event") return { insert: async () => ({ error: null }) };
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, limit: () => chain, order: () => chain,
        maybeSingle: async () => ({
          data: table === "engagement"
            ? { jira_project: "KAN", org_id: "org-1",
                atlassian_base_url: "u", atlassian_email: "e", atlassian_api_token: "t" }
            : null,
        }),
      };
      return chain;
    },
  }),
}));

vi.mock("../jira", () => ({
  resolveJira: () => ({ baseUrl: "u", email: "e", token: "t", project: "KAN" }),
  subtaskType: async () => state.subtaskType,
  createIssue: async (_c: unknown, o: { type: string; parentKey?: string; summary: string; labels?: string[] }) => {
    state.created.push(o);
    return { key: `KAN-${100 + state.created.length}` };
  },
  updateIssue: async (_c: unknown, key: string, opts: Row) => { state.updates.push({ key, opts }); return true; },
  findUser: async (_c: unknown, name: string) => { state.userLookups.push(name); return state.users[name] ?? null; },
  transitionIssue: async () => true,
  projectStatuses: async () => [],
  searchIssues: async () => [],
}));

const { mirrorNested } = await import("./tracker");

const task = (id: string, title: string, role: string): Row =>
  ({ id, title, role_code: role, state: "idle", ticket_key: null, workflow_step: { ord: Number(id.slice(1)) } });

beforeEach(() => {
  state.parentTicket = "KAN-8";
  state.parentRunNested = false;
  state.subtaskType = "Sub-task";
  state.tasks = [task("t1", "Research the ground", "staff-engineer"),
                 task("t2", "Review the research", "reviewer"),
                 task("t3", "Accept the research", "principal-engineer")];
  state.members = [{ org_id: "org-1", engagement_id: "e1", role: "staff-engineer", name: "Jay" },
                   { org_id: "org-1", engagement_id: "e1", role: "reviewer", name: "Priya" },
                   { org_id: "org-1", engagement_id: null, role: "principal-engineer", name: "Renita" }];
  state.users = { Jay: { accountId: "j1", displayName: "Jay" },
                  Priya: { accountId: "p1", displayName: "Priya" },
                  Renita: { accountId: "r1", displayName: "Renita" } };
  state.created = []; state.updates = []; state.userLookups = []; state.stored = [];
});

describe("mirrorNested", () => {
  it("creates one sub-task per row, under the parent story", async () => {
    const r = await mirrorNested("e1", "run-1", "staff-engineer");
    expect(r.problems).toEqual([]);
    expect(r.epic).toBe("KAN-8");
    expect(r.expected).toBe(3);
    expect(state.created.map((c) => [c.type, c.parentKey, c.summary])).toEqual([
      ["Sub-task", "KAN-8", "Research the ground"],
      ["Sub-task", "KAN-8", "Review the research"],
      ["Sub-task", "KAN-8", "Accept the research"],
    ]);
  });

  it("labels each sub-task with its role and assigns it to that role's holder", async () => {
    await mirrorNested("e1", "run-1", "staff-engineer");
    expect(state.created.map((c) => c.labels)).toEqual([["staff-engineer"], ["reviewer"], ["principal-engineer"]]);
    // Renita holds `principal-engineer` at ORG level, with no row on this engagement — she is still
    // the assignee, which is the whole point of `holdersOn` resolving org defaults.
    expect(state.updates.map((u) => (u.opts.assignee as { accountId: string }).accountId))
      .toEqual(["j1", "p1", "r1"]);
  });

  it("stores the key only after Jira accepts it", async () => {
    await mirrorNested("e1", "run-1", "staff-engineer");
    expect(state.stored).toEqual([
      { id: "t1", key: "KAN-101" }, { id: "t2", key: "KAN-102" }, { id: "t3", key: "KAN-103" },
    ]);
  });

  it("creates nothing on a re-run, and re-reads the keys", async () => {
    await mirrorNested("e1", "run-1", "staff-engineer");
    state.created = []; state.updates = [];
    const again = await mirrorNested("e1", "run-1", "staff-engineer");
    expect(state.created).toEqual([]);
    expect(again.stories.map((s) => s.key)).toEqual(["KAN-101", "KAN-102", "KAN-103"]);
  });

  it("looks a role's holder up once, however many rows they own", async () => {
    state.tasks = [task("t1", "One", "staff-engineer"), task("t2", "Two", "staff-engineer"),
                   task("t3", "Three", "staff-engineer")];
    await mirrorNested("e1", "run-1", "staff-engineer");
    expect(state.userLookups).toEqual(["Jay"]);
  });

  /* ── the refusals: each has a silent version that looks like success ──────── */

  it("creates nothing when the project has no sub-task type, and says so", async () => {
    // A team-managed project can have sub-tasks disabled. Falling back to Stories would leave a
    // flat pile that reads exactly like it worked.
    state.subtaskType = null;
    const r = await mirrorNested("e1", "run-1", "staff-engineer");
    expect(state.created).toEqual([]);
    expect(r.reason).toBe("no-subtask-type");
    expect(r.problems.join(" ")).toMatch(/no sub-task issue type/);
  });

  it("creates nothing when the parent row has no ticket, and says so", async () => {
    // Ordinary during a Jira outage rather than an error: there is nothing to hang them under yet.
    state.parentTicket = null;
    const r = await mirrorNested("e1", "run-1", "staff-engineer");
    expect(state.created).toEqual([]);
    expect(r.reason).toBe("no-parent-ticket");
    expect(r.problems.join(" ")).toMatch(/no ticket yet/);
  });

  it("refuses a run nested two deep — Jira sub-tasks cannot have sub-tasks", async () => {
    state.parentRunNested = true;
    const r = await mirrorNested("e1", "run-1", "staff-engineer");
    expect(state.created).toEqual([]);
    expect(r.reason).toBe("nested-too-deep");
  });

  it("names the role rather than dropping it when nobody holds it", async () => {
    state.members = [];
    const r = await mirrorNested("e1", "run-1", "staff-engineer");
    // The sub-tasks are still created — the work exists and belongs on the board. It is the
    // ASSIGNMENT that could not happen, and that is reported rather than passed over.
    expect(state.created).toHaveLength(3);
    expect(state.updates).toEqual([]);
    expect(r.problems.join(" ")).toMatch(/No one is on the roster as `staff-engineer`/);
  });
});
