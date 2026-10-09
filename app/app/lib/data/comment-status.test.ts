import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async (e: unknown) => { emitted.push(e as { verb: string }); } }));

const emitted: { verb: string }[] = [];
const updates: Record<string, unknown>[] = [];
type Row = Record<string, unknown>;
let rows: Row[] = [];
let inScope = true;
let updateHits = 1;
let rpcResult: { data: unknown; error: { message: string } | null } = { data: 0, error: null };

vi.mock("./comments", () => ({ sectionInScope: async () => inScope }));
vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    rpc: async () => rpcResult,
    from() {
      const filters: [string, unknown][] = [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q; },
        maybeSingle: async () => ({ data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null }),
        update: (patch: Row) => {
          updates.push(patch);
          return { eq: () => ({ eq: () => ({ select: async () => ({ data: Array(updateHits).fill({ id: "c1" }), error: null }) }) }) };
        },
      };
      return q;
    },
  }),
}));

const { resolveComment, reopenComment, openCommentsBlocking } = await import("./comment-status");
const ACTOR = { orgId: "o", engagementId: "e1", roleCode: "pm", holder: "Ada" } as never;

beforeEach(() => {
  emitted.length = 0; updates.length = 0; inScope = true; updateHits = 1; rpcResult = { data: 0, error: null };
  rows = [{ id: "c1", document_section_id: "s1", parent_id: null, status: "open" }, { id: "t1", engagement_id: "e1" }];
});

describe("resolveComment / reopenComment", () => {
  it("resolves an open comment, recording who and when", async () => {
    expect(await resolveComment(ACTOR, "c1")).toEqual({ ok: true });
    expect(updates[0]).toMatchObject({ status: "resolved", resolved_by: "Ada" });
    expect(updates[0].resolved_at).toBeTruthy();
    expect(emitted).toMatchObject([{ verb: "comment.resolved" }]);
  });

  it("reopens a resolved comment and clears who resolved it", async () => {
    rows[0].status = "resolved";
    expect(await reopenComment(ACTOR, "c1")).toEqual({ ok: true });
    expect(updates[0]).toEqual({ status: "open", resolved_by: null, resolved_at: null });
    expect(emitted).toMatchObject([{ verb: "comment.reopened" }]);
  });

  it("refuses a reply, a comment already in that state, another engagement's, and a missing one", async () => {
    rows[0].parent_id = "c0";
    expect((await resolveComment(ACTOR, "c1")).ok).toBe(false);
    rows[0].parent_id = null;
    rows[0].status = "resolved";
    expect(await resolveComment(ACTOR, "c1")).toEqual({ ok: false, error: "That comment is already resolved." });
    rows[0].status = "open";
    expect(await reopenComment(ACTOR, "c1")).toEqual({ ok: false, error: "That comment is already open." });
    inScope = false;
    expect((await resolveComment(ACTOR, "c1")).ok).toBe(false);
    expect((await resolveComment(ACTOR, "nope")).ok).toBe(false);
  });

  it("says so when someone changed it first, and emits nothing", async () => {
    updateHits = 0;
    emitted.length = 0;
    expect(await resolveComment(ACTOR, "c1")).toEqual({ ok: false, error: "Someone else changed that comment first." });
    expect(emitted).toEqual([]);
  });
});

describe("openCommentsBlocking", () => {
  it("returns the database's count", async () => {
    rpcResult = { data: 3, error: null };
    expect(await openCommentsBlocking(ACTOR, "t1")).toBe(3);
  });

  it("returns zero only when the database said zero", async () => {
    expect(await openCommentsBlocking(ACTOR, "t1")).toBe(0);
  });

  it("returns null — never zero — when it could not ask", async () => {
    rpcResult = { data: null, error: { message: "boom" } };
    expect(await openCommentsBlocking(ACTOR, "t1")).toBeNull();
    rpcResult = { data: "3", error: null };
    expect(await openCommentsBlocking(ACTOR, "t1")).toBeNull();
    rpcResult = { data: 2, error: null };
    expect(await openCommentsBlocking(ACTOR, "someone-elses-task")).toBeNull();
  });
});
