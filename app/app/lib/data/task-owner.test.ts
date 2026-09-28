import { describe, expect, it, vi, beforeEach } from "vitest";

// The sweep has no session, so who a task belongs to can only come from the row. What matters is
// that a MISSING row is null — the route turns null into a 400, and a default standing in for a
// missing answer would let the sweep run an agent as nobody, on nothing (rule 11).

vi.mock("server-only", () => ({}));

let row: Record<string, unknown> | null = null;
vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: () => {
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q,
        maybeSingle: async () => ({ data: row }),
      };
      return q;
    },
  }),
}));

const { taskOwner } = await import("./job");

beforeEach(() => { row = null; });

describe("taskOwner", () => {
  it("returns the engagement and role from the row", async () => {
    row = { engagement_id: "e1", role_code: "pmo-analyst" };
    expect(await taskOwner("t1")).toEqual({ engagementId: "e1", roleCode: "pmo-analyst" });
  });

  it("returns null for a task that does not exist", async () => {
    expect(await taskOwner("nope")).toBeNull();
  });
});
