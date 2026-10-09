import { describe, expect, it, beforeEach, vi } from "vitest";

// The revise step's contract: it applies only what a person accepted, changes only the sections it
// names, resolves only what it actually addressed, and does nothing at all when anything is off.

vi.mock("server-only", () => ({}));
vi.mock("../data/events", () => ({ emit: async (e: unknown) => { emitted.push(e as { verb: string }); } }));

const emitted: { verb: string }[] = [];
const rpcCalls: Record<string, unknown>[] = [];
const resolvedIds: string[] = [];
const flagged: string[][] = [];
const published: string[] = [];
let publishResult: { ok: true; url: string; id: string } | { ok: false; error: string } = { ok: true, url: "u", id: "i" };
let dispatched: { system: string; content: string }[] = [];
let modelReply: { stopReason?: string | null; toolCall: { name: string; input: unknown } | null; text?: string } = { toolCall: null };
let currentAfterRun = "v1";
let ranModel = false;
let priorPublished = false;
let sections: { heading: string; body: string; ord: number; edited: boolean }[] = [];
import type { Thread } from "./comment-respond";
let threads: Thread[] = [];
let ctx: Record<string, unknown> | null = null;

vi.mock("../data/publish", () => ({
  publishToDocs: async (_e: string, v: string) => { published.push(v); return publishResult; },
}));
vi.mock("./comment-respond", () => ({ loadThreads: async () => threads }));
vi.mock("./context", () => ({ buildContext: async () => ctx, inputPrompt: () => "<inputs/>" }));
vi.mock("./hosts/select", () => ({
  MODEL: "m",
  selectHost: () => ({
    name: "fake",
    dispatch: async (req: { system: string; messages: { content: string }[] }) => {
      ranModel = true;
      dispatched.push({ system: req.system, content: req.messages[0].content });
      return { stopReason: "end_turn", refusalExplanation: null, text: "", usage: null, ...modelReply };
    },
  }),
}));

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => { rpcCalls.push({ name, ...args }); return { data: "v2id", error: null }; },
    from(table: string) {
      let patch: Record<string, unknown> | null = null;
      let eqId: string | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { if (c === "id") eqId = v as string; return q; },
        order: () => q,
        in: (_c: string, v: string[]) => {
          if (table === "document_section" && patch) flagged.push(v);
          return Promise.resolve({ error: null });
        },
        update: (p: Record<string, unknown>) => { patch = p; if (table === "document_comment") return { eq: (_c: string, id: string) => ({ eq: async () => { resolvedIds.push(id); return { error: null }; } }) }; return q; },
        maybeSingle: async () => {
          if (table === "document") return { data: { id: "d1", title: "SOW", owner_role_code: "pm", current_version_id: ranModel ? currentAfterRun : "v1" } };
          if (table === "document_version") return { data: { version: "2.0", published_to_docs_at: priorPublished ? "2026-10-01" : null } };
          if (table === "engagement") return { data: { org_id: "org" } };
          void eqId;
          return { data: null };
        },
        then: (res: (v: { data: unknown }) => unknown) =>
          res({ data: table === "document_section" ? sections : [] }),
      };
      return q;
    },
  }),
}));

const { applyAcceptedAnswers, validateRevision, revisionPrompt } = await import("./comment-revise");
const ACTOR = { orgId: "o", engagementId: "e1", roleCode: "pm", holder: "Ada" } as never;

const thread = (id: string, stance: "change" | "no_change", over: Partial<Thread> = {}): Thread => ({
  id, sectionId: "s1", heading: "Scope", quote: "Build it", body: `comment ${id}`, author: "Priya", status: "open",
  replies: [{ id: `a-${id}`, author: "pm", kind: "agent", body: `answer ${id}`, stance, decision: "accepted", decidedBy: "Ada" }],
  ...over,
});

const revision = (sec: { heading: string; body: string }[], addressed: string[]) =>
  ({ toolCall: { name: "revised_sections", input: { sections: sec, addressed } } });

