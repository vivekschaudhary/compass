import { describe, expect, it, vi, beforeEach } from "vitest";

// Putting a sprint on the board. The tests that matter here are the ones about what happens when
// something is missing — a roster with nobody in a role, a story that never reached Jira, an
// ambiguous name — because every one of those has a silent version that looks like success.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const state: {
  members: Row[];
  users: Record<string, { accountId: string; displayName: string } | null>;
  updateOk: boolean;
  verified: { key: string }[] | null;
  nextNumber: number;
  claimed: number[];
  claimThrows: string | null;
  order: string[];
  updates: { key: string; opts: Row }[];
  userLookups: string[];
  events: Row[];
} = {
  members: [], users: {}, updateOk: true, verified: [], nextNumber: 3,
  claimed: [], claimThrows: null, order: [], updates: [], userLookups: [], events: [],
};

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      if (table === "event") {
        return { insert: async (row: Row) => { state.events.push(row); return { error: null }; } };
      }
      if (table === "member") {
        const f: Row = {};
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (c: string, v: unknown) => { f[c] = v; return chain; },
          order: () => chain,
          limit: async () => ({
            data: state.members.filter(
              (m) => m.engagement_id === f.engagement_id && m.role === f.role),
          }),
        };
        return chain;
      }
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, limit: () => chain, order: () => chain,
        maybeSingle: async () => ({ data: table === "engagement" ? { jira_project: "KAN" } : null }),
      };
      return chain;
    },
  }),
}));

vi.mock("../jira", () => ({
  resolveJira: () => ({ baseUrl: "u", email: "e", token: "t", project: "KAN" }),
  createIssue: async () => null,
  transitionIssue: async () => true,
  projectStatuses: async () => [],
  updateIssue: async (_c: unknown, key: string, opts: Row) => {
    state.order.push(`update:${key}`);
    state.updates.push({ key, opts });
    return state.updateOk;
  },
  findUser: async (_c: unknown, name: string) => {
    state.userLookups.push(name);
    return state.users[name] ?? null;
  },
  searchIssues: async () => state.verified,
}));

vi.mock("./sprint", () => ({
  nextSprintNumber: async () => state.nextNumber,
  claimSprintNumber: async (_t: string, n: number) => {
    if (state.claimThrows) throw new Error(state.claimThrows);
    state.order.push(`claim:${n}`);
    state.claimed.push(n);
  },
  sprintLabel: (n: number) => `sprint-${n}`,
  sprintJql: (p: string, n: number) => `project = "${p}" AND labels = "sprint-${n}"`,
}));

vi.mock("./backlog", () => ({ backlogOf: async () => [] }));
vi.mock("./steps", () => ({ sortByStep: <T,>(x: T[]) => x }));

const { mirrorSprint, sprintIncomplete } = await import("./tracker");

const commitment = (over: Row = {}) => ({
  ref: "E1-S1", ticketKey: "KAN-11", title: "Sign in", ownerRole: "engineer", why: "", ...over,
} as never);

beforeEach(() => {
  state.members = [{ engagement_id: "e1", role: "engineer", name: "Jay" },
                   { engagement_id: "e1", role: "designer", name: "Priya" }];
  state.users = { Jay: { accountId: "j1", displayName: "Jay" },
                  Priya: { accountId: "p1", displayName: "Priya" } };
  state.updateOk = true;
  state.verified = [{ key: "KAN-11" }];
  state.nextNumber = 3;
  state.claimed = [];
  state.claimThrows = null;
  state.order = [];
  state.updates = [];
  state.userLookups = [];
  state.events = [];
});

