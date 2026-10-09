import { describe, expect, it, vi, beforeEach } from "vitest";

// CHARACTERIZATION — what `approve` does with a gate that mixes machine-checked and human-attested
// criteria, pinned before `gates.ts` is split.
//
// `approve` is where three different kinds of truth meet: what a check established, what a person
// is putting their name to, and what the person left unticked. `remeasure.test.ts` covers the
// re-measure cascade with NO done criteria; this covers the criteria loop and the close ordering,
// which is the part a split of `gates.ts` is most likely to disturb.
//
// Where a behaviour looks debatable it is pinned anyway and flagged `QUIRK`. This file records what
// runs, not what should. Changing one is a behaviour change: rewrite the assertion on purpose.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;

const db: Record<string, Row[]> = {};
/** Writes to `measurement`, in order. */
let ops: string[] = [];
/** Everything emitted, in order — events and refusals share one timeline with the writes. */
let timeline: string[] = [];
let closeError: string | null = null;
/** What `task_open_comments` answers — a number, or null for "it could not be asked". */
let openComments: number | null = 0;
/** What the board says when asked to close. */
let move: { ok: boolean; failed?: boolean; note?: string } = { ok: true };

vi.mock("./events", () => ({
  emit: async (e: { verb: string }) => { timeline.push(`emit:${e.verb}`); },
  emitRefusal: async (r: { verb: string }) => { timeline.push(`refuse:${r.verb}`); },
  orgIdFor: async () => "org",
}));
vi.mock("./tracker", () => ({
  mirrorState: async (_e: string, _t: string, state: string) => {
    timeline.push(`mirror:${state}`);
    return state === "closed" ? move : { ok: true };
  },
  moveFailed: (m: { failed?: boolean }) => m.failed === true,
}));
vi.mock("./materialise", () => ({ materialiseFrom: async () => null }));

vi.mock("../supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../supabase")>()),
  supabaseAdmin: () => ({
    from(table: string) {
      let rows = db[table] ?? [];
      const filters: [string, unknown][] = [];
      let deleting = false;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: unknown) => {
          filters.push([col, v]);
          rows = rows.filter((r) => r[col] === v);
          return chain;
        },
        neq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] !== v); return chain; },
        in: (col: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[col])); return chain; },
        order: () => chain,
        limit: () => chain,
        delete: () => { deleting = true; return chain; },
        upsert: async (row: Row) => {
          ops.push(`upsert:${row.criterion_id}:${row.source}:${row.satisfied}`);
          timeline.push(`measure:${row.criterion_id}`);
          return { error: null };
        },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: { data: Row[]; error: null }) => unknown) => {
          if (deleting && table === "measurement") {
            const crit = filters.find(([c]) => c === "criterion_id")?.[1];
            ops.push(`delete:${crit}`);
            timeline.push(`unmeasure:${crit}`);
          }
          return res({ data: rows, error: null });
        },
      };
      return chain;
    },
    rpc: async (name: string) => {
      // The comment-count question is asked before anything is written, and is kept OUT of the
      // timeline so the ordering assertions below still read as before it existed.
      if (name === "task_open_comments") {
        return openComments === null
          ? { data: null, error: { message: "boom" } }
          : { data: openComments, error: null };
      }
      timeline.push(`rpc:${name}`);
      return { data: null, error: closeError ? { message: closeError } : null };
    },
  }),
}));

const { approve } = await import("./gates");

const actor = { engagementId: "eng", orgId: "org", roleCode: "delivery-manager", holder: "Vivek" } as never;

function crit(id: string, kind: "ready" | "done") {
  return {
    id, workflow_version_id: "wv1", kind, step_task: null, ord: 1, statement: id,
    subject_kind: "judgment", subject_ref: null, operator: null, value: null,
  };
}

beforeEach(() => {
  ops = [];
  timeline = [];
  closeError = null;
  openComments = 0;
  move = { ok: true };
  db.work_task = [{
    id: "t1", engagement_id: "eng", state: "closed", workflow_step_id: "s1",
    workflow_run_id: "r1", workflow_run: { workflow_version_id: "wv1" },
  }];
  db.workflow_run = [{ id: "r1", parent_task_id: null }];
  db.workflow_step = [{ id: "s1", task: "draft-x" }];
  db.criterion = [
    crit("c-machine", "done"),   // a check already met this
    crit("c-yes", "done"),       // a person ticks it
    crit("c-no", "done"),        // a person leaves it unticked
    crit("c-ready", "ready"),    // not a Done criterion: approve must not touch it
  ];
  db.measurement = [
    { task_id: "t1", criterion_id: "c-machine", source: "document", satisfied: true },
    // A stale human tick from an earlier approval attempt, which this attempt does not repeat.
    { task_id: "t1", criterion_id: "c-no", source: "human", satisfied: true },
  ];
});

