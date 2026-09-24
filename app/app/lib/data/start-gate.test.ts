import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { blockersFrom, describeBlockers } = await import("./start-gate");
type Blocker = Awaited<ReturnType<typeof blockersFrom>>[number];
type CriterionStatus = Parameters<typeof blockersFrom>[0][number];

const ready = (over: Partial<CriterionStatus> = {}): CriterionStatus => ({
  id: "c1",
  kind: "ready",
  stepTask: null,
  statement: "SOW is filed",
  subjectKind: "document",
  subjectRef: "sow",
  operator: null,
  value: null,
  verdict: { state: "satisfied", source: "document", detail: "filed" },
  ...over,
});

describe("blockersFrom — the Ready/depends_on decision, without a database", () => {
  it("is empty when every Ready criterion is satisfied and nothing is waited on", () => {
    expect(blockersFrom([ready()], [])).toEqual([]);
  });

  it("blocks on an unsatisfied Ready criterion, naming what and why", () => {
    const c = ready({
      statement: "SOW is filed",
      verdict: { state: "unsatisfied", source: "document", detail: "no version filed" },
    });
    const blockers = blockersFrom([c], []);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].kind).toBe("ready");
    expect(blockers[0].label).toContain("SOW is filed");
    expect(blockers[0].label).toContain("not met: no version filed");
  });

  it("blocks on an unmeasurable Ready criterion — never satisfied, never silently dropped", () => {
    const c = ready({ verdict: { state: "unmeasurable", why: "no connector configured" } });
    const blockers = blockersFrom([c], []);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].label).toContain("not checked — no connector configured");
  });

  it("satisfied criteria produce no blocker even alongside unsatisfied ones", () => {
    const ok = ready({ id: "c1" });
    const bad = ready({
      id: "c2",
      statement: "roster is staffed",
      verdict: { state: "unsatisfied", source: "roster", detail: "no EA" },
    });
    const blockers = blockersFrom([ok, bad], []);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].label).toContain("roster is staffed");
  });

  it("blocks on every open dependency, in the order given", () => {
    const blockers = blockersFrom([], ["Draft the timeline", "Staffing plan and resources"]);
    expect(blockers).toEqual<Blocker[]>([
      { kind: "depends_on", label: "Draft the timeline" },
      { kind: "depends_on", label: "Staffing plan and resources" },
    ]);
  });

  it("combines both kinds of blocker in one list", () => {
    const c = ready({ verdict: { state: "unsatisfied", source: "document", detail: "missing" } });
    const blockers = blockersFrom([c], ["Draft the timeline"]);
    expect(blockers.map((b) => b.kind)).toEqual(["ready", "depends_on"]);
  });
});

describe("describeBlockers — the message a refusal shows", () => {
  it("is null when nothing is blocking", () => {
    expect(describeBlockers([])).toBeNull();
  });

  it("groups Ready blockers under 'Not ready'", () => {
    const msg = describeBlockers([{ kind: "ready", label: "SOW is filed (not met: missing)" }]);
    expect(msg).toBe("Not ready:\n  SOW is filed (not met: missing)");
  });

  it("groups depends_on blockers under 'Waiting on'", () => {
    const msg = describeBlockers([{ kind: "depends_on", label: "Draft the timeline" }]);
    expect(msg).toBe("Waiting on:\n  Draft the timeline");
  });

  it("shows both sections when both kinds are present", () => {
    const msg = describeBlockers([
      { kind: "ready", label: "SOW is filed (not met: missing)" },
      { kind: "depends_on", label: "Draft the timeline" },
    ]);
    expect(msg).toBe(
      "Not ready:\n  SOW is filed (not met: missing)\nWaiting on:\n  Draft the timeline",
    );
  });
});
