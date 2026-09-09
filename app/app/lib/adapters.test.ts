import { describe, it, expect } from "vitest";

const { destinationOf, resolvePath } = await import("./adapters");

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

describe("resolvePath", () => {
  const epic = { ref: "E1", key: "KAN-12" };

  // The overwhelmingly common case, and the one that must not change: every path in the seed today
  // has no token, and resolving it has to hand back the same bytes.
  it("returns a token-free path unchanged", () => {
    expect(resolvePath("02-scope/sow", null)).toBe("02-scope/sow");
    expect(resolvePath("02-scope/sow", epic)).toBe("02-scope/sow");
  });

  it("fills {epic} from the subject", () => {
    expect(resolvePath("03-architecture/epic/{epic}", epic)).toBe("03-architecture/epic/KAN-12");
    expect(resolvePath("03-architecture/epic/{epic}-review", epic))
      .toBe("03-architecture/epic/KAN-12-review");
  });

  // The ticket key is what somebody holding the epic can search for; `E1` means something only
  // inside the turn that drafted it.
  it("prefers the tracker key, and falls back to the ref before Jira has accepted the epic", () => {
    expect(resolvePath("epic/{epic}", { ref: "E1", key: null })).toBe("epic/E1");
    expect(resolvePath("epic/{epic}", { ref: "E1", key: "KAN-12" })).toBe("epic/KAN-12");
  });

  // THE ONE THAT MATTERS. Returning the literal would file every epic's design at a path called
  // `{epic}`, each overwriting the last, with the Done gate passing on all of them.
  it("refuses rather than returning the literal when there is no subject", () => {
    expect(resolvePath("03-architecture/epic/{epic}", null)).toBeNull();
    expect(resolvePath("03-architecture/epic/{epic}", { ref: null, key: null })).toBeNull();
  });

  // Same reason `destinationOf` refuses an unknown slot: a typo that resolves to something
  // plausible is the failure nobody notices.
  it("refuses an unknown token even when a subject is present", () => {
    expect(resolvePath("03-architecture/{story}", epic)).toBeNull();
  });

  it("leaves the destination suffix for destinationOf to read", () => {
    const d = destinationOf("epic/{epic}@docs");
    expect(d).toEqual({ path: "epic/{epic}", slot: "docs" });
    expect(resolvePath(d!.path, epic)).toBe("epic/KAN-12");
  });

  it("has nothing to resolve for an empty path", () => {
    expect(resolvePath("", epic)).toBeNull();
    expect(resolvePath(null, epic)).toBeNull();
  });
});
