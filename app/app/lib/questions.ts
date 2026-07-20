import type { SupabaseClient } from "@supabase/supabase-js";

// ── The agent-asks-questions primitive (role-agnostic) ──────────────────────
// Any agent, on any task, surfaces a gap/ambiguity/inference it cannot resolve from its inputs as a
// STRUCTURED question filed into its OWN role's jobs-to-do — instead of fabricating or silently
// defaulting. The interactive form of `[no-padded-status]`/`[derive-from-state]`/`[refuse-escalate]`.
// See AGENTS.md `[agent-asks-structured-questions]`.

export type QuestionType = "choice" | "number" | "text";

// Where the human's answer is applied. A single allowlisted patch: table + row id + column. The
// ALLOW map below is the ONLY set a question may touch — a question can never write arbitrary fields.
export type QuestionTarget = { table: string; id: string; column: string };

export type AgentQuestion = {
  key: string;                 // stable id within a source, e.g. "budget", "lead-qa"
  prompt: string;              // the question shown to the human
  type: QuestionType;
  options?: string[];          // choice only
  target: QuestionTarget;      // how the answer is applied (allowlisted)
  because?: string;            // the gap/inference that drove the ask (shown as subtitle)
  related?: string;            // ticket / deep-link, optional
};

// The client-facing slice carried on a `question` job (see data.ts Job.question).
export type QuestionPayload = { id: string; key: string; type: QuestionType; options?: string[]; target: QuestionTarget };

// Allowlist: table → columns a question answer may patch. Anything off this map is rejected.
export const ALLOW: Record<string, string[]> = {
  engagement: ["budget", "pricing", "months", "quality_bar", "name", "client"],
  member: ["name"],
  story: ["acceptance", "points", "role", "title"],
  deliverable: ["title", "acceptance"],
  epic: ["title", "note"],
};

// Columns coerced to a number before the patch.
const NUMERIC = new Set(["budget", "months", "points"]);

export function isAllowed(target: QuestionTarget): boolean {
  return Boolean(target && ALLOW[target.table]?.includes(target.column) && target.id);
}

export function initialsFor(name: string): string {
  return name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

type Sb = SupabaseClient;

// Producer side — persist a batch of questions tagged with the ASKING agent's role + source task.
// Called both by the streamExecution hook (any streamed agent) and directly by intake.
export async function raiseQuestions(
  sb: Sb,
  meta: { engagementId: string; role: string; source: string },
  questions: AgentQuestion[],
): Promise<number> {
  if (!questions?.length) return 0;
  const rows = questions.map((q, i) => ({
    id: `${meta.engagementId}-q-${meta.source}-${q.key}`.replace(/[^A-Za-z0-9-]/g, "-").slice(0, 120),
    engagement_id: meta.engagementId, role: meta.role, source: meta.source,
    key: q.key, prompt: q.prompt, type: q.type, options: q.options ?? null,
    target: q.target, because: q.because ?? null, related: q.related ?? null,
    status: "open", ord: i,
  }));
  // upsert so re-running a task that re-asks the same key doesn't duplicate the open question
  const { error } = await sb.from("agent_question").upsert(rows, { onConflict: "id" });
  return error ? 0 : rows.length;
}

// Answer side — apply ONE answered question's structured value to its allowlisted target, then mark
// the row answered. Returns {ok, error?}. Shared by the /api/questions/answer endpoint (+ tests).
export async function applyAnswer(sb: Sb, questionId: string, value: string): Promise<{ ok: boolean; error?: string }> {
  const { data: q } = await sb.from("agent_question").select("*").eq("id", questionId).maybeSingle();
  if (!q) return { ok: false, error: "no such question" };
  const target = q.target as QuestionTarget;
  if (!isAllowed(target)) return { ok: false, error: "target not allowed" };

  const raw = (value ?? "").trim();
  const coerced: string | number = NUMERIC.has(target.column) ? Number(raw.replace(/[^0-9.]/g, "")) || 0 : raw;
  const patch: Record<string, unknown> = { [target.column]: coerced };
  // a member's name change also refreshes its initials (kept consistent with intake seeding)
  if (target.table === "member" && target.column === "name") patch.initials = initialsFor(raw);

  const { error: e1 } = await sb.from(target.table).update(patch).eq("id", target.id);
  if (e1) return { ok: false, error: e1.message };
  await sb.from("agent_question").update({ answer: raw, status: "answered" }).eq("id", questionId);
  return { ok: true };
}
