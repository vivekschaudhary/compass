// Sections → HTML, in ONE place.
//
// This was private to `publish.ts` while the only thing that rendered a document was the publish to
// Confluence. It is shared now that the app renders documents too, because two renderers of the
// same bytes is how a preview starts lying about the page that ships — someone approves what the
// screen showed and the client reads something else.
//
// WHAT THIS IS NOT. It is a small, deliberate subset of markdown: headings, paragraphs, lists and
// tables. The app's own reading view uses `Markdown` (react-markdown) and renders more — emphasis,
// links, inline code, nested lists. That difference is a KNOWN gap, tested below so it is visible
// rather than discovered on a published page: anything this does not handle reaches the doc store
// as escaped text. The structured copy lives in Compass either way, and the page says so.

export type Section = { heading: string; body: string };

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * One section's body.
 *
 * Split on blank lines, then each block is decided by its own first line. Order matters: a table is
 * checked before a list because a table's separator row (`|---|---|`) starts with a pipe, and a
 * heading before both because `### 2.1 In Scope` is not a paragraph.
 */
function block(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para.trim().split("\n");
      if (!lines[0]) return "";

      // SUBHEADINGS.
      //
      // These used to fall through to the paragraph branch and publish as the literal text
      // "### 2.1 In Scope". It mattered little while agents invented their own flat structure; it
      // matters now that every templated deliverable carries `###` subsections — `sow.md` alone has
      // nine — so a published SOW would show its own markup down the page.
      //
      // Rendered at the level written, NOT shifted. The body is markdown authored against a
      // template whose sections are `##`, so its `###` already means "one below this section" —
      // and the section heading is emitted as an <h2> above. Shifting would push every subsection
      // one level too deep and break the outline it was meant to preserve.
      const h = /^(#{3,6})\s+(.*)$/.exec(lines[0]);
      if (h && lines.length === 1) {
        const level = h[1].length;
        return `<h${level}>${esc(h[2].trim())}</h${level}>`;
      }

      const isTable =
        lines.length > 1 && lines[0].includes("|") && /^[\s|:-]+$/.test(lines[1] ?? "");
      if (isTable) {
        const cells = (l: string) => l.split("|").slice(1, -1).map((c) => esc(c.trim()));
        const head = `<tr>${cells(lines[0]).map((c) => `<th>${c}</th>`).join("")}</tr>`;
        const rows = lines
          .slice(2)
          .map((l) => `<tr>${cells(l).map((c) => `<td>${c}</td>`).join("")}</tr>`)
          .join("");
        return `<table>${head}${rows}</table>`;
      }

      if (/^[-*]\s/.test(lines[0])) {
        return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^[-*]\s/, ""))}</li>`).join("")}</ul>`;
      }

      return `<p>${esc(para.trim()).replace(/\n/g, "<br/>")}</p>`;
    })
    .join("");
}

/**
 * A whole document, as the doc store receives it.
 *
 * The provenance line is first and is not optional: the page is a PROJECTION of what Compass holds,
 * and a reader who cannot tell that will edit it there — where the edit has no author, no version
 * and no trail, and is silently overwritten by the next publish.
 */
export function documentHtml(title: string, sections: Section[], version: string): string {
  return [
    `<p><em>Authored by Compass · ${esc(title)} · v${esc(version)}</em></p>`,
    ...sections.map((s) => `<h2>${esc(s.heading)}</h2>${block(s.body)}`),
  ].join("");
}
