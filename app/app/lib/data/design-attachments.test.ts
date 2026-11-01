import { describe, it, expect, vi, beforeEach } from "vitest";

// A design is read from the ticket it was attached to. Every way that can go wrong is a reason the
// designer can act on, and none of them files anything.

vi.mock("server-only", () => ({}));

let ticket: string | null = "CT-300";
vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: () => {
      const c: Record<string, unknown> = {
        select: () => c, eq: () => c,
        maybeSingle: async () => ({ data: ticket === undefined ? null : { ticket_key: ticket } }),
      };
      return c;
    },
  }),
}));

type Att = { id: string; filename: string; mimeType: string; size: number; created: string };
let creds: unknown = { baseUrl: "x", email: "e", token: "t", project: "CT" };
let attachments: Att[] | null = [];
const files: Record<string, string | null> = {};
vi.mock("../jira", () => ({
  jiraForEngagement: async () => { if (creds instanceof Error) throw creds; return creds; },
  issueAttachments: async () => attachments,
  attachmentBytes: async (_c: unknown, id: string) =>
    files[id] == null ? null : new TextEncoder().encode(files[id] as string).buffer,
}));

const { designFromTicket, fenced, isAttachedReply, isDesignPath } = await import("./design-attachments");
const att = (id: string, filename: string, created = "2026-10-30T10:00:00.000+0000", size = 100): Att =>
  ({ id, filename, mimeType: "text/html", size, created });

beforeEach(() => {
  ticket = "CT-300"; creds = { baseUrl: "x", email: "e", token: "t", project: "CT" }; attachments = [];
  for (const k of Object.keys(files)) delete files[k];
});

describe("what counts as a design reply", () => {
  it("only a design document, and only the word 'attached'", () => {
    expect(isDesignPath("design/CT-288")).toBe(true);
    expect(isDesignPath("sow")).toBe(false);
    expect(isDesignPath(null)).toBe(false);
    for (const a of ["attached", "Attached.", "  attached!  "]) expect(isAttachedReply(a)).toBe(true);
    for (const a of ["I attached it", "attached the file to CT-1", "<html>", ""]) expect(isAttachedReply(a)).toBe(false);
  });
});

describe("fenced", () => {
  it("wraps the file in a fenced block named for it", () => {
    expect(fenced("a.html", "<p>x</p>\n")).toBe("### a.html\n\n```html\n<p>x</p>\n```\n");
  });

  it("uses a fence longer than any run of backticks inside, so the file cannot close it", () => {
    const out = fenced("a.html", "<script>const s = ```nested```; </script>");
    expect(out).toContain("````html\n");
    expect(out.trimEnd().endsWith("````")).toBe(true);
  });
});

describe("designFromTicket", () => {
  it("files the html attached to the task's ticket", async () => {
    attachments = [att("1", "signin.html")]; files["1"] = "<h1>Sign in</h1>";
    const r = await designFromTicket("e1", "t1");
    expect(r).toMatchObject({ ok: true, names: ["signin.html"], ticket: "CT-300" });
    expect(r.ok && r.text).toContain("<h1>Sign in</h1>");
    expect(r.ok && r.text).toContain("### signin.html");
  });

  it("ignores attachments that are not html, and takes the newest of a repeated name", async () => {
    attachments = [att("1", "signin.html", "2026-10-30T10:00:00.000+0000"), att("2", "signin.html", "2026-10-31T10:00:00.000+0000"),
      { ...att("3", "shot.png"), mimeType: "image/png" }];
    files["1"] = "OLD"; files["2"] = "NEW"; files["3"] = "png";
    const r = await designFromTicket("e1", "t1");
    expect(r.ok && r.names).toEqual(["signin.html"]);
    expect(r.ok && r.text).toContain("NEW");
    expect(r.ok && r.text).not.toContain("OLD");
    expect(r.ok && r.text).not.toContain("png");
  });

  it("several html files are all filed, in name order", async () => {
    attachments = [att("1", "b.html"), att("2", "a.html")]; files["1"] = "B"; files["2"] = "A";
    const r = await designFromTicket("e1", "t1");
    expect(r.ok && r.names).toEqual(["a.html", "b.html"]);
  });

  it("names what IS attached when none of it is html", async () => {
    attachments = [{ ...att("3", "shot.png"), mimeType: "image/png" }];
    const r = await designFromTicket("e1", "t1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain("no `.html` attachment");
    expect(!r.ok && r.reason).toContain("`shot.png`");
  });

  it("says so when there is nothing attached at all", async () => {
    const r = await designFromTicket("e1", "t1");
    expect(!r.ok && r.reason).toContain("no attachments");
  });

  it("a ticket that cannot be read is not 'nothing attached'", async () => {
    attachments = null;
    const r = await designFromTicket("e1", "t1");
    expect(!r.ok && r.reason).toContain("could not be read");
  });

  it("a task with no ticket, or no Jira, is refused with the reason", async () => {
    ticket = null;
    expect((await designFromTicket("e1", "t1") as { reason: string }).reason).toContain("no Jira ticket");
    ticket = "CT-300"; creds = null;
    expect((await designFromTicket("e1", "t1") as { reason: string }).reason).toContain("not configured");
    creds = new Error("bad key");
    expect((await designFromTicket("e1", "t1") as { reason: string }).reason).toContain("bad key");
  });

  it("a file that cannot be downloaded, or is empty, or is too big, files nothing", async () => {
    attachments = [att("1", "a.html")];
    expect((await designFromTicket("e1", "t1") as { reason: string }).reason).toContain("could not be downloaded");
    files["1"] = "   ";
    expect((await designFromTicket("e1", "t1") as { reason: string }).reason).toContain("is empty");
    attachments = [att("1", "a.html", undefined, 6 * 1024 * 1024)];
    expect((await designFromTicket("e1", "t1") as { reason: string }).reason).toContain("over the 5 MB limit");
  });

  it("a prototype over the document limit is refused with its size", async () => {
    attachments = [att("1", "a.html")]; files["1"] = "x".repeat(500_001);
    const r = await designFromTicket("e1", "t1");
    expect(!r.ok && r.reason).toContain("over the 500,000");
  });
});
