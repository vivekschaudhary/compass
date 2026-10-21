import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null }));

const { planStoriesFor, storyBody, storyNumber, describeRound } = await import("./stories");

const good = (over: Record<string, unknown> = {}) => ({
  title: "Sign in with Apple",
  description: "As a member I can sign in with my Apple ID.",
  acceptance_criteria: ["Apple sign-in creates an account", "A returning member lands on their gallery"],
  notes: "Depends on the Apple developer account.",
  cites: ["features"],
  ...over,
});

const existing = (ref: string, title: string, ord = 0) =>
  ({ ref, title, body: `## Description\n${title}`, ticketKey: "CT-1", ord });

describe("planStoriesFor — a first decomposition", () => {
  it("numbers stories from 1 under the epic's own handle", () => {
    const plan = planStoriesFor("ACC-E1", [], [good(), good({ title: "Sign up with email" })]);
    expect(plan.added.map((s) => s.ref)).toEqual(["ACC-E1-S1", "ACC-E1-S2"]);
    expect(plan.problems).toEqual([]);
  });

  it("gives every story the standard shape, in a fixed order", () => {
    const [s] = planStoriesFor("ACC-E1", [], [good()]).added;
    const headings = s.body.split("\n").filter((l) => l.startsWith("## "));
    expect(headings).toEqual(["## Description", "## Acceptance criteria", "## Notes"]);
    expect(s.body).toContain("- Apple sign-in creates an account");
  });

  it("writes 'None.' rather than an empty Notes section", () => {
    const [s] = planStoriesFor("ACC-E1", [], [good({ notes: "" })]).added;
    expect(s.body.endsWith("## Notes\nNone.")).toBe(true);
  });
});

describe("planStoriesFor — running again ADDS, and never overrides", () => {
  const had = [existing("ACC-E1-S1", "Sign in with Apple"), existing("ACC-E1-S2", "Sign up with email", 1)];

  it("continues the numbering after the highest the epic already has", () => {
    const plan = planStoriesFor("ACC-E1", had, [good({ title: "Reset a forgotten password" })]);
    expect(plan.added.map((s) => s.ref)).toEqual(["ACC-E1-S3"]);
  });

  it("continues from the highest, not from the count — a gap is not reused", () => {
    const plan = planStoriesFor("ACC-E1", [existing("ACC-E1-S7", "Late story", 6)], [good()]);
    expect(plan.added[0].ref).toBe("ACC-E1-S8");
  });

  it("carries the existing stories into the document exactly as they were, ahead of the new", () => {
    const plan = planStoriesFor("ACC-E1", had, [good({ title: "Reset a forgotten password" })]);
    expect(plan.sections.map((s) => s.heading)).toEqual([
      "ACC-E1-S1 — Sign in with Apple",
      "ACC-E1-S2 — Sign up with email",
      "ACC-E1-S3 — Reset a forgotten password",
    ]);
    expect(plan.sections[0].body).toBe(had[0].body);
  });

  it("drops a story whose title repeats one the epic has, whatever the case or spacing", () => {
    const plan = planStoriesFor("ACC-E1", had, [good({ title: "  sign IN with   apple " })]);
    expect(plan.added).toEqual([]);
    expect(plan.problems.join(" ")).toMatch(/already has a story with that title/);
  });

  it("drops a repeat inside the same response too", () => {
    const plan = planStoriesFor("ACC-E1", [], [good(), good()]);
    expect(plan.added).toHaveLength(1);
    expect(plan.problems).toHaveLength(1);
  });

  it("does not take another epic's numbering", () => {
    const plan = planStoriesFor("LST-E1", [], [good()]);
    expect(plan.added[0].ref).toBe("LST-E1-S1");
  });

  it("adds nothing, and says so, when the epic is already covered", () => {
    const plan = planStoriesFor("ACC-E1", had, []);
    expect(plan.added).toEqual([]);
    expect(plan.existing).toHaveLength(2);
  });
});

describe("planStoriesFor — what is refused, out loud", () => {
  it("drops a story with no acceptance criteria and names it", () => {
    const plan = planStoriesFor("ACC-E1", [], [good({ acceptance_criteria: [] })]);
    expect(plan.added).toEqual([]);
    expect(plan.problems[0]).toMatch(/"Sign in with Apple".*no acceptance criteria/);
  });

  it("treats blank criteria as none", () => {
    const plan = planStoriesFor("ACC-E1", [], [good({ acceptance_criteria: ["", "  "] })]);
    expect(plan.added).toEqual([]);
  });

  it("drops a story with no title or no description", () => {
    const plan = planStoriesFor("ACC-E1", [], [good({ title: "" }), good({ description: " " })]);
    expect(plan.added).toEqual([]);
    expect(plan.problems).toHaveLength(2);
  });

  it("keeps the good stories when a neighbour is dropped", () => {
    const plan = planStoriesFor("ACC-E1", [], [good({ acceptance_criteria: [] }), good({ title: "Second" })]);
    expect(plan.added.map((s) => s.title)).toEqual(["Second"]);
    // Numbered by what is FILED, so the board never shows a gap the approver cannot explain.
    expect(plan.added[0].ref).toBe("ACC-E1-S1");
  });

  it("returns nothing, not a crash, for input that is not a list", () => {
    expect(planStoriesFor("ACC-E1", [], undefined).added).toEqual([]);
    expect(planStoriesFor("ACC-E1", [], "not json").added).toEqual([]);
    expect(planStoriesFor("ACC-E1", [], { stories: [] }).added).toEqual([]);
  });

  it("reads a list that arrived as a JSON string", () => {
    expect(planStoriesFor("ACC-E1", [], JSON.stringify([good()])).added).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("reads the story number off a ref only when it belongs to the epic", () => {
    expect(storyNumber("ACC-E1", "ACC-E1-S4")).toBe(4);
    expect(storyNumber("ACC-E1", "LST-E1-S4")).toBeNull();
    expect(storyNumber("ACC-E1", "ACC-E1")).toBeNull();
  });

  it("renders the body without inventing sections", () => {
    expect(storyBody({ description: "d", acceptance: ["a"], notes: "n" })).toBe(
      "## Description\nd\n\n## Acceptance criteria\n- a\n\n## Notes\nn",
    );
  });
});

describe("describeRound", () => {
  it("says what the epic had and what this round added", () => {
    expect(describeRound({ existing: 3, added: 4 })).toBe("3 stories already · 4 new in this round");
  });

  it("uses the singular", () => {
    expect(describeRound({ existing: 1, added: 1 })).toBe("1 story already · 1 new in this round");
  });

  it("says plainly when there is nothing yet, rather than printing zeroes", () => {
    expect(describeRound({ existing: 0, added: 0 })).toBe("no stories yet · none drafted in this round");
  });

  it("says a first decomposition added things to an empty epic", () => {
    expect(describeRound({ existing: 0, added: 5 })).toBe("no stories yet · 5 new in this round");
  });
});
