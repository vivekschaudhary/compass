import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  parseTemplate,
  normaliseHeading,
  missingSections,
  describeTemplate,
} from "./template";

describe("normaliseHeading", () => {
  it("strips the template's own numbering", () => {
    expect(normaliseHeading("2. Scope of Work")).toBe("scope of work");
    expect(normaliseHeading("2.1 In Scope")).toBe("in scope");
    expect(normaliseHeading("2.1.3 Exclusions")).toBe("exclusions");
    expect(normaliseHeading("3) Deliverables")).toBe("deliverables");
  });

  it("keeps a number that is part of the words", () => {
    // `Phase 2` is not `Phase`. Only a LEADING ordinal is the template's formatting.
    expect(normaliseHeading("Phase 2")).toBe("phase 2");
    expect(normaliseHeading("Sprint 0 Outcomes")).toBe("sprint 0 outcomes");
  });

  it("is insensitive to case and internal whitespace", () => {
    expect(normaliseHeading("  SCOPE   of    Work ")).toBe("scope of work");
  });
});

describe("parseTemplate", () => {
  it("takes the h1 as the title and h2s as the sections", () => {
    const p = parseTemplate(`# Statement of Work

intro prose

## 1. Purpose & Background

why it exists

## 2. Scope of Work

what is in it
`);
    expect(p.title).toBe("Statement of Work");
    expect(p.sections.map((s) => s.heading)).toEqual([
      "1. Purpose & Background",
      "2. Scope of Work",
    ]);
    expect(p.sections[0].guidance).toBe("why it exists");
  });

  it("folds level 3 into its parent section rather than making it a peer", () => {
    // document_section is flat. `2.1 In Scope` is guidance inside Scope of Work, not a sibling of
    // it — promoting it would shatter the document and put a subsection in the floor.
    const p = parseTemplate(`## 2. Scope of Work

### 2.1 In Scope

- a thing

### 2.2 Out of Scope

- another thing
`);
    expect(p.sections).toHaveLength(1);
    expect(p.sections[0].heading).toBe("2. Scope of Work");
    expect(p.sections[0].guidance).toContain("### 2.1 In Scope");
    expect(p.sections[0].guidance).toContain("### 2.2 Out of Scope");
  });

  it("drops the authoring comment addressed to a human", () => {
    const p = parseTemplate(`<!-- TEMPLATE. Replace every [bracketed] value.
     ## Not A Section -->

# Title

## Real Section

body
`);
    expect(p.sections.map((s) => s.heading)).toEqual(["Real Section"]);
  });

  it("does not read a heading inside a fenced block as a heading", () => {
    // An EXAMPLE of a heading is not one. Treating it as a section would put something in the
    // floor that no draft can satisfy, and the row becomes un-draftable for an invisible reason.
    const p = parseTemplate(`## Real Section

\`\`\`markdown
## Example Heading
\`\`\`

more body
`);
    expect(p.sections.map((s) => s.heading)).toEqual(["Real Section"]);
    expect(p.sections[0].guidance).toContain("## Example Heading");
  });

  it("strips YAML front matter, including the '#' comments inside it", () => {
    // retro.md explains `parent_log` over six `#` lines inside its front matter. Read as markdown
    // those are h1s, and the template came back titled "parent_log: where THIS retro reads…".
    const p = parseTemplate(`---
id: RETRO-<NNN>
# parent_log: where THIS retro reads its source data from
#   - project altitude → docs/improvements.md
---

# Retro

## What happened

body
`);
    expect(p.title).toBe("Retro");
    expect(p.sections.map((s) => s.heading)).toEqual(["What happened"]);
  });

  it("treats a '---' in the body as a rule, not front matter", () => {
    const p = parseTemplate(`# T\n\n## S\n\n---\n\nmore\n`);
    expect(p.title).toBe("T");
    expect(p.sections).toHaveLength(1);
  });

  it("handles a template with no title", () => {
    const p = parseTemplate(`## Only Section\n\nbody\n`);
    expect(p.title).toBeNull();
    expect(p.sections).toHaveLength(1);
  });

  it("returns no sections for a body with no headings", () => {
    // The caller must treat this as a template that cannot gate anything — a zero-length floor
    // passes vacuously, which is the aggregate-over-zero-rows failure.
    expect(parseTemplate("just prose, no headings").sections).toEqual([]);
  });
});

describe("missingSections — the floor", () => {
  const tpl = parseTemplate(`## 1. Purpose

p

## 2. Scope of Work

s

## 3. Deliverables

d
`).sections;

  it("passes when every section is present", () => {
    expect(missingSections(tpl, ["1. Purpose", "2. Scope of Work", "3. Deliverables"])).toEqual([]);
  });

  it("passes when the draft drops the template's numbering", () => {
    expect(missingSections(tpl, ["Purpose", "Scope of Work", "Deliverables"])).toEqual([]);
  });

  it("allows EXTRA sections — the template is a floor, not a cast", () => {
    expect(
      missingSections(tpl, [
        "Purpose",
        "Scope of Work",
        "Assumptions",
        "Deliverables",
        "Open Questions",
      ]),
    ).toEqual([]);
  });

  it("names what is missing, in the template's own spelling", () => {
    // The list is read by a person and handed back to the model. `2. Scope of Work` says where to
    // look; `scope of work` does not.
    expect(missingSections(tpl, ["Purpose"])).toEqual(["2. Scope of Work", "3. Deliverables"]);
  });

  it("reports every section missing when the draft has none", () => {
    expect(missingSections(tpl, [])).toHaveLength(3);
  });
});

describe("describeTemplate", () => {
  it("clips long guidance rather than restating the whole template", () => {
    const p = parseTemplate(`# T\n\n## S\n\n${"x".repeat(900)}\n`);
    const out = describeTemplate(p, 100);
    expect(out).toContain('The deliverable is "T"');
    expect(out).toContain("## S");
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(400);
  });
});

describe("the shipped templates", () => {
  // Parses the REAL file, not a fixture. A fixture can stay green while the template it stands in
  // for is rewritten into a shape the parser no longer understands.
  const sow = resolve(process.cwd(), "..", "compass", "templates", "sow.md");

  it("parses sow.md into its real sections, in order", () => {
    // ASSERTED, not skipped. `if (!exists) return` would make a moved or renamed template read as
    // a passing test — a green tick for a file nobody opened. The framework is a sibling of the
    // app in this repo; if that stops being true this test should say so.
    expect(existsSync(sow), `no template at ${sow}`).toBe(true);
    const p = parseTemplate(readFileSync(sow, "utf8"));
    expect(p.title).toBe("Statement of Work");
    const keys = p.sections.map((s) => s.key);
    expect(keys).toContain("purpose & background");
    expect(keys).toContain("scope of work");
    // The authoring comment at the top of the file must not have become a section.
    expect(keys.some((k) => k.includes("template"))).toBe(false);
    expect(p.sections.length).toBeGreaterThan(3);
  });
});
