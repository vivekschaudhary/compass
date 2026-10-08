import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const reads: string[] = [];
vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => { reads.push("run"); return { data: { subject_ref: "run-subject", subject_key: null } }; },
        }),
      }),
    }),
  }),
}));

const { subjectOfRun } = await import("./run-subject");

beforeEach(() => { reads.length = 0; });

describe("subjectOfRun", () => {
  it("prefers the task's own subject over the run's, without reading the run", async () => {
    expect(await subjectOfRun("run-1", "backend")).toEqual({ ref: "backend", key: null });
    expect(reads).toEqual([]);
  });

  it("falls back to the run's subject when the task names none", async () => {
    expect(await subjectOfRun("run-1", null)).toEqual({ ref: "run-subject", key: null });
    expect(reads).toEqual(["run"]);
  });

  it("returns null with no run and no task subject", async () => {
    expect(await subjectOfRun(null, null)).toBeNull();
  });
});
