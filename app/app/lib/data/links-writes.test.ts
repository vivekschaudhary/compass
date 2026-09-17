import { describe, expect, it, vi, beforeEach } from "vitest";

// Every human→agent input reads its links before it writes.
//
// Three paths carry a person's words to an agent — answering its questions, a note on the task, and
// a send-back — and none is specific to a role. Each is asserted on what reached the DATABASE: the
// document filed, the turn the agent will replay, and, when a link does not open, that nothing was
// written at all.
//
// The real `links.ts` runs; only `fetch` and Supabase are stubbed.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async (e: unknown) => { emitted.push(e as Emitted); }, emitRefusal: async () => {} }));
vi.mock("./tracker", () => ({ mirrorState: async () => ({}), moveFailed: () => false }));
vi.mock("./materialise", () => ({ materialiseFrom: async () => null }));
vi.mock("../docstore", () => ({ probeDocs: async () => ({}) }));
vi.mock("../agent/context", () => ({ subjectOfRun: async () => null }));
vi.mock("../jira", () => ({}));
vi.mock("./sprint", () => ({ sprintJql: () => "", sprintNoOf: () => null }));

type Emitted = { verb: string; payload: Record<string, unknown> };
const emitted: Emitted[] = [];

/** Every write, by table. */
const writes: { table: string; op: string; row: Record<string, unknown> }[] = [];
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
let openQuestions: Record<string, unknown>[] = [];

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => ({
          data: table === "work_task" ? { id: "t1", state: "hitl" } : table === "engagement" ? { org_id: "org-1" } : null,
        }),
        then: (res: (v: { data: unknown[] }) => unknown) =>
          res({ data: table === "question" ? openQuestions : table === "turn" ? [{ ord: 3 }] : [] }),
        insert: async (row: Record<string, unknown>) => { writes.push({ table, op: "insert", row }); return { error: null }; },
        upsert: async (row: Record<string, unknown>) => { writes.push({ table, op: "upsert", row }); return { error: null }; },
        update: (row: Record<string, unknown>) => {
          writes.push({ table, op: "update", row });
          const u: Record<string, unknown> = { eq: () => u, then: (res: (v: { error: null }) => unknown) => res({ error: null }) };
          return u;
        },
      };
      return chain;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => { rpcs.push({ fn, args }); return { data: "v1", error: null }; },
  }),
}));

const { recordAnswers, addNote } = await import("./job");
const { reject } = await import("./gates");

// Deliberately NOT the delivery manager: nothing here may depend on which role is answering.
const ACTOR = { orgId: "org-1", engagementId: "e1", roleCode: "staff-engineer", holder: "Renita Shah" } as never;

const SOW_LINK = "https://docs.google.com/document/d/1SrsePw-a3t9sPPXUHOlC5EwNfzDsYX6j6xsf0s-yn3g";
const SOW_MD = "**STATEMENT OF WORK**\n\n| Field | Detail |\n| :-- | :-- |\n| Contractor | Kindtree |";

function stubFetch(pages: Record<string, { status?: number; type?: string; body?: string }>) {
  vi.stubGlobal("fetch", (async (input: string | URL | Request) => {
    const url = String(input);
    const p = pages[url] ?? { status: 404, type: "text/html", body: "" };
    const res = new Response(p.body ?? "", { status: p.status ?? 200, headers: { "content-type": p.type ?? "text/plain" } });
    Object.defineProperty(res, "url", { value: url });
    return res;
  }) as typeof fetch);
}

const turns = () => writes.filter((w) => w.table === "turn" && w.op === "insert").map((w) => String(w.row.body));

beforeEach(() => {
  writes.length = 0; rpcs.length = 0; emitted.length = 0;
  openQuestions = [];
  vi.unstubAllGlobals();
});

