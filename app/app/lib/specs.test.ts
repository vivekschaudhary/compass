import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("./supabase", () => ({ supabaseAdmin: () => from.getMockImplementation() ? { from } : null }));

import { isEditablePath, parseSpecTable, readFrameworkDefault, resolveSpec, effectiveOverrides, hashContent } from "./specs";

/** Rows keyed by tier: { org: [...], engagement: [...] } */
function db(rows: { org?: { path: string; content: string }[]; eng?: { path: string; content: string }[] }) {
  from.mockImplementation(() => ({
    select: () => {
      const q = {
        _org: false, _eng: false, _path: null as string | null,
        eq(col: string, val: string) {
          if (col === "org_id") this._org = true;
          if (col === "engagement_id") this._eng = true;
          if (col === "path") this._path = val;
          return this;
        },
        maybeSingle: async () => {
          const set = q._org ? rows.org ?? [] : rows.eng ?? [];
          return { data: set.find((r) => r.path === q._path) ?? null };
        },
        then: (res: (v: { data: unknown }) => void) => res({ data: q._org ? rows.org ?? [] : rows.eng ?? [] }),
      };
      return q;
    },
  }));
}

beforeEach(() => { from.mockReset(); });

describe("isEditablePath — the security boundary", () => {
  it("allows the whitelisted data directories", () => {
    for (const p of ["workflows/build.md", "agents/pm.md", "templates/sprint-0.md", "stacks/nextjs-ts.md", "config.yaml"]) {
      expect(isEditablePath(p), p).toBe(true);
    }
  });

  it("refuses the orchestrator's source", () => {
    // An "override" of Python the server executes is remote code execution, not configuration.
    for (const p of ["orchestrator/run.py", "orchestrator/hosts/claude.py", "scripts/consistency-check.py"]) {
      expect(isEditablePath(p), p).toBe(false);
    }
  });

  it("refuses traversal, including traversal that starts inside the whitelist", () => {
    // "workflows/../../etc/passwd" passes a naive prefix check and only reveals itself once
    // normalized — which is why normalization happens BEFORE the prefix test.
    for (const p of ["../secrets", "workflows/../../etc/passwd", "workflows/../../../.env",
                     "templates/../../orchestrator/run.py", "..", "../"]) {
      expect(isEditablePath(p), p).toBe(false);
    }
  });

  it("refuses absolute and drive-letter paths", () => {
    for (const p of ["/etc/passwd", "/Users/x/.ssh/id_rsa", "C:/Windows/system32"]) {
      expect(isEditablePath(p), p).toBe(false);
    }
  });

  it("refuses empty, whitespace-padded and null-byte paths", () => {
    for (const p of ["", "  ", " workflows/build.md", "workflows/build.md ", "workflows/\0.md"]) {
      expect(isEditablePath(p), JSON.stringify(p)).toBe(false);
    }
  });

  it("refuses a path outside any whitelisted location", () => {
    for (const p of ["README.md", "package.json", "docs/foundation/product.md"]) {
      expect(isEditablePath(p), p).toBe(false);
    }
  });
});

describe("readFrameworkDefault", () => {
  it("reads a real shipped file", () => {
    expect(readFrameworkDefault("templates/sprint-0.md")).toContain("Sprint 0");
  });

  it("returns null for a whitelisted path that doesn't exist", () => {
    expect(readFrameworkDefault("workflows/no-such-workflow.md")).toBeNull();
  });

  it("throws on a non-editable path rather than reading it", () => {
    expect(() => readFrameworkDefault("../../etc/passwd")).toThrow(/editable/i);
  });
});