describe("mirrorSprint", () => {
  it("labels each story with the sprint and its owning role, and assigns it", async () => {
    const r = await mirrorSprint("e1", "t1", "product-manager", [commitment()]);
    expect(r.placed).toEqual([{ key: "KAN-11", role: "engineer", assignee: "Jay" }]);
    expect(state.updates[0].opts).toEqual({
      labels: ["sprint-3", "engineer"], assignee: { accountId: "j1" },
    });
  });

  // THE NUMBER FIRST. Labelling ten stories `sprint-3` and then failing to record which sprint they
  // are in leaves a sprint on the board that the process has no memory of — and the next plan
  // allocates 3 again and quietly merges two sprints.
  it("claims the sprint number before touching a single issue", async () => {
    // Ordering observed through the shared log both fakes write to, so this fails if the claim is
    // ever moved after the writes rather than merely asserting that both happened.
    await mirrorSprint("e1", "t1", "product-manager", [commitment()]);
    expect(state.order[0]).toBe("claim:3");
    expect(state.order.slice(1)).toEqual(["update:KAN-11"]);
  });

  it("labels nothing when the number cannot be claimed", async () => {
    // The other half of the ordering rule: a failed claim must stop the run, not proceed and label
    // stories into a sprint nothing recorded.
    state.claimThrows = "no connection";
    const r = await mirrorSprint("e1", "t1", "product-manager", [commitment()]);
    expect(r.reason).toBe("number-refused");
    expect(state.updates).toEqual([]);
    expect(r.problems.join(" ")).toContain("no connection");
  });

  // One search per ROLE, not per story. Thirty stories across two roles is two lookups — and the
  // cache also guarantees every story of a role gets the same person, which resolving per story
  // could not promise on an ambiguous name partway down the list.
  it("looks a role's holder up once, however many stories they own", async () => {
    await mirrorSprint("e1", "t1", "product-manager", [
      commitment({ ref: "E1-S1", ticketKey: "KAN-11" }),
      commitment({ ref: "E1-S2", ticketKey: "KAN-12" }),
      commitment({ ref: "E1-S3", ticketKey: "KAN-13", ownerRole: "designer" }),
    ]);
    expect(state.userLookups).toEqual(["Jay", "Priya"]);
  });

  // Named, never skipped in silence: "nine of eleven" with no list is a number nobody can act on,
  // and the fix — mirror the backlog first — depends on knowing which.
  it("names a story that never reached the board instead of dropping it", async () => {
    state.verified = [{ key: "KAN-11" }];
    const r = await mirrorSprint("e1", "t1", "product-manager", [
      commitment(),
      commitment({ ref: "E1-S9", ticketKey: null, title: "Orphan" }),
    ]);
    expect(r.placed).toHaveLength(1);
    expect(r.expected).toBe(2);
    expect(r.problems.join(" ")).toContain("E1-S9");
  });

  // The ticket is still labelled — the sprint is right even when the person is unknown — but the
  // problem names them, so somebody can fix the roster or the Jira account.
  it("labels but does not assign when no Jira user matches the holder", async () => {
    state.users = { Jay: null };
    const r = await mirrorSprint("e1", "t1", "product-manager", [commitment()]);
    expect(state.updates[0].opts.labels).toEqual(["sprint-3", "engineer"]);
    expect(state.updates[0].opts.assignee).toBeUndefined();
    expect(r.problems.join(" ")).toContain("Jay");
  });

  it("says so when nobody is on the roster for a role", async () => {
    state.members = [];
    const r = await mirrorSprint("e1", "t1", "product-manager", [commitment()]);
    expect(r.problems.join(" ")).toMatch(/No one is on the roster as `engineer`/);
    expect(state.userLookups).toEqual([]);
  });

  it("reports the issues Jira refused", async () => {
    state.updateOk = false;
    const r = await mirrorSprint("e1", "t1", "product-manager", [commitment()]);
    expect(r.placed).toHaveLength(0);
    expect(r.problems.join(" ")).toContain("KAN-11");
  });

  // INSPECT THE OUTPUT, NOT THE EXIT CODE. Every write can return ok and still leave the board
  // short — a permission that drops a field, an issue moved between the read and the write.
  it("reads the sprint back and reports when the board is short", async () => {
    state.verified = [];
    const r = await mirrorSprint("e1", "t1", "product-manager", [commitment()]);
    expect(r.placed).toHaveLength(1);
    expect(r.verified).toBe(0);
    expect(r.problems.join(" ")).toMatch(/board reports 0/);
  });

  it("degrades rather than throwing when there is nothing to commit", async () => {
    const r = await mirrorSprint("e1", "t1", "product-manager", []);
    expect(r.reason).toBe("nothing-to-mirror");
    expect(state.claimed).toEqual([]);
  });

  it("records what it did on the event log", async () => {
    await mirrorSprint("e1", "t1", "product-manager", [commitment()]);
    expect(state.events[0].verb).toBe("tracker.sprint_mirrored");
    expect((state.events[0].payload as Row).sprint).toBe(3);
  });
});

describe("sprintIncomplete", () => {
  const base = { number: 3, placed: [], expected: 0, verified: 0, problems: [] };

  it("is false when there was nothing to do", () => {
    expect(sprintIncomplete({ ...base, reason: "nothing-to-mirror" })).toBe(false);
    expect(sprintIncomplete({ ...base, reason: "no-tracker" })).toBe(false);
  });

  it("is false when the board holds everything committed", () => {
    expect(sprintIncomplete({
      ...base, expected: 2, verified: 2,
      placed: [{ key: "A", role: "engineer", assignee: "Jay" }, { key: "B", role: "engineer", assignee: "Jay" }],
    })).toBe(false);
  });

  // A verification that could not run is not proof of completeness — the one direction this must
  // never default toward is "fine".
  it("is TRUE when the board could not be read back", () => {
    expect(sprintIncomplete({
      ...base, expected: 1, verified: null,
      placed: [{ key: "A", role: "engineer", assignee: "Jay" }],
    })).toBe(true);
  });

  it("is true when fewer stories landed than were committed", () => {
    expect(sprintIncomplete({ ...base, expected: 3, verified: 1, placed: [{ key: "A", role: "e", assignee: null }] }))
      .toBe(true);
  });
});
