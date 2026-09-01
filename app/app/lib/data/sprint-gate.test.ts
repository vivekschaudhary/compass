import { describe, expect, it, vi, beforeEach } from "vitest";

// The sprint's gate asks JIRA, not Compass. That is the point of keeping no sprint table — a gate
// that reads its own side's record grades its own homework and passes on a sprint whose tickets
// never reached the board.
//
// Most of these tests are about the ways it could pass while checking nothing. AGENTS.md rule 11:
// an aggregate over zero rows finds no blockers, so the gate passes because there was nothing to
// check. `every()` over an empty array is `true`, and that single fact is how this feature would
// have shipped green and broken.

vi.mock("server-only", () => ({}));

type Issue = { key: string; fields: Record<string, unknown> };

const state: {
  sprintNo: number | null;
  jiraConfigured: boolean;
  issues: Issue[] | null;      // null = the query could not be run
} = { sprintNo: 3, jiraConfigured: true, issues: [] };

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({
          data: table === "work_task"
            ? { sprint_no: state.sprintNo }
            : table === "engagement"
              ? (state.jiraConfigured ? { jira_project: "KAN" } : {})
              : null,
        }),
        then: undefined,
      };
      // `role` is read as a list, not a single row.
      if (table === "role") {
        return {
          select: () => ({
            eq: async () => ({ data: [{ code: "engineer" }, { code: "designer" }] }),
          }),
        };
      }
      return chain;
    },
  }),
}));

vi.mock("../jira", () => ({
  resolveJira: (eng: Record<string, unknown>) =>
    eng?.jira_project ? { baseUrl: "u", email: "e", token: "t", project: "KAN" } : null,
  projectStatuses: async () => [],
  searchIssues: async () => state.issues,
}));

vi.mock("./tracker", () => ({ mirrorState: async () => ({}), moveFailed: () => false }));
vi.mock("./materialise", () => ({ materialiseFrom: async () => null }));
vi.mock("../docstore", () => ({ probeDocs: async () => ({ ok: true }) }));
vi.mock("./events", () => ({ emit: async () => {}, emitRefusal: async () => {} }));
vi.mock("@/app/v2/_ui/criterion", () => ({ describeCriterion: () => "" }));

const { evaluate } = await import("./gates");

const ACTOR = {
  orgId: "org-1", engagementId: "e1", roleCode: "product-manager", roleLabel: "PM",
  holder: null, scope: "everyone" as const, workstreamCode: null, agent: null,
  tier: "oversight", capabilities: [],
};
const TASK = "11111111-1111-4111-8111-111111111111";

const criterion = (ref: string) => ({
  id: "c1", kind: "done" as const, stepTask: "sprint-planning", statement: "",
  subjectKind: "ticket", subjectRef: ref, operator: "is", value: "true",
});

const issue = (key: string, over: Record<string, unknown> = {}): Issue => ({
  key,
  fields: { parent: { key: "KAN-1" }, assignee: { accountId: "a" }, labels: ["sprint-3", "engineer"], ...over },
});

beforeEach(() => {
  state.sprintNo = 3;
  state.jiraConfigured = true;
  state.issues = [];
});

describe("the ways this gate could pass while checking nothing", () => {
  // THE ZERO-ROW TRAP. `[].every(...)` is true, so a sprint containing nothing would be reported
  // as fully assigned. This is the single most likely false green in the whole change.
  it("is unmeasurable when no issue carries the sprint label", async () => {
    state.issues = [];
    for (const ref of ["on-board", "committed-have-epic"]) {
      const v = await evaluate(ACTOR, criterion(ref), TASK);
      expect(v.state).toBe("unmeasurable");
      expect("why" in v && v.why).toMatch(/nothing to check/);
    }
  });

  // `searchIssues` returns null for "could not ask" precisely so this can be told apart from the
  // empty result above. Collapsed, a Jira outage reads as "no unassigned stories".
  it("is unmeasurable when the board could not be read", async () => {
    state.issues = null;
    const v = await evaluate(ACTOR, criterion("on-board"), TASK);
    expect(v.state).toBe("unmeasurable");
    expect("why" in v && v.why).toMatch(/could not be read/);
  });

  it("is unmeasurable when the engagement has no Jira", async () => {
    state.jiraConfigured = false;
    expect((await evaluate(ACTOR, criterion("on-board"), TASK)).state).toBe("unmeasurable");
  });

  // UNSATISFIED, not unmeasurable. "Nothing was ever labelled" is a real, checkable answer, and
  // calling it unmeasurable would let work-not-done read as a tooling gap.
  it("is UNSATISFIED — not unmeasurable — when no sprint number was ever claimed", async () => {
    state.sprintNo = null;
    const v = await evaluate(ACTOR, criterion("on-board"), TASK);
    expect(v.state).toBe("unsatisfied");
    expect("detail" in v && v.detail).toMatch(/never labelled|Nothing reached the board/i);
  });
});

describe("on-board", () => {
  it("passes when every story has an owning role and an assignee", async () => {
    state.issues = [issue("KAN-11"), issue("KAN-12", { labels: ["sprint-3", "designer"] })];
    const v = await evaluate(ACTOR, criterion("on-board"), TASK);
    expect(v.state).toBe("satisfied");
  });

  // Named, not counted. "2 of 11" sends someone hunting; the keys send them somewhere.
  it("names the unassigned issues rather than counting them", async () => {
    state.issues = [issue("KAN-11"), issue("KAN-12", { assignee: null }), issue("KAN-19", { assignee: null })];
    const v = await evaluate(ACTOR, criterion("on-board"), TASK);
    expect(v.state).toBe("unsatisfied");
    expect("detail" in v && v.detail).toContain("KAN-12");
    expect("detail" in v && v.detail).toContain("KAN-19");
  });

  // A label that is not a role code is not an owner. `sprint-3` alone must not satisfy it, or the
  // sprint label would be mistaken for the ownership it sits beside.
  it("does not accept the sprint label as an owning role", async () => {
    state.issues = [issue("KAN-11", { labels: ["sprint-3"] })];
    const v = await evaluate(ACTOR, criterion("on-board"), TASK);
    expect(v.state).toBe("unsatisfied");
    expect("detail" in v && v.detail).toMatch(/no owning role/);
  });

  it("does not accept a label that is not a known role", async () => {
    state.issues = [issue("KAN-11", { labels: ["sprint-3", "frontend"] })];
    expect((await evaluate(ACTOR, criterion("on-board"), TASK)).state).toBe("unsatisfied");
  });
});

describe("committed-have-epic", () => {
  it("passes when every story sits under an epic", async () => {
    state.issues = [issue("KAN-11"), issue("KAN-12")];
    expect((await evaluate(ACTOR, criterion("committed-have-epic"), TASK)).state).toBe("satisfied");
  });

  it("names the orphans", async () => {
    state.issues = [issue("KAN-11"), issue("KAN-12", { parent: null })];
    const v = await evaluate(ACTOR, criterion("committed-have-epic"), TASK);
    expect(v.state).toBe("unsatisfied");
    expect("detail" in v && v.detail).toContain("KAN-12");
  });
});

describe("a subject nobody wired", () => {
  it("says a person decides it rather than passing", async () => {
    state.issues = [issue("KAN-11")];
    const v = await evaluate(ACTOR, criterion("fits-capacity"), TASK);
    expect(v.state).toBe("unmeasurable");
  });
});
