import { describe, expect, it, vi, beforeEach } from "vitest";

// `evaluateInlineFanOut` is the `inline`-mode counterpart to `evaluateNested`
// (`./nested.test.ts`'s sibling suite): a Done criterion for a nesting row whose fan-out never
// opens a child `workflow_run` at all (`materializeInlinePerSubject` inserts siblings into the SAME
// run instead). It must read those siblings, not ask `workflow_run` a question that has no answer
// — that mismatch is exactly how `scaffold-repos` got stuck open with every repo pair already
// closed.

vi.mock("server-only", () => ({}));

vi.mock("../../nested-version", () => ({
  resolveNestedVersion: vi.fn(),
}));

type StepRow = { task: string };
type TaskRow = { state: string; subject_ref: string | null; workflow_step: { task: string } | null };

const state: { templateSteps: StepRow[]; siblings: TaskRow[] } = { templateSteps: [], siblings: [] };

vi.mock("../../../supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../supabase")>()),
  supabaseAdmin: () => ({
    from(table: string) {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        not: () => chain,
        then: (resolve: (r: { data: unknown; error: null }) => void) =>
          resolve({
            data: table === "workflow_step" ? state.templateSteps : state.siblings,
            error: null,
          }),
      };
      return chain;
    },
  }),
}));

const { evaluateInlineFanOut } = await import("./inline-fanout");
const { resolveNestedVersion } = await import("../../nested-version");

const criterion = {
  id: "c1", kind: "done" as const, stepTask: "scaffold-repos",
  statement: "Every scaffold-repo row this row materialized has closed.",
  subjectKind: "inline-fanout", subjectRef: "scaffold-repo", operator: "is", value: "closed",
};

const resolved = {
  orgId: "org", engagementId: "eng", runId: "run-1", code: "scaffold-repo",
  versionId: "ver-1", ownerRoleCode: null, workstreamCode: null,
};

beforeEach(() => {
  state.templateSteps = [{ task: "execute-scaffold" }, { task: "approve-repo-scaffold" }];
  state.siblings = [];
  vi.mocked(resolveNestedVersion).mockReset();
});

describe("the inline fan-out gate", () => {
  it("is unmeasurable when the row's nested workflow can't be resolved", async () => {
    vi.mocked(resolveNestedVersion).mockResolvedValue(null);
    const v = await evaluateInlineFanOut(criterion, "task-1");
    expect(v.state).toBe("unmeasurable");
  });

  it("is unmeasurable when nothing has been materialized yet — never satisfied over zero rows", async () => {
    vi.mocked(resolveNestedVersion).mockResolvedValue(resolved);
    state.siblings = [];
    const v = await evaluateInlineFanOut(criterion, "task-1");
    expect(v.state).toBe("unmeasurable");
    if (v.state !== "unmeasurable") return;
    expect(v.why).toContain("scaffold-repo");
  });

  it("is unsatisfied while any materialized sibling is still open", async () => {
    vi.mocked(resolveNestedVersion).mockResolvedValue(resolved);
    state.siblings = [
      { state: "closed", subject_ref: "backend", workflow_step: { task: "execute-scaffold" } },
      { state: "running", subject_ref: "ios", workflow_step: { task: "execute-scaffold" } },
    ];
    const v = await evaluateInlineFanOut(criterion, "task-1");
    expect(v.state).toBe("unsatisfied");
  });

  // The regression: scaffold-repos' two repo pairs, both fully closed.
  it("is satisfied once every materialized sibling has closed", async () => {
    vi.mocked(resolveNestedVersion).mockResolvedValue(resolved);
    state.siblings = [
      { state: "closed", subject_ref: "backend", workflow_step: { task: "execute-scaffold" } },
      { state: "closed", subject_ref: "backend", workflow_step: { task: "approve-repo-scaffold" } },
      { state: "closed", subject_ref: "ios", workflow_step: { task: "execute-scaffold" } },
      { state: "closed", subject_ref: "ios", workflow_step: { task: "approve-repo-scaffold" } },
    ];
    const v = await evaluateInlineFanOut(criterion, "task-1");
    expect(v.state).toBe("satisfied");
  });

  it("ignores a sibling from an unrelated step, rather than counting it in or out", async () => {
    vi.mocked(resolveNestedVersion).mockResolvedValue(resolved);
    state.siblings = [
      { state: "running", subject_ref: "backend", workflow_step: { task: "some-other-step" } },
    ];
    const v = await evaluateInlineFanOut(criterion, "task-1");
    // The one sibling present belongs to no step this nested workflow declares — treated as none
    // materialized, not as one that's blocking.
    expect(v.state).toBe("unmeasurable");
  });

  it("is unmeasurable with no taskId — there is no row to check siblings of", async () => {
    const v = await evaluateInlineFanOut(criterion, null);
    expect(v.state).toBe("unmeasurable");
  });
});
