import { describe, it, expect } from "vitest";
import { commitmentsSection, overviewSection, parseCommitments, type Commitment } from "./sprint-rows";

// The commitments cross the gap between the agent drafting and a human approving, and they cross it
// inside the published document — Compass keeps no sprint table. So the render and the parse are
// load-bearing in a way the roster's parse is not: if they disagree, an approved sprint reaches the
// board with the wrong stories in it, and nothing anywhere would say so.

const C = (over: Partial<Commitment> = {}): Commitment => ({
  ref: "E1-S1", ticketKey: "KAN-11", title: "Sign in with a magic link",
  ownerRole: "engineer", why: "No new screens; the flow already exists.",
  ...over,
});

describe("commitmentsSection / parseCommitments", () => {
  it("round-trips what the tool returned", () => {
    const given = [
      C(),
      C({ ref: "E1-S2", ticketKey: "KAN-12", title: "Account switcher", ownerRole: "designer",
          why: "Needs a new screen." }),
      C({ ref: "E2-S1", ticketKey: "KAN-19", title: "Nightly restore drill", ownerRole: "automation",
          why: "SRE owns the outcome." }),
    ];
    expect(parseCommitments(commitmentsSection(given).body).commitments).toEqual(given);
  });

  it("round-trips a story that is not on the board", () => {
    // The em dash the renderer writes for a null ticket has to come back as null, not as "—".
    // Otherwise the mirror would try to label an issue called "—" and report success.
    const given = [C({ ticketKey: null })];
    const back = parseCommitments(commitmentsSection(given).body).commitments;
    expect(back[0].ticketKey).toBeNull();
    expect(back).toEqual(given);
  });

  it("survives a pipe inside a story title", () => {
    // An unescaped pipe would end the cell and shift every column after it — the owner would be
    // read out of the Why column, and the sprint would be assigned to nobody real.
    const given = [C({ title: "Export as CSV | TSV", why: "Table work | no new screens" })];
    expect(parseCommitments(commitmentsSection(given).body).commitments).toEqual(given);
  });

  it("matches columns by name, not by position", () => {
    const md = `
| Why | Owner | Story | Ticket | Ref |
|---|---|---|---|---|
| Needs a new screen. | designer | Account switcher | KAN-12 | E1-S2 |
`;
    expect(parseCommitments(md).commitments).toEqual([{
      ref: "E1-S2", ticketKey: "KAN-12", title: "Account switcher",
      ownerRole: "designer", why: "Needs a new screen.",
    }]);
  });

  it("ignores a column it does not know", () => {
    const md = `
| Ref | Ticket | Story | Owner | Why | Points |
|---|---|---|---|---|---|
| E1-S1 | KAN-11 | Sign in | engineer | No new screens. | 3 |
`;
    expect(parseCommitments(md).commitments).toHaveLength(1);
    expect(parseCommitments(md).commitments[0].ownerRole).toBe("engineer");
  });

  it("strips the emphasis agents put round values", () => {
    const md = `
| Ref | Ticket | Story | Owner | Why |
|---|---|---|---|---|
| \`E1-S1\` | **KAN-11** | Sign in | \`engineer\` | Because. |
`;
    const [row] = parseCommitments(md).commitments;
    expect(row.ref).toBe("E1-S1");
    expect(row.ticketKey).toBe("KAN-11");
    expect(row.ownerRole).toBe("engineer");
  });

  it("skips the roster table and finds the commitments", () => {
    // A sprint plan carries a capacity table too, and it has an Owner column. Requiring a Ref
    // column is the discriminator; without it the roster's rows would be committed to the sprint.
    const md = `
## Capacity

| Role | Holder | Days |
|---|---|---|
| engineer | Jay | 8 |

## Commitments

| Ref | Ticket | Story | Owner | Why |
|---|---|---|---|---|
| E1-S1 | KAN-11 | Sign in | engineer | Because. |
`;
    const { commitments } = parseCommitments(md);
    expect(commitments).toHaveLength(1);
    expect(commitments[0].ref).toBe("E1-S1");
  });

  it("reports a table with no Ticket column instead of returning zero rows", () => {
    // Silently returning [] here would read to the materialiser as "this sprint committed to
    // nothing", which is indistinguishable from a plan that genuinely did — and it would pass.
    const md = `
| Ref | Story | Owner |
|---|---|---|
| E1-S1 | Sign in | engineer |
`;
    const { commitments, problems } = parseCommitments(md);
    expect(commitments).toHaveLength(0);
    expect(problems.join(" ")).toMatch(/no Ticket column/i);
  });

  it("names a row whose owner is missing rather than dropping it", () => {
    const md = `
| Ref | Ticket | Story | Owner | Why |
|---|---|---|---|---|
| E1-S1 | KAN-11 | Sign in | engineer | Because. |
| E1-S2 | KAN-12 | Switcher | — | Nobody said. |
`;
    const { commitments, problems } = parseCommitments(md);
    expect(commitments.map((c) => c.ref)).toEqual(["E1-S1"]);
    expect(problems.join(" ")).toContain("E1-S2");
  });

  it("returns nothing and says nothing when there is no table at all", () => {
    const { commitments, problems } = parseCommitments("## The plan\n\nWe will do some work.");
    expect(commitments).toHaveLength(0);
    expect(problems).toHaveLength(0);
  });

  it("does not mistake the alignment rule for a row", () => {
    const md = `
| Ref | Ticket | Story | Owner | Why |
|:---|:---:|---:|---|---|
| E1-S1 | KAN-11 | Sign in | engineer | Because. |
`;
    expect(parseCommitments(md).commitments).toHaveLength(1);
  });
});

describe("overviewSection", () => {
  const s = { number: 3, goal: "Ship sign-in", starts: "2026-09-07", ends: "2026-09-18" };

  it("states the number that was allocated", () => {
    expect(overviewSection(s).heading).toBe("Sprint 3");
    expect(overviewSection(s).body).toContain("| Sprint | 3 |");
  });

  it("says a goal is missing rather than rendering a blank", () => {
    expect(overviewSection({ ...s, goal: "" }).body).toContain("_Not stated._");
  });

  // THE ONE THAT MATTERS. The overview is a two-column table sitting ABOVE the commitments table in
  // the same document. If the parser took it for the commitments, approval would try to label
  // issues called "Starts" and "Ends" — and the real commitments would never reach the board.
  it("is not mistaken for the commitments table", () => {
    const doc = [
      `## ${overviewSection(s).heading}`, overviewSection(s).body, "",
      "## Commitments", commitmentsSection([C()]).body,
    ].join("\n");
    const { commitments } = parseCommitments(doc);
    expect(commitments).toEqual([C()]);
  });

  it("does not swallow the commitments when the plan has no narrative between them", () => {
    const doc = overviewSection(s).body + "\n\n" + commitmentsSection([C(), C({ ref: "E1-S2" })]).body;
    expect(parseCommitments(doc).commitments).toHaveLength(2);
  });
});
