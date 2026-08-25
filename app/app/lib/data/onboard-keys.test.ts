import { describe, expect, it, vi, beforeEach } from "vitest";

// What is under test is narrow and load-bearing: the value that reaches the `engagement` ROW.
//
// A check that normalises while the insert stores the raw value is worse than neither — it passes
// intake and then 404s every Jira call, three screens away from its cause. So this asserts on the
// insert payload rather than on the checker's return.

vi.mock("server-only", () => ({}));
vi.mock("../doctree", () => ({ readShippedDocTree: () => [] }));
vi.mock("./publish", () => ({ publishToDocs: async () => ({ ok: true, url: "", id: "" }) }));
vi.mock("./events", () => ({ emit: async () => {} }));

// The keys are valid whatever their casing; canonical spelling comes back from the provider.
vi.mock("../docstore", () => ({
  checkSpaceKey: async () => null,
  checkProjectKey: async () => null,
  canonicalSpaceKey: async (_e: unknown, given: string) =>
    given.trim().toLowerCase() === "test1" ? "Test1" : null,
  canonicalProjectKey: (given: string | null | undefined) => {
    const k = given?.trim().toUpperCase();
    return k ? k : null;
  },
}));

/** Captures what each table was handed, so the assertion is on the row, not on a return value. */
const inserted: Record<string, Record<string, unknown>[]> = {};

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: "org-1" } }) }),
        }),
        insert: async (row: Record<string, unknown>) => {
          (inserted[table] ??= []).push(row);
          return { error: null };
        },
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

const { createEngagement } = await import("./onboard");

beforeEach(() => { for (const k of Object.keys(inserted)) delete inserted[k]; });

const INPUT = {
  name: "health provider", client: "DHCS", sowText: "",
  deliveryManager: "John", confluenceSpace: "test1", jiraProject: "test1",
};

describe("createEngagement stores provider-canonical keys", () => {
  // The exact values that were refused before this change.
  it("upper-cases the Jira project key", async () => {
    await createEngagement(INPUT);
    expect(inserted.engagement?.[0]?.jira_project).toBe("TEST1");
  });

  it("stores the space key as Confluence spells it", async () => {
    await createEngagement(INPUT);
    expect(inserted.engagement?.[0]?.confluence_space).toBe("Test1");
  });

  // "Could not check" must not silently change what someone entered — canonicalSpaceKey returns
  // null there, and the given value has to stand rather than becoming null in the row.
  it("keeps the entered space key when it cannot be resolved", async () => {
    await createEngagement({ ...INPUT, confluenceSpace: "Unresolvable" });
    expect(inserted.engagement?.[0]?.confluence_space).toBe("Unresolvable");
  });

  it("stores null, not an empty string, when no project is given", async () => {
    await createEngagement({ ...INPUT, jiraProject: "" });
    expect(inserted.engagement?.[0]?.jira_project).toBeNull();
  });

  // The engagement is unusable without someone on it, and this is the guard that produced a 404'd
  // queue when it was missing.
  it("refuses without a delivery manager, inserting nothing", async () => {
    const r = await createEngagement({ ...INPUT, deliveryManager: "  " });
    expect(r.engagementId).toBe("");
    expect(inserted.engagement).toBeUndefined();
  });
});
