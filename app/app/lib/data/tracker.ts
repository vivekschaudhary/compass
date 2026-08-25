// Mirroring Compass work into the tracker.
//
// The one seam that writes to Jira. Everything that needs a ticket goes through here — phases
// today, bets and stories next — because this pattern repeats and the alternative is `createIssue`
// scattered across every feature that happens to need one, each with its own idea of how to name an
// epic and what to do when the board refuses.
//
// The shape is v1's `createSprint0`, which got it right: an EPIC for the phase, a STORY per row,
// the Jira key stored as the task's `ticket_key` so Compass and Jira name the same thing rather
// than keeping parallel truths.
//
// Three rules it does not break:
//
//   Jira first, then the local row. A failure must not leave a task claiming a key that does not
//   exist. v1 learned this: creating tickets against unverified Jira could never repair itself.
//
//   Idempotent. Re-initiating a phase, a retry, a double click — none of them may produce a second
//   copy of the board.
//
//   Never fatal WHILE WORK IS IN FLIGHT. A run that cannot reach Jira still runs; saying so beats
//   refusing to work. The CLOSE is the exception, and deliberately so: the tracker holds the status
//   of record, so a close that Jira did not accept must not happen in Compass either. `mirrorState`
//   therefore reports WHY it did nothing — see `reason` — so a caller can tell "there was nothing
//   to move" (no ticket, no tracker configured) from "the move was attempted and failed".

import "server-only";
import { supabaseAdmin } from "../supabase";
import { resolveJira, createIssue, transitionIssue, projectStatuses, type JiraCreds } from "../jira";
import { emit } from "./events";
import { sortByStep } from "./steps";

/**
 * What Compass's task states mean on a board.
 *
 * `hitl` and `awaiting` are BOTH "a human has the ball" — the first because the agent drafted and
 * needs approval, the second because it asked a question. Jira usually has one gate status for
 * both, so they map together and the distinction stays in Compass, where it is visible.
 */
const PREFERRED: Record<string, string[]> = {
  idle:      ["To Do", "Backlog", "Open"],
  // "In Progress" vanished from the live board when the HITL statuses were added. Nothing here
  // substitutes a gate status for it: `running` means the AGENT has the ball, and moving a ticket
  // to "Awaiting HITL approval" mid-run would tell the team a human is needed when none is. A
  // missing status is reported, and the ticket stays where it is.
  running:   ["In Progress", "In Development", "Doing"],
  // A real HITL status if the board has one; "In Review" is the honest second choice, because a
  // human deciding whether work is acceptable is what review means everywhere else.
  awaiting:  ["Awaiting HITL approval", "In Review", "In Progress"],
  hitl:      ["Awaiting HITL approval", "In Review", "In Progress"],
  closed:    ["Done", "Closed"],
  abandoned: ["Done", "Closed"],
};

/**
 * The board's own status names, resolved once per call.
 *
 * A mapping written against one client's board is wrong on the next one's. Deloitte's Jira will not
 * have "Awaiting HITL approval" either, so the vocabulary is discovered rather than assumed.
 */
