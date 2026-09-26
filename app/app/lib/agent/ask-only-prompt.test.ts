import { describe, it, expect, vi } from "vitest";

// A `doc-review`/`code-review` row (or a `supplied` one) gets ONLY `ask` from `toolsFor` — there is
// nothing for it to `draft`. The prompt used to say "you have two tools and must use one of them"
// unconditionally, and a review row with nothing left to ask took that literally: it invented a
// filler question every round rather than ever just saying "done" in plain text, because the
// prompt told it a tool call was mandatory. Live evidence: the model's own preamble read "This call
// is only to satisfy the required structured-output step; there is nothing blocking" — it KNEW it
// had nothing to ask and called `ask` anyway, because the prompt said it must.
//
// These tests are about the PROMPT agreeing with what `toolsFor` actually offers — not about what
// a model then does with it.

vi.mock("server-only", () => ({}));

const { systemPrompt } = await import("./context");
import type { AgentContext } from "./context";

const BASE: AgentContext = {
  taskId: "t1", engagementId: "e1", taskTitle: "Review and approve the staffing plan", taskSubtitle: "",
  roleCode: "product-manager", agentFile: "# Agent: PM", produces: null, unresolvedProduces: null,
  renders: "doc-review", reviewPath: "resource-plan", hasWebSearch: false, destination: null,
  output: null, inputs: [], doneCriteria: ["resource-plan is published"], inventory: [], phaseRows: [],
  template: null, templateName: null,
  priorDraft: null, rejections: [], sprint: null,
};

describe("a row with nothing to produce (doc-review/code-review, or supplied)", () => {
  it("tells the model it has one tool, and that finishing with no tool call is a complete turn", () => {
    const p = systemPrompt(BASE);
    expect(p).toContain("You have one tool: `ask`");
    expect(p).toContain("call no tool at all");
    expect(p).not.toContain("two tools");
    expect(p).not.toContain("Use `draft`");
  });

  it("applies the same way to a `supplied` row, whose `produces` IS set but `draft` is still withheld", () => {
    const p = systemPrompt({ ...BASE, renders: "doc", reviewPath: null, produces: "sow", output: "supplied" });
    expect(p).toContain("You have one tool: `ask`");
    expect(p).not.toContain("two tools");
  });
});

describe("an ordinary authoring row", () => {
  it("still tells the model it has two tools and describes both", () => {
    const p = systemPrompt({ ...BASE, renders: "doc", reviewPath: null, produces: "timeline", output: null });
    expect(p).toContain("You have two tools and must use one of them");
    expect(p).toContain("Use `draft`");
  });
});
