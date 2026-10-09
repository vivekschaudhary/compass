import { describe, expect, it, beforeEach, vi } from "vitest";

// A document's comments are read across ALL its versions: a comment outlives the edit that prompted
// it, and is matched onto the current version by section heading.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async () => {} }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const filters: [string, unknown][] = [];
      let inCol: [string, unknown[]] | null = null;
      const rows = () => (tables[table] ?? []).filter((r) =>
        filters.every(([c, v]) => r[c] === v) && (!inCol || inCol[1].includes(r[inCol[0]])));
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
        in: (c: string, v: unknown[]) => { inCol = [c, v]; return q; },
        order: () => q,
        maybeSingle: async () => ({ data: rows()[0] ?? null }),
        then: (res: (v: { data: Row[] }) => unknown) => res({ data: rows() }),
      };
      return q;
    },
  }),
}));

const { commentsForDocument } = await import("./comments");
const ACTOR = { orgId: "o", engagementId: "e1", roleCode: "pm", holder: "Ada" } as never;

const row = (over: Row): Row => ({
  id: "c", document_section_id: "s-v1-scope", parent_id: null, quote: "q", body: "b", author_kind: "human",
  author_role_code: "pm", author_user_id: "Priya", status: "open", stance: null, overlaps_with: [],
  decision: null, decided_by: null, created_at: "2026-10-09T00:00:00Z", ...over,
});

beforeEach(() => {
  tables = {
    document: [{ id: "d1", engagement_id: "e1", path: "02/sow", current_version_id: "v2" }],
    document_version: [{ id: "v1", document_id: "d1", version: "1.0" }, { id: "v2", document_id: "d1", version: "2.0" }],
    document_section: [
      { id: "s-v1-scope", heading: "Scope", document_version_id: "v1" },
      { id: "s-v1-gone", heading: "Removed", document_version_id: "v1" },
      { id: "s-v2-scope", heading: "Scope", document_version_id: "v2" },
    ],
    document_comment: [],
  };
});

describe("commentsForDocument", () => {
  it("carries a comment from an earlier version onto the current version's section by heading", async () => {
    tables.document_comment = [row({ id: "c1" })];

    const [c] = await commentsForDocument(ACTOR, "02/sow");

    expect(c).toMatchObject({ id: "c1", heading: "Scope", version: "1.0", sectionId: "s-v2-scope" });
  });

  it("keeps a comment whose section no longer exists, with nowhere to highlight it", async () => {
    tables.document_comment = [row({ id: "c1", document_section_id: "s-v1-gone" })];

    const [c] = await commentsForDocument(ACTOR, "02/sow");

    expect(c).toMatchObject({ id: "c1", heading: "Removed", sectionId: null });
  });

  it("nests replies under their comment and never lists one at the top level", async () => {
    tables.document_comment = [
      row({ id: "c1" }),
      row({ id: "r1", parent_id: "c1", quote: "", author_kind: "agent", stance: "change", body: "Tighten it." }),
    ];

    const top = await commentsForDocument(ACTOR, "02/sow");

    expect(top.map((c) => c.id)).toEqual(["c1"]);
    expect(top[0].replies).toMatchObject([{ id: "r1", parentId: "c1", stance: "change", authorKind: "agent" }]);
  });

  it("carries an answer's decision and overlaps through", async () => {
    tables.document_comment = [
      row({ id: "c1" }),
      row({ id: "r1", parent_id: "c1", stance: "no_change", overlaps_with: ["c2"], decision: "declined", decided_by: "Ada" }),
    ];

    const [c] = await commentsForDocument(ACTOR, "02/sow");

    expect(c.replies[0]).toMatchObject({ stance: "no_change", overlapsWith: ["c2"], decision: "declined", decidedBy: "Ada" });
  });

  it("returns nothing for another engagement's document, a missing path, or a document with no versions", async () => {
    tables.document_comment = [row({ id: "c1" })];
    expect(await commentsForDocument({ ...(ACTOR as object), engagementId: "other" } as never, "02/sow")).toEqual([]);
    expect(await commentsForDocument(ACTOR, null)).toEqual([]);
    expect(await commentsForDocument(ACTOR, "no/such")).toEqual([]);
    tables.document_version = [];
    expect(await commentsForDocument(ACTOR, "02/sow")).toEqual([]);
  });
});
