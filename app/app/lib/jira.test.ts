import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `jira.ts` reaches Supabase at module scope through its imports, and `updateIssue` reaches the
// network. Both boundaries are stubbed: the subjects here are the ADF the body becomes and the
// request the update makes, neither of which needs a database or a board.
vi.mock("./supabase", () => ({ supabaseAdmin: () => null }));
vi.mock("./crypto", () => ({ decryptSecret: (s?: string) => s ?? "" }));

const { adf, updateIssue, findUser, searchIssues } = await import("./jira");

type Node = { type: string; attrs?: { level?: number }; content?: Node[]; text?: string };
const blocks = (text: string) => adf(text).content as Node[];
/** The plain text of a node tree, for asserting what survived. */
const textOf = (n: Node): string =>
  n.text ?? (n.content ?? []).map(textOf).join(n.type === "bulletList" ? "\n" : " ");

describe("adf", () => {
  // The reason this function was touched at all: a composed body leads with "## What this is", and
  // rendering it as a paragraph put those two hashes on a client's board as literal characters.
  it("renders markdown headings as heading nodes", () => {
    const [h] = blocks("## What this is");
    expect(h.type).toBe("heading");
    expect(h.attrs?.level).toBe(2);
    expect(textOf(h)).toBe("What this is");
  });

  it("carries the heading depth rather than flattening every level", () => {
    expect(blocks("# One")[0].attrs?.level).toBe(1);
    expect(blocks("### Three")[0].attrs?.level).toBe(3);
    // ADF has six levels; a seventh would be rejected outright, so it is clamped rather than sent.
    expect(blocks("####### Seven")[0].attrs?.level).toBe(6);
  });

  // One list, not one node per item — the acceptance criteria are appended as consecutive bullets
  // and must arrive as a list a reader can skim.
  it("gathers consecutive bullets into a single list", () => {
    const out = blocks("- first\n- second\n- third");
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("bulletList");
    expect(out[0].content).toHaveLength(3);
    expect(textOf(out[0])).toBe("first\nsecond\nthird");
  });

  it("closes a list when prose resumes", () => {
    const out = blocks("- a\n- b\n\nAnd then some prose.");
    expect(out.map((n) => n.type)).toEqual(["bulletList", "paragraph"]);
  });

  it("takes * as a bullet as well as -", () => {
    expect(blocks("* starred")[0].type).toBe("bulletList");
  });

  // A wrapped sentence is one paragraph. Splitting on every newline would turn a hard-wrapped
  // body into a column of one-line paragraphs.
  it("joins consecutive prose lines into one paragraph", () => {
    const out = blocks("A sentence that was\nwrapped across lines.");
    expect(out).toHaveLength(1);
    expect(textOf(out[0])).toBe("A sentence that was wrapped across lines.");
  });

  it("separates paragraphs on a blank line", () => {
    const out = blocks("First.\n\nSecond.");
    expect(out.map(textOf)).toEqual(["First.", "Second."]);
  });

  // ADF rejects a doc with no content, and a blank body must not read to the caller as "Jira
  // refused the ticket".
  it("never produces an empty document", () => {
    for (const empty of ["", "   ", "\n\n"]) {
      expect(blocks(empty).length).toBeGreaterThan(0);
    }
  });

  it("leaves a bare hash or hyphen alone rather than half-parsing it", () => {
    expect(blocks("#nohash")[0].type).toBe("paragraph");
    expect(blocks("-")[0].type).toBe("paragraph");
  });
});

describe("updateIssue", () => {
  const creds = { baseUrl: "https://x.atlassian.net", email: "e@x", token: "t", project: "CT" };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("PUTs the fields it was given to the issue", async () => {
    expect(await updateIssue(creds, "CT-16", { summary: "A real title", description: "## Body" })).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://x.atlassian.net/rest/api/3/issue/CT-16");
    expect(init.method).toBe("PUT");
    const { fields } = JSON.parse(String(init.body));
    expect(fields.summary).toBe("A real title");
    // The description goes as ADF, not as a string — a string is a 400 Jira answers unhelpfully.
    expect(fields.description.type).toBe("doc");
    expect(fields.description.content[0].type).toBe("heading");
  });

  it("sends only what it was asked to change", async () => {
    await updateIssue(creds, "CT-16", { description: "Just the body" });
    const { fields } = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(Object.keys(fields)).toEqual(["description"]);
  });

  // A PUT with empty fields is a round trip Jira answers 400, which the caller would then report as
  // a refusal. Nothing to say is not a failure to say it.
  it("does not call Jira when there is nothing to write", async () => {
    expect(await updateIssue(creds, "CT-16", {})).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a refusal rather than throwing", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 403 }));
    expect(await updateIssue(creds, "CT-16", { description: "x" })).toBe(false);
  });

  // Jira caps the summary field; an over-long one is rejected outright, taking the description
  // with it.
  it("truncates an over-long summary", async () => {
    await updateIssue(creds, "CT-16", { summary: "x".repeat(500) });
    const { fields } = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(fields.summary).toHaveLength(240);
  });
});

