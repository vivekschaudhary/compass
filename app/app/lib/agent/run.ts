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

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "../supabase";
import type { Actor } from "../data/actor";
import {
  buildContext,
  systemPrompt,
  inputPrompt,
  revisionPrompt,
  ASK_BATCH,
  ASK_ROUNDS_MAX,
  type AgentContext,
} from "./context";
import { conversation, openQuestions } from "../data/job";
import { publishToDocs } from "../data/publish";
import { emit } from "../data/events";
import { mirrorState } from "../data/tracker";
import { nestedWorkflowOf } from "../data/phases";

const MODEL = "claude-opus-5";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "ask",
    description:
      "Ask the human what you cannot responsibly infer from the documents you were given. " +
      "Use this for facts that were never recorded — dates nobody agreed, people nobody named, " +
      "standards nobody wrote down. Ask only what blocks you RIGHT NOW: the answers come back to " +
      "you and you get another turn, so anything a later answer would settle is not for this " +
      `round. Order the list by how much each answer changes the rest of the work — only the first ` +
      `${ASK_BATCH} are put to the human. Do not use this for anything the documents already answer.`,
    input_schema: {
      type: "object",
      properties: {
        preamble: {
          type: "string",
          description:
            "One or two sentences on what you found and why you are blocked.",
        },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The question, as you would ask a colleague.",
              },
              type: { type: "string", enum: ["text", "choice", "number"] },
              options: {
                type: "array",
                items: { type: "string" },
                description: "For type=choice.",
              },
              why: {
                type: "string",
                description: "What this changes about the deliverable.",
              },
            },
            required: ["prompt", "type", "why"],
            additionalProperties: false,
          },
        },
      },
      required: ["preamble", "questions"],
      additionalProperties: false,
    },
    // Strict: the input is validated against this schema before it reaches us. Without it the
    // shape is a strong convention rather than a guarantee, and a `sections` that arrived as
    // something other than an array threw away a finished two-minute run at the filing step.
    strict: true,
  },
  {
    name: "draft",
    description:
      "Produce the deliverable. Every section names the document paths it was derived from. " +
      "A claim you cannot trace to a document you were given does not belong here.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "What you produced and what it is based on. Note any input that was missing and what it cost.",
        },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              body: { type: "string", description: "Markdown." },
              cites: {
                type: "array",
                items: { type: "string" },
                description:
                  "Document paths this section was derived from. Empty only if the section is genuinely your own judgment, and say so in the body.",
              },
            },
            required: ["heading", "body", "cites"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "sections"],
      additionalProperties: false,
    },
    strict: true,
  },
];

/**
 * Normalise what came back before anything else touches it.
 *
 * `strict: true` makes the shape a guarantee rather than a convention, but this stays as the
 * backstop: a run costs minutes of model time, and the cheapest defence against losing one at the
 * last step is to not assume. A string that parses to an array is accepted; anything else returns
 * empty and the caller reports it rather than throwing.
 */
function asSections(
  raw: unknown,
): { heading: string; body: string; cites: string[] }[] {
  const value = typeof raw === "string" ? safeParse(raw) : raw;
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (s): s is Record<string, unknown> => Boolean(s) && typeof s === "object",
    )
    .map((s) => ({
      heading: String(s.heading ?? ""),
      body: String(s.body ?? ""),
      cites: Array.isArray(s.cites) ? s.cites.map(String) : [],
    }));
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export type AgentOutcome =
  | {
      kind: "asked";
      preamble: string;
      questions: { prompt: string; type: string; why: string }[];
    }
  | {
      kind: "drafted";
      summary: string;
      sections: number;
      path: string | null;
      publishedUrl?: string | null;
    }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

