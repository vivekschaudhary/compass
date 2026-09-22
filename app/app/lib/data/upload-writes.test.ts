import { describe, expect, it, vi, beforeEach } from "vitest";

// What an UPLOADED file puts in the database.
//
// The sibling of `links-writes.test.ts`, and the same question asked of a third source: a person
// answers an agent's request for a document by typing it, by giving a link, or — now — by uploading
// a file. All three end at `fileAnswer`, and what matters is that they end there with the same
// shape.
//
// The assertion that carries the most weight is the SPLIT: the contract's text goes to the
// document, and only a short reference goes to the question and the turn. Collapsing the two would
// pin a forty-page SOW as the agent's input AND replay it in the conversation, handing it the same
// contract twice — the exact thing the sole-link branch was written to avoid.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({
  emit: async (e: unknown) => { emitted.push(e as Emitted); },
  emitRefusal: async () => {},
}));
vi.mock("./tracker", () => ({ mirrorState: async () => ({}), moveFailed: () => false }));
vi.mock("./materialise", () => ({ materialiseFrom: async () => null }));
vi.mock("../docstore", () => ({ probeDocs: async () => ({}) }));
const publishes: string[] = [];
vi.mock("./publish", () => ({
  publishToDocs: async (_e: string, versionId: string) => {
    publishes.push(versionId);
    return { ok: true, url: "http://docs/page-1", id: "page-1" };
  },
}));
vi.mock("../agent/context", () => ({ subjectOfRun: async () => null }));
vi.mock("../jira", () => ({}));
vi.mock("./sprint", () => ({ sprintJql: () => "", sprintNoOf: () => null }));

type Emitted = { verb: string; payload: Record<string, unknown> };
const emitted: Emitted[] = [];
const writes: { table: string; op: string; row: Record<string, unknown> }[] = [];
const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
let openQuestions: Record<string, unknown>[] = [];

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
        maybeSingle: async () => ({
          data:
            table === "work_task" ? { id: "t1", state: "awaiting", title: "File the SOW" }
            : table === "engagement" ? { org_id: "org-1" }
            : null,
        }),
        then: (res: (v: { data: unknown[] }) => unknown) =>
          res({ data: table === "question" ? openQuestions : table === "turn" ? [{ ord: 0 }] : [] }),
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

const { recordAnswers } = await import("./job");

const ACTOR = { orgId: "org-1", engagementId: "e1", roleCode: "pmo-analyst", holder: "Joe" } as never;

/** A contract long enough that repeating it anywhere would be obvious. */
const SOW_TEXT = `STATEMENT OF WORK

| Deliverable | Due |
| --- | --- |
| Discovery report | 2026-10-31 |

${"The supplier shall deliver the platform. ".repeat(200)}`;

const REFERENCE = "Supplied `SOW.pdf` — 412 KB, 8,742 characters.";

const filedDoc = () => rpcs.find((c) => c.fn === "file_document");
const turns = () => writes.filter((w) => w.table === "turn" && w.op === "insert").map((w) => String(w.row.body));
const questionUpdate = () => writes.find((w) => w.table === "question" && w.op === "update")?.row;

beforeEach(() => {
  writes.length = 0; rpcs.length = 0; emitted.length = 0; publishes.length = 0;
  openQuestions = [{ id: "q1", prompt: "The SOW?", optional: false, files_to: "sow" }];
});

async function uploadAnswer() {
  return recordAnswers(
    ACTOR, "t1", { q1: REFERENCE },
    { q1: { filename: "SOW.pdf", bytes: 421_888, text: SOW_TEXT } },
  );
}

describe("answering a question with an uploaded file", () => {
  it("files the FILE's text at files_to, verbatim", async () => {
    await uploadAnswer();
    expect(filedDoc()?.args.p_path).toBe("sow");
    expect(filedDoc()?.args.p_sections).toEqual([{ heading: "As supplied", body: SOW_TEXT }]);
  });

  it("keeps the table the file carried", async () => {
    // The reason an upload exists rather than telling people to paste.
    await uploadAnswer();
    const body = (filedDoc()?.args.p_sections as { body: string }[])[0].body;
    expect(body).toContain("| Discovery report | 2026-10-31 |");
  });

  it("publishes it, like every other supplied answer", async () => {
    await uploadAnswer();
    expect(publishes).toEqual(["v1"]);
  });

  // THE SPLIT. The document is the contract; the record is a reference to it.
  it("records the reference on the question, not the contract", async () => {
    await uploadAnswer();
    expect(questionUpdate()?.answer).toBe(REFERENCE);
    expect(String(questionUpdate()?.answer)).not.toContain("The supplier shall deliver");
  });

  it("says in the conversation what was filed and where, without repeating it", async () => {
    await uploadAnswer();
    const turn = turns().join("\n");
    expect(turn).toContain("SOW.pdf");
    expect(turn).toContain("`sow`");
    expect(turn).toMatch(/Read [\d,]+ characters/);
    // The agent gets this document as a pinned input. In the turn as well, it would arrive twice.
    expect(turn).not.toContain("The supplier shall deliver");
  });

  it("reports where it filed, so the original can be attached to that page", async () => {
    const r = await uploadAnswer();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.filed).toEqual([
      { questionId: "q1", path: "sow", versionId: "v1", externalId: "page-1", externalUrl: "http://docs/page-1" },
    ]);
  });

  it("closes the question and releases the task", async () => {
    const r = await uploadAnswer();
    expect(r.ok && r.remaining).toBe(0);
    expect(questionUpdate()?.state).toBe("answered");
    expect(writes.some((w) => w.table === "work_task" && w.row.state === "running")).toBe(true);
  });

  // A typed answer and a linked answer must not change shape because this argument exists.
  it("leaves an ordinary typed answer exactly as it was", async () => {
    const r = await recordAnswers(ACTOR, "t1", { q1: "There is no SOW; this is time and materials." });
    expect(r.ok).toBe(true);
    const body = (filedDoc()?.args.p_sections as { body: string }[])[0].body;
    expect(body).toBe("There is no SOW; this is time and materials.");
    expect(turns().join("\n")).toContain("There is no SOW");
  });
});
