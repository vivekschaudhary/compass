// Links a human gives an agent are read, not passed along as strings.
//
// An agent turn is one model call that ends in `ask` or `draft`; nothing in it can open a URL. So a
// person who answered "file the SOW" with a public Google Doc got back "I have no web-fetch tool",
// and pasting instead lost every table in the contract. The agent was never going to read that link,
// whichever role it was and whichever host ran it.
//
// Read HERE, where a human's words are recorded, rather than through a model-side tool:
//   - every role and both hosts get it — the CLI host runs with no tools at all;
//   - the text lands verbatim, instead of being retyped by a model through `draft`, which is how a
//     contract gets paraphrased;
//   - a link that does not open is refused to the person holding it, now, rather than discovered
//     by the agent a turn later.
//
// The rule is deliberately simple: a link that opens is read, a link that does not is reported.

import "server-only";
import TurndownService from "turndown";

const TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_LINKS = 5;

export type ReadLink =
  | { ok: true; url: string; finalUrl: string; title: string | null; text: string }
  | { ok: false; url: string; reason: string };

export type LinkRead = { url: string; chars: number };

type Fetch = typeof fetch;

/**
 * Pages whose URL is an app, not the content. Google's editors are JavaScript shells — fetching the
 * page returns a loader — so each is rewritten to the export that IS the content. `expects` is what
 * that export returns; getting HTML back instead means Google served a sign-in page, which is how a
 * document that is not shared publicly answers.
 */
const REWRITES: { pattern: RegExp; to: (id: string) => string; expects: RegExp; what: string }[] = [
  {
    pattern: /^https:\/\/docs\.google\.com\/document\/d\/([\w-]+)/,
    to: (id) => `https://docs.google.com/document/d/${id}/export?format=md`,
    expects: /markdown|text\/plain/, what: "Google Doc",
  },
  {
    pattern: /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/,
    to: (id) => `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`,
    expects: /text\/csv|text\/plain/, what: "Google Sheet",
  },
  {
    pattern: /^https:\/\/docs\.google\.com\/presentation\/d\/([\w-]+)/,
    to: (id) => `https://docs.google.com/presentation/d/${id}/export/txt`,
    expects: /text\/plain/, what: "Google Slides deck",
  },
];

const AS_IS = /^(text\/(plain|markdown|x-markdown|csv)|application\/json)/;

/** Every http(s) URL in a piece of text, in order, without trailing punctuation, deduplicated. */
export function linksIn(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'`]+/g) ?? [];
  const cleaned = found.map((u) => u.replace(/[.,;:!?)\]}]+$/, ""));
  return [...new Set(cleaned)];
}

/** Read one link as text. Never throws: every way it can fail comes back as a reason. */
export async function readLink(url: string, fetchImpl: Fetch = fetch): Promise<ReadLink> {
  const rewrite = REWRITES.find((r) => r.pattern.test(url));
  const target = rewrite ? rewrite.to(url.match(rewrite.pattern)![1]) : url;

  let res: Response;
  try {
    res = await fetchImpl(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "text/markdown, text/plain, text/csv, application/json, text/html;q=0.9, */*;q=0.1" },
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, url, reason: timedOut ? `it did not answer within ${TIMEOUT_MS / 1000}s` : `it could not be reached (${e instanceof Error ? e.message : String(e)})` };
  }

  if (!res.ok) return { ok: false, url, reason: `HTTP ${res.status}` };

  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  const body = await readCapped(res);
  if (body === null) return { ok: false, url, reason: `it is larger than ${MAX_BYTES / 1024 / 1024} MB` };

  if (rewrite && !rewrite.expects.test(type)) {
    return { ok: false, url, reason: `the ${rewrite.what} is not shared publicly (Google returned a sign-in page, not the document)` };
  }

  let text: string;
  let title: string | null = null;
  if (AS_IS.test(type)) {
    text = body;
  } else if (type.startsWith("text/html") || type.startsWith("application/xhtml")) {
    title = titleOf(body);
    text = htmlToMarkdown(body);
  } else {
    return { ok: false, url, reason: `it is not a text format Compass can read yet (${type || "no content type"})` };
  }

  text = text.replace(/^﻿/, "").trim();
  if (!text) return { ok: false, url, reason: "it opened but had no text in it" };
  return { ok: true, url, finalUrl: res.url || target, title, text };
}

