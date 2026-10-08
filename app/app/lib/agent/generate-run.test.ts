import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const db = {
  work_task: [] as Row[],
  repo: [] as Row[],
  handoff_call: [] as Row[],
};

// A small fake of the Supabase calls generate-run makes: selects with eq filters, inserts, updates.
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
    return resolve({ data: null, error: null });
  };
  return chain;
}
vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({ from: (t: keyof typeof db) => chainFor(t) }),
}));

const { runScaffold } = await import("./generate-run");

const shipped = {
  version: 1, status: "shipped", branch: "feat/scaffold-app", pr_url: "https://github.com/o/r/pull/9",
  files_changed: 4, checks: { ran: ["npm run build"], failed: null, tail: null }, refusal: null,
  log_ref: "l", usage: null,
};
const input = { summary: "a web app", framework: "nextjs-ts", options: "app router" };

beforeEach(() => {
  db.work_task = [{ id: "t1", org_id: "o1", engagement_id: "e1", subject_ref: "app" }];
  db.repo = [{ key: "app", engagement_id: "e1", local_path: "/checkouts/app" }];
  db.handoff_call = [];
});

const envelope = (over: Record<string, unknown>) => JSON.stringify({ verb: "generate", version: 1, ...over });

describe("scaffolding from the app", () => {
  it("refuses without spawning when the repo has no local checkout, and closes the record", async () => {
    db.repo = [{ key: "app", engagement_id: "e1", local_path: null }];
    const spawn = vi.fn();
    const r = await runScaffold("e1", "t1", input, { spawn });
    expect(r.status).toBe("refused");
    expect(r.refusal).toMatch(/No local checkout/);
    expect(spawn).not.toHaveBeenCalled();
    expect(db.handoff_call[0]).toMatchObject({ status: "refused" });
  });

  it("refuses when the task names no repo", async () => {
    db.work_task = [{ id: "t1", org_id: "o1", engagement_id: "e1", subject_ref: null }];
    const r = await runScaffold("e1", "t1", input, { spawn: vi.fn() });
    expect(r.status).toBe("generator_failed");
    expect(db.handoff_call).toHaveLength(0);
  });

  it("sends the request with the record's id, and closes the record with the shipped result", async () => {
    const spawn = vi.fn(async () => ({ exit: 0, stdout: envelope({ ok: true, result: shipped }) + "\n", stderr: "" }));
    const r = await runScaffold("e1", "t1", input, { spawn });
    expect(r.status).toBe("shipped");
    const sent = JSON.parse(String((spawn.mock.calls as unknown as string[][])[0][0]));
    expect(sent.framework).toBe("nextjs-ts");
    expect(sent.repo).toEqual({ key: "app", local_path: "/checkouts/app" });
    expect(db.handoff_call).toHaveLength(1);
    expect(sent.caller.handoff_call_id).toBe(db.handoff_call[0].id);
    expect(db.handoff_call[0]).toMatchObject({ status: "shipped", pr_url: "https://github.com/o/r/pull/9" });
  });

  it("reads the result from the last line, after any progress output", async () => {
    const spawn = vi.fn(async () => ({ exit: 0, stdout: "building…\n" + envelope({ ok: true, result: shipped }) + "\n", stderr: "" }));
    expect((await runScaffold("e1", "t1", input, { spawn })).status).toBe("shipped");
  });

  it("a process that prints no envelope is generator_failed, with its stderr", async () => {
    const spawn = vi.fn(async () => ({ exit: 1, stdout: "", stderr: "Traceback: boom" }));
    const r = await runScaffold("e1", "t1", input, { spawn });
    expect(r.status).toBe("generator_failed");
    expect(r.refusal).toMatch(/printed no result/);
    expect(r.refusal).toMatch(/boom/);
    expect(db.handoff_call[0]).toMatchObject({ status: "generator_failed" });
  });

  it("an envelope that is not ok is generator_failed with the generator's message", async () => {
    const spawn = vi.fn(async () => ({ exit: 1, stdout: envelope({ ok: false, error: { code: "invalid_input", message: "bad framework" } }), stderr: "" }));
    const r = await runScaffold("e1", "t1", input, { spawn });
    expect(r.status).toBe("generator_failed");
    expect(r.refusal).toMatch(/bad framework/);
  });

  it("a result the contract refuses is not recorded as shipped", async () => {
    const lie = { ...shipped, pr_url: null };
    const spawn = vi.fn(async () => ({ exit: 0, stdout: envelope({ ok: true, result: lie }), stderr: "" }));
    const r = await runScaffold("e1", "t1", input, { spawn });
    expect(r.status).toBe("generator_failed");
    expect(db.handoff_call[0].status).toBe("generator_failed");
  });

  it("a spawn that throws still closes the record", async () => {
    const spawn = vi.fn(async () => { throw new Error("ENOENT python3"); });
    const r = await runScaffold("e1", "t1", input, { spawn });
    expect(r.status).toBe("generator_failed");
    expect(r.refusal).toMatch(/ENOENT/);
    expect(db.handoff_call[0].status).toBe("generator_failed");
  });
});
