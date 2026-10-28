import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Item = {
  kind: string; ref: string; title: string; ticket_key: string | null;
  parent_ref: string | null; ord: number; created_at: string;
};
const rows: Item[] = [];
const item = (kind: string, ref: string, ticket: string | null, parent: string | null, ord: number, at = "2026-10-27T00:00:00Z"): Item =>
  ({ kind, ref, title: `${ref} title`, ticket_key: ticket, parent_ref: parent, ord, created_at: at });

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from: () => {
      const q = {
        select: () => q, eq: () => q,
        order: () => ({ then: (res: (v: { data: Item[] }) => void) =>
          res({ data: [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)) }) }),
      };
      return q;
    },
  }),
}));

const { subjectChoicesFor, usableSubject } = await import("./subject-choices");
const actor = { engagementId: "e1", orgId: "o", roleCode: "engineer", holder: null };

function seed(...r: Item[]) { rows.length = 0; rows.push(...r); }

describe("subjectChoicesFor", () => {
  it("epics: only those with a ticket, in order, each with its story count", () => {
    seed(
      item("epic", "E2", "CT-289", null, 2), item("epic", "E1", "CT-288", null, 1), item("epic", "E3", null, null, 3),
      item("story", "E1-S1", "CT-359", "E1", 1), item("story", "E1-S2", "CT-360", "E1", 2), item("story", "E2-S1", "CT-370", "E2", 1),
    );
    return subjectChoicesFor(actor as never, ["epic"]).then((c) => {
      expect(c.epic?.map((e) => [e.ticketKey, e.detail])).toEqual([["CT-288", "2 stories"], ["CT-289", "1 story"]]);
      expect(c.story).toBeUndefined();
    });
  });

  it("stories: epic order then story order, tagged with the epic's key, ticketless ones left out", async () => {
    seed(
      item("epic", "E1", "CT-288", null, 1), item("epic", "E2", "CT-289", null, 2),
      item("story", "E2-S1", "CT-370", "E2", 1), item("story", "E1-S2", "CT-360", "E1", 2),
      item("story", "E1-S1", "CT-359", "E1", 1), item("story", "E1-S3", null, "E1", 3),
    );
    const c = await subjectChoicesFor(actor as never, ["story"]);
    expect(c.story?.map((s) => [s.ref, s.ticketKey, s.detail])).toEqual([
      ["E1-S1", "CT-359", "CT-288"], ["E1-S2", "CT-360", "CT-288"], ["E2-S1", "CT-370", "CT-289"],
    ]);
  });

  it("a handle used by two backlogs is offered once, as the copy that reached the board", async () => {
    seed(
      item("story", "E1-S1", null, "E1", 1, "2026-10-28T00:00:00Z"),
      item("story", "E1-S1", "CT-359", "E1", 1, "2026-10-20T00:00:00Z"),
    );
    const c = await subjectChoicesFor(actor as never, ["story"]);
    expect(c.story?.map((s) => s.ticketKey)).toEqual(["CT-359"]);
  });

  it("asks for nothing, reads nothing", async () => {
    expect(await subjectChoicesFor(actor as never, [])).toEqual({});
  });

  it("a kind with nothing on the board is an empty list, not missing", async () => {
    seed();
    expect((await subjectChoicesFor(actor as never, ["story", "epic"]))).toEqual({ story: [], epic: [] });
  });
});

describe("usableSubject", () => {
  it("accepts a story that is on the board and returns its ticket", async () => {
    seed(item("story", "E1-S1", "CT-359", "E1", 1));
    expect(await usableSubject("e1", "story", "E1-S1")).toEqual({
      ok: true, subject: { ref: "E1-S1", title: "E1-S1 title", ticketKey: "CT-359" },
    });
  });
  it("refuses a story the engagement does not have, naming it", async () => {
    seed(item("story", "E1-S1", "CT-359", "E1", 1));
    const r = await usableSubject("e1", "story", "NOPE");
    expect(r).toEqual({ ok: false, error: "This engagement has no story 'NOPE'." });
  });
  it("refuses a story with no ticket, and says what to do", async () => {
    seed(item("story", "E1-S3", null, "E1", 3));
    const r = await usableSubject("e1", "story", "E1-S3");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not on the board yet — approve its stories first/);
  });
  it("does not accept an epic's ref as a story", async () => {
    seed(item("epic", "E1", "CT-288", null, 1));
    expect((await usableSubject("e1", "story", "E1")).ok).toBe(false);
  });
});
