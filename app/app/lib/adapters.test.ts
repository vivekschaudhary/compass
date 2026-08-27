import { describe, it, expect } from "vitest";

const { destinationOf } = await import("./adapters");

describe("destinationOf", () => {
  // The default is the whole compatibility story: eleven existing steps carry a bare path and mean
  // the doc store. A default that changed their behaviour would silently reroute every deliverable.
  it("treats a bare path as the doc store", () => {
    expect(destinationOf("02-scope/sow")).toEqual({ path: "02-scope/sow", slot: "docs" });
  });

  it("reads the destination off the path", () => {
    expect(destinationOf("02-scope/deliverables@tickets"))
      .toEqual({ path: "02-scope/deliverables", slot: "tickets" });
    expect(destinationOf("01-foundation/product-brief@docs"))
      .toEqual({ path: "01-foundation/product-brief", slot: "docs" });
  });

  it("tolerates the padding a CSV picks up", () => {
    expect(destinationOf("  02-scope/deliverables @ tickets ".replace(" @ ", "@")))
      .toEqual({ path: "02-scope/deliverables", slot: "tickets" });
    expect(destinationOf("02-scope/deliverables@TICKETS")?.slot).toBe("tickets");
  });

  // An unknown slot must NOT fall back to docs. `@scm` would then publish a page and look exactly
  // like it worked — the failure nobody can see. The caller halts on a null slot.
  it("refuses to guess at an unknown destination", () => {
    expect(destinationOf("code/repo@scm")).toEqual({ path: "code/repo", slot: null });
    expect(destinationOf("02-scope/x@tickest")).toEqual({ path: "02-scope/x", slot: null });
  });

  it("is null when there is nothing to produce", () => {
    expect(destinationOf(null)).toBeNull();
    expect(destinationOf("")).toBeNull();
    expect(destinationOf("   ")).toBeNull();
    // A destination naming no deliverable is not a deliverable.
    expect(destinationOf("@tickets")).toBeNull();
  });

  // The last `@` wins, so a path that legitimately contains one still routes.
  it("splits on the final @", () => {
    expect(destinationOf("02-scope/a@b@tickets")).toEqual({ path: "02-scope/a@b", slot: "tickets" });
  });
});
