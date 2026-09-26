import { describe, expect, it, vi } from "vitest";

// Two engineers can hold `role_code: "engineer"` — `holdersOn`'s own doc comment says so, and the
// schema backs it (the unique index on `(org_id, role)` is scoped to `engagement_id is null`, the
// ORG default only; two engagement-level holders of one role are unconstrained). What used to
// collapse that down to one name — `resolveActor`'s `.find()`, `rolesOnEngagement`'s "first writer
// wins" — is what these tests are about: `resolveActor` now takes an explicit `holderId` to say
// WHICH of several holders is acting, and `rolesOnEngagement` now returns all of them for the
// switcher to offer.

vi.mock("server-only", () => ({}));

const ORG = { id: "org-1" };
const ENGAGEMENT = { org_id: "org-1" };
const ROLE_ROWS = [
  { code: "engineer", label: "Engineer", tier: "practitioner", scope: "mine",
    workstream_code: "Engineering", agent: "engineer", capabilities: [], engagement_id: null },
];
const MEMBER_ROWS = [
  { id: "m-alice", role: "engineer", name: "Alice", engagement_id: "e1", ord: 0 },
  { id: "m-bob", role: "engineer", name: "Bob", engagement_id: "e1", ord: 1 },
  // A different role's holder — used to prove a `holderId` cannot cross roles.
  { id: "m-carol", role: "designer", name: "Carol", engagement_id: "e1", ord: 2 },
];

vi.mock("../supabase", () => ({
  must: (what: string, result: { data: unknown; error: { message: string } | null }) => {
    if (result.error) throw new Error(`${what}: ${result.error.message}`);
    return result.data;
  },
  supabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        order: () => chain,
        maybeSingle: async () => {
          if (table === "org") return { data: ORG, error: null };
          if (table === "engagement") return { data: ENGAGEMENT, error: null };
          return { data: null, error: null };
        },
        then: (res: (v: { data: unknown; error: null }) => unknown) => {
          if (table === "role") return res({ data: ROLE_ROWS, error: null });
          if (table === "member") return res({ data: MEMBER_ROWS, error: null });
          return res({ data: [], error: null });
        },
      };
      return chain;
    },
  }),
}));

const { resolveActor, rolesOnEngagement } = await import("./actor");

describe("resolveActor", () => {
  it("falls back to the first holder when no holderId is given — unchanged from before this existed", async () => {
    const actor = await resolveActor("e1", "engineer");
    expect(actor?.holder).toBe("Alice");
    expect(actor?.holderId).toBe("m-alice");
  });

  it("resolves the SPECIFIC holder named, when it holds this role", async () => {
    const actor = await resolveActor("e1", "engineer", "m-bob");
    expect(actor?.holder).toBe("Bob");
    expect(actor?.holderId).toBe("m-bob");
  });

  it("falls back to the first holder when the given id belongs to a DIFFERENT role", async () => {
    // Carol holds `designer`, not `engineer` — a holderId must not let someone claim to be
    // acting as a role they do not hold.
    const actor = await resolveActor("e1", "engineer", "m-carol");
    expect(actor?.holder).toBe("Alice");
    expect(actor?.holderId).toBe("m-alice");
  });

  it("falls back to the first holder when the given id does not exist at all", async () => {
    const actor = await resolveActor("e1", "engineer", "m-nobody");
    expect(actor?.holder).toBe("Alice");
  });
});

describe("rolesOnEngagement", () => {
  it("returns EVERY holder of a role, not just the first", async () => {
    const roles = await rolesOnEngagement("e1");
    const engineer = roles.find((r) => r.code === "engineer");
    expect(engineer?.holders.map((h) => h.name)).toEqual(["Alice", "Bob"]);
    // The single-holder field stays the FIRST, for every caller that only ever wanted one.
    expect(engineer?.holder).toBe("Alice");
  });
});
