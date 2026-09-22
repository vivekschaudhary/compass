import { describe, it, expect } from "vitest";
import { normaliseRosterRows, parseRoster, rosterSection } from "./roster-rows";

// The real table the delivery-manager agent wrote for dhcs-n5aq, verbatim — bold names, a vacancy,
// three people in one role, and a fourth column the parser must ignore.
const REAL = `
## Roster

| Role | Holder | Owns (from catalogue) | Source of name |
|---|---|---|---|
| Delivery Manager | **John** | \`basecamp\` (2 steps) | Stated by DM at intake |
| Product Manager | **Jill** | \`create-epics\` | Stated by DM at intake |
| Principal Engineer | **Jim** | \`setup-foundation-architecture\` (8 steps) | Stated by DM at intake |
| Engineer | **Jay** | \`build\`, \`fix\` | Stated by DM at intake |
| Engineer | **Jackie** | \`build\`, \`fix\` | Stated by DM at intake |
| Support | **Unassigned** | \`triage\` (9 steps) | See "Deliberately unstaffed" |
`;

describe("parseRoster", () => {
  it("reads every row of the roster the agent actually wrote", () => {
    expect(parseRoster(REAL)).toHaveLength(6);
  });

  it("strips the emphasis agents put round names", () => {
    // "**John**" is not a name. The site would have shown the asterisks.
    expect(parseRoster(REAL)[0]).toEqual({ roleLabel: "Delivery Manager", holder: "John" });
  });

  it("keeps every person in a role held by more than one", () => {
    // Three engineers was the real case, and the member id had to stop colliding because of it.
    const engineers = parseRoster(REAL).filter((r) => r.roleLabel === "Engineer");
    expect(engineers.map((e) => e.holder)).toEqual(["Jay", "Jackie"]);
  });

  it("records a vacancy as a vacancy, not as a person called Unassigned", () => {
    const support = parseRoster(REAL).find((r) => r.roleLabel === "Support")!;
    expect(support.holder).toBeNull();
  });

  it("matches headers by name, so a reordered table still reads", () => {
    const swapped = `
| Holder | Notes | Role |
|---|---|---|
| Dana | — | Researcher |
`;
    expect(parseRoster(swapped)).toEqual([{ roleLabel: "Researcher", holder: "Dana" }]);
  });

  it("returns nothing for a table that is not a roster", () => {
    expect(parseRoster("| Parameter | Value |\n|---|---|\n| Cost | $1.5m |")).toEqual([]);
  });
});

// The render side, and why it exists: `output: roster` was the one output that must become state
// and had NO tool, so the agent got plain `draft` and the names it was given reached the page as
// whatever prose it chose — or not at all. The live symptom was a delivery manager answering three
// questions with real names and `member` staying empty. The tool returns rows; this renders them
// into the exact table the parser above already reads, so the round trip is mechanical rather than
// a hope about formatting.

describe("rosterSection", () => {
  it("round-trips the rows the tool returned", () => {
    const given = [
      { role: "Delivery Manager", holder: "John" },
      { role: "Product Manager", holder: "Jill" },
    ];
    expect(parseRoster(rosterSection(given).body)).toEqual([
      { roleLabel: "Delivery Manager", holder: "John" },
      { roleLabel: "Product Manager", holder: "Jill" },
    ]);
  });

  it("renders an unfilled role as a vacancy the parser reads back as one", () => {
    // Both directions matter: the row must survive (a role nobody considered is different from a
    // role nobody has yet), and it must not staff a person called "TBD".
    const back = parseRoster(rosterSection([{ role: "Support", holder: "TBD" }]).body);
    expect(back).toEqual([{ roleLabel: "Support", holder: null }]);
  });

  it("renders a blank holder as a vacancy rather than an empty cell", () => {
    // An empty cell would make the row narrower than the header, and `parseRoster` drops those —
    // the role would vanish silently, which is the failure this whole change is about.
    const body = rosterSection([{ role: "Researcher", holder: "" }]).body;
    expect(body).toContain("| Researcher | — |");
    expect(parseRoster(body)).toEqual([{ roleLabel: "Researcher", holder: null }]);
  });

  it("survives a pipe in a name", () => {
    // `parseRoster` splits on every pipe and has no escaping to undo, so a stray one would shift
    // the Holder column and staff the wrong text. Stripped at render rather than escaped.
    const back = parseRoster(rosterSection([{ role: "Engineer | Lead", holder: "A | B" }]).body);
    expect(back).toEqual([{ roleLabel: "Engineer / Lead", holder: "A / B" }]);
  });

  it("keeps two people in one role", () => {
    const back = parseRoster(rosterSection([
      { role: "Engineer", holder: "Jay" },
      { role: "Engineer", holder: "Jackie" },
    ]).body);
    expect(back.map((r) => r.holder)).toEqual(["Jay", "Jackie"]);
  });
});

describe("normaliseRosterRows", () => {
  it("keeps what the tool returned", () => {
    expect(normaliseRosterRows([{ role: "Engineer", holder: "Jay" }])).toEqual({
      rows: [{ role: "Engineer", holder: "Jay" }],
      problems: [],
    });
  });

  it("drops a row with no role and SAYS so", () => {
    // Reported, not silently shortened — the approver is saying yes to a roster on the strength of
    // it being complete. Same posture as `normaliseBacklog`'s dropped epics.
    const { rows, problems } = normaliseRosterRows([
      { role: "", holder: "Nobody" },
      { role: "Engineer", holder: "Jay" },
    ]);
    expect(rows).toEqual([{ role: "Engineer", holder: "Jay" }]);
    expect(problems).toEqual(["Dropped row 1 with no role."]);
  });

  it("keeps a row whose holder is missing — an open role is an answer", () => {
    expect(normaliseRosterRows([{ role: "Support" }]).rows).toEqual([
      { role: "Support", holder: "" },
    ]);
  });

  it("treats a shape that is not a list as nothing, without throwing", () => {
    expect(normaliseRosterRows(undefined)).toEqual({ rows: [], problems: [] });
    expect(normaliseRosterRows("not a list")).toEqual({ rows: [], problems: [] });
  });
});
