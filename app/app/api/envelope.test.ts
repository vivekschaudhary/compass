import { describe, expect, it, vi, beforeEach } from "vitest";

// Every API route answers in the envelope, with the status its answer calls for.
//
// One block per route, asserting the status code as well as the body. The defect that started this
// was a refusal sent as HTTP 200: its body was readable and wrong in a way only the status showed.
//
// `onboard` runs through the REAL `createEngagement` — only the database and the doc store are
// stubbed — because the refusal it sends is decided there, not in the route.

const s = vi.hoisted(() => ({
  spaceProblem: null as string | null,
  engagementError: null as { message: string } | null,
  actor: { orgId: "org-1", engagementId: "e1", roleCode: "delivery-manager" } as object | null,
  agentOutcome: { kind: "asked", preamble: "", questions: [] } as Record<string, unknown>,
  adopt: async () => ({ adopted: 1, linked: 0 }) as unknown,
  planned: { ok: true, plan: { workflows: [], retire: [] }, summary: "nothing" } as Record<string, unknown>,
  existing: {} as object | null,
}));

vi.mock("server-only", () => ({}));

// --- onboard's dependencies, not onboard itself
vi.mock("@/app/lib/doctree", () => ({ readShippedDocTree: () => [] }));
vi.mock("@/app/lib/data/events", () => ({ emit: async () => {}, emitRefusal: async () => {} }));
vi.mock("@/app/lib/docstore", () => ({
  checkSpaceKey: async () => s.spaceProblem,
  checkProjectKey: async () => null,
  canonicalSpaceKey: async () => null,
  canonicalProjectKey: (g: string | null | undefined) => g?.trim().toUpperCase() || null,
}));
vi.mock("@/app/lib/supabase", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "org-1" } }) }) }),
      insert: async () => ({ error: table === "engagement" ? s.engagementError : null }),
    }),
  }),
}));

// --- the other routes' data layer
vi.mock("@/app/lib/data/actor", () => ({
  resolveActor: async () => s.actor,
  rolesOnEngagement: async () => [{ code: "delivery-manager", holder: "Renita" }],
}));
vi.mock("@/app/lib/data/progress", () => ({ progressSince: async () => [{ at: "t", line: "hello" }] }));
vi.mock("@/app/lib/data/gates", () => ({
  checkConnectors: async () => [{ connector: "docs", ok: true }],
  measureTask: async () => [
    { statement: "SOW published", kind: "machine", subjectKind: "doc", subjectRef: "x", verdict: { state: "met", detail: "ok" } },
  ],
}));
vi.mock("@/app/lib/data/documents", () => ({ adoptV1DocTree: () => s.adopt() }));
vi.mock("@/app/lib/data/publish", () => ({
  publishToDocs: async () => ({ ok: true }),
  publishAll: async () => [{ ok: true }, { ok: false, error: "403" }],
}));
vi.mock("@/app/lib/agent/run", () => ({ runAgent: async () => s.agentOutcome }));
vi.mock("@/app/lib/specs", () => ({ COMPASS_DIR: "/nonexistent-compass-dir" }));
vi.mock("@/app/lib/import/plan", () => ({ planImport: () => s.planned }));
vi.mock("@/app/lib/import/apply", () => ({
  applyPlan: async () => ({}),
  describeReport: () => "applied",
}));
vi.mock("@/app/lib/import/store", () => ({
  readExistingFor: async () => s.existing,
  configStore: () => ({}),
  countStaleRuns: async () => 0,
}));

const onboard = await import("./onboard/route");
const progress = await import("./progress/route");
const connectors = await import("./connectors/check/route");
const measure = await import("./agent/measure/route");
const run = await import("./agent/run/route");
const adopt = await import("./content/adopt/route");
const publish = await import("./content/publish/route");
const importRoute = await import("./import/route");

const post = (path: string, body: unknown) =>
  new Request(`http://x/api/${path}`, { method: "POST", body: JSON.stringify(body) }) as never;
const get = (pathAndQuery: string) => new Request(`http://x/api/${pathAndQuery}`) as never;

