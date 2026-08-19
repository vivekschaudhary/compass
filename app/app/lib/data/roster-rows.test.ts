import { describe, it, expect } from "vitest";
import { parseRoster } from "./roster-rows";

// The real table the delivery-manager agent wrote for dhcs-n5aq, verbatim — bold names, a vacancy,
// three people in one role, and a fourth column the parser must ignore.
const REAL = `
## Roster

| Role | Holder | Owns (from catalogue) | Source of name |
|---|---|---|---|
| Delivery Manager | **John** | \`basecamp\` (2 steps) | Stated by DM at intake |
| Product Manager | **Jill** | \`create-epics\` | Stated by DM at intake |
| Enterprise Architect | **Jim** | \`setup-foundation-architecture\` (8 steps) | Stated by DM at intake |
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
