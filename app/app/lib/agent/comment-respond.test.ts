import { describe, expect, it, beforeEach, vi } from "vitest";

// The respond run's contract: it answers EVERY open comment or writes nothing, it never touches the
// task, and a comment with a live answer is not asked about again. The model and the database are
// faked; what is under test is what this module does with what they say.

vi.mock("server-only", () => ({}));
vi.mock("../data/events", () => ({ emit: async (e: unknown) => { emitted.push(e as { verb: string }); } }));

const emitted: { verb: string }[] = [];
const inserted: Record<string, unknown>[][] = [];
const taskWrites: unknown[] = [];

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
/** Overridden per test to simulate someone filing a new version while the model runs. */
let versionAfterRun: string | null = null;
let ranModel = false;
let modelReply: { stopReason?: string | null; toolCall: { name: string; input: unknown } | null; text?: string } = { toolCall: null };
/** When set, each dispatch takes the next reply from here instead of `modelReply`. */
let modelReplies: (typeof modelReply)[] = [];
let dispatched: { system: string; content: string }[] = [];

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
        maybeSingle: async () => {
          if (table === "document" && ranModel && versionAfterRun !== null) {
            return { data: { ...rows()[0], current_version_id: versionAfterRun } };
          }
          return { data: rows()[0] ?? null };
        },
        insert: async (batch: Row[]) => { inserted.push(batch); return { error: null }; },
        update: () => { taskWrites.push(table); return q; },
        then: (res: (v: { data: Row[] }) => unknown) => res({ data: rows() }),
      };
      return q;
    },
  }),
}));

let ctx: Record<string, unknown> | null = null;
vi.mock("./context", () => ({
  buildContext: async () => ctx,
  inputPrompt: () => "<document path=\"01/brief\">brief</document>",
  loadDocumentText: async () => ({ path: "02/sow", title: "SOW", version: "1.0", body: "## Scope\nBuild it." }),
}));
vi.mock("./hosts/select", () => ({
  MODEL: "m",
  selectHost: () => ({
    name: "fake",
    dispatch: async (req: { system: string; messages: { content: string }[] }) => {
      ranModel = true;
      dispatched.push({ system: req.system, content: req.messages[0].content });
      return { stopReason: "end_turn", refusalExplanation: null, text: "", usage: null, ...(modelReplies.shift() ?? modelReply) };
    },
  }),
}));

const { respondToComments, validateAnswers, commentsPrompt } = await import("./comment-respond");

const ACTOR = { orgId: "o", engagementId: "e1", roleCode: "pm", holder: "Ada" } as never;

const comment = (id: string, over: Row = {}): Row => ({
  id, document_section_id: "s1", parent_id: null, quote: "Build it", body: `comment ${id}`,
  author_kind: "human", author_user_id: "Priya", author_role_code: "reviewer", status: "open",
  stance: null, decision: null, created_at: `2026-10-09T00:00:0${id.slice(-1)}Z`, ...over,
});

const answers = (...ids: string[]) => ({
  toolCall: {
    name: "comment_answers",
    input: { answers: ids.map((id) => ({ ref: id, stance: "change", answer: `fix ${id}`, overlaps_with: [] })) },
  },
});

beforeEach(() => {
  emitted.length = 0; inserted.length = 0; taskWrites.length = 0; dispatched = [];
  ranModel = false; versionAfterRun = null; modelReply = { toolCall: null }; modelReplies = [];
  ctx = { renders: "doc", produces: "02/sow", agentFile: "# PM agent", roleCode: "pm" };
  tables = {
    document: [{ id: "d1", engagement_id: "e1", path: "02/sow", current_version_id: "v2" }],
    document_version: [{ id: "v1", document_id: "d1" }, { id: "v2", document_id: "d1" }],
    document_section: [{ id: "s1", document_version_id: "v1", heading: "Scope" }, { id: "s2", document_version_id: "v2", heading: "Scope" }],
    document_comment: [comment("c1"), comment("c2")],
  };
});

