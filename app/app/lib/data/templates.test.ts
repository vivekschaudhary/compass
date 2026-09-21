import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("../supabase", () => ({ supabaseAdmin: () => ({ from }) }));
vi.mock("server-only", () => ({}));

import { templateFor, templatesFor } from "./templates";

type Row = {
  name: string;
  title?: string;
  body?: string;
  org_id: string | null;
  engagement_id: string | null;
};

/** A table of rows, filtered the way PostgREST would filter it. */
function db(rows: Row[]) {
  from.mockImplementation(() => ({
    select: () => {
      const f: { col: string; val: string | null }[] = [];
      const q = {
        eq(col: string, val: string) { f.push({ col, val }); return this; },
        is(col: string, val: null) { f.push({ col, val }); return this; },
        maybeSingle: async () => {
          const hit = rows.filter((r) =>
            f.every(({ col, val }) => (r as unknown as Record<string, unknown>)[col] === val),
          );
          return { data: hit[0] ?? null };
        },
        then: (res: (v: { data: unknown }) => void) => res({ data: rows }),
      };
      return q;
    },
  }));
}

const DEFAULT: Row = { name: "sow", title: "SOW", body: "# SOW\n\n## Scope\n\nd", org_id: null, engagement_id: null };
const ORG: Row = { name: "sow", title: "SOW", body: "# SOW\n\n## Org Scope\n\no", org_id: "org1", engagement_id: null };
const ENG: Row = { name: "sow", title: "SOW", body: "# SOW\n\n## Client Scope\n\ne", org_id: null, engagement_id: "e1" };

beforeEach(() => { from.mockReset(); });

describe("templateFor — precedence", () => {
  it("falls back to the default when nothing else is defined", async () => {
    db([DEFAULT]);
    const t = await templateFor("sow", "e1", "org1");
    expect(t?.tier).toBe("default");
    expect(t?.sections.map((s) => s.heading)).toEqual(["Scope"]);
  });

  it("prefers the org row over the default", async () => {
    db([DEFAULT, ORG]);
    const t = await templateFor("sow", "e1", "org1");
    expect(t?.tier).toBe("org");
    expect(t?.sections[0].heading).toBe("Org Scope");
  });

  it("prefers the engagement row over both", async () => {
    db([DEFAULT, ORG, ENG]);
    const t = await templateFor("sow", "e1", "org1");
    expect(t?.tier).toBe("engagement");
    expect(t?.sections[0].heading).toBe("Client Scope");
  });

  it("does not take another org's row", async () => {
    db([{ ...ORG, org_id: "org2" }]);
    expect(await templateFor("sow", "e1", "org1")).toBeNull();
  });

  it("does not take another engagement's row", async () => {
    db([{ ...ENG, engagement_id: "e2" }]);
    expect(await templateFor("sow", "e1", "org1")).toBeNull();
  });

  it("returns null for a name nothing defines — the caller must halt, not free-form", async () => {
    db([DEFAULT]);
    expect(await templateFor("nonexistent", "e1", "org1")).toBeNull();
  });

  it("returns null for an empty name without querying", async () => {
    db([DEFAULT]);
    expect(await templateFor("", "e1", "org1")).toBeNull();
  });

  it("parses the resolved body into sections", async () => {
    db([DEFAULT]);
    const t = await templateFor("sow", "e1", "org1");
    expect(t?.title).toBe("SOW");
    expect(t?.body).toContain("## Scope");
  });
});

describe("templatesFor — the list", () => {
  it("shows one row per name, the most specific winning", async () => {
    db([DEFAULT, ORG, ENG, { name: "brief", title: "Brief", org_id: null, engagement_id: null }]);
    const list = await templatesFor("e1", "org1");
    expect(list.map((t) => `${t.name}:${t.tier}`)).toEqual(["brief:default", "sow:engagement"]);
  });

  it("hides rows belonging to another engagement", async () => {
    db([DEFAULT, { ...ENG, engagement_id: "e2" }]);
    const list = await templatesFor("e1", "org1");
    expect(list).toEqual([{ name: "sow", title: "SOW", tier: "default" }]);
  });
});
