// The agent loop — one turn of real work.
//
// Two tools, and the model must use one: `ask` when something it needs genuinely isn't in what it
// was given, `draft` when it can produce the deliverable. Tools rather than free text because the
// outcome has to become rows — a question that blocks the task, or sections with the citations that
// make a claim traceable. Parsing prose into those shapes would be guessing at the exact moment
// precision matters.
//
// Everything it writes is recorded: the turn, the questions, the draft, and the citations that
// point at the VERSION each claim came from.
//
// `runAgent` itself is the guards (config, context, nesting, template, supplied-skip), the claim,
// the dispatch, and the refusal/no-tool-call exits — everything that runs before a per-tool outcome
// is known. What happens once a tool IS known lives in `outcomes/`: `ask.ts`, `code.ts` and
// `document.ts` (the shared draft/backlog/sprint/roster filing pipeline — see its own header for
// why those four are one path), with the transitions every outcome ends on in `outcomes/effects.ts`
// and the conversation/ask bookkeeping in `outcomes/turn-context.ts`.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "../data/actor";
import {
  buildContext,
  systemPrompt,
  inputPrompt,
  revisionPrompt,
} from "./context";
import { openQuestions } from "../data/job";
import { emit } from "../data/events";
import { mirrorState } from "../data/tracker";
import { nestedWorkflowOf } from "../data/phases";
import { selectHost, MODEL } from "./hosts/select";
import { toolsFor } from "./hosts/tools";
import type { HostResult } from "./hosts/types";
import { priorMessages, recordTurn } from "./outcomes/turn-context";
import { finished, handOver, releaseExecutor, settleSupplied, withHeartbeat } from "./outcomes/effects";
import { handleAsk } from "./outcomes/ask";
import { handleCode } from "./outcomes/code";
import { handleDocument } from "./outcomes/document";
import type { Turn } from "./outcomes/types";

export type { AgentOutcome } from "./outcomes/types";
import type { AgentOutcome } from "./outcomes/types";

// Re-exported so every existing `from "./run"` import of these keeps working unchanged — several
// tests import them directly, and `emptyAskDiagnosis`/`filesTo`/`splitAsk`/`askRoundNudge` are
// pure enough that testing them through `run.ts` rather than their new home was never the point.
export { emptyAskDiagnosis, filesTo, splitAsk, askRoundNudge } from "./outcomes/turn-context";

