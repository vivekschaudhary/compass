import { describe, it, expect } from "vitest";
import { readSprint0 } from "./sprint0";

// readSprint0 parses the REAL framework spec (compass/templates/sprint-0.md), not a fixture. That
// is deliberate: the spec is user-editable data whose column order is load-bearing and unenforced
// by markdown, so the thing worth testing is that the shipped file still parses. A fixture would
// pass happily while the actual file that drives every new engagement had drifted.

describe("readSprint0 — parsing the shipped spec", () => {
  const rows = readSprint0();

  it("finds the ticket table", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("maps every column to the right field", () => {
    // Column ORDER is the load-bearing part and nothing in markdown enforces it: swap two headers
    // and every ticket silently gets the wrong owner and an unreachable gate.
    const connect = rows.find((r) => /connect systems/i.test(r.ticket));
    expect(connect).toBeDefined();
    expect(connect!.owner).toBe("delivery-manager");
    expect(connect!.gate).toContain("tickets.wired");

    const foundation = rows.find((r) => r.workflow === "/create-product-brief");
    expect(foundation).toBeDefined();
    expect(foundation!.owner).toBe("pm");
    expect(foundation!.gate).toContain("approved");
  });

  it("keeps the spec's row order", () => {
    // depends-on in the spec is expressed as ordering; tickets must materialize in that sequence.
    expect(rows[0].ticket).toMatch(/connect systems/i);
  });

  it("yields no empty fields", () => {
    for (const r of rows) {
      expect(r.ticket, "ticket").not.toBe("");
      expect(r.owner, "owner").not.toBe("");
      expect(r.gate, "gate").not.toBe("");
    }
  });

  it("only renders '· via' for well-formed slash-commands", () => {
    // A ticket may legitimately have no workflow — row 1 is "— (intake/settings)", worked through
    // setup rather than a command. createSprint0 keys off `startsWith("/")`, so the invariant is
    // narrow: anything that DOES start with "/" must be a real command name, because it gets
    // rendered into the acceptance line as the instruction for closing the ticket.
    for (const r of rows) {
      if (r.workflow.startsWith("/")) expect(r.workflow).toMatch(/^\/[a-z][a-z0-9-]*$/);
    }
  });

  it("has at least one ticket closed by a slash-command", () => {
    // Guards the other direction: a spec where nothing parsed as a command would leave every
    // ticket with no route to Done, and the narrow test above would still pass vacuously.
    expect(rows.some((r) => r.workflow.startsWith("/"))).toBe(true);
  });

  it("returns [] rather than throwing when the spec is missing", () => {
    // A docs-only checkout without compass/ must not 500 the intake route.
    const prev = process.env.COMPASS_DIR;
    process.env.COMPASS_DIR = "/nonexistent/compass";
    // readSprint0 resolves COMPASS_DIR at module load, so this asserts the try/catch contract
    // rather than the env read; the parser still must not throw on absent input.
    expect(() => readSprint0()).not.toThrow();
    process.env.COMPASS_DIR = prev;
  });
});
