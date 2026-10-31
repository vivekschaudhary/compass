import { describe, it, expect, vi, beforeEach } from "vitest";

// Which repository a build goes into. The story does not carry one and neither does the data, so the
// model names it — and the part worth testing is what happens when it does not: with several repos
// registered a missing or unknown `repo` must REFUSE (and give the claim back), never fall through to
// "the first one", because a backend story built in the iOS app is not a recoverable mistake.

vi.mock("server-only", () => ({}));

const runCode = vi.fn();
vi.mock("./code-run", () => ({ runCode: (...a: unknown[]) => runCode(...a), storyFor: async () => null }));
vi.mock("../jira", () => ({ jiraForEngagement: async () => null, addRemoteLink: vi.fn(), addComment: vi.fn() }));

const recordTurn = vi.fn(async () => {});
vi.mock("./outcomes/turn-context", () => ({ recordTurn: (...a: unknown[]) => recordTurn(...(a as [])) }));
const releaseExecutor = vi.fn(async () => {});
const finished = vi.fn(async () => {});
const handOver = vi.fn(async () => {});
vi.mock("./outcomes/effects", () => ({
  releaseExecutor: (...a: unknown[]) => releaseExecutor(...(a as [])),
  finished: (...a: unknown[]) => finished(...(a as [])),
  handOver: (...a: unknown[]) => handOver(...(a as [])),
}));

const missingReads = vi.fn(async (): Promise<string[]> => []);
vi.mock("./context/loaders", async (orig) => ({
  ...(await orig<typeof import("./context/loaders")>()),
  missingReads: (...a: unknown[]) => missingReads(...(a as [])),
}));

const { handleCode } = await import("./outcomes/code");
const { inputPrompt } = await import("./context");
import type { AgentContext } from "./context";

const TWO = [
  { key: "app", name: "kindtree-swap", area: "mobile" },
  { key: "backend", name: "art-swap-backend", area: "backend" },
];

const turn = (repos: AgentContext["repos"], input: Record<string, unknown>) => ({
  actor: { engagementId: "e1" }, taskId: "t1",
  ctx: { engagementId: "e1", roleCode: "engineer", repos } as unknown as AgentContext,
  message: {}, text: "", truncated: false,
  call: { name: "code", input: { summary: "s", approach: "a", files: [], ...input } },
}) as never;

beforeEach(() => {
  for (const m of [runCode, recordTurn, releaseExecutor, finished, handOver, missingReads]) m.mockClear();
  missingReads.mockResolvedValue([]);
  runCode.mockResolvedValue({ ok: false, exit: null, branch: null, prUrl: null, log: "", refusal: "stop here", repoName: null });
});

describe("the repo the model names", () => {
  it("passes it through, and records which repository in the intent", async () => {
    await handleCode(turn(TWO, { repo: "backend" }));
    expect(runCode).toHaveBeenCalledWith("e1", "t1", expect.objectContaining({ repo: "backend" }));
    const intent = recordTurn.mock.calls[0] as unknown[];
    expect(String(intent[1])).toContain("art-swap-backend");
  });

  it("REFUSES a missing repo when there are several — nothing is spawned, the claim is given back", async () => {
    const r = await handleCode(turn(TWO, {}));
    expect(r.kind).toBe("error");
    expect(runCode).not.toHaveBeenCalled();
    expect(releaseExecutor).toHaveBeenCalled();
    expect(finished).toHaveBeenCalledWith("e1", "t1", "engineer", "build-refused", expect.anything(), expect.anything());
    const said = String((recordTurn.mock.calls[0] as unknown[])[1]);
    expect(said).toContain("app");
    expect(said).toContain("backend");
  });

  it("REFUSES an unknown repo and names it", async () => {
    const r = await handleCode(turn(TWO, { repo: "web" }));
    expect(r.kind).toBe("error");
    expect(r.kind === "error" && r.message).toContain("'web' is not one of them");
    expect(runCode).not.toHaveBeenCalled();
  });

  it("with exactly one repo needs no name", async () => {
    await handleCode(turn([TWO[0]], {}));
    expect(runCode).toHaveBeenCalledWith("e1", "t1", expect.objectContaining({ repo: null }));
  });

  it("with none listed, defers to runCode — which refuses with the real reason", async () => {
    await handleCode(turn([], {}));
    expect(runCode).toHaveBeenCalled();
  });
});

describe("the documents the step reads", () => {
  it("REFUSES before spawning when a declared read is not in Compass, naming it", async () => {
    missingReads.mockResolvedValue(["design-library", "scaffold-record"]);
    const r = await handleCode(turn([TWO[0]], {}));
    expect(r.kind).toBe("error");
    expect(r.kind === "error" && r.message).toContain("`design-library`");
    expect(r.kind === "error" && r.message).toContain("`scaffold-record`");
    expect(runCode, "nothing is spawned").not.toHaveBeenCalled();
    expect(releaseExecutor, "the claim is given back").toHaveBeenCalled();
    expect(finished).toHaveBeenCalledWith("e1", "t1", "engineer", "build-refused", expect.anything(),
      expect.objectContaining({ missing: ["design-library", "scaffold-record"] }));
    expect(String((recordTurn.mock.calls[0] as unknown[])[1])).toContain("did not start");
  });

  it("asks about this task's reads, and builds when none is missing", async () => {
    await handleCode(turn([TWO[0]], {}));
    expect(missingReads).toHaveBeenCalledWith("t1", "e1");
    expect(runCode).toHaveBeenCalled();
  });

  it("does not record the build's intent for a build that never started", async () => {
    missingReads.mockResolvedValue(["epic/CT-288"]);
    await handleCode(turn([TWO[0]], {}));
    const said = (recordTurn.mock.calls as unknown[][]).map((c) => String(c[1]));
    expect(said.some((t) => t.includes("**Building.**"))).toBe(false);
  });
});

describe("what the model is told", () => {
  const BASE = {
    taskId: "t1", engagementId: "e1", taskTitle: "Implement the story", taskSubtitle: "", roleCode: "engineer",
    agentFile: "# Agent", produces: "{subject}@scm", unresolvedProduces: null, renders: "code", reviewPath: null,
    hasWebSearch: false, destination: "scm", output: "code", inputs: [], doneCriteria: [], inventory: [],
    phaseRows: [], template: null, templateName: null, priorDraft: null, rejections: [], sprint: null,
    subject: null, repoName: null, repos: TWO,
  } as unknown as AgentContext;

  it("lists the repos by key and area, and says a guess is refused", () => {
    const p = inputPrompt(BASE);
    expect(p).toContain("`app` — kindtree-swap (mobile)");
    expect(p).toContain("`backend` — art-swap-backend (backend)");
    expect(p).toMatch(/refused/);
  });

  it("with one repo, says there is nothing to choose", () => {
    expect(inputPrompt({ ...BASE, repos: [TWO[0]] })).toContain("There is only one, so `repo` is `app`");
  });

  it("says nothing about repos on a row that is not a build", () => {
    expect(inputPrompt({ ...BASE, output: null, repos: [] })).not.toContain("<repos>");
  });

  it("never reveals a checkout path", () => {
    expect(inputPrompt(BASE)).not.toMatch(/\/Volumes|local_path/);
  });
});