describe("respondToComments", () => {
  it("answers every open comment in one write, as the drafting role, and never touches the task", async () => {
    modelReply = answers("c1", "c2");

    const r = await respondToComments(ACTOR, "t1");

    expect(r).toEqual({ ok: true, answered: 2 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject([
      { parent_id: "c1", author_kind: "agent", author_role_code: "pm", stance: "change", body: "fix c1", quote: "", document_section_id: "s1" },
      { parent_id: "c2", author_kind: "agent", stance: "change", body: "fix c2" },
    ]);
    expect(taskWrites).toEqual([]);
    expect(emitted).toMatchObject([{ verb: "comment.answered" }]);
  });

  it("puts every comment in one prompt, under the role's own markdown", async () => {
    modelReply = answers("c1", "c2");
    await respondToComments(ACTOR, "t1");

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].system).toBe("# PM agent");
    expect(dispatched[0].content).toContain("`c1`");
    expect(dispatched[0].content).toContain("`c2`");
    expect(dispatched[0].content).toContain("Build it.");
  });

  it("writes NOTHING when the model leaves a comment unanswered", async () => {
    modelReply = answers("c1");

    const r = await respondToComments(ACTOR, "t1");

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/left `c2` unanswered/);
    expect(inserted).toEqual([]);
    expect(emitted).toEqual([]);
  });

  it("refuses when the document was revised while the model ran", async () => {
    modelReply = answers("c1", "c2");
    versionAfterRun = "v3";

    const r = await respondToComments(ACTOR, "t1");

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/revised while/);
    expect(inserted).toEqual([]);
  });

  it("skips a comment whose answer is still undecided, or accepted and not yet applied", async () => {
    tables.document_comment = [
      comment("c1"), comment("c2"), comment("c3"),
      comment("r1", { parent_id: "c1", stance: "change", decision: null, body: "waiting" }),
      comment("r2", { parent_id: "c2", stance: "change", decision: "accepted", body: "accepted" }),
    ];
    modelReply = answers("c3");

    const r = await respondToComments(ACTOR, "t1");

    expect(r).toEqual({ ok: true, answered: 1 });
    expect(dispatched[0].content).not.toContain("`c1`");
    expect(dispatched[0].content).not.toContain("`c2`");
  });

  it("asks again about a DECLINED answer, and shows the model why it was declined", async () => {
    tables.document_comment = [
      comment("c1"),
      comment("r1", { parent_id: "c1", stance: "change", decision: "declined", author_kind: "agent", body: "reword it" }),
      comment("r2", { parent_id: "c1", author_kind: "human", author_user_id: "Ada", body: "wording is contractual" }),
    ];
    modelReply = answers("c1");

    await respondToComments(ACTOR, "t1");

    expect(dispatched[0].content).toContain("DECLINED");
    expect(dispatched[0].content).toContain("wording is contractual");
  });

  it("asks ONCE more when an answer ran over the limit, saying which and by how much", async () => {
    const long = (id: string) => ({ ref: id, stance: "change", answer: "x".repeat(460), overlaps_with: [] });
    modelReplies = [
      { toolCall: { name: "comment_answers", input: { answers: [long("c1"), { ref: "c2", stance: "change", answer: "fine", overlaps_with: [] }] } } },
      answers("c1", "c2"),
    ];

    const r = await respondToComments(ACTOR, "t1");

    expect(r).toEqual({ ok: true, answered: 2 });
    expect(dispatched).toHaveLength(2);
    expect(dispatched[0].content).not.toContain("previous attempt");
    expect(dispatched[1].content).toMatch(/previous attempt was refused[\s\S]*`c1` was 460[\s\S]*at most 400/);
    expect(inserted).toHaveLength(1);
  });

  it("refuses, writing nothing, when it is STILL over the limit on the second try", async () => {
    const long = { toolCall: { name: "comment_answers", input: { answers: ["c1", "c2"].map((id) => ({ ref: id, stance: "change", answer: "x".repeat(500), overlaps_with: [] })) } } };
    modelReplies = [long, long];

    const r = await respondToComments(ACTOR, "t1");

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/in 500 characters \(limit 400\)/);
    expect(dispatched).toHaveLength(2);
    expect(inserted).toEqual([]);
  });

  it("does NOT retry a problem saying it again cannot fix", async () => {
    modelReplies = [answers("c1"), answers("c1", "c2")]; // c2 left unanswered — not a length problem

    const r = await respondToComments(ACTOR, "t1");

    expect(r.ok).toBe(false);
    expect(dispatched).toHaveLength(1);
  });

  it("ignores resolved comments, and says so when nothing is left", async () => {
    tables.document_comment = [comment("c1", { status: "resolved" })];

    const r = await respondToComments(ACTOR, "t1");

    expect(r).toEqual({ ok: false, error: "There are no open comments waiting for an answer." });
    expect(ranModel).toBe(false);
  });

  it("reads comments left on an OLDER version of the document", async () => {
    tables.document_comment = [comment("c1", { document_section_id: "s1" })]; // s1 belongs to v1; v2 is current
    modelReply = answers("c1");

    expect(await respondToComments(ACTOR, "t1")).toEqual({ ok: true, answered: 1 });
  });

  it("refuses a review row, a row with no document, and a role with no agent file — before any model call", async () => {
    ctx = { ...ctx, renders: "doc-review" };
    expect((await respondToComments(ACTOR, "t1")).ok).toBe(false);
    ctx = { ...ctx, renders: "doc", produces: null };
    expect((await respondToComments(ACTOR, "t1")).ok).toBe(false);
    ctx = { renders: "doc", produces: "02/sow", agentFile: null, roleCode: "pm" };
    expect((await respondToComments(ACTOR, "t1")).ok).toBe(false);
    ctx = null;
    expect(await respondToComments(ACTOR, "t1")).toEqual({ ok: false, error: "That task is not in your engagement." });
    expect(ranModel).toBe(false);
  });

  it("reports a model that refused, or that skipped the tool, instead of writing anything", async () => {
    modelReply = { stopReason: "refusal", toolCall: null };
    expect((await respondToComments(ACTOR, "t1")).ok).toBe(false);
    modelReply = { toolCall: null, text: "Sure, here you go" };
    const r = await respondToComments(ACTOR, "t1");
    expect(r.ok === false && r.error).toMatch(/without using `comment_answers`/);
    expect(inserted).toEqual([]);
  });
});

