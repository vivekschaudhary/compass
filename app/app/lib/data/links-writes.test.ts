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
// Filing a document now publishes it too. These tests are about what a person's words put in the
// DATABASE, not about the doc store, so the projection is stubbed — and recorded, because "was it
// published at all" is the question that went unasked for months.
const publishes: string[] = [];
vi.mock("./publish", () => ({
  publishToDocs: async (_e: string, versionId: string) => {
    publishes.push(versionId);
    return { ok: true, url: "http://docs/x", id: "x" };
  },
}));
vi.mock("../agent/context", () => ({ subjectOfRun: async () => null }));
vi.mock("../jira", () => ({}));
vi.mock("./sprint", () => ({ sprintJql: () => "", sprintNoOf: () => null }));

type Emitted = { verb: string; payload: Record<string, unknown> };
const emitted: Emitted[] = [];

/** Every write, by table — `filters` are the `.eq()` calls chained after `update`, in order. */
const writes: { table: string; op: string; row: Record<string, unknown>; filters?: [string, unknown][] }[] = [];
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
let openQuestions: Record<string, unknown>[] = [];
/** Does a `document` already exist at the filed path? Decides whether a title is passed. */
let documentExists = false;

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => ({
          data:
            table === "work_task" ? { id: "t1", state: "hitl", title: "File the SOW" }
            : table === "engagement" ? { org_id: "org-1" }
            : table === "document" ? (documentExists ? { id: "d1" } : null)
            : null,
        }),
        then: (res: (v: { data: unknown[] }) => unknown) =>
          res({ data: table === "question" ? openQuestions : table === "turn" ? [{ ord: 3 }] : [] }),
        insert: async (row: Record<string, unknown>) => { writes.push({ table, op: "insert", row }); return { error: null }; },
        upsert: async (row: Record<string, unknown>) => { writes.push({ table, op: "upsert", row }); return { error: null }; },
        update: (row: Record<string, unknown>) => {
          const entry: { table: string; op: string; row: Record<string, unknown>; filters: [string, unknown][] } =
            { table, op: "update", row, filters: [] };
          writes.push(entry);
          const u: Record<string, unknown> = {
            eq: (col: string, val: unknown) => { entry.filters.push([col, val]); return u; },
            then: (res: (v: { error: null }) => unknown) => res({ error: null }),
          };
          return u;
        },
      };
      return chain;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => { rpcs.push({ fn, args }); return { data: "v1", error: null }; },
  }),
}));

const { recordAnswers, addNote, resumeForReview } = await import("./job");
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
  writes.length = 0; rpcs.length = 0; emitted.length = 0; publishes.length = 0;
  openQuestions = []; documentExists = false;
  vi.unstubAllGlobals();
});

describe("answering a question with a link", () => {
  it("files what the link SAYS at files_to — not the URL", async () => {
    stubFetch({ [`${SOW_LINK}/export?format=md`]: { type: "text/x-markdown", body: SOW_MD } });
    openQuestions = [{ id: "q1", prompt: "The SOW?", optional: false, files_to: "SOW" }];

    const r = await recordAnswers(ACTOR, "t1", { q1: SOW_LINK });

    // `filed` says WHERE the answer landed and on which page it was published. It is returned
    // because the upload path has to attach the original file to that page, and `fileAnswer` used
    // to swallow the version and the page id — so nothing downstream of an answer could act on the
    // document it had just created.
    expect(r).toEqual({
      ok: true,
      remaining: 0,
      filed: [{ questionId: "q1", path: "SOW", versionId: "v1", externalId: "x", externalUrl: "http://docs/x" }],
    });
    const filed = rpcs.find((c) => c.fn === "file_document");
    expect(filed?.args.p_path).toBe("SOW");
    expect(filed?.args.p_sections).toEqual([{ heading: "As supplied", body: SOW_MD }]);
    // The question keeps the link as typed — that is the provenance.
    expect(writes.find((w) => w.table === "question" && w.op === "update")?.row.answer).toBe(SOW_LINK);
    // The contract is the agent's pinned input; it is not repeated in the conversation.
    // Filed AND published. `fileAnswer` stored the document and stopped, so a SOW pasted by a
    // person was correctly versioned in Compass and never appeared in Confluence — `[docs-primary]`
    // says the page is the record for everyone who does not open Compass, and there was no page.
    expect(publishes).toHaveLength(1);
    // Named by the ROW. It used to be titled with the agent's question, which then became the
    // Confluence page title a client reads.
    expect(filed?.args.p_title).toBe("File the SOW");
    expect(turns()[0]).toContain("filed them at `SOW`");
    expect(turns()[0]).not.toContain("Kindtree");
    expect(emitted.find((e) => e.verb === "document.filed")?.payload.url).toBe(`${SOW_LINK}/export?format=md`);
  });

  it("keeps the existing name when the document is already there", async () => {
    // `file_document` coalesces, so a non-null title overwrites on EVERY version — a re-supply
    // would rename a page somebody had since titled properly.
    documentExists = true;
    stubFetch({ [`${SOW_LINK}/export?format=md`]: { type: "text/x-markdown", body: SOW_MD } });
    openQuestions = [{ id: "q1", prompt: "The SOW?", optional: false, files_to: "SOW" }];

    await recordAnswers(ACTOR, "t1", { q1: SOW_LINK });

    expect(rpcs.find((c) => c.fn === "file_document")?.args.p_title).toBeNull();
  });

  it("never titles a document with the question", async () => {
    stubFetch({ [`${SOW_LINK}/export?format=md`]: { type: "text/x-markdown", body: SOW_MD } });
    openQuestions = [{ id: "q1", prompt: "What's the Statement of Work? Please paste it.", optional: false, files_to: "SOW" }];

    await recordAnswers(ACTOR, "t1", { q1: SOW_LINK });

    const title = String(rpcs.find((c) => c.fn === "file_document")?.args.p_title ?? "");
    expect(title).not.toContain("Please paste");
    // …and the question is still on the record, where a question belongs.
    expect(writes.find((w) => w.table === "question" && w.op === "update")).toBeTruthy();
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

describe("resuming a hitl row for a plain chat message", () => {
  // `runAgent` refuses anything but `state: "running"`, and a plain note never moves a row there
  // on its own — that gap is exactly what left a message posted on a hitl task with no reply and
  // no trace of a run ever having been attempted (`work_task.executor` still null, `updated_at`
  // untouched). `resumeForReview` is the fix: the same transition `reject()` makes, without a
  // criterion attached.
  it("updates state to running, scoped to THIS task, THIS engagement, and ONLY from hitl", async () => {
    const r = await resumeForReview(ACTOR, "t1");

    expect(r).toEqual({ ok: true });
    const update = writes.find((w) => w.table === "work_task" && w.op === "update");
    expect(update?.row).toEqual({ state: "running" });
    // The `eq("state", "hitl")` is the safety property: it is what makes this a no-op on a closed
    // or idle row instead of a resume that should never have applied to it. Real Postgres enforces
    // it; asserted here because this mock does not simulate a WHERE clause actually filtering rows.
    expect(update?.filters).toEqual(
      expect.arrayContaining([["id", "t1"], ["engagement_id", "e1"], ["state", "hitl"]]),
    );
  });
});
