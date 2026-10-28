import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const reads: string[] = [];
let run: Record<string, unknown> = {};
let backlog: Record<string, unknown>[] = [];

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q, not: () => q, order: () => q,
        maybeSingle: async () => { reads.push("run"); return { data: run }; },
        then: (res: (v: { data: unknown[] }) => void) => { reads.push(table); res({ data: backlog }); },
      };
      return q;
    },
  }),
}));

const { subjectOfRun } = await import("./run-subject");

beforeEach(() => {
  reads.length = 0;
  run = { subject_ref: "run-subject", subject_key: null, engagement_id: "e1", parent_task_id: null };
  backlog = [];
});

describe("subjectOfRun", () => {
  it("prefers the task's own subject over the run's, without reading the run", async () => {
    expect(await subjectOfRun("run-1", "backend")).toEqual({ ref: "backend", key: null });
    expect(reads).toEqual([]);
  });

  it("falls back to the run's subject when the task names none", async () => {
    expect(await subjectOfRun("run-1", null)).toEqual({ ref: "run-subject", key: null, epicKey: undefined });
    expect(reads[0]).toBe("run");
  });

  it("returns null with no run and no task subject", async () => {
    expect(await subjectOfRun(null, null)).toBeNull();
  });

  it("an epic's run has no epicKey: the subject IS the epic", async () => {
    backlog = []; // no story row has the epic's ref
    expect((await subjectOfRun("run-1", null))?.epicKey).toBeUndefined();
  });

  it("a nested run's subject is never looked up as a story", async () => {
    run = { ...run, parent_task_id: "t1" };
    await subjectOfRun("run-1", null);
    expect(reads).toEqual(["run"]);
  });
});

describe("subjectOfRun for a run about a story", () => {
  it("names the epic the story is under, by its ticket", async () => {
    run = { subject_ref: "E1-S1", subject_key: "CT-359", engagement_id: "e1", parent_task_id: null };
    // First backlog read: the story row; second: the epic row. The fake answers both with the same
    // rows, so give it one that satisfies each question.
    backlog = [{ parent_ref: "E1", ticket_key: "CT-288" }];
    expect(await subjectOfRun("run-1", null)).toEqual({ ref: "E1-S1", key: "CT-359", epicKey: "CT-288" });
  });

  it("says null — not undefined — when the story's epic is not on the board", async () => {
    run = { subject_ref: "E1-S1", subject_key: "CT-359", engagement_id: "e1", parent_task_id: null };
    backlog = [{ parent_ref: "E1", ticket_key: null }];
    expect((await subjectOfRun("run-1", null))?.epicKey).toBeNull();
  });

  it("says null when the story has no parent at all", async () => {
    run = { subject_ref: "E1-S1", subject_key: "CT-359", engagement_id: "e1", parent_task_id: null };
    backlog = [{ parent_ref: null, ticket_key: null }];
    expect((await subjectOfRun("run-1", null))?.epicKey).toBeNull();
  });
});
