import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// The tier rules exist twice: here (resolveSpecFromTable, templateFor) and in
// compass/orchestrator/spec_source.py. They are pinned by ONE file of cases, run from both
// languages, so a change to either side has to change the cases or fail.
//
// Asserted from here: spec and template. The role and workflow cases are asserted from Python only
// — the app resolves a role inside resolveActor and has no read of the same shape for workflows.

const from = vi.fn();
vi.mock("./supabase", () => ({ supabaseAdmin: () => ({ from }) }));
vi.mock("server-only", () => ({}));

import { resolveSpecFromTable } from "./specs";
import { templateFor } from "./data/templates";

type Row = Record<string, unknown>;

const VECTORS = JSON.parse(
  readFileSync(resolve(process.cwd(), "..", "compass/orchestrator/tests/fixtures/spec_resolution_vectors.json"), "utf8"),
);

/** `spec_file` and `document_template` over the given rows, filtered the way PostgREST would. */
function db(table: string, rows: Row[]) {
  from.mockImplementation((t: string) => {
    if (t !== table) throw new Error(`unexpected table ${t}`);
    return {
      select: () => {
        const f: { col: string; val: unknown }[] = [];
        const q = {
          eq(col: string, val: unknown) { f.push({ col, val }); return this; },
          is(col: string, val: null) { f.push({ col, val }); return this; },
          maybeSingle: async () => ({
            data: rows.filter((r) => f.every(({ col, val }) => (r[col] ?? null) === val))[0] ?? null,
            error: null,
          }),
        };
        return q;
      },
    };
  });
}

beforeEach(() => { from.mockReset(); });

describe("spec_resolution_vectors — spec_file", () => {
  for (const c of VECTORS.spec) {
    it(c.name, async () => {
      db("spec_file", c.rows);
      const got = await resolveSpecFromTable(c.engagement, c.path);
      if (c.expect === null) expect(got).toBeNull();
      else expect({ content: got!.content, tier: got!.tier }).toEqual(c.expect);
    });
  }
});

describe("spec_resolution_vectors — document_template", () => {
  for (const c of VECTORS.template) {
    it(c.name, async () => {
      db("document_template", c.rows);
      const got = await templateFor(c.template, c.engagement, c.org);
      if (c.expect === null) expect(got).toBeNull();
      else expect({ body: got!.body, tier: got!.tier }).toEqual(c.expect);
    });
  }
});
