// The sprint: its number, and how it is spelled on the board.
//
// There is no sprint table. A committed story carries `sprint-N` and its owning role as labels and
// a real assignee, and every question about a sprint — which stories, who owns them, who they are
// assigned to — is asked of the tracker. See `20260101004800_sprint_no.sql` for why the number
// alone is the exception.

import "server-only";
import { supabaseAdmin } from "../supabase";
import type { Commitment } from "./sprint-rows";

/**
 * How a sprint is written on the board.
 *
 * ONE PLACE, deliberately. The label is what the mirror writes, what the gate queries, and what
 * `committable` subtracts — three readers of one convention. Written out three times it would drift
 * the first time somebody changed the prefix, and the drift would be invisible: every caller would
 * still return results, just about different sprints.
 *
 * This is also the whole cost of moving to a Jira Version later: `fixVersion = "Sprint 3"` here,
 * and the two write lines in `mirrorSprint`.
 */
export const sprintLabel = (n: number) => `sprint-${n}`;

/** The JQL for one sprint's issues. `project` is a key, not free text — quoted, never interpolated raw. */
export function sprintJql(project: string, n: number): string {
  return `project = ${JSON.stringify(project)} AND labels = ${JSON.stringify(sprintLabel(n))}`;
}

/** The JQL for every sprint up to and including `n` — what is already committed somewhere. */
export function committedJql(project: string, upTo: number): string {
  if (upTo < 1) return "";
  const labels = Array.from({ length: upTo }, (_, i) => JSON.stringify(sprintLabel(i + 1))).join(", ");
  return `project = ${JSON.stringify(project)} AND labels IN (${labels})`;
}

/**
 * Which sprint this planning task is planning.
 *
 * A task that already has a number KEEPS it. A redraft must not renumber: the stories from the
 * first draft may already carry `sprint-3`, and drafting again as sprint 4 would leave one sprint's
 * work spread across two labels with nothing reporting it.
 *
 * `coalesce(max, 0) + 1` over zero rows is correct here — a first sprint genuinely is sprint 1 —
 * and it is the one place in this change where an empty aggregate is allowed to produce an answer
 * rather than a refusal. It is safe only because the query is scoped to ONE engagement; unscoped,
 * every client on the instance would share a counter and the second engagement would start at 4.
 */
export async function nextSprintNumber(engagementId: string, taskId: string): Promise<number> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("Supabase is not configured — a sprint number cannot be allocated.");

  const { data: mine, error: mineErr } = await sb
    .from("work_task").select("sprint_no").eq("id", taskId).maybeSingle();
  if (mineErr) throw new Error(`reading this task's sprint number: ${mineErr.message}`);
  if (mine?.sprint_no) return mine.sprint_no as number;

  const { data: rows, error } = await sb
    .from("work_task")
    .select("sprint_no")
    .eq("engagement_id", engagementId)
    .not("sprint_no", "is", null)
    .order("sprint_no", { ascending: false })
    .limit(1);
  // THROWS rather than falling back to 1. A failed read that returns "1" would relabel a live
  // sprint's stories and there would be nothing in the record to say why.
  if (error) throw new Error(`allocating a sprint number: ${error.message}`);

  return ((rows?.[0]?.sprint_no as number | undefined) ?? 0) + 1;
}

/**
 * Fix this task's sprint number before anything is written to the board.
 *
 * Ordering matters and is the reason this is its own call. Labelling ten stories `sprint-3` and
 * THEN failing to record the number leaves a sprint that exists on the board and not in the
 * process: the next plan allocates 3 again and quietly merges two sprints. The number is cheap to
 * write and impossible to repair afterwards, so it goes first.
 */
export async function claimSprintNumber(taskId: string, n: number): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("Supabase is not configured — a sprint number cannot be claimed.");
  const { error } = await sb.from("work_task").update({ sprint_no: n }).eq("id", taskId);
  if (error) throw new Error(`claiming sprint ${n}: ${error.message}`);
}

/**
 * Turn the refs the model committed to into commitments that name a real ticket.
 *
 * The model is given refs and picks from them; this is where a pick is checked against what
 * actually exists. Two failures, and BOTH are named rather than dropped:
 *
 *   a ref no backlog item has — the model invented it, or the backlog was redrafted underneath it;
 *   a ref whose story never reached the board — it has no `ticket_key`, so there is nothing to
 *   label, and a sprint that silently contains eight of eleven stories is the false green here.
 *
 * The second case still produces a commitment, with a null ticket. It belongs in the plan a human
 * reads — "this is in the sprint and is not on the board" is the useful sentence, and dropping the
 * row would make the page disagree with what was decided.
 */
export async function resolveCommitments(
  engagementId: string, raw: unknown,
): Promise<{ commitments: Commitment[]; problems: string[] }> {
  const problems: string[] = [];
  const picks = Array.isArray(raw) ? raw : [];
  if (!picks.length) return { commitments: [], problems: ["The sprint committed to no stories."] };

  const sb = supabaseAdmin();
  if (!sb) return { commitments: [], problems: ["Supabase is not configured."] };

  const { data: items } = await sb
    .from("backlog_item")
    .select("ref, title, ticket_key, kind")
    .eq("engagement_id", engagementId)
    .eq("kind", "story");
  const byRef = new Map((items ?? []).map((i) => [i.ref as string, i]));

  const commitments: Commitment[] = [];
  const seen = new Set<string>();

  for (const p of picks) {
    const pick = p as { ref?: unknown; role?: unknown; why?: unknown };
    const ref = typeof pick.ref === "string" ? pick.ref.trim() : "";
    const ownerRole = typeof pick.role === "string" ? pick.role.trim().toLowerCase() : "";
    if (!ref || !ownerRole) {
      problems.push(`A commitment arrived without a ref or a role and was not committed.`);
      continue;
    }
    // A model repeating itself must not double-count against capacity.
    if (seen.has(ref)) {
      problems.push(`\`${ref}\` was committed to twice; the duplicate was dropped.`);
      continue;
    }
    seen.add(ref);

    const item = byRef.get(ref);
    if (!item) {
      problems.push(`\`${ref}\` is not a story in this engagement's backlog — it was not committed.`);
      continue;
    }
    if (!item.ticket_key) {
      problems.push(
        `\`${ref}\` ("${item.title}") is not on the board, so it cannot be labelled or assigned. ` +
        `It is in the plan and will not reach the sprint until the backlog is mirrored.`,
      );
    }

    commitments.push({
      ref,
      ticketKey: (item.ticket_key as string | null) ?? null,
      title: item.title as string,
      ownerRole,
      why: typeof pick.why === "string" ? pick.why : "",
    });
  }

  return { commitments, problems };
}

/** The number this task planned, or null when it never reached the board. */
export async function sprintNoOf(taskId: string): Promise<number | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("work_task").select("sprint_no").eq("id", taskId).maybeSingle();
  return (data?.sprint_no as number | null) ?? null;
}