/** Status and body together, so no assertion can look at one without the other. */
async function answer(res: Response) {
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  s.spaceProblem = null;
  s.engagementError = null;
  s.actor = { orgId: "org-1", engagementId: "e1", roleCode: "delivery-manager" };
  s.agentOutcome = { kind: "asked", preamble: "", questions: [] };
  s.adopt = async () => ({ adopted: 1, linked: 0 });
  s.planned = { ok: true, plan: { workflows: [], retire: [] }, summary: "nothing" };
  s.existing = {};
});

const ENGAGEMENT = {
  name: "Envelope", client: "Acme", deliveryManager: "Renita Shah",
  confluenceSpace: "Compass-test", jiraProject: "",
};

describe("POST /api/onboard", () => {
  // The exact case that rendered a blank form.
  it("refuses a Confluence key that does not exist with 422 and a refusal", async () => {
    s.spaceProblem = "No Confluence space with key 'Compass-test'.";
    expect(await answer(await onboard.POST(post("onboard", ENGAGEMENT)))).toEqual({
      status: 422,
      body: { ok: false, refusals: [{ message: "No Confluence space with key 'Compass-test'." }] },
    });
  });

  it("refuses a missing delivery manager with 422", async () => {
    const { status, body } = await answer(await onboard.POST(post("onboard", { ...ENGAGEMENT, deliveryManager: " " })));
    expect(status).toBe(422);
    expect(body.refusals[0].message).toMatch(/No delivery manager/);
  });

  it("refuses a missing name with 400", async () => {
    expect(await answer(await onboard.POST(post("onboard", { ...ENGAGEMENT, name: "" })))).toEqual({
      status: 400, body: { ok: false, refusals: [{ message: "name is required" }] },
    });
  });

  it("sends a database rejection as a 500 failure", async () => {
    s.engagementError = { message: "duplicate key" };
    expect(await answer(await onboard.POST(post("onboard", ENGAGEMENT)))).toEqual({
      status: 500, body: { ok: false, error: "create engagement: duplicate key" },
    });
  });

  // A partial success must not start reading as a refusal: `problems` rides on the SUCCESS.
  it("creates with 200, an id, and its problems list intact", async () => {
    const { status, body } = await answer(await onboard.POST(post("onboard", ENGAGEMENT)));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.engagementId).toMatch(/^acme-/);
    expect(body.problems).toEqual([]);
  });
});

describe("GET /api/progress", () => {
  it("refuses without engagement and since, with 400", async () => {
    const { status, body } = await answer(await progress.GET(get("progress?engagement=e1")));
    expect(status).toBe(400);
    expect(body).toEqual({ ok: false, refusals: [{ message: "engagement and since are required" }] });
  });

  it("refuses an unknown role with 400", async () => {
    s.actor = null;
    expect((await progress.GET(get("progress?engagement=e1&since=t&role=nobody"))).status).toBe(400);
  });

  // PhaseStarter reads `res.ok` then `lines` — both still hold.
  it("answers 200 with lines", async () => {
    expect(await answer(await progress.GET(get("progress?engagement=e1&since=t")))).toEqual({
      status: 200, body: { ok: true, lines: [{ at: "t", line: "hello" }] },
    });
  });
});

describe("POST /api/connectors/check", () => {
  it("refuses an unknown role with 400", async () => {
    s.actor = null;
    const { status, body } = await answer(await connectors.POST(post("connectors/check", { engagement: "e1" })));
    expect(status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.refusals).toHaveLength(1);
  });

  it("answers 200 with checks", async () => {
    expect(await answer(await connectors.POST(post("connectors/check", { engagement: "e1" })))).toEqual({
      status: 200, body: { ok: true, checks: [{ connector: "docs", ok: true }] },
    });
  });
});