const creds = { baseUrl: "https://x.atlassian.net", email: "e@x", token: "t", project: "CT" };
const body = (m: ReturnType<typeof vi.fn>, i = 0) =>
  JSON.parse(String((m.mock.calls[i][1] as RequestInit).body));
const url = (m: ReturnType<typeof vi.fn>, i = 0) => String(m.mock.calls[i][0]);

describe("updateIssue — labels and assignee", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  // The whole reason labels go through `update` rather than `fields`: `fields.labels` REPLACES the
  // list, so writing `sprint-3` that way silently deletes every label the client's team put on the
  // ticket — and the call still returns 204, so nothing would ever report it.
  it("ADDS labels rather than replacing them", async () => {
    await updateIssue(creds, "CT-16", { labels: ["sprint-3", "designer"] });
    const sent = body(fetchMock);
    expect(sent.update.labels).toEqual([{ add: "sprint-3" }, { add: "designer" }]);
    expect(sent.fields?.labels).toBeUndefined();
  });

  it("sets the assignee by accountId", async () => {
    await updateIssue(creds, "CT-16", { assignee: { accountId: "5f2a" } });
    expect(body(fetchMock).fields.assignee).toEqual({ accountId: "5f2a" });
  });

  // undefined must leave an existing assignee alone. Clearing one because OUR lookup failed would
  // take a ticket away from whoever the team had already put on it.
  it("leaves the assignee alone when none is given", async () => {
    await updateIssue(creds, "CT-16", { labels: ["sprint-3"] });
    expect(body(fetchMock).fields).toBeUndefined();
  });

  it("clears the assignee only when explicitly told to", async () => {
    await updateIssue(creds, "CT-16", { assignee: null });
    expect(body(fetchMock).fields.assignee).toBeNull();
  });

  it("still writes nothing when given nothing", async () => {
    expect(await updateIssue(creds, "CT-16", { labels: [] })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("findUser", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const reply = (users: unknown[]) =>
    vi.fn(async () => new Response(JSON.stringify(users), { status: 200 }));
  afterEach(() => vi.unstubAllGlobals());

  it("returns the one match", async () => {
    fetchMock = reply([{ accountId: "5f2a", displayName: "Priya S" }]);
    vi.stubGlobal("fetch", fetchMock);
    expect(await findUser(creds, "Priya S")).toEqual({ accountId: "5f2a", displayName: "Priya S" });
  });

  // Picking the first of two assigns a real ticket on a real board to the wrong human. An
  // unassigned ticket gets noticed; a wrongly-assigned one does not.
  it("refuses to choose between two matches", async () => {
    vi.stubGlobal("fetch", reply([
      { accountId: "1", displayName: "A. Sharma" },
      { accountId: "2", displayName: "A. Sharma" },
    ]));
    expect(await findUser(creds, "A. Sharma")).toBeNull();
  });

  it("returns null when nobody matches", async () => {
    vi.stubGlobal("fetch", reply([]));
    expect(await findUser(creds, "Nobody")).toBeNull();
  });

  it("does not call Jira for an empty name", async () => {
    fetchMock = reply([]);
    vi.stubGlobal("fetch", fetchMock);
    expect(await findUser(creds, "   ")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("searchIssues", () => {
  afterEach(() => vi.unstubAllGlobals());

  // THE DISTINCTION THE GATES DEPEND ON. `[]` is "asked, matched nothing"; `null` is "could not
  // ask". Collapsing them makes a Jira outage read as "no unassigned stories", and the gate passes
  // on a sprint nobody could see.
  it("returns [] when the query matched nothing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ issues: [] }), { status: 200 })));
    expect(await searchIssues(creds, "project = CT", ["assignee"])).toEqual([]);
  });

  it("returns null when the query could not be run", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    expect(await searchIssues(creds, "project = CT", ["assignee"])).toBeNull();
  });

  // A first page that happens to be clean says nothing about the second.
  it("follows the cursor to the end", async () => {
    const pages = [
      { issues: [{ key: "CT-1", fields: {} }], nextPageToken: "p2" },
      { issues: [{ key: "CT-2", fields: {} }] },
    ];
    let n = 0;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(pages[n++]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect((await searchIssues(creds, "project = CT", ["assignee"]))?.map((i) => i.key))
      .toEqual(["CT-1", "CT-2"]);
    expect(url(fetchMock, 1)).toContain("nextPageToken=p2");
  });
});
