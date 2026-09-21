// A document template, parsed into the sections a draft owes.
//
// The templates in `compass/templates/` were written for people and are shaped accordingly: an HTML
// comment at the top addressed to whoever fills them in, an `#` title, `##` sections, `###`
// subsections, and `[bracketed]` placeholders. This module turns that into the two things the agent
// loop needs — a list of headings to fill, and a way to check that the draft filled them.
//
// THE FLOOR IS LEVEL 2, NOT EVERY HEADING.
//
// `document_section` is a FLAT list of (heading, body) and the `draft` tool emits exactly that, so
// requiring every `###` to be its own section would shatter a document into twenty fragments and
// make "2.1 In Scope" a peer of "Scope of Work". Level-3 headings are guidance INSIDE their parent
// section, which is also how a human filling the template reads them. A section body is markdown
// and may keep them verbatim.
//
// Everything here is pure. It is the part that can be wrong — the normalisation especially — and
// that is worth testing without a database or a model.

export type TemplateSection = {
  /** As written in the template, numbering and all: `2. Scope of Work`. */
  heading: string;
  /** Normalised for comparison. See `normaliseHeading`. */
  key: string;
  /**
   * Everything under the heading and above the next level-2 one — subheadings, prose, tables,
   * placeholders. What the section is FOR, in the template author's words.
   */
  guidance: string;
};

export type ParsedTemplate = {
  /** The `#` line, when the template has one. */
  title: string | null;
  sections: TemplateSection[];
};

/**
 * Compare headings by what they MEAN, not byte for byte.
 *
 * The numbering in `## 2. Scope of Work` belongs to the template, not to the deliverable — a model
 * that writes `## Scope of Work` has produced the section that was asked for, and refusing that
 * draft would be enforcing a formatting habit rather than a contract. Likewise case and internal
 * whitespace.
 *
 * Stripped: leading `2.`, `2.1`, `2.1.3`, `2)`, and a leading bullet. NOT stripped: trailing
 * punctuation that is part of the words, and anything that is not at the start — `Phase 2` keeps
 * its 2, because there the number is the meaning.
 */
export function normaliseHeading(raw: string): string {
  return raw
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+(?:\.\d+)*[.)]?\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** An HTML comment block. Template authoring notes, addressed to a human, never to the agent. */
const COMMENT = /<!--[\s\S]*?-->/g;

/**
 * YAML front matter, when the file opens with it.
 *
 * Stripped because it is metadata, not a section — and because several templates put `#` COMMENTS
 * inside it (`retro.md` explains `parent_log` across six `#` lines). Scanned as markdown those are
 * level-1 headings, and `retro.md` came back titled "parent_log: where THIS retro reads its source
 * data from." Only matched at the very start of the file: a `---` in the middle of a document is a
 * horizontal rule.
 */
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/;

/**
 * Parse a template's markdown.
 *
 * Fenced code is skipped rather than scanned: a ``` block containing a `## ` line is an EXAMPLE of
 * a heading, not a heading, and several of the shipped templates contain exactly that. Treating one
 * as a section would put a heading in the floor that no draft could ever satisfy, and the row would
 * be permanently un-draftable for a reason nobody could see.
 */
export function parseTemplate(markdown: string): ParsedTemplate {
  const lines = markdown.replace(FRONT_MATTER, "").replace(COMMENT, "").split("\n");

  let title: string | null = null;
  const sections: TemplateSection[] = [];
  let current: { heading: string; guidance: string[] } | null = null;
  let fenced = false;

  const flush = () => {
    if (!current) return;
    sections.push({
      heading: current.heading,
      key: normaliseHeading(current.heading),
      guidance: current.guidance.join("\n").trim(),
    });
    current = null;
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      if (current) current.guidance.push(line);
      continue;
    }
    if (fenced) {
      if (current) current.guidance.push(line);
      continue;
    }

    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1) {
      flush();
      if (title === null) title = h1[1].trim();
      continue;
    }

    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      flush();
      current = { heading: h2[1].trim(), guidance: [] };
      continue;
    }

    // Level 3 and deeper, and everything else, belong to the section they sit in.
    if (current) current.guidance.push(line);
  }
  flush();

  return { title, sections };
}

/**
 * Which template sections a draft failed to produce.
 *
 * Returns the template's own spelling, because this list is shown to a person and handed back to
 * the model — `2. Scope of Work` tells them where to look in a way `scope of work` does not.
 *
 * EXTRA SECTIONS ARE NOT A FAILURE. The template is a floor: the agent may add whatever the
 * deliverable needs and they are kept in the order it gave them. Only omission is refused, because
 * a document silently missing "Scope of Work" reads as finished and is not.
 */
export function missingSections(
  template: TemplateSection[],
  draftHeadings: string[],
): string[] {
  const have = new Set(draftHeadings.map(normaliseHeading));
  return template.filter((s) => !have.has(s.key)).map((s) => s.heading);
}

/**
 * The template as the agent is told to fill it.
 *
 * Guidance is included but clipped: the whole of `foundation-architecture.md` is 293 lines, and
 * spending the context window restating the template verbatim leaves less of it for the documents
 * the draft is supposed to be derived FROM.
 */
export function describeTemplate(parsed: ParsedTemplate, guidanceChars = 400): string {
  const head = parsed.title ? `The deliverable is "${parsed.title}".` : "";
  const body = parsed.sections
    .map((s) => {
      const g = s.guidance.length > guidanceChars
        ? s.guidance.slice(0, guidanceChars).trimEnd() + "…"
        : s.guidance;
      return g ? `## ${s.heading}\n${g}` : `## ${s.heading}`;
    })
    .join("\n\n");
  return [head, body].filter(Boolean).join("\n\n");
}
