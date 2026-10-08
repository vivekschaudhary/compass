import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { openHandoffCall, closeHandoffCall, latestHandoffCall, latestRanHandoffCall } = await import("./handoff-call");

type Res = { data: unknown; error: { message: string } | null };

/** A chainable fake that records each call and answers with the given result. */
function fake(result: Res) {
  const calls: { op: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of ["insert", "update", "select", "eq", "order", "limit", "single", "maybeSingle"]) {
    chain[op] = (...args: unknown[]) => { calls.push({ op, args }); return chain; };
  }
  chain.then = (resolve: (r: Res) => unknown) => resolve(result);
  return { client: { from: (table: string) => { calls.push({ op: "from", args: [table] }); return chain; } } as never, calls };
}

const result = {
  version: 1, status: "shipped", branch: "b", pr_url: "https://github.com/o/r/pull/7", files_changed: 2,
  checks: { ran: ["npm run build"], failed: null, tail: null }, refusal: null, log_ref: "l", usage: null,
} as never;

describe("opening a handoff record", () => {
  it("writes the request against the task and returns the new id", async () => {
    const f = fake({ data: { id: "h-1" }, error: null });
    const id = await openHandoffCall(f.client, { id: "h-1", orgId: "o", engagementId: "e", taskId: "t", kind: "generate", request: { x: 1 } });
    expect(id).toBe("h-1");
    expect(f.calls[0]).toEqual({ op: "from", args: ["handoff_call"] });
    expect(f.calls.find((c) => c.op === "insert")?.args[0]).toMatchObject({ work_task_id: "t", kind: "generate", request: { x: 1 } });
  });

  it("throws rather than returning a half-written id when the insert fails", async () => {
    const f = fake({ data: null, error: { message: "boom" } });
    await expect(openHandoffCall(f.client, { id: "h-1", orgId: "o", engagementId: "e", taskId: "t", kind: "generate", request: {} }))
      .rejects.toThrow(/could not open the handoff record: boom/);
  });
});

describe("closing a handoff record", () => {
  it("writes the status, result, PR and close time together", async () => {
    const f = fake({ data: null, error: null });
    await closeHandoffCall(f.client, "h-1", result);
    const upd = f.calls.find((c) => c.op === "update")?.args[0] as Record<string, unknown>;
    expect(upd).toMatchObject({ status: "shipped", pr_url: "https://github.com/o/r/pull/7", result });
    expect(typeof upd.closed_at).toBe("string");
  });

  it("throws on a failed close so the run is not left reading as still running without a reason", async () => {
    const f = fake({ data: null, error: { message: "denied" } });
    await expect(closeHandoffCall(f.client, "h-1", result)).rejects.toThrow(/could not close.*denied/);
  });
});

describe("reading the latest handoff", () => {
  it("returns null when no generator has run for the task", async () => {
    const f = fake({ data: null, error: null });
    expect(await latestHandoffCall(f.client, "t")).toBeNull();
  });

  it("filters by task, orders newest first, and returns one row", async () => {
    const f = fake({ data: { id: "h-2", status: "running", result: null, pr_url: null }, error: null });
    const row = await latestHandoffCall(f.client, "t");
    expect(row?.id).toBe("h-2");
    expect(f.calls).toContainEqual({ op: "eq", args: ["work_task_id", "t"] });
    expect(f.calls).toContainEqual({ op: "order", args: ["created_at", { ascending: false }] });
    expect(f.calls).toContainEqual({ op: "limit", args: [1] });
  });

  it("throws on a read error rather than reporting no handoff", async () => {
    const f = fake({ data: null, error: { message: "timeout" } });
    await expect(latestHandoffCall(f.client, "t")).rejects.toThrow(/could not read.*timeout/);
  });
});

describe("the most recent RAN handoff — skipping refusals that came after a real run", () => {
  const shipped = { id: "h-shipped", status: "shipped", pr_url: "https://github.com/o/r/pull/1", result: { status: "shipped" } } as never;
  const refused = { id: "h-refused", status: "refused", pr_url: null, result: { status: "refused" } } as never;
  const checksFailed = { id: "h-checksfailed", status: "checks_failed", pr_url: null, result: { status: "checks_failed" } } as never;

  it("a refusal after a shipped run does not hide the shipped result", async () => {
    // newest first, as the real query orders it: a stray re-run refused, the real run shipped before it
    const rows = [refused, shipped];
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }) }) }) }) } as never;
    const row = await latestRanHandoffCall(client, "t");
    expect(row?.id).toBe("h-shipped");
  });

  it("a real failed attempt (checks_failed) still counts as ran, and is not skipped", async () => {
    const rows = [checksFailed, shipped];
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }) }) }) }) } as never;
    const row = await latestRanHandoffCall(client, "t");
    expect(row?.id).toBe("h-checksfailed");
  });

  it("when every row is a refusal, reports the newest one honestly rather than null", async () => {
    const rows = [refused];
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: rows, error: null }) }) }) }) }) } as never;
    const row = await latestRanHandoffCall(client, "t");
    expect(row?.id).toBe("h-refused");
  });

  it("returns null when nothing has run at all", async () => {
    const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) } as never;
    expect(await latestRanHandoffCall(client, "t")).toBeNull();
  });
});