/**
 * Read every link in a piece of text and attach what each one says.
 *
 * All or nothing. One unreadable link fails the whole thing, because the caller writes nothing on a
 * failure and the person gets to paste the text instead — a message recorded with half its links
 * read would reach the agent looking complete.
 */
export async function expandLinks(
  text: string, fetchImpl: Fetch = fetch,
): Promise<{ ok: true; text: string; links: LinkRead[]; reads: Extract<ReadLink, { ok: true }>[] } | { ok: false; error: string }> {
  const urls = linksIn(text);
  if (!urls.length) return { ok: true, text, links: [], reads: [] };
  if (urls.length > MAX_LINKS) {
    return { ok: false, error: `That has ${urls.length} links; Compass reads at most ${MAX_LINKS} in one message. Split it up or paste the text.` };
  }

  const results = await Promise.all(urls.map((u) => readLink(u, fetchImpl)));
  const failed = results.filter((r): r is Extract<ReadLink, { ok: false }> => !r.ok);
  if (failed.length) {
    return {
      ok: false,
      error: failed.map((f) => `Couldn't read ${f.url}: ${f.reason}.`).join(" ") + " Paste the text instead.",
    };
  }

  const reads = results as Extract<ReadLink, { ok: true }>[];
  return {
    ok: true,
    text: [text, ...reads.map(documentBlock)].join("\n\n"),
    links: reads.map((r) => ({ url: r.url, chars: r.text.length })),
    reads,
  };
}

/** How a read link is shown to the agent — the same `<document>` shape its pinned inputs use. */
export function documentBlock(r: Extract<ReadLink, { ok: true }>): string {
  const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<document source="${attr(r.finalUrl)}"${r.title ? ` title="${attr(r.title)}"` : ""}>\n${r.text}\n</document>`;
}

/** The text of a response, or null past the size cap — counted as it streams, not after. */
async function readCapped(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return null;
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function titleOf(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m?.[1].replace(/\s+/g, " ").trim();
  return t || null;
}

/**
 * A page as markdown: headings, lists, links and tables kept; the chrome around the content dropped.
 *
 * The page's `<main>`, else its `<article>`, else the whole body — so a documentation page is filed
 * as its content rather than as its navigation.
 */
export function htmlToMarkdown(html: string): string {
  const main = html.match(/<main[\s>][\s\S]*<\/main>/i)?.[0]
    ?? html.match(/<article[\s>][\s\S]*<\/article>/i)?.[0]
    ?? html;

  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  td.remove(["script", "style", "noscript", "nav", "header", "footer", "iframe", "form", "title"]);
  // `svg` is not an HTMLElement tag name, so it needs a filter function rather than the list.
  td.remove((node) => node.nodeName.toLowerCase() === "svg");

  // Tables as GFM pipe tables. Turndown's default flattens a table to its cell text, which is how
  // the SOW's deliverables table became a column of words when it was pasted.
  td.addRule("table", {
    filter: "table",
    replacement: (_content, node) => {
      const rows = Array.from((node as HTMLTableElement).querySelectorAll("tr"));
      if (!rows.length) return "";
      const cell = (c: Element) =>
        td.turndown((c as HTMLElement).innerHTML).replace(/\n+/g, " ").replace(/\|/g, "\\|").trim();
      const grid = rows.map((r) => Array.from(r.querySelectorAll("th, td")).map(cell));
      const width = Math.max(...grid.map((r) => r.length));
      if (!width) return "";
      const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ")} |`;
      return `\n\n${line(grid[0])}\n| ${Array(width).fill("---").join(" | ")} |\n${grid.slice(1).map(line).join("\n")}\n\n`;
    },
  });

  return td.turndown(main).replace(/\n{3,}/g, "\n\n").trim();
}
