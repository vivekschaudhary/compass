import { describe, expect, it, beforeEach, vi } from "vitest";

// A comment is anchored to a `document_section`, not a task — see the migration header on
// `document_comment` for why. These tests are about the two things that have to hold regardless:
// the section's document must actually be in the actor's engagement (the same boundary every
// document read already enforces), and a quote or a body that is blank refuses before anything is
// written, rather than filing a comment nobody could act on.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async (e: unknown) => { emitted.push(e as Emitted); } }));

type Emitted = { verb: string; payload: Record<string, unknown> };
const emitted: Emitted[] = [];

/** Every write, by table. */
const writes: { table: string; row: Record<string, unknown> }[] = [];

// Keyed fixtures rather than one row — `sectionInScope` walks section → version → document, and
// the test for "not in your engagement" needs a document whose `engagement_id` genuinely differs.
let sections: Record<string, { document_version_id: string }> = {};
let versions: Record<string, { document_id: string }> = {};
let documents: Record<string, { id: string; engagement_id: string }> = {};

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          (chain as Record<string, unknown> & { _eq?: [string, unknown][] })._eq =
            [...(((chain as Record<string, unknown> & { _eq?: [string, unknown][] })._eq) ?? []), [col, val]];
          return chain;
        },
        in: () => chain,
        order: () => chain,
        maybeSingle: async () => {
          const eqs = ((chain as Record<string, unknown> & { _eq?: [string, unknown][] })._eq) ?? [];
          const id = eqs.find(([c]) => c === "id")?.[1] as string | undefined;
          if (table === "document_section") return { data: id ? sections[id] ?? null : null };
          if (table === "document_version") return { data: id ? versions[id] ?? null : null };
          if (table === "document") {
            const doc = id ? documents[id] : undefined;
            const eng = eqs.find(([c]) => c === "engagement_id")?.[1];
            return { data: doc && doc.engagement_id === eng ? doc : null };
          }
          return { data: null };
        },
        insert: (row: Record<string, unknown>) => {
          writes.push({ table, row });
          return {
            select: () => ({
              single: async () => ({
                data: { id: "c1", ...row, status: "open", created_at: "2026-09-25T00:00:00Z" },
                error: null,
              }),
            }),
          };
        },
        then: (res: (v: { data: unknown[] }) => unknown) => res({ data: [] }),
      };
      return chain;
    },
  }),
}));

const { addComment, commentsForSections } = await import("./comments");

const ACTOR = { orgId: "org-1", engagementId: "e1", roleCode: "product-manager", holder: "Priya Shah" } as never;

beforeEach(() => {
  writes.length = 0; emitted.length = 0;
  sections = { s1: { document_version_id: "v1" } };
  versions = { v1: { document_id: "d1" } };
  documents = { d1: { id: "d1", engagement_id: "e1" } };
});

describe("addComment", () => {
  it("writes the comment against the section, as this actor", async () => {
    const r = await addComment(ACTOR, "s1", "the milestone table", "M3 date looks wrong");

    expect(r.ok).toBe(true);
    const write = writes.find((w) => w.table === "document_comment");
    expect(write?.row).toEqual({
      document_section_id: "s1",
      quote: "the milestone table",
      body: "M3 date looks wrong",
      author_kind: "human",
      author_role_code: "product-manager",
      author_user_id: "Priya Shah",
    });
    expect(emitted[0]).toMatchObject({ verb: "comment.added", payload: { quote: "the milestone table" } });
  });

  it("refuses when the section's document is in a DIFFERENT engagement", async () => {
    documents.d1.engagement_id = "some-other-engagement";

    const r = await addComment(ACTOR, "s1", "quote", "body");

    expect(r).toEqual({ ok: false, error: "That section is not in your engagement." });
    expect(writes).toEqual([]);
  });

  it("refuses a blank quote or a blank body without writing anything", async () => {
    expect(await addComment(ACTOR, "s1", "   ", "body")).toEqual({ ok: false, error: "Select some text to comment on." });
    expect(await addComment(ACTOR, "s1", "quote", "  ")).toEqual({ ok: false, error: "Say what the comment is." });
    expect(writes).toEqual([]);
  });

  it("refuses a section id that resolves to nothing", async () => {
    const r = await addComment(ACTOR, "no-such-section", "quote", "body");
    expect(r).toEqual({ ok: false, error: "That section is not in your engagement." });
    expect(writes).toEqual([]);
  });
});

describe("commentsForSections", () => {
  it("returns an empty map rather than a query for zero sections", async () => {
    expect(await commentsForSections([])).toEqual(new Map());
  });
});
