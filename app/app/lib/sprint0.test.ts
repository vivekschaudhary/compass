import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase", () => ({ supabaseAdmin: () => null }));   // no DB → resolve falls to the file

import { readSprint0Default, readSprint0, SPRINT_0_PATH } from "./sprint0";

// These assert the SHIPPED spec still parses — so they read the framework default directly rather
// than the resolved (overridable) copy. The spec is user-editable data whose column order is
// load-bearing and unenforced by markdown, so what's worth testing is that the actual file driving
// every new engagement is still well-formed. A fixture would pass happily while it had drifted.

describe("readSprint0Default — parsing the shipped spec", () => {
  const rows = readSprint0Default();

  it("finds the ticket table", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("maps every column to the right field", () => {
    // Column ORDER is load-bearing and nothing in markdown enforces it: swap two headers and every
    // ticket silently gets the wrong owner and an unreachable gate.
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
    // depends-on is expressed as ordering; tickets must materialize in that sequence.
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
    // narrow: anything that DOES start with "/" must be a real command name, because it is
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
});

describe("readSprint0 — the resolved copy", () => {
  it("falls back to the shipped spec when nothing is overridden", async () => {
    // supabaseAdmin is mocked to null here, so this is the no-override path.
    expect(await readSprint0("e1")).toEqual(readSprint0Default());
  });

  it("reads a whitelisted path", () => {
    // If this ever moved outside the editable whitelist, every resolve would throw rather than
    // silently degrade — worth pinning next to the constant it depends on.
    expect(SPRINT_0_PATH).toBe("templates/sprint-0.md");
  });
});