beforeEach(() => {
  emitted.length = 0; rpcCalls.length = 0; resolvedIds.length = 0; flagged.length = 0; published.length = 0; dispatched = [];
  publishResult = { ok: true, url: "u", id: "i" };
  modelReply = { toolCall: null }; currentAfterRun = "v1"; ranModel = false; priorPublished = false;
  ctx = { renders: "doc", produces: "02/sow", agentFile: "# PM agent", roleCode: "pm", destination: "docs" };
  sections = [
    { heading: "Scope", body: "Build it.", ord: 0, edited: false },
    { heading: "Budget", body: "Cheap.", ord: 1, edited: true },
  ];
  threads = [thread("c1", "change")];
});

describe("applyAcceptedAnswers", () => {
  it("files a new version changing ONLY the named section, and resolves the comment it settled", async () => {
    modelReply = revision([{ heading: "Scope", body: "Build it well." }], ["c1"]);

    const r = await applyAcceptedAnswers(ACTOR, "t1");

    expect(r).toEqual({ ok: true, version: "2.0", resolved: 1 });
    expect(rpcCalls[0]).toMatchObject({
      name: "file_document", p_path: "02/sow",
      p_sections: [{ heading: "Scope", body: "Build it well." }, { heading: "Budget", body: "Cheap." }],
    });
    expect(resolvedIds).toEqual(["c1"]);
    expect(emitted).toMatchObject([{ verb: "document.filed" }]);
  });

  it("carries a person's earlier `edited` mark onto the new version", async () => {
    modelReply = revision([{ heading: "Scope", body: "Build it well." }], ["c1"]);
    await applyAcceptedAnswers(ACTOR, "t1");
    expect(flagged).toEqual([["Budget"]]);
  });

  it("sends the model only accepted answers, with the whole document", async () => {
    threads = [thread("c1", "change"), { ...thread("c2", "change"), replies: [{ id: "a", author: "pm", kind: "agent", body: "nope", stance: "change", decision: "declined", decidedBy: "Ada" }] }];
    modelReply = revision([{ heading: "Scope", body: "Build it well." }], ["c1"]);

    await applyAcceptedAnswers(ACTOR, "t1");

    expect(dispatched[0].content).toContain("`c1`");
    expect(dispatched[0].content).not.toContain("`c2`");
    expect(dispatched[0].content).toContain("## Budget");
  });

  it("resolves an accepted NO CHANGE without a model call or a new version", async () => {
    threads = [thread("c1", "no_change")];

    const r = await applyAcceptedAnswers(ACTOR, "t1");

    expect(r).toEqual({ ok: true, version: null, resolved: 1 });
    expect(ranModel).toBe(false);
    expect(rpcCalls).toEqual([]);
    expect(resolvedIds).toEqual(["c1"]);
  });

  it("leaves a comment OPEN when the model does not claim to have addressed it", async () => {
    threads = [thread("c1", "change"), thread("c2", "change")];
    modelReply = revision([{ heading: "Scope", body: "Build it well." }], ["c1"]);

    const r = await applyAcceptedAnswers(ACTOR, "t1");

    expect(r).toMatchObject({ ok: true, resolved: 1, note: expect.stringMatching(/1 accepted comment\(s\) were not addressed/) });
    expect(resolvedIds).toEqual(["c1"]);
  });

  it("files nothing and resolves nothing when the revision is invalid", async () => {
    modelReply = revision([{ heading: "Nowhere", body: "x" }], ["c1"]);

    const r = await applyAcceptedAnswers(ACTOR, "t1");

    expect(r.ok).toBe(false);
    expect(rpcCalls).toEqual([]);
    expect(resolvedIds).toEqual([]);
  });

  it("refuses when the document moved while the model ran", async () => {
    modelReply = revision([{ heading: "Scope", body: "Build it well." }], ["c1"]);
    currentAfterRun = "v9";

    const r = await applyAcceptedAnswers(ACTOR, "t1");

    expect(r.ok === false && r.error).toMatch(/revised while/);
    expect(rpcCalls).toEqual([]);
    expect(resolvedIds).toEqual([]);
  });

  it("republishes when the replaced version was published, and says so loudly when that fails", async () => {
    priorPublished = true;
    modelReply = revision([{ heading: "Scope", body: "Build it well." }], ["c1"]);
    expect(await applyAcceptedAnswers(ACTOR, "t1")).toMatchObject({ ok: true });
    expect(published).toEqual(["v2id"]);

    publishResult = { ok: false, error: "no space" };
    published.length = 0;
    const r = await applyAcceptedAnswers(ACTOR, "t1");
    expect(r.ok === false && r.error).toMatch(/Filed v2\.0.*publishing it to the doc store failed: no space/);
  });

  it("does not publish an unpublished draft", async () => {
    modelReply = revision([{ heading: "Scope", body: "Build it well." }], ["c1"]);
    await applyAcceptedAnswers(ACTOR, "t1");
    expect(published).toEqual([]);
  });

  it("ignores resolved comments and declined/undecided answers, and says when nothing is waiting", async () => {
    threads = [
      thread("c1", "change", { status: "resolved" }),
      { ...thread("c2", "change"), replies: [{ id: "a", author: "pm", kind: "agent", body: "x", stance: "change", decision: null, decidedBy: null }] },
    ];
    expect(await applyAcceptedAnswers(ACTOR, "t1")).toEqual({ ok: false, error: "No accepted answers are waiting to be applied." });
    expect(ranModel).toBe(false);
  });

  it("refuses a review row, a backlog document, a role with no agent file, and a missing task", async () => {
    ctx = { ...ctx, renders: "doc-review" };
    expect((await applyAcceptedAnswers(ACTOR, "t1")).ok).toBe(false);
    ctx = { ...ctx, renders: "doc", destination: "tickets" };
    expect((await applyAcceptedAnswers(ACTOR, "t1")).ok).toBe(false);
    ctx = { ...ctx, destination: "docs", agentFile: null };
    expect((await applyAcceptedAnswers(ACTOR, "t1")).ok).toBe(false);
    ctx = null;
    expect((await applyAcceptedAnswers(ACTOR, "t1")).ok).toBe(false);
    expect(ranModel).toBe(false);
  });

  it("reports a model that refused or skipped the tool, writing nothing", async () => {
    modelReply = { stopReason: "refusal", toolCall: null };
    expect((await applyAcceptedAnswers(ACTOR, "t1")).ok).toBe(false);
    modelReply = { toolCall: null, text: "done" };
    const r = await applyAcceptedAnswers(ACTOR, "t1");
    expect(r.ok === false && r.error).toMatch(/without using `revised_sections`/);
    expect(rpcCalls).toEqual([]);
  });
});

