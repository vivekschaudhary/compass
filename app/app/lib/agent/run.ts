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
import { buildContext, systemPrompt, inputPrompt, revisionPrompt, type AgentContext } from "./context";
import { conversation, openQuestions } from "../data/job";
import { publishToDocs } from "../data/publish";

const MODEL = "claude-opus-5";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "ask",
    description:
      "Ask the human what you cannot responsibly infer from the documents you were given. " +
      "Use this for facts that were never recorded — dates nobody agreed, people nobody named, " +
      "standards nobody wrote down. Ask everything you need at once. Do not use this for anything " +
      "the documents already answer.",
    input_schema: {
      type: "object",
      properties: {
        preamble: { type: "string", description: "One or two sentences on what you found and why you are blocked." },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              prompt: { type: "string", description: "The question, as you would ask a colleague." },
              type: { type: "string", enum: ["text", "choice", "number"] },
              options: { type: "array", items: { type: "string" }, description: "For type=choice." },
              why: { type: "string", description: "What this changes about the deliverable." },
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
        summary: { type: "string", description: "What you produced and what it is based on. Note any input that was missing and what it cost." },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              body: { type: "string", description: "Markdown." },
              cites: {
                type: "array", items: { type: "string" },
                description: "Document paths this section was derived from. Empty only if the section is genuinely your own judgment, and say so in the body.",
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
function asSections(raw: unknown): { heading: string; body: string; cites: string[] }[] {
  const value = typeof raw === "string" ? safeParse(raw) : raw;
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => ({
      heading: String(s.heading ?? ""),
      body: String(s.body ?? ""),
      cites: Array.isArray(s.cites) ? s.cites.map(String) : [],
    }));
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

export type AgentOutcome =
  | { kind: "asked"; preamble: string; questions: { prompt: string; type: string; why: string }[] }
  | { kind: "drafted"; summary: string; sections: number; path: string | null; publishedUrl?: string | null }
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
 */
async function priorMessages(taskId: string): Promise<Anthropic.MessageParam[]> {
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
  const { data } = await sb.from("turn").select("ord").eq("task_id", taskId)
    .order("ord", { ascending: false }).limit(1);
  return (data?.[0]?.ord ?? -1) + 1;
}

async function recordTurn(taskId: string, body: string, ctx: AgentContext): Promise<string | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("turn").insert({
    task_id: taskId, ord: await nextOrd(taskId),
    author_kind: "agent", author_role_code: ctx.roleCode, body,
  }).select("id").maybeSingle();
  return data?.id ?? null;
}

/**
 * Run the agent for one turn.
 *
 * Streaming because a real task at high effort can run for minutes and a non-streaming request
 * would hit the HTTP timeout. We take the final message rather than handling events — the caller
 * wants the outcome, and progress is visible in the record either way.
 */
export async function runAgent(actor: Actor, taskId: string): Promise<AgentOutcome> {
  const sb = supabaseAdmin();
  if (!sb) return { kind: "error", message: "Supabase is not configured." };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { kind: "error", message: "ANTHROPIC_API_KEY is not set — nothing can run." };
  }

  const ctx = await buildContext(actor, taskId);
  if (!ctx) return { kind: "error", message: "That task is not in your engagement." };

  // Mark who is executing BEFORE the call, so a run that dies mid-flight is visibly attributed
  // rather than looking like a task nobody ever picked up.
  await sb.from("work_task").update({ executor: "app" }).eq("id", taskId);

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
        ...await priorMessages(taskId),
        // The previous draft and any rejections go LAST, so they are the most recent thing the
        // model sees rather than something buried above a long conversation.
        ...(revision ? [{ role: "user" as const, content: revision }] : []),
      ],
    });
    message = await stream.finalMessage();
  } catch (e) {
    await sb.from("work_task").update({ executor: null }).eq("id", taskId);
    return { kind: "error", message: e instanceof Error ? e.message : String(e) };
  }

  // A refusal is a real outcome, not an exception. Record it and leave the task where it is.
  if (message.stop_reason === "refusal") {
    const reason = message.stop_details && "explanation" in message.stop_details
      ? String(message.stop_details.explanation ?? "no explanation given")
      : "no explanation given";
    await recordTurn(taskId, `The model declined this request. ${reason}`, ctx);
    await sb.from("work_task").update({ executor: null }).eq("id", taskId);
    return { kind: "refused", reason };
  }

  // Running out of room is not the same as having nothing to say, and it is the difference
  // between "the agent failed" and "give it more budget". Checked before anything reads content.
  const truncated = message.stop_reason === "max_tokens";

  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  const call = message.content.find((b) => b.type === "tool_use");

  if (!call) {
    // It answered in prose without choosing a tool. Record what it said rather than discarding it,
    // and leave the task running — the human can read it and decide.
    await recordTurn(taskId, text || "(no output)", ctx);
    await sb.from("work_task").update({ executor: null }).eq("id", taskId);
    return { kind: "error", message: "The agent replied without using a tool. Its message is in the conversation." };
  }

  if (call.name === "ask") {
    const input = call.input as { preamble: string; questions: { prompt: string; type: string; options?: string[]; why: string }[] };
    const body = [text, input.preamble].filter(Boolean).join("\n\n");
    const turnId = await recordTurn(taskId, body, ctx);

    if (input.questions.length) {
      await sb.from("question").insert(input.questions.map((q) => ({
        task_id: taskId, turn_id: turnId,
        prompt: q.why ? `${q.prompt}\n\n(${q.why})` : q.prompt,
        type: ["text", "choice", "number"].includes(q.type) ? q.type : "text",
        options: q.options ?? null,
      })));
    }

    // Waiting on a person is a state, not a pause. The queue should show it as such.
    await sb.from("work_task").update({ state: "awaiting", executor: null }).eq("id", taskId);
    return { kind: "asked", preamble: input.preamble, questions: input.questions };
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
    await recordTurn(taskId, [text, input.summary].filter(Boolean).join("\n\n"), ctx);

    if (!sections.length) {
      // An EMPTY array is not unreadable output — it parsed perfectly and contained nothing. Saying
      // "could not be read" sends someone to debug a parser when the actual cause is usually that
      // the model ran out of room after writing its summary. Name which one it was.
      const why = truncated
        ? "It hit the token limit after writing its summary, so the document itself never came. Run it again — the budget is larger now."
        : Array.isArray(input.sections)
          ? "It returned an empty list of sections, having written a summary. Running again usually resolves it."
          : "Its sections came back in a shape that could not be read; the raw output is below.";

      await recordTurn(taskId,
        `**No document was produced.** ${why}` +
        (Array.isArray(input.sections) && !input.sections.length
          ? ""
          : "\n\n```json\n" + JSON.stringify(input.sections ?? call.input, null, 2).slice(0, 40000) + "\n```"), ctx);
      await sb.from("work_task").update({ executor: null }).eq("id", taskId);
      return { kind: "error", message: `The agent wrote a summary but produced no document. ${why}` };
    }

    if (!ctx.produces) {
      await sb.from("work_task").update({ executor: null }).eq("id", taskId);
      return { kind: "error", message: "The agent drafted, but this step declares no document to produce." };
    }

    const { data: org } = await sb.from("engagement").select("org_id").eq("id", actor.engagementId).maybeSingle();

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
    if (error) {
      // Filing failed, so the conversation IS the last copy. Write it out in full — this is the
      // one case where the duplication is worth it, because the alternative is losing the run.
      await recordTurn(taskId,
        `**Filing failed — the draft is preserved here.** ${error.message}\n\n` +
        sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n"), ctx);
      await sb.from("work_task").update({ executor: null }).eq("id", taskId);
      return { kind: "error", message: `filing the draft: ${error.message}` };
    }

    await recordCitations(versionId as string, sections, ctx);

    // Publish to the engagement's doc store. Filing already succeeded, so a provider failure does
    // not lose the draft — it is recorded on the version and the task carries on. Per
    // `[docs-primary]` (#154), the page is the record for everyone who does not open Compass.
    const published = await publishToDocs(actor.engagementId, versionId as string);
    if (!published.ok) {
      await recordTurn(taskId,
        `Filed in Compass, but publishing to the engagement's doc store failed: ${published.error}\n\n` +
        `The document is complete and versioned here; it is not yet visible in the doc store.`, ctx);
    }

    // Drafting is a decision to proceed without the outstanding answers. Those questions stop
    // blocking — but they were never answered, so they are superseded, not resolved. Leaving them
    // open is what made the queue look like the agent was asking the same things forever.
    await sb.from("question").update({
      state: "superseded",
      superseded_at: new Date().toISOString(),
      superseded_reason: "The agent drafted without these answers and named what was unresolved in the document.",
    }).eq("task_id", taskId).eq("state", "open");

    // Drafted, not done. A human still approves it — that is the HITL gate, and skipping it here
    // would make the agent both maker and checker.
    await sb.from("work_task").update({ state: "hitl", executor: null }).eq("id", taskId);
    return { kind: "drafted", summary: input.summary ?? "", sections: sections.length, path: ctx.produces, publishedUrl: published.ok ? published.url : null };
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

  const { data: rows } = await sb.from("document_section")
    .select("id, ord").eq("document_version_id", versionId).order("ord");
  if (!rows?.length) return;

  // Resolve each pinned input to the document AND the version id the agent actually read. Both are
  // stored: the document so "what cites this file" is one query, the version so the citation keeps
  // resolving to the text it was written from after the source is edited.
  const sources = new Map<string, { docId: string; versionId: string }>();
  for (const input of ctx.inputs) {
    if (!input.version) continue;
    const { data: doc } = await sb.from("document")
      .select("id").eq("engagement_id", ctx.engagementId).eq("path", input.path).maybeSingle();
    if (!doc) continue;
    const { data: v } = await sb.from("document_version")
      .select("id").eq("document_id", doc.id).eq("version", input.version).maybeSingle();
    if (v) sources.set(input.path, { docId: doc.id, versionId: v.id });
  }

  const citations = sections.flatMap((s, i) => {
    const section = rows[i];
    if (!section) return [];
    return s.cites
      .map((path) => ({ path, src: sources.get(path) }))
      .filter((c): c is { path: string; src: { docId: string; versionId: string } } => Boolean(c.src))
      .map((c) => ({
        document_section_id: section.id,
        source_document_id: c.src.docId,
        source_version_id: c.src.versionId,
        locator: c.path,
      }));
  });

  if (citations.length) await sb.from("citation").insert(citations);
}
