// Small, mostly-pure helpers shared by `run.ts` and every outcome handler: assembling the
// conversation replay, recording a turn, and the ask-specific bookkeeping (batching, round limits,
// the empty-ask diagnosis). None of this decides an outcome — `effects.ts` and the handlers do.

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "../../supabase";
import { conversation, openQuestions } from "../../data/job";
import { ASK_BATCH, ASK_ROUNDS_MAX, type AgentContext } from "../context";

export function asSections(
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
export async function priorMessages(
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

export async function recordTurn(
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
 * The document path an answer may be filed at, or null.
 *
 * An agent asks for the client's BRD and the human pastes it; the app files that text verbatim,
 * because an agent that re-drafts a supplied document paraphrases it, and a summarised requirement
 * is indistinguishable from a real one to everything downstream that cites it.
 *
 * The path is model output, so it is checked HERE, on the way in. `04-` and `05-` are absent from
 * the allowed prefixes on purpose: delivery and cadence documents are produced BY workflow steps,
 * and letting an answer land at one would let a pasted message overwrite a deliverable an agent is
 * responsible for. Anything else is dropped and the question is asked as an ordinary one — the
 * answer is still recorded, it just does not become a document.
 */
const FILEABLE = /^(0[0-3])-[a-z0-9-]+\/[a-z0-9-]+$/;

export function filesTo(path: string | null | undefined): string | null {
  const p = (path ?? "").trim().toLowerCase();
  return p && FILEABLE.test(p) ? p : null;
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