async function statusFor(creds: JiraCreds, state: string): Promise<string | null> {
  const available = await projectStatuses(creds);
  if (!available?.length) return null;
  const lower = new Map(available.map((s) => [s.toLowerCase(), s]));
  for (const want of PREFERRED[state] ?? []) {
    const hit = lower.get(want.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

type Eng = Parameters<typeof resolveJira>[0];

async function credsFor(engagementId: string): Promise<JiraCreds | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("engagement")
    .select("jira_project, atlassian_base_url, atlassian_email, atlassian_api_token")
    .eq("id", engagementId).maybeSingle();
  return data ? resolveJira(data as Eng) : null;
}

export type Mirrored = {
  epic: string | null;
  stories: { taskId: string; key: string; title: string }[];
  /** How many stories the run OWES the board — one per task. Without it "3 stories" reads as success. */
  expected: number;
  /** Said plainly rather than thrown — the work happened whether or not the board heard about it. */
  problems: string[];
  /**
   * Why the board does not have everything, when it does not.
   *
   * The same split `MoveResult.reason` makes, for the same reason: `no-tracker` means nothing was
   * owed and nothing is wrong, while `epic-refused` / `story-refused` mean a real board was asked
   * and did not deliver. A caller cannot tell those apart from a `problems` string without parsing
   * English.
   */
  reason?: "no-supabase" | "no-tracker" | "no-run" | "epic-refused" | "story-refused";
};

/**
 * Does the board owe this run something it does not have?
 *
 * Pure, and the counterpart to `moveFailed`. An engagement with no tracker configured is NOT
 * incomplete — it owed nothing, and reporting it as a problem would put a permanent warning on
 * every engagement that deliberately runs without a board.
 */
export function mirrorIncomplete(m: Mirrored): boolean {
  if (m.reason === "no-tracker" || m.reason === "no-supabase") return false;
  return !m.epic || m.stories.length < m.expected;
}

/**
 * Put a phase on the board: one epic, one story per task.
 *
 * Called after the phase's tasks exist, so every story has something local to point at.
 */
export async function mirrorPhase(
  engagementId: string, runId: string, actorRole: string,
): Promise<Mirrored> {
  const out: Mirrored = { epic: null, stories: [], expected: 0, problems: [] };
  const sb = supabaseAdmin();
  if (!sb) return { ...out, reason: "no-supabase", problems: ["Supabase is not configured."] };

  const creds = await credsFor(engagementId);
  if (!creds) {
    // Not an error. An engagement may deliberately run without a tracker, and the phase still works.
    return {
      ...out, reason: "no-tracker",
      problems: ["No Jira configured for this engagement — nothing mirrored."],
    };
  }

  const { data: run } = await sb.from("workflow_run")
    .select("id, ticket_key, workflow(code, label)").eq("id", runId).maybeSingle();
  if (!run) return { ...out, reason: "no-run", problems: ["No such run."] };

  const wf = Array.isArray(run.workflow) ? run.workflow[0] : run.workflow;
  const { data: eng } = await sb.from("engagement").select("name").eq("id", engagementId).maybeSingle();

  // The epic. Reused when the run already carries one — that is the idempotency hinge, and it is
  // stored on the RUN rather than derived from a title, because a title someone edits in Jira must
  // not cause a second epic on the next call.
  let epicKey = run.ticket_key as string | null;
  if (!epicKey) {
    const created = await createIssue(creds, {
      type: "Epic",
      summary: `${wf?.label ?? wf?.code ?? "Phase"} — ${eng?.name ?? engagementId}`,
      description: `Created by Compass. Every story under this epic is one row of the ${wf?.code} phase.`,
    });
    if (!created) {
      return {
        ...out, reason: "epic-refused",
        problems: [`Could not create the epic in ${creds.project}. Nothing else was written.`],
      };
    }
    epicKey = created.key;
    await sb.from("workflow_run").update({ ticket_key: epicKey }).eq("id", runId);
  }
  out.epic = epicKey;

    // Ordered by the STEP's ord, not created_at. A phase creates every task in one transaction, so
    // their timestamps are identical and created_at ordering is arbitrary — it put step 2 before
    // step 1 on the first real run, which numbered the epic's stories backwards and would show a
    // queue in the wrong dependency order.
  const { data: rows } = await sb.from("work_task")
    .select("id, title, role_code, state, ticket_key, workflow_step(ord)")
    .eq("workflow_run_id", runId);
  const tasks = sortByStep(rows ?? []);
  // What the board is owed, recorded before any of it is attempted. `stories.length` alone cannot
  // say whether eleven is all of them or two short.
  out.expected = tasks.length;

  for (const t of tasks ?? []) {
    if (t.ticket_key) { out.stories.push({ taskId: t.id, key: t.ticket_key, title: t.title }); continue; }

    const created = await createIssue(creds, {
      type: "Story", summary: t.title, parentKey: epicKey,
      description: "Worked in Compass. This ticket mirrors its state.",
      // The owning role as a label, so a board can be filtered by who holds the work — v1's
      // convention, and the reason DELIVERY_ROLES exists.
      labels: [t.role_code],
    });
    if (!created) {
      out.problems.push(`Could not create a story for "${t.title}".`);
      out.reason = "story-refused";
      continue;
    }

    // Jira first, then the local row: a key is stored only once it exists.
    await sb.from("work_task").update({ ticket_key: created.key }).eq("id", t.id);
    out.stories.push({ taskId: t.id, key: created.key, title: t.title });

    // A task that is ALREADY in a later state gets moved there rather than left at To Do — the
    // machine rows close on creation, and a board that shows them open would be lying on day one.
    if (t.state !== "idle") await mirrorState(engagementId, t.id, t.state, actorRole);
  }

  await emit({
    engagementId, subjectType: "workflow_run", subjectId: runId,
    verb: "tracker.mirrored", actorKind: "system", actorRoleCode: actorRole,
    payload: {
      epic: epicKey, stories: out.stories.length, expected: out.expected,
      project: creds.project, problems: out.problems,
      incomplete: mirrorIncomplete(out), reason: out.reason ?? null,
    },
  });

  return out;
}

/**
 * Move a task's ticket to match its Compass state.
 *
 * Returns what it did, including "the board has no status for this" — which is a real answer on a
 * board with four statuses and no HITL gate, and must not read as success.
 */
export type MoveResult = {
  ok: boolean;
  key?: string;
  status?: string;
  note?: string;
  /**
   * Why the move did not happen. Absent on success.
   *
   * The split that matters to a caller: `no-supabase` / `no-ticket` / `no-tracker` mean there was
   * nothing to move and nothing is wrong. `no-status` / `refused` mean the move was ATTEMPTED
   * against a real board and did not take — which is a failure a close must respect.
   */
  reason?: "no-supabase" | "no-ticket" | "no-tracker" | "no-status" | "refused";
};

/** True when the move was attempted against a real board and did not take. */
export function moveFailed(r: MoveResult): boolean {
  return !r.ok && (r.reason === "no-status" || r.reason === "refused");
}

export async function mirrorState(
  engagementId: string, taskId: string, state: string, actorRole: string,
): Promise<MoveResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, reason: "no-supabase", note: "Supabase is not configured." };

  const { data: task } = await sb.from("work_task")
    .select("ticket_key, title").eq("id", taskId).maybeSingle();
  if (!task?.ticket_key) return { ok: false, reason: "no-ticket", note: "This task has no ticket to move." };

  const creds = await credsFor(engagementId);
  if (!creds) return { ok: false, reason: "no-tracker", note: "No Jira configured for this engagement." };

  const status = await statusFor(creds, state);
  if (!status) {
    const note = `The board has no status for '${state}'. Add one, or map it — the ticket stays where it is.`;
    await emit({
      engagementId, subjectType: "task", subjectId: taskId,
      verb: "tracker.status_missing", actorKind: "system", actorRoleCode: actorRole,
      payload: { ticket: task.ticket_key, state, wanted: PREFERRED[state] ?? [] },
    });
    return { ok: false, reason: "no-status", key: task.ticket_key, note };
  }

  const moved = await transitionIssue(creds, task.ticket_key, status);
  await emit({
    engagementId, subjectType: "task", subjectId: taskId,
    verb: moved ? "tracker.moved" : "tracker.move_refused",
    actorKind: "system", actorRoleCode: actorRole,
    payload: { ticket: task.ticket_key, to: status, from_state: state },
  });

  return moved
    ? { ok: true, key: task.ticket_key, status }
    : { ok: false, reason: "refused", key: task.ticket_key, status, note: `Jira refused the move to '${status}'.` };
}
