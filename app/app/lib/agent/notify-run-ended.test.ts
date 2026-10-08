import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const calls: { sent: unknown[]; removed: number; mode: "ok" | "error" | "silent" } = { sent: [], removed: 0, mode: "ok" };

const channel = {
  subscribe(cb: (status: string) => void) {
    if (calls.mode === "ok") setTimeout(() => cb("SUBSCRIBED"), 0);
    if (calls.mode === "error") setTimeout(() => cb("CHANNEL_ERROR"), 0);
    return channel;
  },
  send: async (msg: unknown) => { calls.sent.push(msg); return "ok"; },
};

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    channel: (name: string) => { calls.sent.push({ name }); return channel; },
    removeChannel: async () => { calls.removed++; },
  }),
}));

const { notifyRunEnded } = await import("./notify-run-ended");

beforeEach(() => { calls.sent = []; calls.removed = 0; calls.mode = "ok"; });

describe("telling the page a run has ended", () => {
  it("sends run-ended on the task's own channel once subscribed, then removes the channel", async () => {
    await notifyRunEnded("t1");
    expect(calls.sent[0]).toEqual({ name: "task-t1" });
    expect(calls.sent[1]).toEqual({ type: "broadcast", event: "run-ended", payload: { taskId: "t1" } });
    expect(calls.removed).toBe(1);
  });

  it("does not throw when the channel fails, and still removes it", async () => {
    calls.mode = "error";
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyRunEnded("t1")).resolves.toBeUndefined();
    expect(err.mock.calls.join(" ")).toMatch(/could not notify task=t1: CHANNEL_ERROR/);
    expect(calls.removed).toBe(1);
    err.mockRestore();
  });
});
