import { describe, it, expect, vi } from "vitest";

// `readShippedDocTree` against the REAL compass/templates/doc-tree.md.
//
// It replaced scripts/test-doctree.mjs, a manual node script from before this app had a test runner.
// That one re-implemented the parser instead of calling it, asserted a hardcoded count of 20 nodes
// while the template had grown to 29, and was already failing when it was removed — nothing ran it.
// So this checks structure rather than a number that goes stale the next time a row is added.
//
// What depends on it: the seed importer treats every non-folder node as a declared document path.

vi.mock("./supabase", () => ({ supabaseAdmin: () => null }));

const { readShippedDocTree } = await import("./doctree");
const tree = readShippedDocTree();
const byPath = new Map(tree.map((n) => [n.path, n]));

describe("readShippedDocTree", () => {
  // Empty is the failure that would pass silently: every declared path vanishes, and the importer
  // starts refusing steps that name documents which have always existed.
  it("parses the shipped template into nodes", () => {
    expect(tree.length).toBeGreaterThan(0);
  });

  it("has no two nodes at the same path", () => {
    expect(byPath.size).toBe(tree.length);
  });

  it("gives every child a parent that exists", () => {
    const orphans = tree.filter((n) => n.parent && !byPath.has(n.parent)).map((n) => `${n.path} → ${n.parent}`);
    expect(orphans).toEqual([]);
  });

  it("lists every parent before its children", () => {
    const index = new Map(tree.map((n, i) => [n.path, i]));
    const early = tree.filter((n) => n.parent && index.get(n.parent)! > index.get(n.path)!).map((n) => n.path);
    expect(early).toEqual([]);
  });

  it("reads `—` as top-level, not as a parent named `—`", () => {
    expect(tree.some((n) => n.parent === "")).toBe(true);
    expect(tree.some((n) => n.parent === "—")).toBe(false);
  });

  // Known rows of the shipped template, typed as documents. A spot check that the path, title, kind
  // and parent columns still land in the right fields — a column shifted by one would parse a path
  // into `title` and still produce a non-empty tree.
  it("reads known rows with their columns in the right fields", () => {
    for (const path of ["02-scope/sow", "02-scope/business-requirements", "05-cadence/kickoff"]) {
      expect(byPath.get(path)?.kind, path).toBe("doc");
    }
  });

  it("types the sprint-review form as a template", () => {
    expect(byPath.get("05-cadence/sprint-reviews/template")?.kind).toBe("template");
  });
});
