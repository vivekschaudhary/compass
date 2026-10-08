import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../../supabase", () => ({ supabaseAdmin: () => null }));
vi.mock("../../handoff-call", () => ({ latestHandoffCall: async () => null }));

const { verdictOfHandoff } = await import("./ci");

const call = (over: Record<string, unknown>) => ({
  id: "h1",
  status: "shipped" as const,
  pr_url: "https://github.com/o/r/pull/7",
  result: {
    version: 1, status: "shipped", branch: "b", pr_url: "https://github.com/o/r/pull/7", files_changed: 3,
    checks: { ran: ["npm ci", "npm run build"], failed: null, tail: null }, refusal: null, log_ref: "l", usage: null,
  },
  ...over,
}) as never;

describe("ci verdict from the generator's handoff record", () => {
  it("is unmeasurable when the generator has never run, rather than unmet", () => {
    expect(verdictOfHandoff(null).state).toBe("unmeasurable");
  });

  it("is unmeasurable while the generator is still running", () => {
    expect(verdictOfHandoff(call({ status: "running", pr_url: null, result: null })).state).toBe("unmeasurable");
  });

  it("is satisfied only when the record says shipped, and names the PR", () => {
    const v = verdictOfHandoff(call({}));
    expect(v.state).toBe("satisfied");
    if (v.state === "satisfied") expect(v.detail).toContain("pull/7");
  });

  it("is unsatisfied and names the failing check when checks failed", () => {
    const v = verdictOfHandoff(call({
      status: "checks_failed", pr_url: null,
      result: { ...(call({}) as { result: object }).result, status: "checks_failed", pr_url: null,
        checks: { ran: ["npm ci", "npm run build"], failed: "npm run build", tail: "x" } },
    }));
    expect(v.state).toBe("unsatisfied");
    if (v.state === "unsatisfied") expect(v.detail).toContain("npm run build");
  });

  it("is unsatisfied with the refusal when the generator refused", () => {
    const v = verdictOfHandoff(call({
      status: "refused", pr_url: null,
      result: { ...(call({}) as { result: object }).result, status: "refused", pr_url: null, refusal: "not a git repository." },
    }));
    expect(v.state).toBe("unsatisfied");
    if (v.state === "unsatisfied") expect(v.detail).toBe("not a git repository.");
  });
});
