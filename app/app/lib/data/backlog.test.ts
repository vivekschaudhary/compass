import { describe, it, expect } from "vitest";
import { parseBacklog } from "./backlog-rows";

// The real table Compass authored for Provider FFS, verbatim — including the em-dash owner suffix
// and the "STEPS UNSPECIFIED" bold that the agent adds beside a workflow with no dispatch graph.
const REAL = `
Some prose before the table.

| ID | Work | Workflow | Owning role | Exit condition |
|---|---|---|---|---|
| PS0-01 | Shape this kickoff backlog | \`plan-kickoff\` (1 step) | delivery-manager — John | This document approved |
| PS0-02 | Confirm roster | \`staff-engagement\` (1 step) | delivery-manager — John | A named person against every load-bearing role |
| PS0-03 | Approve the bet portfolio | \`create-bet-portfolio\` — **STEPS UNSPECIFIED** | pm — Casey | Portfolio approved |
| PS0-99 | Connect systems of record | — (intake/settings) | delivery-manager | tickets.wired && docs.wired |
`;

describe("parseBacklog", () => {
  it("reads a row per line of the authored table", () => {
    expect(parseBacklog(REAL)).toHaveLength(4);
  });

  it("takes the workflow code out of the backticks, ignoring the step count beside it", () => {
    expect(parseBacklog(REAL).map((r) => r.workflowCode))
      .toEqual(["plan-kickoff", "staff-engagement", "create-bet-portfolio", null]);
  });

  it("leaves a row that names no workflow — intake satisfies those, as it did in v1", () => {
    const connect = parseBacklog(REAL).find((r) => r.ref === "PS0-99")!;
    expect(connect.workflowCode).toBeNull();
    expect(connect.exit).toContain("tickets.wired");
  });

  it("keeps the owning ROLE, not the person against it", () => {
    expect(parseBacklog(REAL).map((r) => r.ownerRole))
      .toEqual(["delivery-manager", "delivery-manager", "pm", "delivery-manager"]);
  });

  it("matches headers by name, so a reordered table still reads", () => {
    const swapped = `
| Owning role | Workflow | # | Work | Exit condition |
|---|---|---|---|---|
| pm | \`create-brief\` | B-1 | Write the brief | Approved |
`;
    expect(parseBacklog(swapped)).toEqual([
      { ref: "B-1", work: "Write the brief", workflowCode: "create-brief", ownerRole: "pm", exit: "Approved" },
    ]);
  });

  it("returns nothing for a table that is not a backlog", () => {
    expect(parseBacklog("| Parameter | Value | Source |\n|---|---|---|\n| Cost | $1.5m | SOW |")).toEqual([]);
  });
});