describe("validateAnswers", () => {
  const good = { ref: "c1", stance: "change", answer: "Tighten it.", overlaps_with: [] };

  it("accepts a complete, well-formed set", () => {
    expect(validateAnswers([good], ["c1"])).toMatchObject({ ok: true });
  });

  it("names EVERY problem at once, not just the first", () => {
    const r = validateAnswers([{ ...good, ref: "zz" }, { ...good, ref: "c1", answer: "  " }], ["c1", "c2"]);
    expect(r.ok === false && r.error).toMatch(/not asked about.*empty answer.*left `c2` unanswered/);
  });

  it("reports an over-long answer as over-long ONLY — it did answer, so it is not also 'unanswered'", () => {
    const r = validateAnswers([{ ...good, answer: "x".repeat(460) }], ["c1"]);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/in 460 characters \(limit 400\)/);
    expect(r.ok === false && r.error).not.toMatch(/unanswered/);
    expect(r.ok === false && r.retry).toEqual([{ id: "c1", length: 460 }]);
  });

  it("offers a retry ONLY when length is the sole problem", () => {
    const r = validateAnswers([{ ...good, answer: "x".repeat(460) }, { ...good, ref: "zz" }], ["c1"]);
    expect(r.ok === false && r.retry).toBeUndefined();
  });

  it.each([
    ["a bad stance", { ...good, stance: "maybe" }],
    ["an over-long answer", { ...good, answer: "x".repeat(401) }],
    ["an overlap pointing at itself", { ...good, overlaps_with: ["c1"] }],
    ["an overlap pointing at nothing", { ...good, overlaps_with: ["nope"] }],
  ])("refuses %s", (_n, entry) => {
    expect(validateAnswers([entry], ["c1"]).ok).toBe(false);
  });

  it("refuses a duplicate and a non-array", () => {
    expect(validateAnswers([good, good], ["c1"]).ok).toBe(false);
    expect(validateAnswers(undefined, ["c1"]).ok).toBe(false);
  });

  it("keeps overlaps between comments in the batch", () => {
    const r = validateAnswers(
      [{ ...good, overlaps_with: ["c2"] }, { ...good, ref: "c2" }], ["c1", "c2"]);
    expect(r.ok && r.answers[0].overlapsWith).toEqual(["c2"]);
  });
});

describe("commentsPrompt", () => {
  it("says the run is not a rewrite, and tells the model to read the comments together", () => {
    const p = commentsPrompt("## Scope\nx", []);
    expect(p).toMatch(/NOT rewriting/);
    expect(p).toMatch(/overlaps_with/);
  });
});
