import { describe, it, expect } from "vitest";

// An agent should know what the REST of its phase is for.
//
// `file-sow` reads nothing and starts from a blank page, and the prompt tells it that "people who
// were never named are things to ask about, not to invent". Correct on its own — but the inventory
// it was given lists the engagement's WORKFLOWS, not the rows of its own run. So it could not see
// that row 4 is "Staffing plan and resources", owned by the delivery manager, and it asked the
// human for the team. Four rows later `propose-staffing` asked again, because `turn` is keyed on
// `task_id` and the first answer was invisible to it.
//
// These tests are about the RENDERING, which is where the behaviour change lives. What the model
// then does with it can only be seen by running it.

vi.mock("server-only", () => ({}));

import { vi } from "vitest";
const { systemPrompt } = await import("./context");
import type { AgentContext, PhaseRow } from "./context";

const row = (ord: number, title: string, role: string, produces: string | null, later: boolean): PhaseRow =>
  ({ ord, title, role, produces, later });

const ctx = (phaseRows: PhaseRow[]): AgentContext => ({
  taskId: "t1", engagementId: "e1", taskTitle: "File the SOW", taskSubtitle: "",
  roleCode: "delivery-manager", agentFile: "# Agent: DM", produces: "SOW", unresolvedProduces: null, destination: "docs",
  output: null, inputs: [], doneCriteria: ["The SOW is filed"], inventory: [], phaseRows,
  priorDraft: null, rejections: [], sprint: null,
});

describe("the rest of this phase, in the prompt", () => {
  it("lists the other rows with who holds them and what they produce", () => {
    const p = systemPrompt(ctx([
      row(4, "Staffing plan and resources", "delivery-manager", "Staffing plan", true),
      row(7, "Features and how each is judged", "product-owner", "features", true),
    ]));
    expect(p).toContain("# The rest of this phase");
    expect(p).toContain("4 · Staffing plan and resources — delivery-manager → Staffing plan");
    expect(p).toContain("7 · Features and how each is judged — product-owner → features");
  });

  it("marks the rows that come after this one", () => {
    const p = systemPrompt(ctx([
      row(1, "File the Requirements", "delivery-manager", "Requirements", false),
      row(4, "Staffing plan and resources", "delivery-manager", "Staffing plan", true),
    ]));
    const before = p.split("\n").find((l) => l.includes("File the Requirements"))!;
    const after = p.split("\n").find((l) => l.includes("Staffing plan and resources"))!;
    expect(before).not.toContain("(after yours)");
    expect(after).toContain("(after yours)");
  });

  it("says an answer given to the wrong row is LOST, not merely duplicated", () => {
    // The load-bearing sentence. "Do not ask about staffing" would need restating for every row and
    // every subject; a reason generalises. The answer lands in this task's turns, and `turn` is
    // keyed on task_id — the row that needs it never reads it.
    const p = systemPrompt(ctx([row(4, "Staffing plan", "delivery-manager", "Staffing plan", true)]));
    expect(p).toMatch(/the answer is lost/i);
    expect(p).toMatch(/never reads it/i);
  });

  it("points a row at an earlier document rather than at the human", () => {
    const p = systemPrompt(ctx([row(0, "SOW", "delivery-manager", "SOW", false)]));
    expect(p).toMatch(/already produced something/i);
    expect(p).toMatch(/retype what Compass already has/i);
  });

  it("omits the section entirely when there are no other rows", () => {
    // An ad-hoc task with no run is a real case, not an error. An empty heading would read as "this
    // phase has no other work", which is a different and false claim.
    const p = systemPrompt(ctx([]));
    expect(p).not.toContain("# The rest of this phase");
  });
});
