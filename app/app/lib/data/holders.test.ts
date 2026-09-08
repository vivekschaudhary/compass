import { describe, expect, it, vi, beforeEach } from "vitest";

// Two-tier roster resolution: this engagement's people, with the org's defaults behind them.
//
// The case that motivated it is the PMO Analyst — it owns `setup`, the phase that brings an
// engagement into being, so somebody holds it before any engagement exists. 056 made that
// expressible; this is the resolution rule on top of it.

type Row = Record<string, unknown>;

vi.mock("server-only", () => ({}));

const state: { members: Row[]; orgId: string | null } = { members: [], orgId: "org-1" };

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      if (table === "engagement") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: state.orgId ? { org_id: state.orgId } : null }),
        };
        return chain;
      }
      const f: Row = {};
      let orEngagement: string | null = null;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => { f[c] = v; return chain; },
        or: (expr: string) => {
          orEngagement = /engagement_id\.eq\.([^,]+)/.exec(expr)?.[1] ?? null;
          return chain;
        },
        order: async () => ({
          data: state.members.filter((m) => {
            if (f.org_id !== undefined && m.org_id !== f.org_id) return false;
            if (orEngagement !== null
                && !(m.engagement_id === orEngagement || m.engagement_id == null)) return false;
            return true;
          }),
        }),
      };
      return chain;
    },
  }),
}));

const { holdersOn } = await import("./actor");

const member = (role: string, name: string, engagement: string | null): Row =>
  ({ id: `${name}-${role}`, org_id: "org-1", engagement_id: engagement, role, name });

beforeEach(() => {
  state.orgId = "org-1";
  state.members = [];
});

describe("holdersOn", () => {
  it("uses the org's default when this engagement has staffed nobody to the role", async () => {
    state.members = [member("pmo-analyst", "Renita", null)];
    const h = await holdersOn("e1");
    expect(h.map((x) => [x.role, x.name, x.engagementId]))
      .toEqual([["pmo-analyst", "Renita", null]]);
  });

  it("prefers this engagement's person over the org's default", async () => {
    state.members = [
      member("delivery-manager", "Org DM", null),
      member("delivery-manager", "Engagement DM", "e1"),
    ];
    const h = await holdersOn("e1");
    expect(h.map((x) => x.name)).toEqual(["Engagement DM"]);
  });

  /**
   * The subtle one, and the reason precedence is per role rather than per query.
   *
   * "Any engagement row at all suppresses the org defaults" is the easy implementation and it is
   * wrong: staffing a single engineer would silently drop the PMO Analyst from the roster, and
   * nothing would report it — the role would simply read as vacant.
   */
  it("suppresses the org default only for the role that was overridden", async () => {
    state.members = [
      member("pmo-analyst", "Renita", null),
      member("delivery-manager", "Org DM", null),
      member("delivery-manager", "Engagement DM", "e1"),
      member("engineer", "Jay", "e1"),
    ];
    const byRole = new Map((await holdersOn("e1")).map((h) => [h.role, h.name]));
    expect(byRole.get("pmo-analyst")).toBe("Renita");        // org default survives
    expect(byRole.get("delivery-manager")).toBe("Engagement DM");
    expect(byRole.get("engineer")).toBe("Jay");
  });

  it("returns every holder when a role has more than one", async () => {
    // Two engineers on one engagement is ordinary. `resolveActor` used to `.maybeSingle()` here and
    // threw on the second, which is why `tracker.ts` avoided it entirely.
    state.members = [member("engineer", "Jay", "e1"), member("engineer", "Sam", "e1")];
    expect((await holdersOn("e1")).map((h) => h.name)).toEqual(["Jay", "Sam"]);
  });

  it("does not leak another engagement's roster", async () => {
    state.members = [member("engineer", "Jay", "e1"), member("engineer", "Other", "e2")];
    expect((await holdersOn("e1")).map((h) => h.name)).toEqual(["Jay"]);
  });

  it("is empty, not a crash, when the engagement names no org", async () => {
    // Pre-055 rows, or an id that does not exist. An empty roster is a real answer; throwing here
    // would take down every caller that merely wanted to know who is around.
    state.orgId = null;
    state.members = [member("pmo-analyst", "Renita", null)];
    expect(await holdersOn("e1")).toEqual([]);
  });
});
