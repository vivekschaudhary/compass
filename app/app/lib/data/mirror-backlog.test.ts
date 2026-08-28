import { describe, it, expect, vi, beforeEach } from "vitest";

// What is under test is the ORDER and the refusals: epics before stories, a story never created
// without its epic, and nothing created twice. Jira and Supabase are stubbed — the decisions are
// the load-bearing part, and neither a board nor a database can make them.
vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async () => {} }));

const createIssue = vi.fn();
vi.mock("../jira", () => ({
  resolveJira: () => creds,
  createIssue: (...args: unknown[]) => createIssue(...args),
  transitionIssue: async () => true,
  projectStatuses: async () => ["To Do", "Done"],
  updateIssue: async () => true,
}));

const rows = vi.fn();
vi.mock("./backlog", () => ({ backlogOf: async () => rows() }));

// Only two reads matter here: the engagement (for creds) and the update that stores a ticket key.
const updated: { id: string; key: string }[] = [];
vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { jira_project: "CT" } }) }) }),
      update: (patch: { ticket_key: string }) => ({
        eq: async (_col: string, id: string) => {
          if (table === "backlog_item") updated.push({ id, key: patch.ticket_key });
          return { error: null };
        },
      }),
    }),
  }),
}));

let creds: unknown = { baseUrl: "https://x", email: "e", token: "t", project: "CT" };

const { mirrorBacklog, backlogIncomplete } = await import("./tracker");

const row = (over: Record<string, unknown>) => ({
  id: "id-1", kind: "epic", ref: "E1", parentRef: null,
  title: "An epic", body: "b", ticketKey: null, ord: 0, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  updated.length = 0;
  creds = { baseUrl: "https://x", email: "e", token: "t", project: "CT" };
  let n = 0;
  createIssue.mockImplementation(async () => ({ key: `CT-${++n}` }));
});

describe("mirrorBacklog", () => {
  it("creates every epic and hangs its stories under it", async () => {
    rows.mockReturnValue([
      row({ id: "e1", ref: "E1" }),
      row({ id: "s1", kind: "story", ref: "E1-S1", parentRef: "E1", title: "A story", ord: 1 }),
    ]);

    const out = await mirrorBacklog("eng", "task", "product-manager");
    expect(out.epics).toHaveLength(1);
    expect(out.stories).toHaveLength(1);
    expect(out.expected).toBe(2);
    expect(out.problems).toEqual([]);

    // Epics FIRST, so the story has a parent to point at by the time it is created.
    const opts = createIssue.mock.calls.map((c) => c[1] as { type: string; parentKey?: string });
    expect(opts[0].type).toBe("Epic");
    expect(opts[1].type).toBe("Story");
    expect(opts[1].parentKey).toBe("CT-1");
  });

  it("stores each key on its own row", async () => {
    rows.mockReturnValue([row({ id: "e1" })]);
    await mirrorBacklog("eng", "task", "pm");
    expect(updated).toEqual([{ id: "e1", key: "CT-1" }]);
  });

  // Re-approval is the ordinary case, not an error — and it must not put the backlog on the board
  // a second time.
  it("creates nothing when every item already has a ticket", async () => {
    rows.mockReturnValue([row({ ticketKey: "CT-9" })]);
    const out = await mirrorBacklog("eng", "task", "pm");
    expect(createIssue).not.toHaveBeenCalled();
    expect(out.reason).toBe("nothing-to-mirror");
    expect(backlogIncomplete(out)).toBe(false);
  });

  // A story whose epic Jira refused must not become a top-level orphan: a parentless story on a
  // board is worse than a visibly missing one, because nothing shows it is misplaced.
  it("does not create a story whose epic was refused", async () => {
    rows.mockReturnValue([
      row({ id: "e1", ref: "E1" }),
      row({ id: "s1", kind: "story", ref: "E1-S1", parentRef: "E1", title: "Orphan", ord: 1 }),
    ]);
    createIssue.mockResolvedValue(null);

    const out = await mirrorBacklog("eng", "task", "pm");
    expect(out.epics).toEqual([]);
    expect(out.stories).toEqual([]);
    expect(out.reason).toBe("epic-refused");
    // Both named — a count of zero cannot say which two things are missing.
    expect(out.problems.join(" ")).toMatch(/An epic/);
    expect(out.problems.join(" ")).toMatch(/Orphan/);
    expect(backlogIncomplete(out)).toBe(true);
  });

  // A retry after a partial failure hangs the remaining stories under the epic that DID get created,
  // rather than skipping them because their parent is not in this pass.
  it("uses an epic key stored by an earlier run as the parent", async () => {
    rows.mockReturnValue([
      row({ id: "e1", ref: "E1", ticketKey: "CT-100" }),
      row({ id: "s1", kind: "story", ref: "E1-S1", parentRef: "E1", title: "Late story", ord: 1 }),
    ]);

    const out = await mirrorBacklog("eng", "task", "pm");
    expect(out.expected).toBe(1);
    expect(out.stories).toHaveLength(1);
    expect((createIssue.mock.calls[0][1] as { parentKey?: string }).parentKey).toBe("CT-100");
  });

  // An engagement may deliberately run without a tracker. Nothing was owed, so nothing is wrong.
  it("is not a failure when there is no tracker", async () => {
    creds = null;
    rows.mockReturnValue([row({})]);
    const out = await mirrorBacklog("eng", "task", "pm");
    expect(out.reason).toBe("no-tracker");
    expect(createIssue).not.toHaveBeenCalled();
    expect(backlogIncomplete(out)).toBe(false);
  });
});