describe("resolveSpec — tier precedence", () => {
  it("falls through to the framework file when nothing is overridden", async () => {
    db({});
    const r = await resolveSpec("e1", "templates/sprint-0.md");
    expect(r!.tier).toBe("framework");
    expect(r!.content).toContain("Sprint 0");
  });

  it("prefers the org default over the framework file", async () => {
    db({ org: [{ path: "templates/sprint-0.md", content: "ORG VERSION" }] });
    const r = await resolveSpec("e1", "templates/sprint-0.md");
    expect(r!.tier).toBe("org");
    expect(r!.content).toBe("ORG VERSION");
  });

  it("prefers the engagement override over the org default", async () => {
    db({
      org: [{ path: "templates/sprint-0.md", content: "ORG VERSION" }],
      eng: [{ path: "templates/sprint-0.md", content: "CLIENT VERSION" }],
    });
    const r = await resolveSpec("e1", "templates/sprint-0.md");
    expect(r!.tier).toBe("engagement");
    expect(r!.content).toBe("CLIENT VERSION");
  });

  it("skips the engagement tier entirely when no engagement is given", async () => {
    // This is the org admin's view: what the firm's default IS, not what one client made of it.
    db({
      org: [{ path: "templates/sprint-0.md", content: "ORG VERSION" }],
      eng: [{ path: "templates/sprint-0.md", content: "CLIENT VERSION" }],
    });
    const r = await resolveSpec(null, "templates/sprint-0.md");
    expect(r!.tier).toBe("org");
  });

  it("inherits per FILE, not wholesale — an override of one file doesn't shadow the rest", async () => {
    // The point of copy-on-write: editing sprint-0 must not freeze build.md at fork time.
    db({ eng: [{ path: "templates/sprint-0.md", content: "CLIENT VERSION" }] });
    expect((await resolveSpec("e1", "templates/sprint-0.md"))!.tier).toBe("engagement");
    expect((await resolveSpec("e1", "templates/doc-tree.md"))!.tier).toBe("framework");
  });

  it("refuses a non-editable path", async () => {
    db({});
    await expect(resolveSpec("e1", "orchestrator/run.py")).rejects.toThrow(/editable/i);
  });
});

describe("effectiveOverrides — what the overlay writes", () => {
  it("merges org and engagement, engagement winning", async () => {
    db({
      org: [{ path: "workflows/build.md", content: "ORG BUILD" }, { path: "agents/pm.md", content: "ORG PM" }],
      eng: [{ path: "agents/pm.md", content: "CLIENT PM" }],
    });
    const o = await effectiveOverrides("e1");
    expect(o["workflows/build.md"]).toBe("ORG BUILD");     // inherited
    expect(o["agents/pm.md"]).toBe("CLIENT PM");           // overridden
  });

  it("drops any row whose path is not editable", async () => {
    // Defence in depth: a row written before the whitelist tightened must not reach the overlay.
    db({ org: [{ path: "orchestrator/run.py", content: "import os" }] });
    expect(await effectiveOverrides("e1")).toEqual({});
  });
});

describe("parseSpecTable", () => {
  const SPEC = `# Doc
## Tickets
| # | ticket | workflow | owner | gate |
|---|--------|----------|-------|------|
| 1 | Connect | — | delivery-manager | tickets.wired |
| 2 | Foundation | /create-product-brief | pm | approved |
`;
  const COLS = ["ticket", "workflow", "owner", "gate"] as const;

  it("parses rows and maps columns positionally", () => {
    const { rows, errors } = parseSpecTable(SPEC, "Tickets", COLS);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({ ticket: "Foundation", workflow: "/create-product-brief", owner: "pm", gate: "approved" });
  });

  it("reports a missing section instead of returning silence", () => {
    const { rows, errors } = parseSpecTable(SPEC, "Nodes", COLS);
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/No "## Nodes" section/);
  });

  it("lenient mode keeps a short row; strict mode rejects it", () => {
    // The historical behaviour silently skipped malformed rows — correct for a spec the framework
    // controls, wrong for one a human is editing, where a fumbled pipe deletes a ticket in silence.
    const broken = SPEC + "| 3 | Missing bits | /x |\n";
    expect(parseSpecTable(broken, "Tickets", COLS).rows).toHaveLength(3);
    const strict = parseSpecTable(broken, "Tickets", COLS, { strict: true });
    expect(strict.rows).toHaveLength(2);
    expect(strict.errors.join(" ")).toMatch(/Row 3/);
  });

  it("flags empty cells", () => {
    const blank = SPEC + "| 3 | Ticket |  | pm | gate |\n";
    expect(parseSpecTable(blank, "Tickets", COLS).errors.join(" ")).toMatch(/Row 3.*workflow/);
  });

  it("parses the REAL shipped sprint-0 spec", () => {
    // Same guarantee the sprint0 suite makes, now through the shared parser.
    const { rows, errors } = parseSpecTable(readFrameworkDefault("templates/sprint-0.md")!, "Tickets", COLS);
    expect(errors).toEqual([]);
    expect(rows[0].owner).toBe("delivery-manager");
  });
});

describe("hashContent", () => {
  it("is stable and content-sensitive", () => {
    expect(hashContent("a")).toBe(hashContent("a"));
    expect(hashContent("a")).not.toBe(hashContent("b"));
  });
});