/**
 * Replay the conversation so far.
 *
 * Without this the agent rebuilds context from the pinned documents on every run and asks the same
 * questions again — the answers are recorded, and it never sees them. The transcript is
 * reconstructed rather than replayed verbatim: agent turns come back as assistant messages, human
 * turns as user messages. Tool calls are deliberately NOT replayed, because a `tool_use` block
 * requires its matching `tool_result` and there is no result to give — the human's answer IS the
 * result, and it is already in the next turn.
 *
 * Any questions still open are appended as a final user message, so "you asked twelve things and
 * got eight answers" is something the model is told rather than something it has to infer.
 *
 * So is how many rounds it has already had. A model that cannot see its own round count has no way
 * to tell a first question from a fourth, and the transcript alone reads as a conversation going
 * fine.
 */
async function priorMessages(
  taskId: string,
): Promise<Anthropic.MessageParam[]> {
  const turns = await conversation(taskId);
  const messages: Anthropic.MessageParam[] = turns.map((t) => ({
    role: t.authorKind === "agent" ? ("assistant" as const) : ("user" as const),
    content: t.body,
  }));

  const still = await openQuestions(taskId);
  if (still.length) {
    messages.push({
      role: "user",
      content:
        `These questions of yours are still unanswered:\n` +
        still.map((q) => `- ${q.prompt.split("\n")[0]}`).join("\n") +
        `\n\nWork with what you have. If you can produce the deliverable and name what is still ` +
        `unresolved inside it, do that rather than asking again. Only ask again for something that ` +
        `genuinely blocks you.`,
    });
  }

  const nudge = askRoundNudge(await askRounds(taskId));
  if (nudge) messages.push({ role: "user", content: nudge });

  // The model must end on a user turn to reply to. When the last thing recorded was the agent's own
  // message and nothing is outstanding, say so plainly.
  if (messages.length && messages[messages.length - 1].role === "assistant") {
    messages.push({ role: "user", content: "Continue from here." });
  }
  return messages;
}

async function nextOrd(taskId: string): Promise<number> {
  const sb = supabaseAdmin();
  if (!sb) return 0;
  const { data } = await sb
    .from("turn")
    .select("ord")
    .eq("task_id", taskId)
    .order("ord", { ascending: false })
    .limit(1);
  return (data?.[0]?.ord ?? -1) + 1;
}

async function recordTurn(
  taskId: string,
  body: string,
  ctx: AgentContext,
): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb
    .from("turn")
    .insert({
      task_id: taskId,
      ord: await nextOrd(taskId),
      author_kind: "agent",
      author_role_code: ctx.roleCode,
      body,
    })
    .select("id")
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Run the agent for one turn.
 *
 * Streaming because a real task at high effort can run for minutes and a non-streaming request
 * would hit the HTTP timeout. We take the final message rather than handling events — the caller
 * wants the outcome, and progress is visible in the record either way.
 */
/**
 * Close the run in the log, whatever way it ended.
 *
 * Cost and stop reason belong on the record: "why did this task take four minutes and produce
 * nothing" is a question the log should answer without anyone re-running it.
 */
/**
 * Why an `ask` arrived with no questions.
 *
 * Named, not guessed, and separated out because this has recurred: the payload needs enough to tell
 * a repeating cause from a one-off. `leaked` means the questions are demonstrably sitting in the
 * preamble as text — the model closed the parameter inside its own string value — which is a
 * different failure from a model that genuinely decided to ask nothing.
 *
 * `buried` counts them by their JSON key rather than parsing the fragment. Parsing model-emitted
 * pseudo-XML to RECOVER the questions was the tempting version and is not what this does: a
 * mis-parse would file a question the agent never asked, and re-running is cheap.
 */
