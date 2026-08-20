import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { specKind, validateSpec } from "./spec-validate";
import { COMPASS_DIR } from "./specs";

// These really do spawn python3 — no credentials involved, and mocking the subprocess would test
// the mock rather than the thing that matters (that the app and the orchestrator agree on what a
// file means). Slower than the rest of the suite by design.

describe("specKind", () => {
  it("maps each whitelisted shape to its validator", () => {
    expect(specKind("workflows/build.md")).toBe("workflow");
    expect(specKind("agents/product-manager.md")).toBe("agent");
    expect(specKind("templates/sprint-0.md")).toBe("table");
    expect(specKind("templates/doc-tree.md")).toBe("table");
  });

  it("returns null for prose we cannot check mechanically", () => {
    // Honest rather than pretending to verify something we can't: these save without a structural
    // gate instead of being blocked by a check that doesn't apply.
    expect(specKind("config.yaml")).toBeNull();
    expect(specKind("templates/brief.md")).toBeNull();
    expect(specKind("framework/canon.md")).toBeNull();
  });
});

describe("validateSpec against the real parser", () => {
  it("returns null when there is nothing to validate", async () => {
    expect(await validateSpec("config.yaml", "a: 1")).toBeNull();
  });

  it("parses a shipped workflow", async () => {
    const src = readFileSync(join(COMPASS_DIR, "workflows/create-product-brief.md"), "utf8");
    const r = await validateSpec("workflows/create-product-brief.md", src);
    expect(r?.kind).toBe("workflow");
    expect(r?.ok).toBe(true);
    if (r?.kind === "workflow") {
      expect(r.steps.length).toBeGreaterThan(0);
      expect(r.hitl_count).toBeGreaterThan(0);
      expect(r.agents).toContain("product-manager");
    }
  }, 30_000);

  it("reports a gutted dispatch graph as unusable", async () => {
    const r = await validateSpec("workflows/build.md", "## Dispatch graph\n\nprose, no steps\n");
    expect(r?.ok).toBe(false);
  }, 30_000);

  it("agrees with the orchestrator on a shipped agent's hosts", async () => {
    const src = readFileSync(join(COMPASS_DIR, "agents/product-manager.md"), "utf8");
    const r = await validateSpec("agents/product-manager.md", src);
    expect(r?.kind).toBe("agent");
    if (r?.kind === "agent") expect(r.preferred_hosts.length).toBeGreaterThan(0);
  }, 30_000);

  it("parses the sprint-0 table with its real columns", async () => {
    const src = readFileSync(join(COMPASS_DIR, "templates/sprint-0.md"), "utf8");
    const r = await validateSpec("templates/sprint-0.md", src);
    expect(r?.kind).toBe("table");
    if (r?.kind === "table") {
      expect(r.rows[0].owner).toBe("delivery-manager");
      expect(r.warnings).toEqual([]);
    }
  }, 30_000);

  it("treats an unrunnable validator as NOT ok, never as fine", async () => {
    // "We could not check it" must not read as "it is safe" — the same rule the readiness probe
    // follows. A 1ms budget guarantees the timeout path.
    const r = await validateSpec("workflows/build.md", "## Dispatch graph\n\n### Step 1. `pm.draft`\n", 1);
    expect(r?.ok).toBe(false);
    expect(r?.warnings.join(" ")).toMatch(/timed out|could not/i);
  }, 30_000);
});
