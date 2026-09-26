import { describe, it, expect, vi, beforeEach } from "vitest";

// `composeTicketBodies` batches by role because one system prompt is one role's own markdown.
// This is the ONE thing that changed in this file: those batches used to run one after another —
// a phase with N roles cost N sequential model calls before anything was on the board. This test
// proves they now genuinely OVERLAP, not just that a concurrent-looking rewrite doesn't crash: two
// roles' model calls are both in flight before either resolves.

vi.mock("server-only", () => ({}));
vi.mock("../jira", () => ({
  resolveJira: () => ({ baseUrl: "https://x.atlassian.net", email: "e", token: "t", project: "CT" }),
  updateIssue: async () => true,
}));
vi.mock("./events", () => ({ emit: async () => {}, orgIdFor: async () => "org1" }));
vi.mock("./steps", async () => {
  const real = await vi.importActual<typeof import("./steps")>("./steps");
  return real;
});

const agentMarkdown = vi.fn(async (_e: string, _o: string, role: string) => `# ${role}\n\nWrite tickets.`);
vi.mock("../agent/context", () => ({
  agentMarkdown: (e: string, o: string, r: string) => agentMarkdown(e, o, r),
  doneCriteriaFor: async () => [],
  loadDocumentText: async () => ({ path: "", title: null, version: null, body: null }),
}));

// The thing under test: does role B's dispatch START before role A's RESOLVES?
const timeline: string[] = [];
const REF_OF: Record<string, string> = { "product-manager": "task:t1", "staff-engineer": "task:t2" };
const dispatch = vi.fn(async (req: { system: string }) => {
  const role = req.system.includes("product-manager") ? "product-manager" : "staff-engineer";
  timeline.push(`${role}:start`);
  // product-manager resolves slower — if these ran sequentially (product-manager first, being the
  // Map's first entry), staff-engineer's OWN start would never appear before product-manager's end.
  await new Promise((r) => setTimeout(r, role === "product-manager" ? 30 : 5));
  timeline.push(`${role}:end`);
  return {
    stopReason: "tool_use", refusalExplanation: null, text: "",
    toolCall: { name: "ticket_bodies", input: { tickets: [{ ref: REF_OF[role], summary: "s", description: "d" }] } },
    usage: null,
  };
});
vi.mock("../agent/hosts/select", () => ({ MODEL: "test-model", selectHost: () => ({ name: "test", dispatch }) }));

type Row = Record<string, unknown>;
function table(rows: Row[] | Row | null) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  const q = {
    select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q,
    maybeSingle: async () => ({ data: Array.isArray(rows) ? null : rows }),
    update: () => q,
    then: (res: (v: { data: Row[]; error: null }) => void) => res({ data: list, error: null }),
  };
  return q;
}

const ENGAGEMENT = { name: "Acme", jira_project: "CT", atlassian_base_url: "x", atlassian_email: "e", atlassian_api_token: null };
const RUN = { id: "run1", ticket_key: null, ticket_body_at: null, owner_role_code: null, workflow: { code: "feature", label: "Feature" } };
const TASKS: Row[] = [
  { id: "t1", title: "PM row", subtitle: "", role_code: "product-manager", ticket_key: "CT-1", ticket_body_at: null, workflow_step_id: "s1", workflow_step: { ord: 1, produces: null, reads: [] } },
  { id: "t2", title: "SE row", subtitle: "", role_code: "staff-engineer", ticket_key: "CT-2", ticket_body_at: null, workflow_step_id: "s2", workflow_step: { ord: 2, produces: null, reads: [] } },
];

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: (name: string) => {
      if (name === "engagement") return table(ENGAGEMENT);
      if (name === "workflow_run") return table(RUN);
      if (name === "work_task") return table(TASKS);
      if (name === "ticket_brief") return table({ brief: "Ground rules." });
      return table([]);
    },
  }),
}));

const { composeTicketBodies } = await import("./ticket-body");

beforeEach(() => {
  timeline.length = 0;
  dispatch.mockClear();
  agentMarkdown.mockClear();
});

describe("composeTicketBodies runs one role's batch per model call, concurrently", () => {
  it("starts the second role's model call before the first role's has resolved", async () => {
    const result = await composeTicketBodies("e1", "run1", "product-manager");

    expect(result.written.map((w) => w.ref).sort()).toEqual(["task:t1", "task:t2"]);
    expect(dispatch).toHaveBeenCalledTimes(2);

    // Sequential would read start,end,start,end. Concurrent reads both starts before either end.
    const bothStartedFirst =
      timeline.indexOf("staff-engineer:start") < timeline.indexOf("product-manager:end");
    expect(bothStartedFirst).toBe(true);
  });
});
