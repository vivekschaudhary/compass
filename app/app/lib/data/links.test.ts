import { describe, expect, it, vi } from "vitest";

// Reading a link a human gave an agent.
//
// `fetch` is injected, never the network. What is under test is the decision about what came back:
// what gets filed, what gets refused, and that every refusal names why.

vi.mock("server-only", () => ({}));

const { readLink, expandLinks, linksIn, htmlToMarkdown } = await import("./links");

type Reply = { status?: number; type?: string; body?: string; url?: string; length?: number };

/** A fetch that answers by URL, recording what it was asked for. */
function fakeFetch(replies: Record<string, Reply | Error>) {
  const asked: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const r = replies[url];
    if (!r) return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    if (r instanceof Error) throw r;
    const res = new Response(r.body ?? "", {
      status: r.status ?? 200,
      headers: {
        ...(r.type ? { "content-type": r.type } : {}),
        ...(r.length ? { "content-length": String(r.length) } : {}),
      },
    });
    Object.defineProperty(res, "url", { value: r.url ?? url });
    return res;
  }) as typeof fetch;
  return { impl, asked };
}

const DOC = "https://docs.google.com/document/d/1SrsePw-a3t9sPPXUHOlC5EwNfzDsYX6j6xsf0s-yn3g";

describe("readLink — app pages are rewritten to their content", () => {
  it("reads a Google Doc through its markdown export, tables intact", async () => {
    const md = "**STATEMENT OF WORK**\n\n| Field | Detail |\n| :-- | :-- |\n| Contractor | Kindtree |";
    const { impl, asked } = fakeFetch({ [`${DOC}/export?format=md`]: { type: "text/x-markdown; charset=utf-8", body: md } });
    const r = await readLink(`${DOC}/edit?usp=sharing`, impl);
    expect(asked).toEqual([`${DOC}/export?format=md`]);
    expect(r).toMatchObject({ ok: true, text: md });
  });

  it("reads a Google Sheet as CSV and a deck as text", async () => {
    const sheet = "https://docs.google.com/spreadsheets/d/abc123";
    const deck = "https://docs.google.com/presentation/d/xyz789";
    const { impl, asked } = fakeFetch({
      [`${sheet}/export?format=csv`]: { type: "text/csv", body: "a,b\n1,2" },
      [`${deck}/export/txt`]: { type: "text/plain", body: "Slide 1" },
    });
    expect(await readLink(`${sheet}/edit#gid=0`, impl)).toMatchObject({ ok: true, text: "a,b\n1,2" });
    expect(await readLink(deck, impl)).toMatchObject({ ok: true, text: "Slide 1" });
    expect(asked).toEqual([`${sheet}/export?format=csv`, `${deck}/export/txt`]);
  });

  // A private doc's export answers with Google's sign-in page, not a 403.
  it("refuses a Google Doc that answers with a sign-in page instead of the document", async () => {
    const { impl } = fakeFetch({
      [`${DOC}/export?format=md`]: { type: "text/html", body: "<title>Sign in</title>", url: "https://accounts.google.com/v3/signin" },
    });
    const r = await readLink(DOC, impl);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/not shared publicly/);
  });
});

describe("readLink — any link that opens is read", () => {
  it("files markdown and plain text as they are", async () => {
    const { impl } = fakeFetch({
      "https://example.com/brd.md": { type: "text/markdown", body: "# BRD\n\nThe thing." },
      "https://example.com/notes.txt": { type: "text/plain; charset=utf-8", body: "﻿plain notes" },
    });
    expect(await readLink("https://example.com/brd.md", impl)).toMatchObject({ ok: true, text: "# BRD\n\nThe thing." });
    // The byte-order mark Google puts on exports is not content.
    expect(await readLink("https://example.com/notes.txt", impl)).toMatchObject({ ok: true, text: "plain notes" });
  });

  it("converts an HTML page to markdown, keeping its title and dropping its chrome", async () => {
    const html = `<html><head><title>Coding Standard</title><style>.x{}</style></head><body>
      <nav><a href="/">Home</a> Menu</nav>
      <main><h1>Standard</h1><p>Use <a href="https://ex.com/lint">the linter</a>.</p>
      <table><tr><th>Rule</th><th>Level</th></tr><tr><td>no-any</td><td>error</td></tr></table></main>
      <script>track()</script><footer>© 2026</footer></body></html>`;
    const { impl } = fakeFetch({ "https://example.com/std": { type: "text/html; charset=utf-8", body: html } });
    const r = await readLink("https://example.com/std", impl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.title).toBe("Coding Standard");
    expect(r.text).toContain("# Standard");
    expect(r.text).toContain("[the linter](https://ex.com/lint)");
    expect(r.text).toContain("| Rule | Level |");
    expect(r.text).toContain("| no-any | error |");
    expect(r.text).not.toMatch(/Menu|track\(\)|© 2026|\.x\{\}/);
  });
});

