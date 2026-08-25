import { describe, it, expect, vi } from "vitest";

// The distinction under test is the whole point of `must`: PostgREST returns `{data: null, error}`
// for a read that FAILED and `{data: null, error: null}` for a row that is genuinely absent. Before
// this, `buildContext` collapsed both into null, the page called `notFound()`, and someone looking
// at their own running task was told it does not exist.

vi.mock("server-only", () => ({}));
vi.mock("../specs", () => ({ resolveSpec: async () => null, COMPASS_DIR: "/nowhere" }));

/** A Supabase stub whose FIRST read — work_task — resolves to whatever is handed in. */
function clientWhoseTaskReadReturns(result: unknown) {
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain, in: () => chain,
    maybeSingle: async () => result,
    then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [] }).then(r),
  };
  return { from: () => chain };
}

const ACTOR = {
  orgId: "org", engagementId: "e1", roleCode: "delivery-manager",
  roleLabel: "Delivery Manager", holder: "John", scope: "mine" as const,
  workstreamCode: null, agent: null, tier: "lead", capabilities: [],
};

async function buildContextWith(result: unknown) {
  vi.resetModules();
  vi.doMock("../supabase", async () => {
    const real = await vi.importActual<typeof import("../supabase")>("../supabase");
    return { ...real, supabaseAdmin: () => clientWhoseTaskReadReturns(result) };
  });
  const { buildContext } = await import("./context");
  return buildContext(ACTOR, "task-1");
}

describe("a failed read is not an absent row", () => {
  it("throws when the task read fails, rather than reporting the task missing", async () => {
    await expect(
      buildContextWith({ data: null, error: { message: "TypeError: fetch failed" } }),
    ).rejects.toThrow(/read task: TypeError: fetch failed/);
  });

  it("still returns null when the task genuinely is not there", async () => {
    // The 404 path that must SURVIVE the fix: a bad id, or another engagement's task.
    await expect(buildContextWith({ data: null, error: null })).resolves.toBeNull();
  });
});
