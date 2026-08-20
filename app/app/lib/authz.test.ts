import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const from = vi.fn();
vi.mock("./supabase", () => ({ supabaseAdmin: () => (from.getMockImplementation() ? { from } : null) }));

import { resolveActor, can, rolesFor, isAdvisoryOnly, authMode, permissionRefusal } from "./authz";

const MODE = process.env.COMPASS_AUTH_MODE;
beforeEach(() => { from.mockReset(); delete process.env.COMPASS_AUTH_MODE; });
afterEach(() => { if (MODE) process.env.COMPASS_AUTH_MODE = MODE; else delete process.env.COMPASS_AUTH_MODE; });

describe("auth mode", () => {
  it("defaults to demo so a fresh clone runs with no identity provider", () => {
    expect(authMode()).toBe("demo");
    expect(isAdvisoryOnly()).toBe(true);
  });

  it("reports entra as enforced once configured", () => {
    process.env.COMPASS_AUTH_MODE = "entra";
    expect(authMode()).toBe("entra");
    // Surfaces that let someone change how every engagement runs check this before claiming a
    // control exists. Getting it backwards would mean telling a user they are protected.
    expect(isAdvisoryOnly()).toBe(false);
  });

  it("treats any unknown value as demo rather than silently enforcing nothing", () => {
    process.env.COMPASS_AUTH_MODE = "sso-maybe";
    expect(authMode()).toBe("demo");
  });
});

describe("demo mode — the role picker is the actor", () => {
  it("takes roles from the passed role, with no user id", async () => {
    const a = await resolveActor({ role: "pmo-analyst" });
    expect(a.mode).toBe("demo");
    expect(a.roles).toEqual(["pmo-analyst"]);
    // Null on purpose: inventing an id here would write a fictional `updated_by` and produce an
    // audit trail that reads as real.
    expect(a.userId).toBeNull();
  });

  it("gives no capabilities when no role is selected", async () => {
    const a = await resolveActor({});
    expect(can(a, "edit-engagement-specs")).toBe(false);
    expect(can(a, "edit-org-defaults")).toBe(false);
  });

  it("never consults the grants table", async () => {
    from.mockImplementation(() => { throw new Error("must not query user_role in demo mode"); });
    await expect(resolveActor({ role: "pm" })).resolves.toBeTruthy();
  });
});

describe("capabilities", () => {
  const actor = (roles: string[]) => ({ userId: null, roles, mode: "demo" as const });

  it("only the PMO analyst edits org defaults", () => {
    expect(can(actor(["pmo-analyst"]), "edit-org-defaults")).toBe(true);
    // Everyone else, INCLUDING the delivery manager who may edit their own engagement.
    for (const r of ["delivery-manager", "product-manager", "engineer"]) {
      expect(can(actor([r]), "edit-org-defaults"), r).toBe(false);
    }
  });

  it("a delivery manager edits their own engagement but not the firm's defaults", () => {
    const dm = actor(["delivery-manager"]);
    expect(can(dm, "edit-engagement-specs")).toBe(true);
    expect(can(dm, "edit-org-defaults")).toBe(false);
  });

  it("the PMO analyst subsumes engagement editing", () => {
    expect(can(actor(["pmo-analyst"]), "edit-engagement-specs")).toBe(true);
  });

  it("a delivery role alone grants nothing administrative", () => {
    for (const r of ["product-manager", "engineer", "designer", "researcher"]) {
      expect(can(actor([r]), "edit-engagement-specs"), r).toBe(false);
      expect(can(actor([r]), "manage-users"), r).toBe(false);
    }
  });

  it("holding several roles takes the union — a small team wears many hats", () => {
    const both = actor(["engineer", "pmo-analyst"]);
    expect(can(both, "edit-org-defaults")).toBe(true);
    expect(can(both, "manage-users")).toBe(true);
  });

  it("names what is missing rather than just refusing", () => {
    expect(permissionRefusal("edit-org-defaults")).toContain("pmo-analyst");
  });
});

describe("entra mode — roles come from grants", () => {
  beforeEach(() => { process.env.COMPASS_AUTH_MODE = "entra"; });

  function grants(rows: { role: string; engagement_id: string | null }[]) {
    from.mockImplementation(() => ({ select: () => ({ eq: async () => ({ data: rows }) }) }));
  }

  it("reads the user's granted roles", async () => {
    grants([{ role: "pmo-analyst", engagement_id: null }]);
    const a = await resolveActor({ actor: "user-1" });
    expect(a.mode).toBe("entra");
    expect(a.userId).toBe("user-1");
    expect(can(a, "edit-org-defaults")).toBe(true);
  });

  it("ignores the role picker entirely — a dropdown cannot grant access once auth is real", async () => {
    grants([]);
    const a = await resolveActor({ actor: "user-1", role: "pmo-analyst" });
    expect(a.roles).toEqual([]);
    expect(can(a, "edit-org-defaults")).toBe(false);
  });

  it("gives an unauthenticated caller nothing", async () => {
    grants([{ role: "pmo-analyst", engagement_id: null }]);
    const a = await resolveActor({});
    expect(a.userId).toBeNull();
    expect(a.roles).toEqual([]);
  });

  it("applies an engagement-scoped grant only on that engagement", async () => {
    grants([{ role: "delivery-manager", engagement_id: "e1" }]);
    expect(await rolesFor("u1", "e1")).toEqual(["delivery-manager"]);
    expect(await rolesFor("u1", "e2")).toEqual([]);
    expect(await rolesFor("u1")).toEqual([]);          // no engagement context → scoped grant doesn't apply
  });

  it("applies an org-wide grant everywhere", async () => {
    grants([{ role: "pmo-analyst", engagement_id: null }]);
    expect(await rolesFor("u1", "e1")).toEqual(["pmo-analyst"]);
    expect(await rolesFor("u1")).toEqual(["pmo-analyst"]);
  });
});
