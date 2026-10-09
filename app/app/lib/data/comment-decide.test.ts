import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async (e: unknown) => { emitted.push(e as { verb: string }); } }));

const emitted: { verb: string }[] = [];
const inserts: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
type Row = Record<string, unknown>;
let rows: Row[] = [];
let inScope = true;
let updateHits = 1;

vi.mock("./comments", () => ({ sectionInScope: async () => inScope }));
vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from() {
      const filters: [string, unknown][] = [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
        is: () => q,
        maybeSingle: async () => ({ data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null }),
        insert: async (row: Row) => { inserts.push(row); return { error: null }; },
        update: (patch: Row) => {
          updates.push(patch);
          return { eq: () => ({ is: () => ({ select: async () => ({ data: Array(updateHits).fill({ id: "a1" }), error: null }) }) }) };
        },
      };
      return q;
    },
  }),
}));

const { decideAnswer } = await import("./comment-decide");
const ACTOR = { orgId: "o", engagementId: "e1", roleCode: "pm", holder: "Ada" } as never;

beforeEach(() => {
  emitted.length = 0; inserts.length = 0; updates.length = 0; inScope = true; updateHits = 1;
  rows = [
    { id: "a1", document_section_id: "s1", parent_id: "c1", stance: "change", decision: null },
    { id: "c1", status: "open" },
  ];
});

describe("decideAnswer", () => {
  it("accepts: records who and when on the answer, and writes no reply", async () => {
    expect(await decideAnswer(ACTOR, "a1", "accepted")).toEqual({ ok: true });
    expect(updates[0]).toMatchObject({ decision: "accepted", decided_by: "Ada" });
    expect(inserts).toEqual([]);
    expect(emitted).toMatchObject([{ verb: "comment.answer_accepted" }]);
  });

  it("declines: files the reason and next step as a human reply under the comment", async () => {
    const r = await decideAnswer(ACTOR, "a1", "declined", { reason: "wording is contractual", next: "keep, add a footnote" });
    expect(r).toEqual({ ok: true });
    expect(inserts[0]).toMatchObject({ parent_id: "c1", author_kind: "human", author_user_id: "Ada", quote: "" });
    expect(String(inserts[0].body)).toMatch(/wording is contractual[\s\S]*keep, add a footnote/);
    expect(updates[0]).toMatchObject({ decision: "declined" });
  });

  it("refuses a decline missing its reason or its next step, writing nothing", async () => {
    for (const note of [undefined, { reason: " ", next: "x" }, { reason: "x", next: "" }]) {
      expect((await decideAnswer(ACTOR, "a1", "declined", note)).ok).toBe(false);
    }
    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("refuses something that is not an answer, one already decided, and a resolved comment", async () => {
    rows[0].stance = null;
    expect((await decideAnswer(ACTOR, "a1", "accepted")).ok).toBe(false);
    rows[0].stance = "change"; rows[0].decision = "accepted";
    expect(await decideAnswer(ACTOR, "a1", "accepted")).toEqual({ ok: false, error: "That answer was already accepted." });
    rows[0].decision = null; rows[1].status = "resolved";
    expect(await decideAnswer(ACTOR, "a1", "accepted")).toEqual({ ok: false, error: "That comment is already resolved." });
    expect(updates).toEqual([]);
  });

  it("refuses another engagement's comment", async () => {
    inScope = false;
    expect((await decideAnswer(ACTOR, "a1", "accepted")).ok).toBe(false);
    expect(updates).toEqual([]);
  });

  it("says so when someone else decided first, rather than reporting success", async () => {
    updateHits = 0;
    expect(await decideAnswer(ACTOR, "a1", "accepted")).toEqual({ ok: false, error: "Someone else decided that answer first." });
    expect(emitted).toEqual([]);
  });
});