describe("answering a question with a link", () => {
  it("files what the link SAYS at files_to — not the URL", async () => {
    stubFetch({ [`${SOW_LINK}/export?format=md`]: { type: "text/x-markdown", body: SOW_MD } });
    openQuestions = [{ id: "q1", prompt: "The SOW?", optional: false, files_to: "SOW" }];

    const r = await recordAnswers(ACTOR, "t1", { q1: SOW_LINK });

    expect(r).toEqual({ ok: true, remaining: 0 });
    const filed = rpcs.find((c) => c.fn === "file_document");
    expect(filed?.args.p_path).toBe("SOW");
    expect(filed?.args.p_sections).toEqual([{ heading: "As supplied", body: SOW_MD }]);
    // The question keeps the link as typed — that is the provenance.
    expect(writes.find((w) => w.table === "question" && w.op === "update")?.row.answer).toBe(SOW_LINK);
    // The contract is the agent's pinned input; it is not repeated in the conversation.
    expect(turns()[0]).toContain("filed them at `SOW`");
    expect(turns()[0]).not.toContain("Kindtree");
    expect(emitted.find((e) => e.verb === "document.filed")?.payload.url).toBe(`${SOW_LINK}/export?format=md`);
  });

  it("puts the linked text into the conversation when the question files nothing", async () => {
    stubFetch({ "https://example.com/standard.md": { type: "text/markdown", body: "# House standard" } });
    openQuestions = [{ id: "q1", prompt: "Which standard?", optional: false, files_to: null }];

    await recordAnswers(ACTOR, "t1", { q1: "Follow https://example.com/standard.md" });

    expect(rpcs.find((c) => c.fn === "file_document")).toBeUndefined();
    expect(turns()[0]).toContain("Follow https://example.com/standard.md");
    expect(turns()[0]).toContain('<document source="https://example.com/standard.md">\n# House standard\n</document>');
  });

  it("files a pasted answer unchanged, as before", async () => {
    stubFetch({});
    openQuestions = [{ id: "q1", prompt: "The SOW?", optional: false, files_to: "SOW" }];

    await recordAnswers(ACTOR, "t1", { q1: "STATEMENT OF WORK\nCDPH CAB Online" });

    expect(rpcs.find((c) => c.fn === "file_document")?.args.p_sections)
      .toEqual([{ heading: "As supplied", body: "STATEMENT OF WORK\nCDPH CAB Online" }]);
  });

  // The rule: a link that does not open is reported, and NOTHING is recorded.
  it("refuses with the reason and writes nothing when a link does not open", async () => {
    stubFetch({ "https://example.com/private": { status: 403, type: "text/html" } });
    openQuestions = [
      { id: "q1", prompt: "The SOW?", optional: false, files_to: "SOW" },
      { id: "q2", prompt: "Anything else?", optional: true, files_to: null },
    ];

    const r = await recordAnswers(ACTOR, "t1", { q1: "https://example.com/private" });

    expect(r).toEqual({ ok: false, error: "Couldn't read https://example.com/private: HTTP 403. Paste the text instead." });
    expect(writes, "not the answer, not the declined optional question, not the turn").toEqual([]);
    expect(rpcs).toEqual([]);
  });
});

describe("a note with a link", () => {
  it("carries the linked text into the turn the agent replays", async () => {
    stubFetch({ "https://example.com/adr": { type: "text/html", body: "<main><h2>ADR 7</h2><p>Use Postgres.</p></main>" } });

    expect(await addNote(ACTOR, "t1", "Read https://example.com/adr before drafting")).toEqual({ ok: true });

    expect(turns()[0]).toContain("Read https://example.com/adr before drafting");
    expect(turns()[0]).toContain("## ADR 7");
    // The event keeps the note as typed, not every page inlined.
    expect(emitted.find((e) => e.verb === "note.added")?.payload.body).toBe("Read https://example.com/adr before drafting");
  });

  it("refuses and writes nothing when the link does not open", async () => {
    stubFetch({ "https://example.com/down": { status: 500 } });
    const r = await addNote(ACTOR, "t1", "see https://example.com/down");
    expect(r).toEqual({ ok: false, error: "Couldn't read https://example.com/down: HTTP 500. Paste the text instead." });
    expect(writes).toEqual([]);
  });
});

describe("sending a draft back with a link", () => {
  it("gives the agent the linked standard, and the gate the short reason", async () => {
    stubFetch({ "https://example.com/naming.md": { type: "text/markdown", body: "Names are nouns." } });

    const r = await reject(ACTOR, "t1", [{ criterionId: "c1", reason: "Breaks https://example.com/naming.md" }]);

    expect(r).toEqual({ ok: true });
    expect(writes.find((w) => w.table === "measurement")?.row.detail).toBe("Rejected by Renita Shah: Breaks https://example.com/naming.md");
    expect(turns()[0]).toContain("Sent back for revision:");
    expect(turns()[0]).toContain('<document source="https://example.com/naming.md">\nNames are nouns.\n</document>');
  });

  it("refuses and writes nothing — no measurement, no state change, no turn — when the link does not open", async () => {
    stubFetch({ "https://example.com/gone": { status: 404 } });
    const r = await reject(ACTOR, "t1", [{ criterionId: "c1", reason: "See https://example.com/gone" }]);
    expect(r.ok).toBe(false);
    expect(writes).toEqual([]);
  });
});
