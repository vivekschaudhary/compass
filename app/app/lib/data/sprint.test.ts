import { describe, expect, it, vi, beforeEach } from "vitest";

// The sprint number is the ONE thing about a sprint that Compass stores, because JQL cannot
// enumerate labels. Everything else is asked of Jira. That makes these few lines load-bearing in a
// way their size hides: a wrong number relabels a live sprint's stories, and because the label
// writes are additive, nothing downstream would ever report it.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

// What the fake database holds, reset per test.
const state: {
  tasks: Row[];
  updates: Row[];
  failListWith: string | null;
} = { tasks: [], updates: [], failListWith: null };

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      if (table !== "work_task") throw new Error(`unexpected table ${table}`);

      const filters: Row = {};
      let notNullCol: string | null = null;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => { filters[col] = val; return chain; },
        not: (col: string) => { notNullCol = col; return chain; },
        order: () => chain,
        update: (patch: Row) => ({
          eq: async (_c: string, id: string) => {
            state.updates.push({ id, ...patch });
            const t = state.tasks.find((x) => x.id === id);
            if (t) Object.assign(t, patch);
            return { error: null };
          },
        }),
        maybeSingle: async () => ({
          data: state.tasks.find((t) => t.id === filters.id) ?? null,
          error: null,
        }),
        limit: async () => {
          if (state.failListWith) return { data: null, error: { message: state.failListWith } };
          const rows = state.tasks
            .filter((t) => t.engagement_id === filters.engagement_id)
            .filter((t) => (notNullCol ? t[notNullCol] != null : true))
            .sort((a, b) => (b.sprint_no as number) - (a.sprint_no as number));
          return { data: rows.slice(0, 1), error: null };
        },
      };
      return chain;
    },
  }),
}));

const { nextSprintNumber, claimSprintNumber, sprintLabel, sprintJql, committedJql } =
  await import("./sprint");

beforeEach(() => {
  state.tasks = [];
  state.updates = [];
  state.failListWith = null;
});

const task = (id: string, engagement: string, sprintNo: number | null = null) =>
  ({ id, engagement_id: engagement, sprint_no: sprintNo });

describe("nextSprintNumber", () => {
  it("is 1 on an engagement that has never planned a sprint", async () => {
    state.tasks = [task("t1", "e1")];
    expect(await nextSprintNumber("e1", "t1")).toBe(1);
  });

  it("is one past the highest sprint the engagement has planned", async () => {
    state.tasks = [task("t1", "e1", 1), task("t2", "e1", 2), task("t3", "e1")];
    expect(await nextSprintNumber("e1", "t3")).toBe(3);
  });

  // A sprint that was planned and abandoned leaves a gap. Filling it would reuse a label that may
  // still be on real issues.
  it("does not fill a gap left by an abandoned sprint", async () => {
    state.tasks = [task("t1", "e1", 1), task("t2", "e1", 4), task("t3", "e1")];
    expect(await nextSprintNumber("e1", "t3")).toBe(5);
  });

  // THE REDRAFT CASE. The first draft may already have labelled stories `sprint-3`; drafting again
  // as sprint 4 would leave one sprint's work spread across two labels with nothing saying so.
  it("keeps the number a task has already been given", async () => {
    state.tasks = [task("t1", "e1", 1), task("t2", "e1", 2), task("t3", "e1", 2)];
    expect(await nextSprintNumber("e1", "t3")).toBe(2);
  });

  // Unscoped, every client on the instance would share one counter and the second engagement's
  // first sprint would be called sprint 4.
  it("counts per engagement, so two clients both get a sprint 1", async () => {
    state.tasks = [task("t1", "e1", 1), task("t2", "e1", 2), task("t3", "e2")];
    expect(await nextSprintNumber("e2", "t3")).toBe(1);
  });

  // THROWS rather than falling back to 1. A read that failed and returned "1" would relabel a live
  // sprint's stories, and there would be nothing in the record to say why.
  it("refuses to guess when the count cannot be read", async () => {
    state.tasks = [task("t1", "e1")];
    state.failListWith = "connection reset";
    await expect(nextSprintNumber("e1", "t1")).rejects.toThrow(/connection reset/);
  });
});

describe("claimSprintNumber", () => {
  it("writes the number to the task", async () => {
    state.tasks = [task("t1", "e1")];
    await claimSprintNumber("t1", 3);
    expect(state.updates).toEqual([{ id: "t1", sprint_no: 3 }]);
  });

  // Claiming is what makes the next allocation correct, so a failure has to stop the caller rather
  // than let it go on and label ten stories into a sprint nothing recorded.
  it("is what makes the next number move", async () => {
    state.tasks = [task("t1", "e1"), task("t2", "e1")];
    await claimSprintNumber("t1", 1);
    expect(await nextSprintNumber("e1", "t2")).toBe(2);
  });
});

describe("how a sprint is spelled on the board", () => {
  // One place, three readers — the mirror writes it, the gate queries it, the context subtracts it.
  it("labels a sprint by its number", () => {
    expect(sprintLabel(3)).toBe("sprint-3");
  });

  it("quotes the project rather than interpolating it raw", () => {
    expect(sprintJql("KAN", 3)).toBe('project = "KAN" AND labels = "sprint-3"');
  });

  it("asks for every earlier sprint at once", () => {
    expect(committedJql("KAN", 3))
      .toBe('project = "KAN" AND labels IN ("sprint-1", "sprint-2", "sprint-3")');
  });

  // Sprint 1 has no earlier sprints, so there is nothing to ask and no outage to mistake for one.
  it("has nothing to ask before the first sprint", () => {
    expect(committedJql("KAN", 0)).toBe("");
  });
});