export async function runAgent(
  actor: Actor,
  taskId: string,
): Promise<AgentOutcome> {
  const sb = supabaseAdmin();
  if (!sb) return { kind: "error", message: "Supabase is not configured." };
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      kind: "error",
      message: "ANTHROPIC_API_KEY is not set — nothing can run.",
    };
  }

  // Timed, because the gap between a person pressing the button and the model starting was 12.6s
  // on a real run and nobody could say which part of it was which. `buildContext` is ~a dozen
  // queries plus the agent file; `mirrorState` is an HTTP round trip to Jira. Attributing it in the
  // event rather than a log line means the answer is in the same place as everything else that
  // happened, and is still there tomorrow.
  const tContext = Date.now();
  const ctx = await buildContext(actor, taskId);
  const contextMs = Date.now() - tContext;
  if (!ctx)
    return { kind: "error", message: "That task is not in your engagement." };

  // A row that NESTS a workflow has no agent to run. Its work happens in the child run's own steps,
  // each with its own agent and its own gates. An agent was invoked on a `kind: workflow` row,
  // given the row's task slug (`define-product-foundation`) that no agent file defines, and it
  // produced eight questions from a blank context. Refused here, where every call passes.
  //
  // For a long time this was the ONLY thing that knew. Neither surface did: the queue's button did
  // the right thing while labelled "Start with agent", and the job page offered a Run button whose
  // every press came back as a 500 carrying the sentence below. Both now read
  // `nests_workflow_code` and offer the child run instead — so this refusal should no longer be
  // reachable from the UI, and stays as the backstop for every other caller.
  const nests = await nestedWorkflowOf(taskId);
  if (nests) {
    return {
      kind: "error",
      message:
        `This row is satisfied by the ${nests} workflow, not by an agent. Start it to open ` +
        `that run — its steps are where the work happens.`,
    };
  }

  // `start_task` is the ONLY thing that moves a row out of `idle` — running the agent on one that
  // never went through it is the defect that left `Draft the timeline` stuck: `executor` got
  // claimed below, the run never finished cleanly, and because `state` was still `idle` the sweep
  // (which only watches `state = 'running'`) could never find it again to retry or release it.
  // Refused here, loudly, rather than proceeding on the assumption the caller already started it.
  const { data: taskRow } = await sb
    .from("work_task")
    .select("state")
    .eq("id", taskId)
    .maybeSingle();
  if (taskRow?.state !== "running") {
    return {
      kind: "error",
      message: `This task is ${taskRow?.state ?? "not startable"}, not running — start it first.`,
    };
  }

  // A declared template that resolves to nothing HALTS — before the model call, not after.
  //
  // The alternative is drafting free-form, and that is the worst available outcome: the document
  // comes back looking finished, is not the deliverable the process asked for, and nothing
  // downstream can tell the difference. Its Done criterion asks whether a document is published,
  // not whether it is the right shape.
  //
  // Checked here rather than at filing so a misconfigured row costs nothing. A run is minutes of
  // model time and a person waiting on it; discovering the missing template afterwards wastes both
  // and still files nothing.
  if (ctx.templateName && !ctx.template) {
    return {
      kind: "error",
      message:
        `This row drafts into the \`${ctx.templateName}\` template, and no such template exists ` +
        `for this engagement, its organisation, or the default. Nothing was run — add the ` +
        `template, or clear the row's \`template\` column if this deliverable has no house shape.`,
    };
  }

  // A supplied row with nothing to compare against is FINISHED once its document is filed.
  //
  // Answering the last question auto-triggers a run. For `file-sow` — which reads nothing — that is
  // minutes of model time and a Jira round trip to arrive at "the document is filed, there is
  // nothing else to do". Stopping here is not an optimisation so much as declining to bill someone
  // for a foregone conclusion.
  //
  // DERIVED, not a flag: a row that reads something (`file-requirements` reads the SOW) has a
  // comparison to make and proceeds. `openQuestions` is checked too, because an unanswered question
  // means the conversation is genuinely still going.
  if (ctx.output === "supplied" && ctx.priorDraft && !ctx.inputs.length) {
    const still = await openQuestions(taskId);
    if (!still.length) {
      // Said in the conversation, not only in the return value. Without this the thread ends on the
      // human's paste with nothing acknowledging it, which reads as though the click was lost —
      // and phrased so the record does not suggest an agent wrote the document. It did not.
      const summary =
        `Filed \`${ctx.produces}\` as supplied (v${ctx.priorDraft.version}) — your text, verbatim, ` +
        `unchanged. This row receives its deliverable rather than writing one, and has nothing to ` +
        `compare it against, so there is nothing further to do. Closing it.`;
      await recordTurn(taskId, summary, ctx);
      await settleSupplied(actor, taskId, ctx, "filed-as-supplied", null, {
        path: ctx.produces,
        sections: ctx.priorDraft.sections.length,
      });
      return {
        kind: "drafted",
        summary,
        sections: ctx.priorDraft.sections.length,
        path: ctx.produces,
      };
    }
  }

  // Mark who is executing BEFORE the call, so a run that dies mid-flight is visibly attributed
  // rather than looking like a task nobody ever picked up.
  //
  // CLAIMED, not just set — `.is("executor", null)` means only one caller wins this update. Two
  // requests hitting a freshly-started row at once used to both pass every check above and both
  // reach this line; an unconditional update let both proceed to dispatch the model. Auto-firing
  // the run on page load (rather than waiting for a person to notice and click) makes that race far
  // more reachable than it was when it needed two people clicking at once, so it is closed here.
  const claim = await sb
    .from("work_task")
    .update({ executor: "app", heartbeat_at: new Date().toISOString() })
    .eq("id", taskId)
    .is("executor", null)
    .select("id");
  if (!claim.data?.length) {
    return {
      kind: "error",
      message: "This task is already running. Refresh in a moment rather than run it again.",
    };
  }
  const tMirror = Date.now();
  await mirrorState(actor.engagementId, taskId, "running", ctx.roleCode);
  const mirrorMs = Date.now() - tMirror;

  await emit({
    engagementId: actor.engagementId,
    subjectType: "task",
    subjectId: taskId,
    verb: "agent.run.started",
    actorKind: "agent",
    actorRoleCode: ctx.roleCode,
    payload: {
      model: MODEL,
      // What the wait before the model was actually spent on.
      contextMs,
      mirrorMs,
      agentFile: ctx.agentFile,
      produces: ctx.produces,
      // What it was allowed to read, pinned. A run is only reproducible if this is on the record.
      inputs: ctx.inputs.map((i) => ({ path: i.path, version: i.version })),
      priorDraft: ctx.priorDraft?.version ?? null,
      rejections: ctx.rejections.length,
    },
  });

  const revision = revisionPrompt(ctx);

  let message: HostResult;
  try {
    // Which host runs this is a configuration answer, and an unavailable one HALTS here rather
    // than quietly becoming the metered API — see `hosts/select.ts`.
    const host = selectHost();
    message = await withHeartbeat(taskId, async () => host.dispatch({
      model: MODEL,
      // 64k, not 32k. A run came back with a complete 1,760-character summary and an EMPTY
      // sections array: adaptive thinking at high effort plus a long summary left no budget for
      // the document itself. max_tokens caps thinking AND output together, so a document-producing
      // task needs room for both.
      maxTokens: 64000,
      system: systemPrompt(ctx),
      // `ctx.produces` is null for a `doc-review`/`code-review` row (and for any row whose subject
      // did not resolve) — `toolsFor` drops `draft` for exactly the same reason `supplied` already
      // drops it for a row that receives its deliverable: the tool is a dead end, and the fix is
      // not offering it.
      tools: toolsFor(ctx.output, Boolean(ctx.produces)),
      wantsWebSearch: ctx.hasWebSearch,
      messages: [
        { role: "user", content: inputPrompt(ctx) },
        ...(await priorMessages(taskId)),
        // The previous draft and any rejections go LAST, so they are the most recent thing the
        // model sees rather than something buried above a long conversation.
        ...(revision ? [{ role: "user" as const, content: revision }] : []),
      ],
    }));
  } catch (e) {
    await releaseExecutor(taskId, ctx, { failed: true });
    await finished(ctx.engagementId, taskId, ctx.roleCode, "error", null, {
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  // A refusal is a real outcome, not an exception. Record it and leave the task where it is.
  if (message.stopReason === "refusal") {
    const reason = message.refusalExplanation ?? "no explanation given";
    await recordTurn(taskId, `The model declined this request. ${reason}`, ctx);
    await releaseExecutor(taskId, ctx, { failed: true });
    return { kind: "refused", reason };
  }

  // Running out of room is not the same as having nothing to say, and it is the difference
  // between "the agent failed" and "give it more budget". Checked before anything reads content.
  const truncated = message.stopReason === "max_tokens";

  const text = message.text;
  const call = message.toolCall;

  if (!call) {
    // It answered in prose without choosing a tool. Record what it said rather than discarding it.
    await recordTurn(taskId, text || "(no output)", ctx);

    // For a SUPPLIED row this is the expected ending, not a failure.
    //
    // Such a row has `ask` and nothing else — there is no `draft` to call. Once its document has
    // been filed, a run whose job is to say how that document compares with what it was given has
    // nothing to file and nothing to ask, and prose is the only thing it can produce. Treating it
    // as an error would mark a completed comparison as a failed run.
    //
    // SCOPED TO `supplied` deliberately. On an authoring row, prose means the model ignored its
    // tools and produced nothing durable, which is a real failure and must keep saying so.
    if (ctx.output === "supplied") {
      // Closes itself, like the skip path. The document was supplied by a person and the
      // comparison is information for them to read, not a draft for them to approve — the report
      // is in the conversation either way.
      //
      // This branch previously only cleared the executor and left the row at `running`, the same
      // defect that stranded `file-sow`.
      await settleSupplied(actor, taskId, ctx, "reported", message, { path: ctx.produces });
      return {
        kind: "drafted",
        summary: text || "(no output)",
        sections: 0,
        path: ctx.produces,
      };
    }

    // A `doc-review`/`code-review` row talking is not a failure either — `toolsFor` no longer even
    // OFFERS it `draft` (see there for why), so prose IS the deliverable: the reviewer asked
    // something, the agent answered. Back to `hitl`, same as a normal draft handing off to its
    // reviewer — the row was resumed OUT of `hitl` (see `resumeForReview`) purely so this reply
    // could run, and now that it has, the ball is back with whoever is reviewing.
    if (ctx.renders === "doc-review" || ctx.renders === "code-review") {
      await handOver(actor, taskId, ctx, "reviewed", message);
      return { kind: "drafted", summary: text || "(no output)", sections: 0, path: null };
    }

    await releaseExecutor(taskId, ctx, { failed: true });
    await finished(ctx.engagementId, taskId, ctx.roleCode, "no-tool", message);
    return {
      kind: "error",
      message:
        "The agent replied without using a tool. Its message is in the conversation.",
    };
  }

  const turn: Turn = { actor, taskId, ctx, message, text, truncated, call };

  if (call.name === "ask") return handleAsk(turn);
  if (call.name === "code") return handleCode(turn);
  if (["draft", "backlog", "sprint", "roster"].includes(call.name)) return handleDocument(turn);

  await releaseExecutor(taskId, ctx, { failed: true });
  return { kind: "error", message: `Unknown tool: ${call.name}` };
}
