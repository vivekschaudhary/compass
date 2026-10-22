import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const db = {
  work_task: [] as Row[],
  repo: [] as Row[],
  handoff_call: [] as Row[],
};

// A small fake of the Supabase calls survey-run makes: selects with eq filters, inserts, updates.
function chainFor(table: keyof typeof db) {
  let rows: Row[] = db[table];
  let mode: "select" | "insert" | "update" = "select";
  let payload: Row = {};
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => { rows = rows.filter((r) => r[col] === val); return chain; };
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  chain.single = async () => ({ data: rows[0] ?? null, error: null });
  chain.insert = (v: Row) => {
    mode = "insert";
    const row: Row = { created_at: new Date().toISOString(), ...v };
    db[table].push(row);
    rows = [row];
    return chain;
  };
  chain.update = (v: Row) => { mode = "update"; payload = v; return chain; };
  chain.then = (resolve: (r: unknown) => unknown) => {
    if (mode === "update") for (const r of rows) Object.assign(r, payload);
    return resolve({ data: mode === "select" ? rows : null, error: null });
  };
  return chain;
}
vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({ from: (t: keyof typeof db) => chainFor(t) }),
}));

const { runSurvey } = await import("./survey-run");

const surveyed = {
  version: 1, status: "surveyed",
  sections: [{ heading: "Sign-in", body: "Handled in `src/auth.ts:10`." }],
  files_cited: ["src/auth.ts"], refusal: null, log_ref: "l",
  usage: { input_tokens: 100, output_tokens: 50 },
};
const input = { focus: "How does sign-in work?", context: "Epic ACC-E1" };

beforeEach(() => {
  db.work_task = [{ id: "t1", org_id: "o1", engagement_id: "e1", subject_ref: "KAN-12" }];
  db.repo = [
    { key: "api", engagement_id: "e1", local_path: "/checkouts/api", ord: 1 },
    { key: "ios", engagement_id: "e1", local_path: "  ", ord: 2 },
    { key: "web", engagement_id: "e1", local_path: null, ord: 3 },
  ];
  db.handoff_call = [];
});

const envelope = (over: Record<string, unknown>) => JSON.stringify({ verb: "survey", version: 1, ...over });

describe("surveying from the app", () => {
  it("refuses without spawning when no repo has a local checkout, and closes the record", async () => {
    db.repo = [{ key: "api", engagement_id: "e1", local_path: null }];
    const spawn = vi.fn();
    const r = await runSurvey("e1", "t1", input, { spawn });
    expect(r.status).toBe("refused");
    expect(r.refusal).toMatch(/local checkout/);
    expect(spawn).not.toHaveBeenCalled();
    expect(db.handoff_call[0]).toMatchObject({ kind: "survey", status: "refused" });
  });

  it("refuses a task that is not in the engagement, writing no record", async () => {
    const spawn = vi.fn();
    const r = await runSurvey("other-engagement", "t1", input, { spawn });
    expect(r.status).toBe("survey_failed");
    expect(spawn).not.toHaveBeenCalled();
    expect(db.handoff_call).toHaveLength(0);
  });

  it("sends only the repos that have a checkout, with the focus, context and the record's id", async () => {
    const spawn = vi.fn(async () => ({ exit: 0, stdout: envelope({ ok: true, result: surveyed }) + "\n", stderr: "" }));
    const r = await runSurvey("e1", "t1", input, { spawn });
    expect(r.status).toBe("surveyed");
    const sent = JSON.parse(String((spawn.mock.calls as unknown as string[][])[0][0]));
    expect(sent.repos).toEqual([{ key: "api", local_path: "/checkouts/api" }]);
    expect(sent).toMatchObject({ subject_ref: "KAN-12", focus: input.focus, context: input.context });
    expect(sent.caller.handoff_call_id).toBe(db.handoff_call[0].id);
    expect(db.handoff_call[0]).toMatchObject({ kind: "survey", status: "surveyed" });
  });

  it("reads the result from the last line, after the reader's progress output", async () => {
    const spawn = vi.fn(async () => ({
      exit: 0, stdout: "    · Read src/auth.ts\n" + envelope({ ok: true, result: surveyed }) + "\n", stderr: "",
    }));
    expect((await runSurvey("e1", "t1", input, { spawn })).status).toBe("surveyed");
  });

  it("a process that prints no envelope is survey_failed, with its stderr", async () => {
    const spawn = vi.fn(async () => ({ exit: 1, stdout: "", stderr: "Traceback: boom" }));
    const r = await runSurvey("e1", "t1", input, { spawn });
    expect(r.status).toBe("survey_failed");
    expect(r.refusal).toMatch(/printed no result/);
    expect(r.refusal).toMatch(/boom/);
    expect(db.handoff_call[0]).toMatchObject({ status: "survey_failed" });
  });

  it("an envelope that is not ok is refused with the reader's message", async () => {
    const spawn = vi.fn(async () => ({
      exit: 1, stdout: envelope({ ok: false, error: { code: "invalid_input", message: "bad focus" } }), stderr: "",
    }));
    const r = await runSurvey("e1", "t1", input, { spawn });
    expect(r.status).toBe("refused");
    expect(r.refusal).toMatch(/bad focus/);
  });

  it("a result the contract refuses is not recorded as surveyed", async () => {
    const lie = { ...surveyed, files_cited: [] };
    const spawn = vi.fn(async () => ({ exit: 0, stdout: envelope({ ok: true, result: lie }), stderr: "" }));
    const r = await runSurvey("e1", "t1", input, { spawn });
    expect(r.status).toBe("survey_failed");
    expect(db.handoff_call[0].status).toBe("survey_failed");
  });

  it("a spawn that throws still closes the record", async () => {
    const spawn = vi.fn(async () => { throw new Error("ENOENT python3"); });
    const r = await runSurvey("e1", "t1", input, { spawn });
    expect(r.status).toBe("survey_failed");
    expect(r.refusal).toMatch(/ENOENT/);
    expect(db.handoff_call[0].status).toBe("survey_failed");
  });
});
