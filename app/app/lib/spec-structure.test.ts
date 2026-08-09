import { describe, it, expect } from "vitest";
import { structuralChanges, isDangerous, summarizeChanges } from "./spec-structure";
import type { ValidateResult, WorkflowStep } from "./spec-validate";

// The gate that replaced `hitl_count`. The count check was measured against the real corpus and
// does NOT catch the actual corruption — see the heading-damage test below, which reproduces the
// exact before/after measured on create-product-brief.md.

const step = (n: number, hitl: boolean, agent: string | null): WorkflowStep => ({
  n, title: `Step ${n}`, hitl, agent, task: agent ? "do" : null,
  agent_file: agent ? `${agent}.md` : null, artifact_target: null, routes: null,
});

type WorkflowResult = Extract<ValidateResult, { kind: "workflow" }>;

function wf(steps: WorkflowStep[]): WorkflowResult {
  return {
    kind: "workflow", ok: steps.length > 0, has_dispatch_graph: true, steps,
    hitl_count: steps.filter((s) => s.hitl).length,
    agents: [...new Set(steps.map((s) => s.agent).filter((a): a is string => !!a))].sort(),
    requires_approved: [], warnings: [],
  };
}

const BASE = wf([
  step(1, false, "researcher"), step(2, true, null), step(3, false, "pm"),
  step(4, true, null), step(5, false, "delivery-manager"),
]);

describe("the corruption a count misses", () => {
  it("catches a damaged step heading even though hitl_count is unchanged", () => {
    // Measured on the real create-product-brief.md: demoting `### Step 2.` merges its body into
    // step 1, so step 1 becomes a gate, the researcher stops being dispatched, and step 2 vanishes.
    const after = wf([
      step(1, true, null), step(3, false, "pm"), step(4, true, null), step(5, false, "delivery-manager"),
    ]);

    expect(after.hitl_count).toBe(BASE.hitl_count);          // the trap: totals look fine

    const changes = structuralChanges(BASE, after);
    const kinds = changes.filter(isDangerous).map((c) => c.kind);
    expect(kinds).toContain("step-removed");
    expect(kinds).toContain("step-became-gate");
    expect(kinds).toContain("agent-removed");
    expect(summarizeChanges(changes)).toMatch(/researcher/);
  });
});

describe("workflow regressions require confirmation", () => {
  it("flags a gate turning into an automated step", () => {
    const after = wf([step(1, false, "researcher"), step(2, false, "pm"), step(3, false, "pm"),
                      step(4, true, null), step(5, false, "delivery-manager")]);
    const c = structuralChanges(BASE, after).filter(isDangerous);
    expect(c.map((x) => x.kind)).toContain("gate-removed");
  });

  it("flags a step disappearing", () => {
    const after = wf(BASE.steps.filter((s) => s.n !== 3));
    expect(structuralChanges(BASE, after).filter(isDangerous).map((c) => c.kind)).toContain("step-removed");
  });

  it("flags an agent no longer being dispatched", () => {
    const after = wf([step(1, false, "pm"), step(2, true, null), step(3, false, "pm"),
                      step(4, true, null), step(5, false, "delivery-manager")]);
    const c = structuralChanges(BASE, after).filter(isDangerous);
    expect(c.some((x) => x.kind === "agent-removed" && x.detail.includes("researcher"))).toBe(true);
  });

  it("does not double-report one lost gate", () => {
    const after = wf([step(1, false, "researcher"), step(3, false, "pm"),
                      step(4, true, null), step(5, false, "delivery-manager")]);
    const gateRemoved = structuralChanges(BASE, after).filter((c) => c.kind === "gate-removed");
    expect(gateRemoved.length).toBeLessThanOrEqual(1);
  });
});

describe("additions are informational, not blocking", () => {
  it("adding a gate is safe", () => {
    const after = wf([...BASE.steps, step(6, true, null)]);
    const changes = structuralChanges(BASE, after);
    expect(changes.filter(isDangerous)).toEqual([]);
    expect(changes.map((c) => c.kind)).toContain("gate-added");
  });

  it("adding a step and an agent is safe", () => {
    const after = wf([...BASE.steps, step(6, false, "architect")]);
    const changes = structuralChanges(BASE, after);
    expect(changes.filter(isDangerous)).toEqual([]);
    expect(changes.map((c) => c.kind)).toEqual(expect.arrayContaining(["step-added", "agent-added"]));
  });

  it("an identical file reports nothing", () => {
    expect(structuralChanges(BASE, BASE)).toEqual([]);
    expect(summarizeChanges([])).toMatch(/No structural regressions/);
  });
});

describe("no baseline to compare against", () => {
  it("reports nothing on a first override", () => {
    // You cannot lose a gate you never had at this tier.
    expect(structuralChanges(null, BASE)).toEqual([]);
  });

  it("reports nothing when the kinds differ", () => {
    const agent: ValidateResult = { kind: "agent", ok: true, preferred_hosts: ["claude"], executor_tools: [], model_tier: null, loads_bet_catalog: false, has_frontmatter: true, warnings: [] };
    expect(structuralChanges(BASE, agent)).toEqual([]);
  });
});

describe("agent files", () => {
  const agent = (hosts: string[], tools: string[] = []): ValidateResult => ({
    kind: "agent", ok: true, preferred_hosts: hosts, executor_tools: tools,
    model_tier: null, loads_bet_catalog: false, has_frontmatter: true, warnings: [],
  });

  it("flags a host change — which model runs an agent is a cost and capability decision", () => {
    const c = structuralChanges(agent(["claude"]), agent(["gemini"])).filter(isDangerous);
    expect(c.map((x) => x.kind)).toContain("hosts-changed");
  });

  it("flags tools being removed", () => {
    const c = structuralChanges(agent(["claude"], ["read_file", "grep"]), agent(["claude"], ["read_file"]));
    expect(c.filter(isDangerous).some((x) => x.detail.includes("grep"))).toBe(true);
  });

  it("adding a tool is not a regression", () => {
    const c = structuralChanges(agent(["claude"], ["read_file"]), agent(["claude"], ["read_file", "grep"]));
    expect(c.filter(isDangerous)).toEqual([]);
  });
});

describe("table specs", () => {
  const table = (n: number): ValidateResult => ({
    kind: "table", ok: n > 0, rows: Array.from({ length: n }, (_, i) => ({ ticket: `T${i}` })), warnings: [],
  });

  it("flags a removed row — for sprint-0 that is a kickoff ticket that will never be created", () => {
    expect(structuralChanges(table(3), table(2)).filter(isDangerous).map((c) => c.kind)).toContain("rows-removed");
  });

  it("adding a row is safe", () => {
    expect(structuralChanges(table(3), table(4)).filter(isDangerous)).toEqual([]);
  });
});
