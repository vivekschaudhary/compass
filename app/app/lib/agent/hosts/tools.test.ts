import { describe, it, expect, vi } from "vitest";

// Confirmed live: `execute-scaffold`'s own `output` is `scaffold`, not `code` — unrecognized by
// `TOOL_FOR` originally, so `toolsFor` fell through to the GENERAL default (`ask`/`draft`), neither
// of which fits "build a repo". The model settled on an empty `ask` every run, reproducibly. The
// first fix aliased `scaffold` onto the `code` tool; `scaffold` now has its own tool and handler,
// since `code`'s is entirely build-shaped (requires a story, which a new repo does not have).

vi.mock("server-only", () => ({}));
vi.mock("../context", () => ({ ASK_BATCH: 3 }));

const { toolsFor } = await import("./tools");

describe("toolsFor", () => {
  it("offers the code tool (plus ask) for output: 'code'", () => {
    const names = toolsFor("code").map((t) => t.name).sort();
    expect(names).toEqual(["ask", "code"]);
  });

  it("offers its OWN tool (plus ask) for output: 'scaffold' — not the code tool", () => {
    const names = toolsFor("scaffold").map((t) => t.name).sort();
    expect(names).toEqual(["ask", "scaffold"]);
  });

  it("falls back to ask/draft for an output with no special tool", () => {
    const names = toolsFor("something-unrecognised").map((t) => t.name).sort();
    expect(names).toEqual(["ask", "draft"]);
  });

  it("offers only ask when the step cannot produce (a supplied row, or an unresolved subject)", () => {
    const names = toolsFor("code", false).map((t) => t.name);
    expect(names).toEqual(["ask"]);
  });
});