describe("readLink — a link that does not open is reported, with why", () => {
  it.each([403, 404, 500])("names HTTP %i", async (status) => {
    const { impl } = fakeFetch({ "https://example.com/x": { status, type: "text/html", body: "nope" } });
    expect(await readLink("https://example.com/x", impl)).toEqual({ ok: false, url: "https://example.com/x", reason: `HTTP ${status}` });
  });

  it("refuses a format it cannot read, naming the type", async () => {
    const { impl } = fakeFetch({ "https://example.com/sow.pdf": { type: "application/pdf", body: "%PDF-1.7" } });
    const r = await readLink("https://example.com/sow.pdf", impl);
    expect(!r.ok && r.reason).toMatch(/not a text format.*application\/pdf/);
  });

  it("refuses a body over the size cap", async () => {
    const { impl } = fakeFetch({ "https://example.com/big": { type: "text/plain", body: "x", length: 6 * 1024 * 1024 } });
    const r = await readLink("https://example.com/big", impl);
    expect(!r.ok && r.reason).toMatch(/larger than 5 MB/);
  });

  it("refuses a page that opened with nothing in it", async () => {
    const { impl } = fakeFetch({ "https://example.com/empty": { type: "text/html", body: "<html><body><script>x</script></body></html>" } });
    const r = await readLink("https://example.com/empty", impl);
    expect(!r.ok && r.reason).toMatch(/no text/);
  });

  it("reports a timeout and an unreachable host rather than throwing", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const { impl } = fakeFetch({ "https://slow.example": timeout, "https://gone.example": new TypeError("fetch failed") });
    expect(await readLink("https://slow.example", impl)).toMatchObject({ ok: false, reason: expect.stringMatching(/within 15s/) });
    expect(await readLink("https://gone.example", impl)).toMatchObject({ ok: false, reason: expect.stringMatching(/could not be reached/) });
  });
});

describe("linksIn", () => {
  it("finds links inside prose, without trailing punctuation, once each", () => {
    expect(linksIn("See https://a.com/x, and (https://b.com/y). Also https://a.com/x.")).toEqual([
      "https://a.com/x", "https://b.com/y",
    ]);
  });

  it("finds nothing in text without a link", () => {
    expect(linksIn("CDPH, fixed price, 1/1/2027")).toEqual([]);
  });
});

describe("expandLinks", () => {
  it("leaves text with no links exactly as it was", async () => {
    const { impl, asked } = fakeFetch({});
    expect(await expandLinks("pricing is 20million$", impl)).toEqual({ ok: true, text: "pricing is 20million$", links: [], reads: [] });
    expect(asked).toEqual([]);
  });

  it("attaches one document block per link, after the text as typed", async () => {
    const { impl } = fakeFetch({
      "https://a.com/one.md": { type: "text/markdown", body: "ONE" },
      "https://b.com/two.txt": { type: "text/plain", body: "TWO" },
    });
    const r = await expandLinks("Use https://a.com/one.md and https://b.com/two.txt", impl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text.startsWith("Use https://a.com/one.md and https://b.com/two.txt\n\n")).toBe(true);
    expect(r.text).toContain('<document source="https://a.com/one.md">\nONE\n</document>');
    expect(r.text).toContain('<document source="https://b.com/two.txt">\nTWO\n</document>');
    expect(r.links).toEqual([{ url: "https://a.com/one.md", chars: 3 }, { url: "https://b.com/two.txt", chars: 3 }]);
  });

  // All or nothing: a message with half its links read would reach the agent looking complete.
  it("fails the whole message when any link does not open, naming that link", async () => {
    const { impl } = fakeFetch({
      "https://a.com/ok.md": { type: "text/markdown", body: "fine" },
      "https://b.com/locked": { status: 403, type: "text/html", body: "" },
    });
    const r = await expandLinks("https://a.com/ok.md https://b.com/locked", impl);
    expect(r).toEqual({ ok: false, error: "Couldn't read https://b.com/locked: HTTP 403. Paste the text instead." });
  });

  it("refuses more than five links rather than reading some of them", async () => {
    const { impl, asked } = fakeFetch({});
    const text = Array.from({ length: 6 }, (_, i) => `https://x.com/${i}`).join(" ");
    const r = await expandLinks(text, impl);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/6 links; Compass reads at most 5/);
    expect(asked).toEqual([]);
  });
});

describe("htmlToMarkdown", () => {
  it("escapes pipes inside table cells so the table keeps its columns", () => {
    const md = htmlToMarkdown("<table><tr><td>a | b</td><td>c</td></tr></table>");
    expect(md).toContain("| a \\| b | c |");
  });
});
