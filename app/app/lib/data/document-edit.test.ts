import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async () => {} }));

type Section = { id: string; heading: string; body: string; ord: number; edited: boolean };

const state: {
  sections: Section[];
  rpc: { name: string; args: Record<string, unknown> }[];
  updates: { table: string; patch: Record<string, unknown>; headings?: string[] }[];
  /** The calling task's own `renders` — overridden per test to exercise the review-row refusal. */
  renders: string | null;
} = { sections: [], rpc: [], updates: [], renders: null };

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const q = {
        _patch: null as Record<string, unknown> | null,
        _in: undefined as string[] | undefined,
        select: () => q,
        eq: () => q,
        order: () => q,
        in(_col: string, vals: string[]) { this._in = vals; return this; },
        update(patch: Record<string, unknown>) {
          this._patch = patch;
          state.updates.push({ table, patch, headings: this._in });
          return this;
        },
        maybeSingle: async () => {
          if (q._patch) return { data: null, error: null };
          if (table === "document") {
            return { data: { id: "d1", title: "SOW", current_version_id: "v1", owner_role_code: "pmo-analyst" } };
          }
          if (table === "engagement") return { data: { org_id: "org1" } };
          if (table === "document_version") return { data: { version: "2.0" } };
          // The calling task's own renders — "doc" (an authoring row) unless a test overrides it,
          // so the new "a review row cannot edit" guard passes through for every existing case.
          if (table === "work_task") return { data: { workflow_step_id: "s1" } };
          if (table === "workflow_step") return { data: { renders: state.renders ?? "doc" } };
          return { data: null };
        },
        then: (res: (v: { data: unknown; error: null }) => void) =>
          res({ data: table === "document_section" ? state.sections : [], error: null }),
      };
      // `update(...).eq(...).in(...)` resolves without maybeSingle; make the chain thenable.
      return Object.assign(q, {
        update(patch: Record<string, unknown>) {
          state.updates.push({ table, patch, headings: q._in });
          const done = {
            eq: () => done,
            in: (_c: string, vals: string[]) => {
              state.updates[state.updates.length - 1].headings = vals;
              return done;
            },
            then: (res: (v: { error: null }) => void) => res({ error: null }),
          };
          return done;
        },
      });
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpc.push({ name, args });
      return { data: "v2", error: null };
    },
  }),
}));

const { editSection } = await import("./document-edit");

const actor = { engagementId: "e1", orgId: "org1", roleCode: "researcher", holder: "Ada", scope: "mine" };

beforeEach(() => {
  state.rpc = [];
  state.updates = [];
  state.renders = null;
  state.sections = [
    { id: "s1", heading: "Purpose", body: "old purpose", ord: 0, edited: false },
    { id: "s2", heading: "Scope", body: "old scope", ord: 1, edited: true },
  ];
});

describe("editSection", () => {
  it("files a NEW version through file_document, never an in-place update", async () => {
    const r = await editSection(actor as never, "t1", "02-scope/sow", "s1", "new purpose");
    expect(r.ok).toBe(true);

    const call = state.rpc.find((c) => c.name === "file_document");
    expect(call).toBeTruthy();
    // No `document_section` body was patched directly — the version is the unit of change.
    expect(state.updates.some((u) => u.table === "document_section" && "body" in u.patch)).toBe(false);
  });

  it("sends every section, with only the edited one changed", async () => {
    await editSection(actor as never, "t1", "02-scope/sow", "s1", "new purpose");
    const sent = state.rpc[0].args.p_sections as { heading: string; body: string }[];
    expect(sent).toEqual([
      { heading: "Purpose", body: "new purpose" },
      { heading: "Scope", body: "old scope" },
    ]);
  });

  it("records the person as the author", async () => {
    await editSection(actor as never, "t1", "02-scope/sow", "s1", "new purpose");
    const attr = state.updates.find((u) => u.table === "document_version");
    expect(attr?.patch).toEqual({ author_kind: "human", authored_by: "Ada" });
  });

  it("carries `edited` forward, so an older rewrite does not lose its mark", async () => {
    // Sections are created fresh per version. Marking only the section just edited would let a
    // section rewritten two versions ago start reading as agent-authored again, and its citations
    // would claim to describe text a person replaced.
    await editSection(actor as never, "t1", "02-scope/sow", "s1", "new purpose");
    const flag = state.updates.find((u) => u.table === "document_section");
    expect(flag?.headings?.sort()).toEqual(["Purpose", "Scope"]);
  });

  it("refuses a section id that is not in the current version", async () => {
    // Someone else filed a new version since this page rendered. Guessing which new section was
    // meant is how one person's edit silently erases another's.
    const r = await editSection(actor as never, "t1", "02-scope/sow", "gone", "text");
    expect(r.ok).toBe(false);
    expect(state.rpc).toHaveLength(0);
  });

  it("refuses an empty body — that is a deletion, which this path must not be able to do", async () => {
    const r = await editSection(actor as never, "t1", "02-scope/sow", "s1", "   ");
    expect(r.ok).toBe(false);
    expect(state.rpc).toHaveLength(0);
  });

  it("refuses a no-op rather than filing an identical version", async () => {
    const r = await editSection(actor as never, "t1", "02-scope/sow", "s1", "old purpose");
    expect(r.ok).toBe(false);
    expect(state.rpc).toHaveLength(0);
  });

  it("cannot add, remove or reorder sections — the floor is safe by construction", async () => {
    await editSection(actor as never, "t1", "02-scope/sow", "s2", "rewritten scope");
    const sent = state.rpc[0].args.p_sections as { heading: string }[];
    expect(sent.map((s) => s.heading)).toEqual(["Purpose", "Scope"]);
  });

  // The write path a review row must never reach — enforced here, not only by `DraftPanel` hiding
  // its own Edit button, which is a suggestion a direct call to the action would skip past.
  it("refuses when the calling task reviews the document rather than authoring it", async () => {
    state.renders = "doc-review";
    const r = await editSection(actor as never, "t1", "02-scope/sow", "s1", "new purpose");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/reviews the document/);
    expect(state.rpc).toHaveLength(0);
  });

  it("refuses the same way for a code-review row", async () => {
    state.renders = "code-review";
    const r = await editSection(actor as never, "t1", "02-scope/sow", "s1", "new purpose");
    expect(r.ok).toBe(false);
    expect(state.rpc).toHaveLength(0);
  });
});
