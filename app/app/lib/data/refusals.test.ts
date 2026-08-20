import { describe, expect, it, vi, beforeEach } from "vitest";

// A refusal must leave a trace. These tests exist because the failure they guard against is
// invisible by construction: a gate says no, the caller returns an error to the screen, and nothing
// anywhere records that the process was blocked. The product's claim is that its record can answer
// "where is this stuck", and state changes alone cannot answer it — a task that starts is evented,
// a task that could not start is not.
//
// Mocked at `supabaseAdmin`, not at `emit`. `emitRefusal` calls `emit` inside its OWN module and so
// holds a direct reference to it — mocking the module's export replaces it for importers and not
// for the intra-module call, so an `emit` mock records nothing and the test passes on an empty
// array. Stubbing the database seam exercises the real path instead.
vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const events: Row[] = [];

vi.mock("../supabase", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      if (table === "event") {
        return { insert: async (row: Row) => { events.push(row); return { error: null }; } };
      }
      // `orgIdFor` walks work_task → document → org looking for an org id.
      const chain = {
        select: () => chain, eq: () => chain, limit: () => chain,
        maybeSingle: async () => ({ data: table === "org" ? { id: "org-1" } : null }),
      };
      return chain;
    },
  }),
}));

const { emitRefusal } = await import("./events");

beforeEach(() => { events.length = 0; });

const TASK = "11111111-1111-4111-8111-111111111111";

describe("emitRefusal", () => {
  it("records the reason verbatim rather than a paraphrase", async () => {
    // The routines explain themselves — "Waiting on:\n  Staffing plan and resources" names the row
    // someone has to close. Summarising it to "dependencies unmet" throws away the only part that
    // tells anyone what to do next.
    const reason = "Waiting on:\n  Staffing plan and resources";
    await emitRefusal({
      engagementId: "e1", subjectType: "task", subjectId: TASK,
      verb: "task.start_refused", reason,
    });
    expect(events).toHaveLength(1);
    expect((events[0].payload as Row).reason).toBe(reason);
    expect(events[0].verb).toBe("task.start_refused");
  });

  it("attributes the refusal to the system, not to the person who tried", async () => {
    // The gate refused; the person did nothing wrong. Someone asking why their close bounced wants
    // the rule — attributing it to them sends them to the wrong question, and turns a queue of
    // refusals into a list of people's mistakes.
    await emitRefusal({
      engagementId: "e1", subjectType: "task", subjectId: TASK,
      verb: "task.close_refused", reason: "Not done: …",
      actorRoleCode: "delivery-manager", actorUserId: "Priya S.",
    });
    expect(events[0].actor_kind).toBe("system");
    // Who tried is still recorded. It is the ATTRIBUTION that belongs to the system, not the
    // identity — losing that would make the record unusable for asking who is blocked.
    expect(events[0].actor_role_code).toBe("delivery-manager");
    expect(events[0].actor_user_id).toBe("Priya S.");
  });

  it("keeps the caller's payload alongside the reason", async () => {
    await emitRefusal({
      engagementId: "e1", subjectType: "task", subjectId: TASK,
      verb: "task.close_blocked_by_tracker", reason: "Jira refused the move to 'Done'.",
      payload: { ticket: "KAN-14", status: "Done" },
    });
    const p = events[0].payload as Row;
    expect(p.ticket).toBe("KAN-14");
    expect(p.reason).toBe("Jira refused the move to 'Done'.");
  });

  it("distinguishes the four refusals by verb", async () => {
    // Four different things go wrong and they need different fixes: an entry gate, a Ready
    // criterion, a Done criterion, and a board that will not take the transition. One verb for all
    // of them makes the record unusable for the question it exists to answer.
    for (const verb of [
      "phase.refused", "task.start_refused", "task.close_refused", "task.close_blocked_by_tracker",
    ]) {
      await emitRefusal({ engagementId: "e1", subjectType: "task", subjectId: TASK, verb, reason: "…" });
    }
    expect(events.map((e) => e.verb)).toEqual([
      "phase.refused", "task.start_refused", "task.close_refused", "task.close_blocked_by_tracker",
    ]);
  });
});
