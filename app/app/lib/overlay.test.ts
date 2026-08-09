import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const from = vi.fn();
vi.mock("./supabase", () => ({ supabaseAdmin: () => (from.getMockImplementation() ? { from } : null) }));

import { buildOverlay, overlayHeader, clearOverlays } from "./overlay";

// A fake framework dir, so these tests never depend on the real compass/ contents.
let base = "";
beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "compass-base-"));
  mkdirSync(join(base, "workflows"), { recursive: true });
  mkdirSync(join(base, "agents"), { recursive: true });
  mkdirSync(join(base, "orchestrator"), { recursive: true });
  writeFileSync(join(base, "workflows/build.md"), "SHIPPED BUILD");
  writeFileSync(join(base, "workflows/fix.md"), "SHIPPED FIX");
  writeFileSync(join(base, "agents/pm.md"), "SHIPPED PM");
  writeFileSync(join(base, "config.yaml"), "shipped: true");
  writeFileSync(join(base, "orchestrator/run.py"), "print('code')");
  from.mockReset();
  clearOverlays();
});
afterEach(() => { rmSync(base, { recursive: true, force: true }); clearOverlays(); });

/** spec_file rows, by tier. */
function db(rows: { org?: { path: string; content: string }[]; eng?: { path: string; content: string }[] }) {
  from.mockImplementation(() => ({
    select: () => {
      const q = {
        _org: false,
        eq(col: string) { if (col === "org_id") this._org = true; return this; },
        then: (res: (v: { data: unknown }) => void) => res({ data: q._org ? rows.org ?? [] : rows.eng ?? [] }),
      };
      return q;
    },
  }));
}

describe("buildOverlay", () => {
  it("returns null when nothing is overridden", async () => {
    // No overlay means the run uses the exact bytes on disk — an engagement that customized
    // nothing must cost nothing and behave identically to before this existed.
    db({});
    expect(await buildOverlay("e1", base)).toBeNull();
  });

  it("writes the override and inherits every untouched file", async () => {
    db({ eng: [{ path: "workflows/build.md", content: "CLIENT BUILD" }] });
    const o = (await buildOverlay("e1", base))!;
    expect(readFileSync(join(o.dir, "workflows/build.md"), "utf8")).toBe("CLIENT BUILD");
    expect(readFileSync(join(o.dir, "workflows/fix.md"), "utf8")).toBe("SHIPPED FIX");
    expect(readFileSync(join(o.dir, "agents/pm.md"), "utf8")).toBe("SHIPPED PM");
    expect(readFileSync(join(o.dir, "config.yaml"), "utf8")).toBe("shipped: true");
  });

  it("layers engagement over org", async () => {
    db({
      org: [{ path: "workflows/build.md", content: "ORG BUILD" }, { path: "agents/pm.md", content: "ORG PM" }],
      eng: [{ path: "agents/pm.md", content: "CLIENT PM" }],
    });
    const o = (await buildOverlay("e1", base))!;
    expect(readFileSync(join(o.dir, "workflows/build.md"), "utf8")).toBe("ORG BUILD");
    expect(readFileSync(join(o.dir, "agents/pm.md"), "utf8")).toBe("CLIENT PM");
  });

  it("never copies the orchestrator's source into a writable temp dir", async () => {
    // --compass-dir supplies CONTENT; the Python runs from the repo. Copying executable source
    // into a world-writable location would be a liability for no benefit.
    db({ eng: [{ path: "workflows/build.md", content: "X" }] });
    const o = (await buildOverlay("e1", base))!;
    expect(existsSync(join(o.dir, "orchestrator"))).toBe(false);
  });

  it("builds on the base it is GIVEN, not a global one", async () => {
    // A vendoring project's overrides must layer on ITS projection. Getting this wrong would run
    // an engagement against a different set of workflows entirely, silently.
    const other = mkdtempSync(join(tmpdir(), "compass-vendored-"));
    mkdirSync(join(other, "workflows"), { recursive: true });
    writeFileSync(join(other, "workflows/fix.md"), "VENDORED FIX");
    db({ eng: [{ path: "workflows/build.md", content: "X" }] });
    const o = (await buildOverlay("e1", other))!;
    expect(readFileSync(join(o.dir, "workflows/fix.md"), "utf8")).toBe("VENDORED FIX");
    rmSync(other, { recursive: true, force: true });
  });

  it("reuses the cached overlay for identical content", async () => {
    db({ eng: [{ path: "workflows/build.md", content: "SAME" }] });
    const a = (await buildOverlay("e1", base))!;
    const b = (await buildOverlay("e1", base))!;
    expect(b.dir).toBe(a.dir);
    expect(b.hash).toBe(a.hash);
  });

  it("rebuilds when the override CHANGES", async () => {
    // The cache is content-addressed. If it keyed on engagement id alone, an edited workflow would
    // keep running the old definition until something evicted it — the worst kind of stale.
    db({ eng: [{ path: "workflows/build.md", content: "V1" }] });
    const a = (await buildOverlay("e1", base))!;
    db({ eng: [{ path: "workflows/build.md", content: "V2" }] });
    const b = (await buildOverlay("e1", base))!;
    expect(b.hash).not.toBe(a.hash);
    expect(readFileSync(join(b.dir, "workflows/build.md"), "utf8")).toBe("V2");
  });

  it("gives different engagements different overlays", async () => {
    db({ eng: [{ path: "workflows/build.md", content: "A" }] });
    const a = (await buildOverlay("e1", base))!;
    db({ eng: [{ path: "workflows/build.md", content: "B" }] });
    const b = (await buildOverlay("e2", base))!;
    expect(a.dir).not.toBe(b.dir);
  });

  it("drops a row whose path is not editable", async () => {
    db({ eng: [{ path: "orchestrator/run.py", content: "import os; os.system('rm -rf /')" }] });
    // The only override is illegal, so there is nothing to overlay at all.
    expect(await buildOverlay("e1", base)).toBeNull();
  });

  it("survives concurrent builds of the same content", async () => {
    db({ eng: [{ path: "workflows/build.md", content: "RACE" }] });
    const all = await Promise.all([1, 2, 3, 4].map(() => buildOverlay("e1", base)));
    const dirs = new Set(all.map((o) => o!.dir));
    expect(dirs.size).toBe(1);
    // A run must never read a half-copied overlay, so completeness is asserted, not assumed.
    expect(readFileSync(join(all[0]!.dir, "workflows/build.md"), "utf8")).toBe("RACE");
    expect(readFileSync(join(all[0]!.dir, "workflows/fix.md"), "utf8")).toBe("SHIPPED FIX");
  });
});

describe("overlayHeader", () => {
  it("says so plainly when no overrides apply", () => {
    expect(overlayHeader(null)).toMatch(/framework defaults \(no overrides\)/);
  });

  it("names the hash and every overridden file", async () => {
    // This line is what makes "the workflow did something unexpected" answerable.
    db({ eng: [{ path: "workflows/build.md", content: "X" }, { path: "agents/pm.md", content: "Y" }] });
    const h = overlayHeader(await buildOverlay("e1", base));
    expect(h).toContain("2 overrides");
    expect(h).toContain("agents/pm.md");
    expect(h).toContain("workflows/build.md");
  });
});
