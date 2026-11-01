import { describe, expect, it, vi, beforeEach } from "vitest";

// The designer replies "attached". What reaches the DATABASE is the HTML read from the ticket, filed
// at the design path; and when the ticket has none, the person is told and nothing is written.
// The real `design-attachments.ts` runs; only Jira and Supabase are stubbed.

vi.mock("server-only", () => ({}));
vi.mock("./events", () => ({ emit: async () => {}, emitRefusal: async () => {} }));
vi.mock("./tracker", () => ({ mirrorState: async () => ({}), moveFailed: () => false }));
vi.mock("./materialise", () => ({ materialiseFrom: async () => null }));
vi.mock("../docstore", () => ({ probeDocs: async () => ({}) }));
vi.mock("./publish", () => ({ publishToDocs: async () => ({ ok: true, url: "http://docs/x", id: "x" }) }));
vi.mock("./run-subject", () => ({ subjectOfRun: async () => null }));
vi.mock("./sprint", () => ({ sprintJql: () => "", sprintNoOf: () => null }));

let attachments: { id: string; filename: string; mimeType: string; size: number; created: string }[] = [];
const jiraCalls: string[] = [];
vi.mock("../jira", () => ({
  jiraForEngagement: async () => ({ baseUrl: "x", email: "e", token: "t", project: "CT" }),
  issueAttachments: async () => { jiraCalls.push("list"); return attachments; },
  attachmentBytes: async () => new TextEncoder().encode("<h1>Sign in</h1>").buffer,
}));

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
            table === "work_task" ? { id: "t1", state: "hitl", title: "File the epic's design", ticket_key: "CT-300" }
            : table === "engagement" ? { org_id: "org-1" } : null,
        }),
        then: (res: (v: { data: unknown[] }) => unknown) =>
          res({ data: table === "question" ? openQuestions : table === "turn" ? [{ ord: 3 }] : [] }),
        insert: async (row: Record<string, unknown>) => { writes.push({ table, op: "insert", row }); return { error: null }; },
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
const ACTOR = { orgId: "org-1", engagementId: "e1", roleCode: "designer", holder: "Dee" } as never;
const HTML_ATT = { id: "1", filename: "signin.html", mimeType: "text/html", size: 100, created: "2026-10-30T10:00:00.000+0000" };
const turns = () => writes.filter((w) => w.table === "turn" && w.op === "insert").map((w) => String(w.row.body));

beforeEach(() => {
  writes.length = 0; rpcs.length = 0; jiraCalls.length = 0; attachments = [];
  openQuestions = [{ id: "q1", prompt: "Attach the prototype", optional: false, files_to: "design/CT-288" }];
});

describe("answering 'attached' on a design row", () => {
  it("files the html read from the ticket at the design path", async () => {
    attachments = [HTML_ATT];
    const r = await recordAnswers(ACTOR, "t1", { q1: "attached" });
    expect(r.ok).toBe(true);
    const filed = rpcs.find((c) => c.fn === "file_document");
    expect(filed?.args.p_path).toBe("design/CT-288");
    const body = String((filed?.args.p_sections as { body: string }[])[0].body);
    expect(body).toContain("### signin.html");
    expect(body).toContain("<h1>Sign in</h1>");
    // The record keeps what the person typed; the conversation says where the file came from.
    expect(writes.find((w) => w.table === "question" && w.op === "update")?.row.answer).toBe("attached");
    expect(turns()[0]).toContain("from CT-300");
    expect(turns()[0]).not.toContain("<h1>Sign in</h1>");
  });

  it("with no html on the ticket, refuses and writes NOTHING", async () => {
    attachments = [{ ...HTML_ATT, filename: "shot.png", mimeType: "image/png" }];
    const r = await recordAnswers(ACTOR, "t1", { q1: "attached" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("no `.html` attachment");
    expect(writes).toEqual([]);
    expect(rpcs).toEqual([]);
  });

  it("HTML pasted into the answer is filed as typed, and Jira is not asked", async () => {
    const r = await recordAnswers(ACTOR, "t1", { q1: "<h1>Pasted</h1>" });
    expect(r.ok).toBe(true);
    expect(jiraCalls).toEqual([]);
    expect(String((rpcs[0].args.p_sections as { body: string }[])[0].body)).toBe("<h1>Pasted</h1>");
  });

  it("'attached' on any other document is just an answer", async () => {
    openQuestions = [{ id: "q1", prompt: "The SOW?", optional: false, files_to: "sow" }];
    const r = await recordAnswers(ACTOR, "t1", { q1: "attached" });
    expect(r.ok).toBe(true);
    expect(jiraCalls).toEqual([]);
    expect(String((rpcs[0].args.p_sections as { body: string }[])[0].body)).toBe("attached");
  });
});
