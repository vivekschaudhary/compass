import { describe, expect, it, vi, beforeEach } from "vitest";

// Every `member` row names its org.
//
// 056 made `member.org_id` NOT NULL. Two write paths never set it, so every insert they attempted
// was rejected — and both swallowed the rejection into a `problems` array the caller carried past.
// Onboarding returned an engagement id for an engagement with an empty `member` table; approving a
// roster closed the gate green having staffed nobody. Both were live: `engagement` held a row and
// `member` had none.
//
// Asserted on the ROW HANDED TO THE INSERT, the way `onboard-keys.test.ts` does, because the return
// value is precisely what looked fine while the row was wrong.

vi.mock("server-only", () => ({}));
vi.mock("../doctree", () => ({ readShippedDocTree: () => [] }));
vi.mock("./publish", () => ({ publishToDocs: async () => ({ ok: true, url: "", id: "" }) }));
vi.mock("./events", () => ({ emit: async () => {}, emitRefusal: async () => {} }));
vi.mock("../docstore", () => ({
  checkSpaceKey: async () => null,
  checkProjectKey: async () => null,
  canonicalSpaceKey: async () => null,
  canonicalProjectKey: (g: string | null | undefined) => g?.trim().toUpperCase() || null,
}));

// Nobody is staffed yet, which is the state both paths run against on a fresh engagement.
vi.mock("./actor", () => ({ holdersOn: async () => [] }));
vi.mock("./sprint-rows", () => ({ parseCommitments: () => [] }));
vi.mock("./backlog", () => ({ backlogOf: async () => [] }));
vi.mock("./tracker", () => ({ mirrorBacklog: async () => ({}), mirrorSprint: async () => ({}) }));
vi.mock("../agent/context", () => ({ subjectOfRun: async () => null }));

/** What each table was handed, and what the next `member` insert should return. */
const inserted: Record<string, Record<string, unknown>[]> = {};
let memberError: { message: string } | null = null;

/** Enough of the real tables for `materialiseFrom` to walk from a task to a roster. */
const ROWS: Record<string, unknown> = {
  org: { id: "org-1" },
  work_task: { workflow_step_id: "s1", workflow_run_id: "r1" },
  workflow_step: { produces: "01-foundation/team", output: "roster" },
  document: { current_version_id: "v1" },
};
const LISTS: Record<string, unknown[]> = {
  role: [{ code: "engineer", label: "Engineer", title: "Engineer" }],
  document_section: [{ heading: "Roster", body: "| Role | Holder |\n|---|---|\n| Engineer | Renita Shah |" }],
};

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: ROWS[table] ?? null }),
        // A bare `await` on the builder resolves to the list form.
        then: (res: (v: { data: unknown[] }) => unknown) => res({ data: LISTS[table] ?? [] }),
        insert: async (row: Record<string, unknown>) => {
          (inserted[table] ??= []).push(row);
          return { error: table === "member" ? memberError : null };
        },
        update: () => ({ eq: async () => ({ error: null }) }),
      };
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  }),
}));

const { createEngagement } = await import("./onboard");
const { materialiseFrom } = await import("./materialise");

beforeEach(() => {
  for (const k of Object.keys(inserted)) delete inserted[k];
  memberError = null;
});

const INPUT = {
  name: "health provider", client: "DHCS",
  deliveryManager: "Renita Shah", confluenceSpace: "", jiraProject: "",
};

describe("onboarding staffs the delivery manager", () => {
  it("names the org on the member row", async () => {
    await createEngagement(INPUT);
    expect(inserted.member?.[0]?.org_id, "member.org_id is NOT NULL — omitting it rejects the row")
      .toBe("org-1");
  });

  it("uses the same org as the engagement it just created", async () => {
    await createEngagement(INPUT);
    expect(inserted.member?.[0]?.org_id).toBe(inserted.engagement?.[0]?.org_id);
  });

  // THE ONE THAT MATTERS. An engagement nobody is on cannot be worked — no queue opens, `holdersOn`
  // returns nothing, `mirrorNested` can assign no one — so a failure here has to read as a failure
  // rather than as a success with a footnote. Returning an id is what let the form draw a done page
  // over an empty `member` table.
  it("reports no engagement id when the delivery manager could not be staffed", async () => {
    memberError = { message: 'null value in column "org_id"' };
    const r = await createEngagement(INPUT);
    expect(r.ok, "an unstaffed engagement must not read as created").toBe(false);
    expect("engagementId" in r, "no id for the form to draw a done page from").toBe(false);
    // A failure, not a refusal: nothing typed into the form will make the database accept the row.
    expect("error" in r && r.error).toMatch(/staff the delivery manager/i);
  });

  // The `engagement` row is already committed by then, so the message has to name it — otherwise a
  // retry collides with a row nobody was told about.
  it("names the orphaned engagement so it can be cleaned up", async () => {
    memberError = { message: "boom" };
    const r = await createEngagement(INPUT);
    expect("error" in r && r.error).toMatch(/created and has nobody on it/i);
  });
});

describe("materialising an approved roster", () => {
  const ACTOR = {
    orgId: "org-1", engagementId: "eng-1", roleCode: "delivery-manager",
    holder: "Renita Shah",
  } as never;

  it("names the org on every row it staffs", async () => {
    const r = await materialiseFrom(ACTOR, "t1");
    expect(r?.created, "the roster names one holder").toBe(1);
    expect(inserted.member?.[0]?.org_id, "a roster row without an org is rejected by 056")
      .toBe("org-1");
  });

  // Never fatal, and never SILENT — materialise.ts states both in its own header and only the first
  // was held to. The problems have to survive as far as the caller or nothing can report them.
  it("returns the problems rather than swallowing them", async () => {
    memberError = { message: 'null value in column "org_id"' };
    const r = await materialiseFrom(ACTOR, "t1");
    expect(r?.created).toBe(0);
    expect(r?.problems.join(" "), "a roster that staffed nobody must say so").toMatch(/org_id/);
  });
});
