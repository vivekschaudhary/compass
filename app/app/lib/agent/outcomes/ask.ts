import { supabaseAdmin } from "../../supabase";
import { emit } from "../../data/events";
import { mirrorState } from "../../data/tracker";
import { emptyAskDiagnosis, filesTo, recordTurn, splitAsk } from "./turn-context";
import { finished, handOver, releaseExecutor, settleSupplied } from "./effects";
import type { AgentOutcome, Turn } from "./types";

/**
 * The `ask` tool: the model chose to ask rather than produce a deliverable.
 *
 * Moved out of `runAgent` as-is — every branch, every exit, and their order are unchanged from
 * before the split.
 */
export async function handleAsk({ actor, taskId, ctx, message, text, call }: Turn): Promise<AgentOutcome> {
  const sb = supabaseAdmin();
  if (!sb) return { kind: "error", message: "Supabase is not configured." };

  const input = call.input as {
    preamble: string;
    questions: {
      prompt: string;
      type: string;
      options?: string[];
      why: string;
      optional?: boolean;
      files_to?: string;
    }[];
  };

  // Only the first few are put to the human; the rest wait for the next round. What is held back
  // goes into the turn the human reads, because a question that vanishes between the model and
  // the screen is exactly the silent kind of loss rule 11 is about — and because "it also wanted
  // to know X" is often the thing you volunteer while answering the first three.
  const { put, held } = splitAsk(input.questions ?? []);
  const heldNote = held.length
    ? `_Also on its mind, held until these are answered:_\n` +
      held.map((q) => `- ${q.prompt.split("\n")[0]}`).join("\n")
    : "";
  const body = [text, input.preamble, heldNote].filter(Boolean).join("\n\n");
  const turnId = await recordTurn(taskId, body, ctx);

  // An ask that asks nothing is not an ask.
  //
  // Seen live: the model closed the `preamble` parameter INSIDE its own string value — the turn
  // body ends `…rather than guess.</preamble>  <parameter name="questions">[{"prompt": …` — so
  // twelve well-formed questions were swallowed into that string and `questions` arrived empty.
  // The API still returns a valid tool_use block, so nothing upstream notices.
  //
  // Recorded as success, that produced a row parked in `awaiting`, a ticket moved to In Review,
  // and a message saying "answer the below" with nothing below. A gate waiting on answers that
  // cannot arrive is indistinguishable from one waiting on a person — the swallowed failure rule
  // 11 names. So: fail loud, leave the task and the ticket exactly where they were, and say what
  // went wrong. The preamble is already in the conversation, so nothing the model wrote is lost.
  if (!input.questions.length) {
    const { leaked, buried } = emptyAskDiagnosis(input.preamble ?? "");

    // …unless the row has nothing left to ask, and no other way to say so.
    //
    // A SUPPLIED row is given `ask` and nothing else. Once its document is filed and the
    // comparison is reported, "nothing further is needed" is the only thing left to say and an
    // empty ask is the only shape it has to say it in. Twice live, `file-requirements` reported
    // the comparison exactly as instructed and was recorded as a failed run:
    //
    //     outcome: ask-empty, questions: 0, leaked: false, buried: 0
    //
    // This is the SOW defect at its third site. A supplied row ends in three ways — the skip
    // path, prose with no tool call, and here — and `settleSupplied` was wired into the first
    // two. The row sat at `running` with its executor cleared and its ticket In Progress, while
    // its Done criterion carried a measurement taken a minute BEFORE the document was filed.
    //
    // The guards are what keep this from swallowing the failure above. `priorDraft` means a
    // document actually exists, so a supplied row given nothing and asking nothing still halts
    // loudly. And the diagnosis still wins: swallowed questions can happen on a supplied row
    // too, and leave exactly this evidence.
    if (ctx.output === "supplied" && ctx.priorDraft && !leaked && !buried) {
      await settleSupplied(actor, taskId, ctx, "reported", message, {
        path: ctx.produces,
        via: "ask-empty",
      });
      return {
        kind: "drafted",
        summary: body || "(no output)",
        sections: 0,
        path: ctx.produces,
      };
    }

    // A `doc-review`/`code-review` row hits this SAME shape, live, even with the prompt telling
    // it plainly that calling no tool at all is a complete turn (see `systemPrompt`'s `askOnly`
    // branch) — the model still reaches for its one tool and calls it with nothing in it, rather
    // than not calling it. `stopReason: "tool_use"`, `questions: 0`, every time observed. Prompt
    // wording alone was not a reliable enough signal; this is the same fix as the `!call` branch
    // above, reached by the other door a review row's "nothing to ask" can arrive through.
    if ((ctx.renders === "doc-review" || ctx.renders === "code-review") && !leaked && !buried) {
      await handOver(actor, taskId, ctx, "reviewed", message, { via: "ask-empty" });
      return { kind: "drafted", summary: body || "(no output)", sections: 0, path: null };
    }

    await releaseExecutor(taskId, ctx, { failed: true });
    await finished(
      ctx.engagementId,
      taskId,
      ctx.roleCode,
      "ask-empty",
      message,
      {
        questions: 0,
        leaked,
        buried,
        preambleChars: input.preamble?.length ?? 0,
      },
    );
    return {
      kind: "error",
      message: leaked
        ? `The agent's questions ended up inside its preamble instead of the questions list — ${buried} of them. ` +
          "Nothing was lost: its message is in the conversation. Run it again."
        : "The agent chose to ask but sent no questions. Its message is in the conversation. Run it again.",
    };
  }

  // A SUPPLIED row whose deliverable does not exist yet, asking nothing that carries it, is a
  // DEAD END — and this is exactly what happened live: three questions, every `files_to` null.
  //
  // Such a row has no `draft` tool, so the document can only ever arrive as an answer. If no
  // question carries it, the person answers, nothing is filed, the Done gate stays unsatisfiable,
  // and the row sits open with nothing on screen explaining why. Refusing costs one cheap re-run;
  // the alternative costs somebody an afternoon of wondering.
  //
  // Only before the document exists. Once it is filed, follow-up questions are ordinary.
  if (ctx.output === "supplied" && !ctx.priorDraft && !put.some((q) => q.files_to)) {
    await releaseExecutor(taskId, ctx, { failed: true });
    await finished(ctx.engagementId, taskId, ctx.roleCode, "ask-unfilable", message, {
      questions: put.length,
    });
    return {
      kind: "error",
      message:
        `This row receives \`${ctx.produces}\` rather than writing it, so the document can only ` +
        `arrive as an answer — but none of its ${put.length} question(s) asks for one. Nothing ` +
        `was filed. Run it again; its message is in the conversation.`,
    };
  }

  {
    const { data: asked } = await sb
      .from("question")
      .insert(
        put.map((q) => ({
          task_id: taskId,
          turn_id: turnId,
          prompt: q.why ? `${q.prompt}\n\n(${q.why})` : q.prompt,
          type: ["text", "choice", "number"].includes(q.type)
            ? q.type
            : "text",
          options: q.options ?? null,
          optional: q.optional === true,
          // Only a path the app is allowed to write. An agent naming `agents/pm.md` here would
          // otherwise turn a human's pasted answer into a framework file, and the check belongs
          // where the value ENTERS rather than where it is later used.
          //
          // On a SUPPLIED row the app chooses the path rather than the model. There is exactly
          // one destination — what the row produces — so letting a model name it is a decision
          // with one right answer and many wrong ones.
          //
          // NOT passed through `filesTo`, deliberately. That guard exists for MODEL OUTPUT: it
          // stops an agent naming `agents/pm.md` and turning a pasted answer into a framework
          // file. `ctx.produces` is not model output — it is the row's own `produces`, resolved
          // in `buildContext` — so checking it is a category error, and a damaging one: FILEABLE
          // demands `0X-folder/name` while this seed's documents are bare names (`sow`,
          // `requirements`), so the guard would null every one of them and nothing would ever be
          // filed. Trust the row; guard the model.
          files_to:
            ctx.output === "supplied" && q.files_to
              ? ctx.produces
              : filesTo(q.files_to),
        })),
      )
      .select("id, prompt");

    for (const q of asked ?? []) {
      await emit({
        engagementId: ctx.engagementId,
        subjectType: "question",
        subjectId: q.id,
        verb: "question.asked",
        actorKind: "agent",
        actorRoleCode: ctx.roleCode,
        payload: { taskId, prompt: q.prompt },
      });
    }
  }

  // Waiting on a person is a state, not a pause. The queue should show it as such — and so
  // should the board, which is where everyone who does not open Compass is looking.
  await releaseExecutor(taskId, ctx, { failed: false, state: "awaiting" });
  await mirrorState(actor.engagementId, taskId, "awaiting", ctx.roleCode);
  await finished(ctx.engagementId, taskId, ctx.roleCode, "asked", message, {
    questions: put.length,
    held: held.length,
  });
  return { kind: "asked", preamble: input.preamble, questions: put };
}
