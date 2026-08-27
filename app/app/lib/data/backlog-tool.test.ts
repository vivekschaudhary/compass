import { describe, it, expect, vi } from "vitest";

// `normaliseBacklog` and `sectionsOf` are pure — the Supabase-touching half of the module is
// stubbed away at the boundary, as `tracker.test.ts` does for the same reason.
vi.mock("server-only", () => ({}));
vi.mock("../supabase", () => ({ supabaseAdmin: () => null }));

const { normaliseBacklog, sectionsOf } = await import("./backlog");

const epic = (over: Record<string, unknown> = {}) => ({
  ref: "E1", title: "Provider search refresh", body: "The M2 slice.",
  cites: ["02-scope/sow"], stories: [], ...over,
});

describe("normaliseBacklog", () => {
  it("keeps a well-formed backlog intact", () => {
    const { epics, problems } = normaliseBacklog([
      epic({ stories: [{ ref: "E1-S1", title: "Map view", body: "Pins and clustering.", cites: ["02-scope/sow"] }] }),
    ]);
    expect(problems).toEqual([]);
    expect(epics).toHaveLength(1);
    expect(epics[0].stories[0].title).toBe("Map view");
  });

  // `strict: true` guarantees the SHAPE. It does not stop a model reusing a handle, and a duplicate
  // would collide on the table's unique index — failing the whole write after issues were created.
  it("renames a duplicate ref rather than losing the epic", () => {
    const { epics, problems } = normaliseBacklog([epic(), epic({ title: "Second" })]);
    expect(epics).toHaveLength(2);
    expect(new Set(epics.map((e) => e.ref)).size).toBe(2);
    expect(problems.join(" ")).toMatch(/labelled `E1`/);
  });

  it("labels an epic the model left unlabelled", () => {
    const { epics } = normaliseBacklog([epic({ ref: "" })]);
    expect(epics[0].ref).toBe("E1");
  });

  // A titleless epic cannot become a ticket — the summary is the one field Jira requires.
  it("drops an untitled epic and says so", () => {
    const { epics, problems } = normaliseBacklog([epic(), epic({ ref: "E2", title: "  " })]);
    expect(epics).toHaveLength(1);
    expect(problems.join(" ")).toMatch(/position 2/);
  });

  it("drops an untitled story under a named epic", () => {
    const { epics, problems } = normaliseBacklog([
      epic({ stories: [{ ref: "E1-S1", title: "", body: "x", cites: [] }] }),
    ]);
    expect(epics[0].stories).toEqual([]);
    expect(problems.join(" ")).toMatch(/story under `E1`/);
  });

  // Kept, not dropped: on a thin engagement an undecomposed epic is the honest answer, and deleting
  // it would hide that from whoever approves the backlog.
  it("keeps an epic with no stories, and flags it", () => {
    const { epics, problems } = normaliseBacklog([epic()]);
    expect(epics).toHaveLength(1);
    expect(problems.join(" ")).toMatch(/has no stories/);
  });

  it("survives junk instead of a backlog", () => {
    expect(normaliseBacklog("not an array").epics).toEqual([]);
    expect(normaliseBacklog(null).epics).toEqual([]);
    expect(normaliseBacklog([null, 7, "x"]).epics).toEqual([]);
  });

  it("parses a backlog that arrived as a JSON string", () => {
    const { epics } = normaliseBacklog(JSON.stringify([epic()]));
    expect(epics[0].title).toBe("Provider search refresh");
  });
});

describe("sectionsOf", () => {
  // The filed document must stay a document: citations are written per section, `priorDraft` reads
  // sections back on a redraft, and downstream steps quote it.
  it("makes one section per epic, with its stories inside", () => {
    const { epics } = normaliseBacklog([
      epic({ stories: [{ ref: "E1-S1", title: "Map view", body: "Pins.", cites: [] }] }),
    ]);
    const [s] = sectionsOf(epics);
    expect(s.heading).toBe("Provider search refresh");
    expect(s.body).toContain("The M2 slice.");
    expect(s.body).toContain("**Map view**");
  });

  it("says plainly when an epic has no stories", () => {
    expect(sectionsOf(normaliseBacklog([epic()]).epics)[0].body).toMatch(/No stories are decomposed/);
  });

  // A section's provenance has to cover everything in it, or a story's source is lost the moment it
  // is folded into its epic's section.
  it("gathers the epic's cites and its stories' into one list", () => {
    const { epics } = normaliseBacklog([
      epic({
        cites: ["02-scope/sow"],
        stories: [{ ref: "E1-S1", title: "Map", body: "b", cites: ["02-scope/timeline", "02-scope/sow"] }],
      }),
    ]);
    expect(sectionsOf(epics)[0].cites.sort()).toEqual(["02-scope/sow", "02-scope/timeline"]);
  });
});
