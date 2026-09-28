import { describe, it, expect, vi, beforeEach } from "vitest";

// `/api/agent/run` answers "accepted" the moment the actor resolves — it must NOT wait for the run,
// which takes minutes. A never-resolving `runAgent` proves it: if the route awaited it, this test
// would hang rather than pass.

vi.mock("server-only", () => ({}));
const resolveActor = vi.fn();
vi.mock("@/app/lib/data/actor", () => ({ resolveActor: (...a: unknown[]) => resolveActor(...a) }));
const runAgent = vi.fn();
vi.mock("@/app/lib/agent/run", () => ({ runAgent: (...a: unknown[]) => runAgent(...a) }));

const { POST } = await import("./run/route");

function req(body: object) {
  return { json: async () => body } as never;
}

beforeEach(() => {
  resolveActor.mockReset();
  runAgent.mockReset();
});

describe("POST /api/agent/run", () => {
  it("responds 'accepted' while the run is still in flight", async () => {
    resolveActor.mockResolvedValue({ engagementId: "e1" });
    runAgent.mockReturnValue(new Promise(() => {})); // never settles

    const res = await POST(req({ engagement: "e1", role: "pm", taskId: "t1" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, kind: "accepted", taskId: "t1" });
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  it("still refuses a role that does not exist, synchronously, without starting a run", async () => {
    resolveActor.mockResolvedValue(null);

    const res = await POST(req({ engagement: "e1", role: "nope", taskId: "t1" }));

    expect(res.status).toBe(400);
    expect(runAgent).not.toHaveBeenCalled();
  });
});