describe("POST /api/agent/measure", () => {
  it("refuses an unknown role with 400", async () => {
    s.actor = null;
    expect((await measure.POST(post("agent/measure", { engagement: "e1", role: "x", taskId: "t" }))).status).toBe(400);
  });

  it("answers 200 with checks", async () => {
    const { status, body } = await answer(await measure.POST(post("agent/measure", { engagement: "e1", role: "dm", taskId: "t" })));
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true, checks: [{ criterion: "SOW published", kind: "machine", state: "met", detail: "ok" }] });
  });
});

describe("POST /api/agent/run", () => {
  const RUN = { engagement: "e1", role: "dm", taskId: "t" };

  it("refuses an unknown role with 400", async () => {
    s.actor = null;
    expect((await run.POST(post("agent/run", RUN))).status).toBe(400);
  });

  // The domain `kind` survives for every run that happened, including one the model declined.
  it("answers 200 with the outcome's kind for a run that happened", async () => {
    for (const outcome of [
      { kind: "asked", preamble: "p", questions: [] },
      { kind: "drafted", summary: "s", sections: 2, path: "01/brief" },
      { kind: "refused", reason: "no" },
    ]) {
      s.agentOutcome = outcome;
      expect(await answer(await run.POST(post("agent/run", RUN))), outcome.kind)
        .toEqual({ status: 200, body: { ok: true, ...outcome } });
    }
  });

  it("sends kind: error as a 500 failure, never a 200", async () => {
    s.agentOutcome = { kind: "error", message: "ANTHROPIC_API_KEY is not set" };
    expect(await answer(await run.POST(post("agent/run", RUN)))).toEqual({
      status: 500, body: { ok: false, error: "ANTHROPIC_API_KEY is not set" },
    });
  });
});

describe("POST /api/content/adopt", () => {
  it("refuses without an engagementId, with 400", async () => {
    expect(await answer(await adopt.POST(post("content/adopt", {})))).toEqual({
      status: 400, body: { ok: false, refusals: [{ message: "engagementId is required." }] },
    });
  });

  it("answers 200 with the counts", async () => {
    expect(await answer(await adopt.POST(post("content/adopt?engagementId=e1", {})))).toEqual({
      status: 200, body: { ok: true, adopted: 1, linked: 0 },
    });
  });

  it("sends a thrown adoption as a 500 failure", async () => {
    s.adopt = async () => { throw new Error("tree unreadable"); };
    expect(await answer(await adopt.POST(post("content/adopt?engagementId=e1", {})))).toEqual({
      status: 500, body: { ok: false, error: "tree unreadable" },
    });
  });
});

describe("POST /api/content/publish", () => {
  it("refuses without an engagement, with 400", async () => {
    expect((await publish.POST(post("content/publish", {}))).status).toBe(400);
  });

  // Some documents failing is still a backfill that ran; `results` says which.
  it("answers 200 with counts even when some documents failed", async () => {
    const { status, body } = await answer(await publish.POST(post("content/publish", { engagement: "e1" })));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, published: 1, of: 2 });
  });
});

describe("/api/import", () => {
  it("fails with 503 when Supabase is not configured", async () => {
    s.existing = null;
    expect(await answer(await importRoute.GET(new Request("http://x/api/import")))).toEqual({
      status: 503, body: { ok: false, error: "Supabase is not configured." },
    });
  });

  // Import's four-field refusals survive the envelope unchanged — under `refusals` now.
  it("refuses a bad bundle with 422 and every locating field", async () => {
    const problem = { file: "roles.csv", row: 3, message: "unknown tier", fix: "Use one of: oversight." };
    s.planned = { ok: false, problems: [problem] };
    expect(await answer(await importRoute.GET(new Request("http://x/api/import")))).toEqual({
      status: 422, body: { ok: false, refusals: [problem] },
    });
  });

  it("answers a dry run with 200", async () => {
    const { status, body } = await answer(await importRoute.GET(new Request("http://x/api/import")));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, dryRun: true, summary: "nothing" });
  });

  it("answers an applied import with 200", async () => {
    const res = await importRoute.POST(new Request("http://x/api/import", { method: "POST", body: "{}" }));
    expect(await answer(res)).toMatchObject({ status: 200, body: { ok: true, summary: "applied" } });
  });
});
