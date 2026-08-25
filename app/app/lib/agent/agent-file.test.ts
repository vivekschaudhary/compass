import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "fs";

// `context.ts` reaches Supabase at module scope through its imports. `withoutTaskCatalogue` is a
// pure string transform, so the side-effecting neighbours are stubbed away.
vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null }));
vi.mock("../specs", () => ({ resolveSpec: async () => null }));

const { withoutTaskCatalogue } = await import("./context");

const FILE = `---
name: delivery-manager
---

# Agent: Delivery Manager

## Identity

You maintain visibility.

## Core principles

- **\`[derive-from-state]\`** — every claim maps to a specific artifact.

## Tasks I own

Gates + postconditions = load-bearing.

### \`intake-sow\` — instantiate an engagement from a SOW

**Work:** raise a structured clarifying question for every unnamed role.

### \`compile-sprint-comms\` — write the sprint doc

**Gate:** sprint cadence configured in \`compass/config.yaml\`.

## Refusal rules

Refuse a publish without a HITL gate.

## Anti-patterns

Padded status.
`;

describe("withoutTaskCatalogue", () => {
  const out = withoutTaskCatalogue(FILE);

  it("removes the catalogue and the task subsections inside it", () => {
    expect(out).not.toContain("## Tasks I own");
    // The scan must not stop at the first `###`, or the tasks survive under a removed heading.
    expect(out).not.toContain("intake-sow");
    expect(out).not.toContain("compile-sprint-comms");
    expect(out).not.toContain("compass/config.yaml");
  });

  // The whole reason this removes a section rather than truncating at one: the discipline lives
  // BELOW the catalogue, and cutting the file there would have deleted it.
  it("keeps everything after the catalogue", () => {
    expect(out).toContain("## Refusal rules");
    expect(out).toContain("Refuse a publish without a HITL gate.");
    expect(out).toContain("## Anti-patterns");
  });

  it("keeps everything above it", () => {
    expect(out).toContain("name: delivery-manager");
    expect(out).toContain("## Identity");
    expect(out).toContain("[derive-from-state]");
  });

  it("leaves a file without the heading untouched", () => {
    const plain = "# Agent: X\n\n## Identity\n\nYou do a thing.\n";
    expect(withoutTaskCatalogue(plain)).toBe(plain);
  });

  it("is idempotent", () => {
    expect(withoutTaskCatalogue(out)).toBe(out);
  });

  it("does not leave a gaping seam where the section was", () => {
    expect(out).not.toMatch(/\n{3,}/);
  });

  it("handles the catalogue being the last section", () => {
    const trailing = "# A\n\n## Identity\n\nx\n\n## Tasks I own\n\n### t\n\nbody\n";
    const cut = withoutTaskCatalogue(trailing);
    expect(cut).toContain("## Identity");
    expect(cut).not.toContain("## Tasks I own");
    expect(cut).not.toContain("body");
  });
});

// The one that would actually have caught the live defect. A synthetic fixture passes while the
// shipped file still leaks, so this reads what the prompt really loads.
describe("the shipped agent files", () => {
  const dir = `${process.cwd()}/../compass/agents`;

  it("delivery-manager: the catalogue goes, the discipline stays", () => {
    const path = `${dir}/delivery-manager.md`;
    // Fail loud rather than skip: a silently-skipped test is indistinguishable from a passing one.
    expect(existsSync(path), `${path} should exist — this test asserts on the real prompt`).toBe(true);

    const src = readFileSync(path, "utf8");
    const out = withoutTaskCatalogue(src);

    // The two task DEFINITIONS that produced five questions on a one-document row. Asserted as
    // headings, not as bare strings: `intake-sow` is also NAMED in a core principle above the
    // catalogue, and that mention must survive — see the next assertion.
    expect(out).not.toContain("### `intake-sow`");
    expect(out).not.toContain("### `compile-sprint-comms`");
    // No task heading at all survives; the whole catalogue is what goes.
    expect(out).not.toMatch(/^### /m);
    // The instructions those definitions carried, which are what the agent actually followed.
    expect(out).not.toContain("Gate:");
    expect(out).not.toContain("raise a **structured clarifying question**");

    // The discipline that made that same run correctly refuse to invent the SOW. The principle
    // saying "ask rather than fabricate" is the good half of what happened and stays.
    expect(out).toContain("[derive-from-state]");
    expect(out).toContain("[no-padded-status]");
    expect(out).toContain("[agent-asks-structured-questions]");
    expect(out).toContain("## Refusal rules");
    expect(out).toContain("## Identity");
    expect(out.length).toBeLessThan(src.length * 0.75);
  });

  // The transform must not be delivery-manager-shaped: every role's file uses the same heading.
  it("every agent file loses its catalogue and keeps its refusal rules", () => {
    for (const role of ["engineer", "architect", "designer", "product-manager", "reviewer"]) {
      const path = `${dir}/${role}.md`;
      if (!existsSync(path)) continue;
      const src = readFileSync(path, "utf8");
      if (!/^## Tasks I own\s*$/m.test(src)) continue;

      const out = withoutTaskCatalogue(src);
      expect(out, `${role}: catalogue removed`).not.toContain("## Tasks I own");
      expect(out.length, `${role}: something was removed`).toBeLessThan(src.length);
      if (src.includes("## Refusal rules")) {
        expect(out, `${role}: refusal rules survive`).toContain("## Refusal rules");
      }
    }
  });
});
