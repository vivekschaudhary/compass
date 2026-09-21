import { describe, it, expect } from "vitest";
import { documentHtml, esc } from "./document";

const one = (body: string) => documentHtml("T", [{ heading: "H", body }], "1.0");

describe("documentHtml", () => {
  it("leads with the provenance line", () => {
    // A reader who cannot tell the page is a projection will edit it in Confluence, where the edit
    // has no author, no version, and is overwritten by the next publish.
    expect(documentHtml("SOW", [], "2.0")).toContain(
      "<p><em>Authored by Compass · SOW · v2.0</em></p>",
    );
  });

  it("makes each section an h2", () => {
    expect(documentHtml("T", [{ heading: "Scope", body: "x" }], "1.0")).toContain("<h2>Scope</h2>");
  });

  it("keeps section order", () => {
    const html = documentHtml(
      "T",
      [{ heading: "A", body: "1" }, { heading: "B", body: "2" }],
      "1.0",
    );
    expect(html.indexOf("<h2>A</h2>")).toBeLessThan(html.indexOf("<h2>B</h2>"));
  });
});

describe("subheadings", () => {
  // These published as the literal text "### 2.1 In Scope" until this renderer was extracted. It
  // barely showed while agents invented flat structures; every templated deliverable now carries
  // them — sow.md alone has nine — so a published SOW would have shown its own markup down the page.
  it("renders a '###' inside a body as a real heading, one level down from the section", () => {
    expect(one("### 2.1 In Scope")).toContain("<h3>2.1 In Scope</h3>");
  });

  it("renders '####' as h4", () => {
    expect(one("#### Detail")).toContain("<h4>Detail</h4>");
  });

  it("does not treat a hash inside prose as a heading", () => {
    expect(one("see issue #42 for context")).toContain("<p>see issue #42 for context</p>");
  });

  it("does not swallow a paragraph that merely starts with a heading line", () => {
    // Two lines in one block is prose, not a heading: turning it into <h3> would drop the rest.
    const html = one("### Heading\nand a line that belongs to it");
    expect(html).toContain("and a line that belongs to it");
  });
});

describe("tables", () => {
  it("converts a markdown table", () => {
    const html = one("| Field | Value |\n|---|---|\n| Client | Acme |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Field</th>");
    expect(html).toContain("<td>Acme</td>");
  });

  it("is checked before lists, because a separator row starts with a pipe", () => {
    expect(one("| A |\n|---|\n| b |")).not.toContain("<ul>");
  });
});

describe("lists and paragraphs", () => {
  it("converts a bullet list", () => {
    expect(one("- one\n- two")).toContain("<li>one</li><li>two</li>");
  });

  it("keeps a single newline inside a paragraph as a break", () => {
    expect(one("line one\nline two")).toContain("line one<br/>line two");
  });

  it("splits blocks on blank lines", () => {
    const html = one("first para\n\nsecond para");
    expect(html).toContain("<p>first para</p>");
    expect(html).toContain("<p>second para</p>");
  });
});

describe("escaping — the content comes from a model reading client documents", () => {
  it("escapes markup in a body", () => {
    expect(one("<script>alert(1)</script>")).toContain("&lt;script&gt;");
    expect(one("<script>alert(1)</script>")).not.toContain("<script>");
  });

  it("escapes a heading", () => {
    expect(documentHtml("T", [{ heading: "a <b> & c", body: "" }], "1.0")).toContain(
      "<h2>a &lt;b&gt; &amp; c</h2>",
    );
  });

  it("escapes table cells", () => {
    expect(one("| A |\n|---|\n| <img> |")).toContain("&lt;img&gt;");
  });

  it("escapes the title and version in the provenance line", () => {
    expect(documentHtml("<b>", [], "<i>")).toContain("&lt;b&gt;");
  });

  it("esc is idempotent on already-safe text", () => {
    expect(esc("plain text")).toBe("plain text");
  });
});

describe("the known gap — what this deliberately does NOT render", () => {
  // Documented as a test rather than a comment alone, because the app's reading view uses
  // react-markdown and renders these. Someone approving the in-app view sees emphasis and links
  // that the published page shows as literal characters. Asserting it here means the gap is a
  // decision on the record; if it is ever closed, this test fails and says so.
  it("passes emphasis, links and inline code through as text", () => {
    const html = one("**bold**, _italic_, [a link](http://x), `code`");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("<a href");
    expect(html).not.toContain("<code>");
    expect(html).toContain("**bold**");
  });

  it("does not nest lists", () => {
    const html = one("- top\n  - nested");
    expect(html).not.toContain("<ul><ul>");
  });
});
