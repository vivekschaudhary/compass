import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const runSurvey = vi.fn();
const approve = vi.fn();
const measureTask = vi.fn();
const emit = vi.fn();
const recordTurn = vi.fn();
const finished = vi.fn();
const handOver = vi.fn();
const releaseExecutor = vi.fn();
const rpc = vi.fn();

vi.mock("../survey-run", () => ({ runSurvey: (...a: unknown[]) => runSurvey(...a) }));
vi.mock("../../data/gates", () => ({
  approve: (...a: unknown[]) => approve(...a),
  measureTask: (...a: unknown[]) => measureTask(...a),
}));
vi.mock("../../data/events", () => ({ emit: (...a: unknown[]) => emit(...a) }));
vi.mock("./turn-context", () => ({ recordTurn: (...a: unknown[]) => recordTurn(...a) }));
vi.mock("./effects", () => ({
  finished: (...a: unknown[]) => finished(...a),
  handOver: (...a: unknown[]) => handOver(...a),
  releaseExecutor: (...a: unknown[]) => releaseExecutor(...a),
}));
vi.mock("../../supabase", () => ({
  supabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { org_id: "o1" } }) }) }) }),
    rpc: (...a: unknown[]) => rpc(...a),
  }),
}));

const { handleSurvey } = await import("./survey");

const actor = { engagementId: "e1", orgId: "o1", roleCode: "staff-engineer", holder: "Sam" } as never;
const sections = [{ heading: "Sign-in", body: "Handled in `src/auth.ts:10`." }];
const surveyed = {
  version: 1, status: "surveyed", sections, files_cited: ["src/auth.ts"], refusal: null, log_ref: "l", usage: null,
};

function turn(over: { ctx?: Record<string, unknown>; input?: Record<string, unknown> } = {}) {
  return {
    actor, taskId: "t1", message: { stopReason: "tool_use" }, text: "", truncated: false,
    ctx: {
      engagementId: "e1", roleCode: "staff-engineer", taskTitle: "Survey the code",
      produces: "03-architecture/epic/KAN-12/code-survey", unresolvedProduces: null,
      inputs: [{ path: "epic", body: "EPIC TEXT" }, { path: "stack", body: "STACK TEXT" }, { path: "gap", body: null }],
      ...over.ctx,
    },
    call: { name: "survey", input: { summary: "reading auth", focus: "How does sign-in work?", ...over.input } },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  runSurvey.mockResolvedValue(surveyed);
  rpc.mockResolvedValue({ data: "v1", error: null });
  approve.mockResolvedValue({ ok: true });
});

describe("the survey hand-off", () => {
  it("refuses before reading when the findings have nowhere to be filed", async () => {
    const r = await handleSurvey(turn({ ctx: { produces: null, unresolvedProduces: "epic/{epic}/code-survey" } }));
    expect(r.kind).toBe("error");
    expect(runSurvey).not.toHaveBeenCalled();
    expect(releaseExecutor).toHaveBeenCalledWith("t1", expect.anything(), { failed: true });
  });

  it("refuses a survey that names nothing to look for", async () => {
    const r = await handleSurvey(turn({ input: { focus: "   " } }));
    expect(r.kind).toBe("error");
    expect(runSurvey).not.toHaveBeenCalled();
  });

  it("hands the focus and the pinned documents to the reader, skipping an input that was never drafted", async () => {
    await handleSurvey(turn());
    const [, , arg] = runSurvey.mock.calls[0] as [string, string, { focus: string; context: string }];
    expect(arg.focus).toBe("How does sign-in work?");
    expect(arg.context).toContain("### epic");
    expect(arg.context).toContain("STACK TEXT");
    expect(arg.context).not.toContain("### gap");
  });

  it("caps the context it hands over rather than sending every page whole", async () => {
    const big = "x".repeat(100_000);
    await handleSurvey(turn({ ctx: { inputs: [{ path: "a", body: big }, { path: "b", body: "SECOND" }] } }));
    const arg = (runSurvey.mock.calls[0] as unknown[])[2] as { context: string };
    expect(arg.context.length).toBeLessThan(31_000);
    expect(arg.context).not.toContain("SECOND");
  });

  it("files the findings at the row's path, then closes itself", async () => {
    const r = await handleSurvey(turn());
    expect(rpc).toHaveBeenCalledWith("file_document", expect.objectContaining({
      p_path: "03-architecture/epic/KAN-12/code-survey", p_sections: sections, p_task_id: "t1",
    }));
    expect(measureTask).toHaveBeenCalled();
    expect(approve).toHaveBeenCalledWith(actor, "t1", []);
    expect(releaseExecutor).toHaveBeenCalledWith("t1", expect.anything(), { failed: false });
    expect(handOver).not.toHaveBeenCalled();
    expect(r).toMatchObject({ kind: "drafted", path: "03-architecture/epic/KAN-12/code-survey" });
  });

  it("hands over with the reason when the gate will not let it close itself", async () => {
    approve.mockResolvedValue({ ok: false, error: "criterion unmet" });
    await handleSurvey(turn());
    expect(handOver).toHaveBeenCalledWith(actor, "t1", expect.anything(), "surveyed", expect.anything(), expect.objectContaining({ closed: false }));
    expect(recordTurn).toHaveBeenCalledWith("t1", expect.stringContaining("criterion unmet"), expect.anything());
  });

  it.each(["survey_failed", "refused"])("a %s survey files nothing and goes to a person", async (status) => {
    runSurvey.mockResolvedValue({ ...surveyed, status, sections: [], files_cited: [], refusal: "src/oauth.ts does not exist" });
    const r = await handleSurvey(turn());
    expect(rpc).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
    expect(handOver).toHaveBeenCalledWith(actor, "t1", expect.anything(), "survey-failed", expect.anything(), expect.anything());
    expect(r).toMatchObject({ kind: "error" });
    expect(recordTurn).toHaveBeenCalledWith("t1", expect.stringContaining("NOT SURVEYED"), expect.anything());
  });

  it("when filing fails the findings are written to the conversation, not lost", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "unique violation" } });
    const r = await handleSurvey(turn());
    expect(r.kind).toBe("error");
    expect(approve).not.toHaveBeenCalled();
    expect(recordTurn).toHaveBeenCalledWith("t1", expect.stringContaining("Handled in `src/auth.ts:10`."), expect.anything());
    expect(releaseExecutor).toHaveBeenCalledWith("t1", expect.anything(), { failed: true });
  });
});
