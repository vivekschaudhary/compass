import { describe, it, expect } from "vitest";
import { WORKFLOW_SPECS, GENERIC_WORKFLOWS, SPECS_BY_COMMAND, firstSpecForCommand } from "./workflow-specs";

// #148 removed a hand-kept "client-safe mirror" of these specs by DERIVING the lookup maps. The
// drift it removed — a button that renders and does nothing, or an action with no button — was
// invisible except by eye. These pin the derivation, which matters more once the specs become
// per-engagement editable and the maps have to derive from the RESOLVED definitions.

describe("derived maps stay derived", () => {
  it("GENERIC_WORKFLOWS covers exactly the specs", () => {
    expect(Object.keys(GENERIC_WORKFLOWS).sort()).toEqual(Object.keys(WORKFLOW_SPECS).sort());
  });

  it("every label is its spec's verb", () => {
    for (const [key, spec] of Object.entries(WORKFLOW_SPECS)) {
      expect(GENERIC_WORKFLOWS[key]).toBe(spec.verb);
    }
  });

  it("SPECS_BY_COMMAND indexes exactly the specs that declare a command", () => {
    const declared = Object.entries(WORKFLOW_SPECS).filter(([, s]) => s.command);
    const indexed = Object.values(SPECS_BY_COMMAND).flat();
    expect(indexed.sort()).toEqual(declared.map(([k]) => k).sort());
  });

  it("resolves a command to its first runnable spec", () => {
    // A Sprint 0 ticket's acceptance names "via /x"; this is what lets that card offer a REAL
    // action rather than being informational.
    expect(firstSpecForCommand("/create-product-brief")).toBe("product-brief");
    expect(firstSpecForCommand("/not-a-command")).toBeUndefined();
    expect(firstSpecForCommand(null)).toBeUndefined();
    expect(firstSpecForCommand(undefined)).toBeUndefined();
  });
});

describe("spec shape", () => {
  it("every spec has a role, verb and focus", () => {
    for (const [key, s] of Object.entries(WORKFLOW_SPECS)) {
      expect(s.role, `${key}.role`).toBeTruthy();
      expect(s.verb, `${key}.verb`).toBeTruthy();
      expect(s.focus, `${key}.focus`).toBeTruthy();
    }
  });

  it("every command is a well-formed slash-command", () => {
    // These are matched against the acceptance text of Sprint 0 tickets, so a malformed one
    // silently produces a card with no action.
    for (const [key, s] of Object.entries(WORKFLOW_SPECS)) {
      if (s.command) expect(s.command, `${key}.command`).toMatch(/^\/[a-z][a-z0-9-]*$/);
    }
  });

  it("a gated spec names who approves", () => {
    // gate:true with no gateRole would park a ticket at the HITL status with nobody holding it.
    for (const [key, s] of Object.entries(WORKFLOW_SPECS)) {
      if (s.gate) expect(s.gateRole, `${key}.gateRole`).toBeTruthy();
    }
  });
});
