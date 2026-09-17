import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `jiraForEngagement` — whose Jira a build's pull request is posted to.
//
// Its own file because jira.test.ts stubs Supabase to null for the whole module, and the subject
// here is what happens with a database: a row, no row, and a read that fails.
//
// The defect it replaced: `jiraForStory` found the engagement through v1's `story` → `epic` tables,
// which the app never writes. The walk always came up empty and fell back to env credentials, so
// every build posted to the board `.env` names rather than the engagement's own.

type Result = { data: unknown; error: { message: string } | null };
let result: Result = { data: null, error: null };
const tables: string[] = [];
const ids: unknown[] = [];

const fake = {
  from(table: string) {
    tables.push(table);
    const q = {
      select: () => q,
      eq: (_col: string, v: unknown) => { ids.push(v); return q; },
      maybeSingle: async () => result,
    };
    return q;
  },
};

vi.mock("./supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./supabase")>()),
  supabaseAdmin: () => fake,
}));
vi.mock("./crypto", () => ({ decryptSecret: (s?: string) => s ?? "" }));

const { jiraForEngagement } = await import("./jira");

const ENV = {
  ATLASSIAN_BASE_URL: "https://env.atlassian.net",
  ATLASSIAN_EMAIL: "env@example.com",
  ATLASSIAN_API_TOKEN: "env-token",
  JIRA_PROJECT: "ENV",
};
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  result = { data: null, error: null };
  tables.length = 0;
  ids.length = 0;
  for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
});
afterEach(() => {
  for (const k of Object.keys(ENV)) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

describe("jiraForEngagement", () => {
  it("uses the engagement's own credentials when it has them", async () => {
    result = {
      data: {
        atlassian_base_url: "https://client.atlassian.net", atlassian_email: "dm@client.com",
        atlassian_api_token: "client-token", jira_project: "KAN",
      },
      error: null,
    };
    expect(await jiraForEngagement("eng-1")).toEqual({
      baseUrl: "https://client.atlassian.net", email: "dm@client.com", token: "client-token", project: "KAN",
    });
  });

  it("fills only the fields the engagement leaves empty from env", async () => {
    result = { data: { jira_project: "KAN" }, error: null };
    expect(await jiraForEngagement("eng-1")).toEqual({
      baseUrl: ENV.ATLASSIAN_BASE_URL, email: ENV.ATLASSIAN_EMAIL, token: ENV.ATLASSIAN_API_TOKEN,
      project: "KAN",
    });
  });

  // The regression itself: the lookup is by engagement id, and never through v1's tables.
  it("reads the engagement by id and touches neither story nor epic", async () => {
    result = { data: { jira_project: "KAN" }, error: null };
    await jiraForEngagement("eng-42");
    expect(tables).toEqual(["engagement"]);
    expect(ids).toEqual(["eng-42"]);
  });

  // Falling back here would post a client's pull request to whatever board .env names.
  it("returns null for an engagement that does not exist, rather than the env board", async () => {
    result = { data: null, error: null };
    expect(await jiraForEngagement("no-such-engagement")).toBeNull();
  });

  // A failed read is not "no credentials configured". Treating it as that is the silent misroute.
  it("throws when the read fails, naming the read", async () => {
    result = { data: null, error: { message: "connection reset" } };
    await expect(jiraForEngagement("eng-1")).rejects.toThrow(
      "read the engagement's Jira credentials: connection reset",
    );
  });
});
