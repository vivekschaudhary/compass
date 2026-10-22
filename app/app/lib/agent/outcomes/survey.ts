import { supabaseAdmin } from "../../supabase";
import { runSurvey } from "../survey-run";
import { approve, measureTask } from "../../data/gates";
import { emit } from "../../data/events";
import { recordTurn } from "./turn-context";
import { finished, handOver, releaseExecutor } from "./effects";
import type { AgentOutcome, Turn } from "./types";

/** The most pinned-document text handed to the reader. A survey needs the epic and the stack, not every page. */
const CONTEXT_BUDGET = 30_000;

/**
 * The `survey` tool — a design row's hand-off to a reader of the code, shaped like `scaffold`'s.
 *
 * The model says what it needs to know; Python reads the checkout read-only and returns findings,
 * each citing a file it verified exists; this files them as the document the next row designs from.
 * What comes back is the reader's recorded result, not a claim.
 *
 * Closes itself on success, for the reason `scaffold` does: the one criterion is machine-checked
 * (the findings document is published), so there is nothing for a person to attest here. Judgment
 * lives where the design is accepted. A failed or refused survey goes to a person with the reason —
 * never back to the agent to retry against a repo it cannot read.
 */
export async function handleSurvey({ actor, taskId, ctx, message, call }: Turn): Promise<AgentOutcome> {
  const input = call.input as { summary?: string; focus?: string };
  const focus = (input.focus ?? "").trim();

  // A survey row files the findings; a row with no resolvable path has nowhere to put them. Refused
  // before the reader runs, because minutes of reading that cannot be filed are minutes lost.
  if (!ctx.produces) {
    const msg = ctx.unresolvedProduces
      ? `**Refused.** This survey's path \`${ctx.unresolvedProduces}\` names a subject this run does not have, so there is nowhere to file the findings.`
      : "**Refused.** This survey row declares no document to file its findings at.";
    await recordTurn(taskId, msg, ctx);
    await releaseExecutor(taskId, ctx, { failed: true });
    return { kind: "error", message: msg };
  }
  if (!focus) {
    const msg = "**Refused.** The survey named nothing to look for.";
    await recordTurn(taskId, msg, ctx);
    await releaseExecutor(taskId, ctx, { failed: true });
    return { kind: "error", message: msg };
  }

  // Written BEFORE the reader runs — a run that dies still leaves a record of what it was asked.
  await recordTurn(taskId, `**Reading the code.** ${input.summary ?? ""}\n\n**Looking for.**\n${focus}\n`, ctx);

  let budget = CONTEXT_BUDGET;
  const context = ctx.inputs
    .filter((i) => i.body)
    .map((i) => {
      const body = (i.body as string).slice(0, Math.max(0, budget));
      budget -= body.length;
      return body ? `### ${i.path}\n\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const result = await runSurvey(actor.engagementId, taskId, { focus, context });

  if (result.status !== "surveyed") {
    const outcome = `**NOT SURVEYED — ${result.status}.** ${result.refusal ?? "no reason given"}`;
    await recordTurn(taskId, outcome, ctx);
    // hitl: a failed survey needs a person to look, not an agent retrying forever.
    await handOver(actor, taskId, ctx, "survey-failed", message, { status: result.status, refusal: result.refusal });
    return { kind: "error", message: `The survey did not complete: ${result.refusal ?? result.status}.` };
  }

  const sb = supabaseAdmin();
  const { data: org } = sb
    ? await sb.from("engagement").select("org_id").eq("id", actor.engagementId).maybeSingle()
    : { data: null };
  const { data: versionId, error } = sb
    ? await sb.rpc("file_document", {
        p_org_id: org?.org_id ?? actor.orgId,
        p_engagement_id: actor.engagementId,
        p_path: ctx.produces,
        p_title: ctx.taskTitle,
        p_sections: result.sections,
        p_version: null,
        p_actor: actor.holder ?? actor.roleCode,
        p_actor_role: actor.roleCode,
        p_owner_role: ctx.roleCode,
        p_task_id: taskId,
      })
    : { data: null, error: { message: "Supabase is not configured." } };

  if (error || !versionId) {
    // The findings exist only in the handoff record now; say so, and put them where a person can read them.
    const why = error?.message ?? "no version was returned";
    await recordTurn(
      taskId,
      `**Filing failed — the findings are preserved here.** ${why}\n\n` +
        result.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n"),
      ctx,
    );
    await releaseExecutor(taskId, ctx, { failed: true });
    return { kind: "error", message: `filing the survey: ${why}` };
  }

  await emit({
    engagementId: ctx.engagementId, subjectType: "document", subjectId: versionId as string,
    verb: "document.filed", actorKind: "agent", actorRoleCode: ctx.roleCode,
    payload: { taskId, path: ctx.produces, sections: result.sections.length, survey: true },
  });

  const outcome =
    `**Surveyed.** ${result.sections.length} section(s) from ${result.files_cited.length} cited file(s), ` +
    `filed at \`${ctx.produces}\`.`;
  await recordTurn(taskId, outcome, ctx);

  await measureTask(actor, taskId);
  const closed = await approve(actor, taskId, []);
  if (closed.ok) {
    await releaseExecutor(taskId, ctx, { failed: false });
    await finished(ctx.engagementId, taskId, ctx.roleCode, "surveyed", message, {
      path: ctx.produces, files: result.files_cited.length, usage: result.usage, closed: true,
    });
  } else {
    // The gate said no — never leave the row mid-flight: hand it to a person with the reason.
    await recordTurn(taskId, `Surveyed, but this row could not close itself: ${closed.error}`, ctx);
    await handOver(actor, taskId, ctx, "surveyed", message, { path: ctx.produces, closed: false });
  }

  return { kind: "drafted", summary: outcome, sections: result.sections.length, path: ctx.produces };
}
