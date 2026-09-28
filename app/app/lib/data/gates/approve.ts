import { supabaseAdmin } from "../../supabase";
import { emit, emitRefusal } from "../events";
import { expandLinks } from "../links";
import { mirrorState, moveFailed } from "../tracker";
import { materialiseFrom } from "../materialise";
import type { Actor } from "../actor";
import { criteriaForTask, parentRunOf, remeasureRun } from "./measure";

/* ── approving: a person as the evaluator ────────────────────────────────── */

/**
 * Record a person confirming Done criteria, then close the task.
 *
 * Judgment criteria — "scope not covered by any row is named rather than left implicit" — cannot be
 * computed. The person who knows the engagement reads the draft and says so, and that attestation
 * is stored as a measurement with `source: "human"` and their name, exactly like a machine check.
 * The record does not distinguish "a script verified this" from "Matt said so" by making one of
 * them less real; it distinguishes them by saying which.
 *
 * Per-criterion rather than one button, because a single Approve that silently satisfies five
 * criteria is a signature on work nobody read. Criteria left unconfirmed stay unmeasured, and the
 * database refuses the close — the person does not have to remember what they skipped.
 */
export async function approve(
  actor: Actor,
  taskId: string,
  confirmed: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  // The run comes back with the task because the close has to re-measure the rows it unblocks, and
  // asking again afterwards would be a second round-trip for something already in hand.
  const { data: task } = await sb
    .from("work_task")
    .select("id, workflow_run_id")
    .eq("id", taskId)
    .eq("engagement_id", actor.engagementId)
    .maybeSingle();
  if (!task)
    return { ok: false, error: "That task is not in your engagement." };

  const runId = task.workflow_run_id as string | null;
  const parentRunId = runId ? await parentRunOf(runId) : null;

  const who = actor.holder ?? actor.roleCode;
  const criteria = await criteriaForTask(taskId);
  const done = criteria.filter((c) => c.kind === "done");

  // What a CHECK established stays the check's. Overwriting it with "Confirmed by <name>" put a
  // person's signature on seventeen rows a script verified — the record then says they personally
  // checked something they never looked at, which is worse than no record.
  const { data: existing } = await sb
    .from("measurement")
    .select("criterion_id, source, satisfied")
    .eq("task_id", taskId);
  const machineMet = new Set(
    (existing ?? [])
      .filter((m) => m.satisfied && m.source !== "human")
      .map((m) => m.criterion_id as string),
  );

  for (const c of done) {
    if (machineMet.has(c.id)) continue;
    if (!confirmed.includes(c.id)) {
      // Not confirmed is not "failed" — it is unmeasured, and the gate treats it as such. Writing
      // satisfied:false here would say the person checked and rejected it, which they did not.
      await sb
        .from("measurement")
        .delete()
        .eq("task_id", taskId)
        .eq("criterion_id", c.id);
      continue;
    }
    await sb.from("measurement").upsert(
      {
        task_id: taskId,
        criterion_id: c.id,
        satisfied: true,
        measured_at: new Date().toISOString(),
        source: "human",
        detail: `Confirmed by ${who}.`,
      },
      { onConflict: "task_id,criterion_id" },
    );

    // A person putting their name to something a machine could not check is the single most
    // consequential act in the system. It was previously invisible in the log.
    await emit({
      engagementId: actor.engagementId,
      subjectType: "criterion",
      subjectId: c.id,
      verb: "criterion.attested",
      actorKind: "human",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      payload: { taskId, statement: c.statement, satisfied: true },
    });
  }

  // The BOARD closes first, and this order is the whole point.
  //
  // The tracker holds the status of record. Closing here and telling Jira afterwards — which is
  // what this did — leaves Compass claiming Done while the board still says To Do whenever the
  // move is refused or the board has no Done status to move to. Two answers, no arbiter, and the
  // wrong one is the one people look at.
  //
  // "Nothing to move" is not a failure: an engagement with no tracker, or a task with no ticket
  // (phase 1 configures the tracker, so its own rows predate it), closes exactly as before.
  const moved = await mirrorState(
    actor.engagementId,
    taskId,
    "closed",
    actor.roleCode,
  );
  if (moveFailed(moved)) {
    // Distinct from a gate refusing: the work was accepted and the BOARD would not take it. Someone
    // reading the record needs to tell "the criteria were not met" from "the board has no Done
    // status", because they are different problems with different fixes.
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.close_blocked_by_tracker",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      reason: moved.note ?? "The tracker refused to close this.",
      payload: {
        ticket: moved.key ?? null,
        status: moved.status ?? null,
        kind: moved.reason ?? null,
      },
    });
    return {
      ok: false,
      error: moved.note ?? "The tracker refused to close this.",
    };
  }

  const { error } = await sb.rpc("close_task", {
    p_task_id: taskId,
    p_actor: who,
    p_actor_role: actor.roleCode,
  });
  if (error) {
    // The gate refused AFTER the ticket moved. Put the ticket back rather than leave the board
    // reading Done for work Compass will not close — best effort, and the failure the caller sees
    // is the gate's, which is the one that explains what to fix.
    if (moved.ok)
      await mirrorState(actor.engagementId, taskId, "hitl", actor.roleCode);
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.close_refused",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      reason: error.message,
      payload: { confirmed: confirmed.length, ticketReturned: moved.ok },
    });
    return { ok: false, error: error.message };
  }

  // An approved document that the app must KNOW becomes state here — the roster into `member` rows,
  // and whatever else registers later. Only on approval: a draft is a proposal, and materialising
  // one would let an agent staff an engagement by suggesting names.
  //
  // ITS PROBLEMS ARE EMITTED, not discarded. This call's result was dropped on the floor, so an
  // approved roster that staffed nobody — every insert rejected — closed the gate green and said
  // nothing anywhere. "Never fatal, and never silent" is the rule materialise.ts states in its own
  // header; the second half was not held to. Not fatal here either: the human accepted the
  // document, and refusing the close now would blame them for a write that failed after it.
  const materialised = await materialiseFrom(actor, taskId);
  if (materialised?.problems.length) {
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.materialise_incomplete",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      reason: materialised.problems.join(" · "),
      payload: {
        path: materialised.path,
        created: materialised.created,
        updated: materialised.updated,
      },
    });
  }

  try {
    if (runId) await remeasureRun(actor, runId);
    if (parentRunId) await remeasureRun(actor, parentRunId);
  } catch (e) {
    await emitRefusal({
      engagementId: actor.engagementId,
      subjectType: "task",
      subjectId: taskId,
      verb: "task.remeasure_incomplete",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      reason: e instanceof Error ? e.message : String(e),
      payload: { runId, parentRunId },
    });
  }

  // Approving the backlog no longer materialises anything.
  //
  // It used to open a workflow run per row, because each row WAS a workflow. Now the rows of a
  // phase are its tasks, created when the delivery manager initiates it — so approving the backlog
  // approves a document, which is all it ever claimed to do. See lib/data/phases.ts.
  return { ok: true };
}