describe("validateRevision", () => {
  const current = [{ heading: "Scope", body: "a" }, { heading: "Budget", body: "b" }];

  it("accepts a changed section that settles an accepted comment", () => {
    const r = validateRevision({ sections: [{ heading: "Scope", body: "A" }], addressed: ["c1"] }, current, ["c1"]);
    expect(r).toMatchObject({ ok: true, addressed: ["c1"] });
  });

  it.each([
    ["a section that does not exist", { sections: [{ heading: "Nope", body: "x" }], addressed: ["c1"] }],
    ["an emptied section", { sections: [{ heading: "Scope", body: " " }], addressed: ["c1"] }],
    ["an unchanged section", { sections: [{ heading: "Scope", body: "a" }], addressed: ["c1"] }],
    ["a duplicated section", { sections: [{ heading: "Scope", body: "x" }, { heading: "Scope", body: "y" }], addressed: ["c1"] }],
    ["a comment that was never accepted", { sections: [{ heading: "Scope", body: "x" }], addressed: ["zz"] }],
    ["edits that settle no comment", { sections: [{ heading: "Scope", body: "x" }], addressed: [] }],
    ["no changes at all", { sections: [], addressed: [] }],
    ["no sections list", { addressed: ["c1"] }],
    ["no addressed list", { sections: [{ heading: "Scope", body: "x" }] }],
  ])("refuses %s", (_n, raw) => {
    expect(validateRevision(raw, current, ["c1"]).ok).toBe(false);
  });
});

describe("revisionPrompt", () => {
  it("carries each accepted answer and tells the model to return only what it changes", () => {
    const p = revisionPrompt("## Scope\na", [{ thread: thread("c1", "change"), answer: thread("c1", "change").replies[0] }]);
    expect(p).toContain("accepted answer: answer c1");
    expect(p).toMatch(/Return only the sections you change/);
  });
});
