import { describe, expect, it, vi, beforeEach } from "vitest";

// `pr-linked` for a run with no ticket.
//
// `scaffold-repo` is about a repo, not a story, so there is no Jira issue to read a pull request
// off. Left as it was, the gate answered "this run has no story on the tracker" — UNMEASURABLE
// forever — and the row could never close however good the pull request was. It now reads the
// pull request the run recorded when it finished.
//
// What this guards is the direction of the failure. A run that recorded NO pull request is
// UNSATISFIED, not unmeasurable: "nothing shipped" is an answer, and dressing it as "could not
// look" would send someone hunting for a measurement problem instead of a missing PR.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const state: { runs: Row[]; tasks: Row[]; events: Row[] } = { runs: [], tasks: [], events: [] };

vi.mock("../supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../supabase")>()),
  supabaseAdmin: () => ({
    from(table: string) {
      let rows = table === "workflow_run" ? state.runs : table === "work_task" ? state.tasks : state.events;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return chain; },
        in: (col: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[col])); return chain; },
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (res: (v: { data: Row[] }) => unknown) => res({ data: rows }),
      };
      return chain;
    },
  }),
}));

const { evaluate } = await import("./gates");

const actor = { engagementId: "eng", orgId: "org", roleCode: "staff-engineer" } as never;
const prLinked = {
  id: "c1", kind: "done" as const, stepTask: "execute-scaffold", statement: "A pull request is linked on the ticket.",
  subjectKind: "ticket", subjectRef: "pr-linked", operator: "is", value: "true",
};

const seed = (run: Row | null, finished: Row[] = []) => {
  state.tasks = [{ id: "task-1", workflow_run_id: "run-1" }, { id: "task-2", workflow_run_id: "run-1" }];
  state.runs = run ? [{ id: "run-1", ...run }] : [];
  state.events = finished.map((payload) => ({ verb: "agent.run.finished", subject_id: "task-1", payload }));
};

beforeEach(() => { state.runs = []; state.tasks = []; state.events = []; });

describe("pr-linked on a run about a repo", () => {
  it("is satisfied by a pull request the run recorded", async () => {
    seed({ subject_key: null, subject_ref: "api" }, [{ outcome: "built", pr: "https://github.com/a/api/pull/3" }]);
    const v = await evaluate(actor, prLinked, "task-1");
    expect(v.state).toBe("satisfied");
    if (v.state !== "satisfied") return;
    expect(v.detail).toContain("pull/3");
    // Weaker than asking the tracker, and it says so.
    expect(v.source).toBe("compass");
  });

  it("is UNSATISFIED, not unmeasurable, when the run recorded none", async () => {
    seed({ subject_key: null, subject_ref: "api" }, [{ outcome: "build-failed", pr: null, exit: 1 }]);
    const v = await evaluate(actor, prLinked, "task-1");
    expect(v.state).toBe("unsatisfied");
  });

  it("is unsatisfied when the run has not finished at all", async () => {
    seed({ subject_key: null, subject_ref: "api" }, []);
    expect((await evaluate(actor, prLinked, "task-1")).state).toBe("unsatisfied");
  });

  // A URL that is not a pull request is not evidence of one.
  it("ignores a recorded value that is not a pull request URL", async () => {
    seed({ subject_key: null, subject_ref: "api" }, [{ pr: "https://github.com/a/api/tree/main" }]);
    expect((await evaluate(actor, prLinked, "task-1")).state).toBe("unsatisfied");
  });

  // Only a run that IS about something gets the fallback. A story run with no key is misconfigured,
  // and reading a recorded PR there would hide that.
  it("still says a run with neither a story nor a subject is unmeasurable", async () => {
    seed({ subject_key: null, subject_ref: null }, [{ pr: "https://github.com/a/api/pull/3" }]);
    expect((await evaluate(actor, prLinked, "task-1")).state).toBe("unmeasurable");
  });
});