/**
 * Send the draft back: record what a reviewer read and refused, and why.
 *
 * The counterpart to `approve`. An unticked criterion is unmeasured — nobody looked. A REJECTED
 * one is someone reading the work and saying what is wrong with it, stored as `satisfied: false`
 * with their name and their reason, and read back to the agent on its next run.
 *
 * Without this the gate could only stall. A reviewer who found a real problem had no way to say so
 * except by leaving a box unticked, which is indistinguishable from not having got to it.
 */
export async function reject(
  actor: Actor,
  taskId: string,
  rejections: { criterionId: string; reason: string }[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: task } = await sb
    .from("work_task")
    .select("id, state")
    .eq("id", taskId)
    .eq("engagement_id", actor.engagementId)
    .maybeSingle();
  if (!task)
    return { ok: false, error: "That task is not in your engagement." };

  const given = rejections.filter((r) => r.reason.trim().length > 0);
  if (!given.length) {
    // A rejection with no reason is not a rejection, it is a refusal to explain. The agent cannot
    // act on it and the next reviewer cannot tell what was wrong.
    return {
      ok: false,
      error: "A rejection needs a reason — the agent has to act on it.",
    };
  }

  // Links in the reasons are read before anything is written. "Doesn't follow <link to the
  // standard>" is a useful send-back only if the agent gets the standard, and it cannot open a URL.
  // One unreadable link refuses the whole send-back, so the reviewer can paste the text instead.
  const typed = `Sent back for revision:\n\n${given.map((r) => `- ${r.reason.trim()}`).join("\n")}`;
  const read = await expandLinks(typed);
  if (!read.ok) return { ok: false, error: read.error };

  const who = actor.holder ?? actor.roleCode;
  for (const r of given) {
    // The short reason as typed: this is what the gate and the next reviewer read.
    await sb.from("measurement").upsert(
      {
        task_id: taskId,
        criterion_id: r.criterionId,
        satisfied: false,
        measured_at: new Date().toISOString(),
        source: "human",
        detail: `Rejected by ${who}: ${r.reason.trim()}`,
      },
      { onConflict: "task_id,criterion_id" },
    );

    await emit({
      engagementId: actor.engagementId,
      subjectType: "criterion",
      subjectId: r.criterionId,
      verb: "criterion.rejected",
      actorKind: "human",
      actorRoleCode: actor.roleCode,
      actorUserId: who,
      payload: {
        taskId,
        reason: r.reason.trim(),
        links: read.links.filter((l) => r.reason.includes(l.url)),
      },
    });
  }

  // Back to running: there is work to do, and it is the agent's. Leaving it at `hitl` would say
  // it is still waiting on a human when the human has just answered.
  await sb.from("work_task").update({ state: "running" }).eq("id", taskId);

  const { data: last } = await sb
    .from("turn")
    .select("ord")
    .eq("task_id", taskId)
    .order("ord", { ascending: false })
    .limit(1);
  await sb.from("turn").insert({
    task_id: taskId,
    ord: (last?.[0]?.ord ?? -1) + 1,
    author_kind: "human",
    author_role_code: actor.roleCode,
    author_user_id: who,
    // With every linked page attached — this turn is what the agent replays on its revision run.
    body: read.text,
  });

  return { ok: true };
}