export function emptyAskDiagnosis(preamble: string): {
  leaked: boolean;
  buried: number;
} {
  const leaked = /<\/preamble>|<parameter name="questions">/.test(preamble);
  const buried = (preamble.match(/"prompt":\s*"/g) ?? []).length;
  return { leaked, buried };
}

/**
 * What of an ask goes to the human, and what waits.
 *
 * The model's own ordering decides — it was told to put the answers that change the most work
 * first, and it is the only party that knows which those are. This function does not re-rank.
 *
 * `held` is deliberately NOT persisted as question rows. A held question is a guess about what will
 * still matter after the next three answers, and half of them stop mattering: filed as rows they
 * become open questions nobody can retire, and the task sits `awaiting` on things the agent no
 * longer needs. If it still needs one, it asks again next round — with the answers in hand, and
 * usually better phrased. What it must not do is disappear silently, which is the caller's job.
 */
export function splitAsk<Q>(
  questions: Q[],
  cap: number = ASK_BATCH,
): { put: Q[]; held: Q[] } {
  return { put: questions.slice(0, cap), held: questions.slice(cap) };
}

/** How many rounds of questions this task has already had. One insert batch per round. */
async function askRounds(taskId: string): Promise<number> {
  const sb = supabaseAdmin();
  if (!sb) return 0;
  const { data } = await sb
    .from("question")
    .select("turn_id")
    .eq("task_id", taskId);
  return new Set((data ?? []).map((q) => q.turn_id).filter(Boolean)).size;
}

/**
 * Tell the agent where it is in its round budget.
 *
 * The cap on batch size makes an interview possible; without a cap on ROUNDS it also makes an
 * interrogation possible — three questions at a time, forever, each one a run of minutes and a
 * person waiting on it. The last round is announced rather than sprung, so the agent can spend it
 * on what it most needs instead of discovering the budget is gone.
 */
export function askRoundNudge(rounds: number): string | null {
  if (rounds >= ASK_ROUNDS_MAX) {
    return (
      `You have already asked ${rounds} rounds of questions on this task. Do not ask again. ` +
      `Draft from what you have, and name what is still unresolved inside the deliverable itself ` +
      `so the reviewer sees it.`
    );
  }
  if (rounds >= ASK_ROUNDS_MAX - 1) {
    return (
      `You have asked ${rounds} rounds of questions on this task, and this is your last one. ` +
      `Spend it on what you most need; after these answers, draft and state what is still open.`
    );
  }
  return null;
}

async function finished(
  engagementId: string,
  taskId: string,
  roleCode: string,
  outcome: string,
  message: Anthropic.Message | null,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await emit({
    engagementId,
    subjectType: "task",
    subjectId: taskId,
    verb: "agent.run.finished",
    actorKind: "agent",
    actorRoleCode: roleCode,
    payload: {
      outcome,
      stopReason: message?.stop_reason ?? null,
      inputTokens: message?.usage?.input_tokens ?? null,
      outputTokens: message?.usage?.output_tokens ?? null,
      ...extra,
    },
  });
}

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

  const ctx = await buildContext(actor, taskId);
  if (!ctx)
    return { kind: "error", message: "That task is not in your engagement." };

  // A row that NESTS a workflow has no agent to run. Its work happens in the child run's own steps,
  // each with its own agent and its own gates. The queue knows this and offers "open" instead of
  // "start", but the job page's Run button did not — so an agent was invoked on a `kind: workflow`
  // row, given the row's task slug (`define-product-foundation`) that no agent file defines, and
  // produced eight questions from a blank context. Refused here, where every call passes.
  const nests = await nestedWorkflowOf(taskId);
  if (nests) {
    return {
      kind: "error",
      message:
        `This row is satisfied by the ${nests} workflow, not by an agent. Start it to open ` +
        `that run — its steps are where the work happens.`,
    };
  }

  // Mark who is executing BEFORE the call, so a run that dies mid-flight is visibly attributed
  // rather than looking like a task nobody ever picked up.
  await sb.from("work_task").update({ executor: "app" }).eq("id", taskId);
  await mirrorState(actor.engagementId, taskId, "running", ctx.roleCode);

  await emit({
    engagementId: actor.engagementId,
    subjectType: "task",
    subjectId: taskId,
    verb: "agent.run.started",
    actorKind: "agent",
    actorRoleCode: ctx.roleCode,
    payload: {
      model: MODEL,
      agentFile: ctx.agentFile,
      produces: ctx.produces,
      // What it was allowed to read, pinned. A run is only reproducible if this is on the record.
      inputs: ctx.inputs.map((i) => ({ path: i.path, version: i.version })),
      priorDraft: ctx.priorDraft?.version ?? null,
      rejections: ctx.rejections.length,
    },
  });

  const revision = revisionPrompt(ctx);

  const client = new Anthropic();
  let message: Anthropic.Message;
  try {
    const stream = client.messages.stream({
      model: MODEL,
      // 64k, not 32k. A run came back with a complete 1,760-character summary and an EMPTY
      // sections array: adaptive thinking at high effort plus a long summary left no budget for
      // the document itself. max_tokens caps thinking AND output together, so a document-producing
      // task needs room for both.
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: systemPrompt(ctx),
      tools: TOOLS,
      messages: [
        { role: "user", content: inputPrompt(ctx) },
        ...(await priorMessages(taskId)),
        // The previous draft and any rejections go LAST, so they are the most recent thing the
        // model sees rather than something buried above a long conversation.
        ...(revision ? [{ role: "user" as const, content: revision }] : []),
      ],
    });
    message = await stream.finalMessage();
  } catch (e) {
    await sb.from("work_task").update({ executor: null }).eq("id", taskId);
    await finished(ctx.engagementId, taskId, ctx.roleCode, "error", null, {
      error: e instanceof Error ? e.message : String(e),
    });
    return {
      kind: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  // A refusal is a real outcome, not an exception. Record it and leave the task where it is.
  if (message.stop_reason === "refusal") {
    const reason =
      message.stop_details && "explanation" in message.stop_details
        ? String(message.stop_details.explanation ?? "no explanation given")
        : "no explanation given";
    await recordTurn(taskId, `The model declined this request. ${reason}`, ctx);
    await sb.from("work_task").update({ executor: null }).eq("id", taskId);
    return { kind: "refused", reason };
  }

  // Running out of room is not the same as having nothing to say, and it is the difference
  // between "the agent failed" and "give it more budget". Checked before anything reads content.
  const truncated = message.stop_reason === "max_tokens";

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const call = message.content.find((b) => b.type === "tool_use");

  if (!call) {
    // It answered in prose without choosing a tool. Record what it said rather than discarding it,
    // and leave the task running — the human can read it and decide.
    await recordTurn(taskId, text || "(no output)", ctx);
    await sb.from("work_task").update({ executor: null }).eq("id", taskId);
    await finished(ctx.engagementId, taskId, ctx.roleCode, "no-tool", message);
    return {
      kind: "error",
      message:
        "The agent replied without using a tool. Its message is in the conversation.",
    };
  }

  if (call.name === "ask") {
    const input = call.input as {
      preamble: string;
      questions: {
        prompt: string;
        type: string;
        options?: string[];
        why: string;
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

      await sb.from("work_task").update({ executor: null }).eq("id", taskId);
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
    await sb
      .from("work_task")
      .update({ state: "awaiting", executor: null })
      .eq("id", taskId);
    await mirrorState(actor.engagementId, taskId, "awaiting", ctx.roleCode);
    await finished(ctx.engagementId, taskId, ctx.roleCode, "asked", message, {
      questions: put.length,
      held: held.length,
    });
    return { kind: "asked", preamble: input.preamble, questions: put };
  }

  if (call.name === "draft") {
    const input = call.input as { summary?: string; sections?: unknown };
    const sections = asSections(input.sections);

    // The conversation gets the SUMMARY, not the document. Writing the whole draft into the turn
    // made it render twice — once in the chat and again in the document pane — and turned a
    // readable exchange into nine pages of duplicated text. The chat is where you talk about the
    // work; the document pane is where the work is.
    //
    // Durability is still handled, just not by duplication: if filing fails, the draft is written
    // as a recovery turn below, which is the only case where the conversation is the last copy.
    await recordTurn(
      taskId,
      [text, input.summary].filter(Boolean).join("\n\n"),
      ctx,
    );

    if (!sections.length) {
      // An EMPTY array is not unreadable output — it parsed perfectly and contained nothing. Saying
      // "could not be read" sends someone to debug a parser when the actual cause is usually that
      // the model ran out of room after writing its summary. Name which one it was.
      const why = truncated
        ? "It hit the token limit after writing its summary, so the document itself never came. Run it again — the budget is larger now."
        : Array.isArray(input.sections)
          ? "It returned an empty list of sections, having written a summary. Running again usually resolves it."
          : "Its sections came back in a shape that could not be read; the raw output is below.";

      await recordTurn(
        taskId,
        `**No document was produced.** ${why}` +
          (Array.isArray(input.sections) && !input.sections.length
            ? ""
            : "\n\n```json\n" +
              JSON.stringify(input.sections ?? call.input, null, 2).slice(
                0,
                40000,
              ) +
              "\n```"),
        ctx,
      );
      await sb.from("work_task").update({ executor: null }).eq("id", taskId);
      return {
        kind: "error",
        message: `The agent wrote a summary but produced no document. ${why}`,
      };
    }

    if (!ctx.produces) {
      await sb.from("work_task").update({ executor: null }).eq("id", taskId);
      return {
        kind: "error",
        message:
          "The agent drafted, but this step declares no document to produce.",
      };
    }

    const { data: org } = await sb
      .from("engagement")
      .select("org_id")
      .eq("id", actor.engagementId)
      .maybeSingle();

    const { data: versionId, error } = await sb.rpc("file_document", {
      p_org_id: org?.org_id ?? actor.orgId,
      p_engagement_id: actor.engagementId,
      p_path: ctx.produces,
      p_title: ctx.taskTitle,
      p_sections: sections.map((s) => ({ heading: s.heading, body: s.body })),
      // null = the routine derives the next version. Picking a number here is what made a
      // redraft collide on (document_id, version) and lose a two-minute run at the last step.
      p_version: null,
      p_actor: actor.holder ?? actor.roleCode,
      p_actor_role: actor.roleCode,
      p_owner_role: ctx.roleCode,
      p_task_id: taskId,
    });
    if (!error && versionId) {
      await emit({
        engagementId: ctx.engagementId,
        subjectType: "document",
        subjectId: versionId as string,
        verb: "document.filed",
        actorKind: "agent",
        actorRoleCode: ctx.roleCode,
        payload: { taskId, path: ctx.produces, sections: sections.length },
      });
    }
    if (error) {
      // Filing failed, so the conversation IS the last copy. Write it out in full — this is the
      // one case where the duplication is worth it, because the alternative is losing the run.
      await recordTurn(
        taskId,
        `**Filing failed — the draft is preserved here.** ${error.message}\n\n` +
          sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n"),
        ctx,
      );
      await sb.from("work_task").update({ executor: null }).eq("id", taskId);
      await finished(ctx.engagementId, taskId, ctx.roleCode, "error", message, {
        error: `filing the draft: ${error.message}`,
      });
      return { kind: "error", message: `filing the draft: ${error.message}` };
    }

    await recordCitations(versionId as string, sections, ctx);

    // Publish to the engagement's doc store. Filing already succeeded, so a provider failure does
    // not lose the draft — it is recorded on the version and the task carries on. Per
    // `[docs-primary]` (#154), the page is the record for everyone who does not open Compass.
    const published = await publishToDocs(
      actor.engagementId,
      versionId as string,
    );
    if (!published.ok) {
      await recordTurn(
        taskId,
        `Filed in Compass, but publishing to the engagement's doc store failed: ${published.error}\n\n` +
          `The document is complete and versioned here; it is not yet visible in the doc store.`,
        ctx,
      );
    }

    // Drafting is a decision to proceed without the outstanding answers. Those questions stop
    // blocking — but they were never answered, so they are superseded, not resolved. Leaving them
    // open is what made the queue look like the agent was asking the same things forever.
    const { data: dropped } = await sb
      .from("question")
      .update({
        state: "superseded",
        superseded_at: new Date().toISOString(),
        superseded_reason:
          "The agent drafted without these answers and named what was unresolved in the document.",
      })
      .eq("task_id", taskId)
      .eq("state", "open")
      .select("id, prompt");

    // Superseded is not answered. A question worked around leaves a line saying so, or the record
    // reads as though it was resolved.
    for (const q of dropped ?? []) {
      await emit({
        engagementId: ctx.engagementId,
        subjectType: "question",
        subjectId: q.id,
        verb: "question.superseded",
        actorKind: "agent",
        actorRoleCode: ctx.roleCode,
        payload: {
          taskId,
          prompt: q.prompt,
          reason: "drafted without an answer",
        },
      });
    }

    // Drafted, not done. A human still approves it — that is the HITL gate, and skipping it here
    // would make the agent both maker and checker.
    await sb
      .from("work_task")
      .update({ state: "hitl", executor: null })
      .eq("id", taskId);
    await mirrorState(actor.engagementId, taskId, "hitl", ctx.roleCode);
    await finished(ctx.engagementId, taskId, ctx.roleCode, "drafted", message, {
      path: ctx.produces,
      sections: sections.length,
      published: published.ok,
    });
    return {
      kind: "drafted",
      summary: input.summary ?? "",
      sections: sections.length,
      path: ctx.produces,
      publishedUrl: published.ok ? published.url : null,
    };
  }

  await sb.from("work_task").update({ executor: null }).eq("id", taskId);
  return { kind: "error", message: `Unknown tool: ${call.name}` };
}

/**
 * Record what each section was derived from.
 *
 * A citation points at the pinned VERSION, never the path — that is why `source_version_id` is NOT
 * NULL. A cite naming a document that was not among this task's inputs is dropped rather than
 * stored: the agent cannot have derived anything from a document it was never given, and recording
 * the claim would make the provenance trail lie.
 */
async function recordCitations(
  versionId: string,
  sections: { heading: string; cites: string[] }[],
  ctx: AgentContext,
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb || !versionId) return;

  const { data: rows } = await sb
    .from("document_section")
    .select("id, ord")
    .eq("document_version_id", versionId)
    .order("ord");
  if (!rows?.length) return;

  // Resolve each pinned input to the document AND the version id the agent actually read. Both are
  // stored: the document so "what cites this file" is one query, the version so the citation keeps
  // resolving to the text it was written from after the source is edited.
  const sources = new Map<string, { docId: string; versionId: string }>();
  for (const input of ctx.inputs) {
    if (!input.version) continue;
    const { data: doc } = await sb
      .from("document")
      .select("id")
      .eq("engagement_id", ctx.engagementId)
      .eq("path", input.path)
      .maybeSingle();
    if (!doc) continue;
    const { data: v } = await sb
      .from("document_version")
      .select("id")
      .eq("document_id", doc.id)
      .eq("version", input.version)
      .maybeSingle();
    if (v) sources.set(input.path, { docId: doc.id, versionId: v.id });
  }

  const citations = sections.flatMap((s, i) => {
    const section = rows[i];
    if (!section) return [];
    return s.cites
      .map((path) => ({ path, src: sources.get(path) }))
      .filter(
        (c): c is { path: string; src: { docId: string; versionId: string } } =>
          Boolean(c.src),
      )
      .map((c) => ({
        document_section_id: section.id,
        source_document_id: c.src.docId,
        source_version_id: c.src.versionId,
        locator: c.path,
      }));
  });

  if (citations.length) await sb.from("citation").insert(citations);
}