describe("approve — mixed machine and human criteria", () => {
  it("leaves what a check established alone, attests what is ticked, unmeasures what is not", async () => {
    const r = await approve(actor, "t1", ["c-yes"]);

    expect(r).toEqual({ ok: true });
    // Nothing is written for c-machine: overwriting it with "Confirmed by <name>" would put a
    // signature on something a script verified.
    // In criterion order, not tick order.
    expect(ops).toEqual([
      "upsert:c-yes:human:true",
      "delete:c-no",         // unticked → unmeasured, NOT written as satisfied:false
    ]);
    expect(ops.join()).not.toContain("c-machine");
    expect(ops.join()).not.toContain("c-ready");
  });

  it("a criterion is attested in the record once per tick, and only for ticked ones", async () => {
    await approve(actor, "t1", ["c-yes"]);

    expect(timeline.filter((t) => t === "emit:criterion.attested")).toHaveLength(1);
  });

  it("ticking a criterion a check already met is a no-op, not a second signature", async () => {
    await approve(actor, "t1", ["c-machine", "c-yes"]);

    expect(ops.filter((o) => o.includes("c-machine"))).toEqual([]);
    expect(timeline.filter((t) => t === "emit:criterion.attested")).toHaveLength(1);
  });

  it("QUIRK: a human tick OVERRIDES a check that ran and failed", async () => {
    // `machineMet` counts only satisfied, non-human measurements, so a check that said NO is
    // treated like no check at all and a confirmation replaces it.
    db.measurement = [{ task_id: "t1", criterion_id: "c-yes", source: "document", satisfied: false }];

    await approve(actor, "t1", ["c-yes"]);

    expect(ops).toContain("upsert:c-yes:human:true");
  });

  it("closes the BOARD first, then the gate, in that order, after every measurement", async () => {
    await approve(actor, "t1", ["c-yes"]);

    expect(timeline).toEqual([
      "measure:c-yes",
      "emit:criterion.attested",
      "unmeasure:c-no",
      "mirror:closed",
      "rpc:close_task",
    ]);
  });
});

describe("approve — the two ways a close is refused", () => {
  it("the board refusing stops the close: the gate is never asked, and the reason is recorded", async () => {
    move = { ok: false, failed: true, note: "No Done status on this board." };

    const r = await approve(actor, "t1", ["c-yes"]);

    expect(r).toEqual({ ok: false, error: "No Done status on this board." });
    expect(timeline).not.toContain("rpc:close_task");
    expect(timeline.at(-1)).toBe("refuse:task.close_blocked_by_tracker");
  });

  it("the gate refusing AFTER the board moved puts the ticket back, then records the refusal", async () => {
    closeError = "Done criteria not met.";

    const r = await approve(actor, "t1", ["c-yes"]);

    expect(r).toEqual({ ok: false, error: "Done criteria not met." });
    expect(timeline.slice(-4)).toEqual([
      "mirror:closed", "rpc:close_task", "mirror:hitl", "refuse:task.close_refused",
    ]);
  });

  it("a task outside the engagement is refused before anything is written", async () => {
    db.work_task = [];

    const r = await approve(actor, "t1", ["c-yes"]);

    expect(r).toEqual({ ok: false, error: "That task is not in your engagement." });
    expect(ops).toEqual([]);
    expect(timeline).toEqual([]);
  });

  describe("open comments on the document", () => {
    it("refuses BEFORE writing anything or moving the ticket, and records why", async () => {
      openComments = 2;

      const r = await approve(actor, "t1", ["c-yes"]);

      expect(r).toEqual({ ok: false, error: "2 open comments on the document must be resolved before this can be approved." });
      expect(ops).toEqual([]);
      expect(timeline).toEqual(["refuse:task.close_blocked_by_comments"]);
    });

    it("says 'comment', singular, for one", async () => {
      openComments = 1;
      const r = await approve(actor, "t1", ["c-yes"]);
      expect(r.ok === false && r.error).toMatch(/^1 open comment on the document/);
    });

    it("refuses when the count could not be read — never reads that as nothing open", async () => {
      openComments = null;

      const r = await approve(actor, "t1", ["c-yes"]);

      expect(r.ok).toBe(false);
      expect(r.ok === false && r.error).toMatch(/Could not check for open comments.*Nothing was approved/);
      expect(ops).toEqual([]);
      expect(timeline).toEqual([]);
    });
  });
});
