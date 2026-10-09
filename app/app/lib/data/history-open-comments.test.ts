import { describe, expect, it, beforeEach, vi } from "vitest";

// `history` says, per closed task, how many comments are still open on what it filed — so a drafter
// can find the closed work a reviewer has since commented on. The count has to be right across
// versions, ignore what is not a top-level open comment, and be NULL (never zero) when it could not
// be read.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let failTable: string | null = null;

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let rows = tables[table] ?? [];
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        is: (c: string, v: unknown) => { rows = rows.filter((r) => (r[c] ?? null) === v); return q; },
        in: (c: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
        order: () => q,
        then: (res: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) =>
          res(table === failTable ? { data: null, error: { message: "boom" } } : { data: rows, error: null }),
      };
      return q;
    },
  }),
}));

const { history } = await import("./history");
const ACTOR = { orgId: "o", engagementId: "e1", roleCode: "designer", scope: "mine", workstreamCode: null } as never;

const comment = (id: string, section: string, over: Row = {}): Row => ({
  id, document_section_id: section, parent_id: null, status: "open", ...over,
});

beforeEach(() => {
  failTable = null;
  tables = {
    work_task: [
      { id: "t1", title: "Research", role_code: "designer", state: "closed", engagement_id: "e1", closed_at: "2026-10-01", workflow_run: null },
      { id: "t2", title: "Nothing filed", role_code: "designer", state: "closed", engagement_id: "e1", closed_at: "2026-10-02", workflow_run: null },
    ],
    measurement: [],
    turn: [],
    document_version: [
      { id: "v1", document_id: "d1", version: "1.0", created_by_task_id: "t1", external_url: null, document: { path: "research" } },
      { id: "v2", document_id: "d1", version: "2.0", created_by_task_id: null, external_url: null, document: { path: "research" } },
      { id: "vx", document_id: "dx", version: "1.0", created_by_task_id: "other", external_url: null, document: { path: "else" } },
    ],
    document_section: [
      { id: "s1", document_version_id: "v1" },
      { id: "s2", document_version_id: "v2" },
      { id: "sx", document_version_id: "vx" },
    ],
    document_comment: [],
  };
});

describe("history — open comments on what a task filed", () => {
  it("counts open top-level comments across EVERY version of the document", async () => {
    tables.document_comment = [comment("c1", "s1"), comment("c2", "s2")];

    const [t1, t2] = await history(ACTOR);

    expect(t1).toMatchObject({ id: "t1", openComments: 2 });
    expect(t2).toMatchObject({ id: "t2", openComments: 0 });
  });

  it("ignores resolved comments, replies, and comments on other tasks' documents", async () => {
    tables.document_comment = [
      comment("c1", "s1", { status: "resolved" }),
      comment("r1", "s1", { parent_id: "c1" }),
      comment("cx", "sx"),
    ];

    const jobs = await history(ACTOR);

    expect(jobs.find((j) => j.id === "t1")?.openComments).toBe(0);
  });

  it("is null — not zero — when the comments could not be read", async () => {
    tables.document_comment = [comment("c1", "s1")];
    failTable = "document_comment";

    const jobs = await history(ACTOR);

    expect(jobs.every((j) => j.openComments === null)).toBe(true);
  });

  it("is null when the task's own versions could not be read — an error is not 'nothing filed'", async () => {
    tables.document_comment = [comment("c1", "s1")];
    failTable = "document_version";
    expect((await history(ACTOR)).every((j) => j.openComments === null)).toBe(true);
  });

  it("is null when the versions could not be read either", async () => {
    failTable = "document_section";
    expect((await history(ACTOR)).every((j) => j.openComments === null)).toBe(true);
  });
});
