// The writing half of a reset — reading the engagement, and doing what `planReset` decided.
//
// Split from `reset.ts` exactly as `applyPlan` is split from `planImport`, and for the reason that
// file states: the part that can be WRONG is the ordering and the exemptions, and those are worth
// testing without a database. `reset.ts` stays pure; the I/O is here.
//
// It exists as a module rather than as code inside `scripts/reset-engagement.mts` because there are
// now two callers — the script and `POST /api/cleanup` — and two copies of "clear an engagement"
// is precisely the shape this repo keeps getting burned by. One implementation, two front doors.
//
// COMPASS'S SIDE ONLY. Pages already published to Confluence and issues already created in Jira
// stay where they are; `publishedElsewhere` on the plan is what says so out loud, so a caller
// cannot report a reset as having removed both.

import { supabaseAdmin } from "../supabase.ts";
import { planReset, type ResetPlan, type ResetSnapshot } from "./reset.ts";
import type { Refusal } from "../envelope.ts";

export type ResetRun =
  | { ok: true; engagementId: string; name: string | null; plan: ResetPlan; cleared: boolean }
  | { ok: false; refusals: Refusal[] };

/**
 * PostgREST puts `in.(…)` in the URL, and a few thousand uuids exceeds what the server accepts.
 * Chunking fails at a row count nobody hits rather than at 8k characters on the one engagement big
 * enough to reach it.
 */
const CHUNK = 200;

/** Every engagement, for a caller that was given no id. */
export async function engagementsToReset(only: string | null): Promise<
  { ok: true; targets: { id: string; name: string | null }[] } | { ok: false; error: string }
> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data, error } = await sb.from("engagement").select("id, name");
  if (error) return { ok: false, error: `read engagements: ${error.message}` };

  const all = (data ?? []).map((e) => ({ id: e.id as string, name: (e.name as string | null) ?? null }));
  if (!only) return { ok: true, targets: all };

  const found = all.filter((e) => e.id === only);
  if (!found.length) {
    return {
      ok: false,
      error: `No engagement '${only}'. Known: ${all.map((e) => e.id).join(", ") || "none"}`,
    };
  }
  return { ok: true, targets: found };
}

/** What the engagement currently holds, in the shape `planReset` reads. */
export async function snapshotEngagement(engagementId: string): Promise<ResetSnapshot> {
  const sb = supabaseAdmin();
  if (!sb) throw new Error("Supabase is not configured.");

  const [tasks, runs, documents, events] = await Promise.all([
    sb.from("work_task").select("id, workflow_run_id").eq("engagement_id", engagementId),
    sb.from("workflow_run").select("id").eq("engagement_id", engagementId),
    sb.from("document").select("id, path, external_url").eq("engagement_id", engagementId),
    sb.from("event").select("id, verb").eq("engagement_id", engagementId),
  ]);
  for (const [what, r] of [["work_task", tasks], ["workflow_run", runs], ["document", documents], ["event", events]] as const) {
    if (r.error) throw new Error(`read ${what}: ${r.error.message}`);
  }

  return {
    engagementId,
    tasks: (tasks.data ?? []).map((t) => ({
      id: t.id as string, workflowRunId: (t.workflow_run_id as string | null) ?? null,
    })),
    runs: (runs.data ?? []).map((r) => ({ id: r.id as string })),
    documents: (documents.data ?? []).map((d) => ({
      id: d.id as string, path: d.path as string, externalUrl: (d.external_url as string | null) ?? null,
    })),
    events: (events.data ?? []).map((e) => ({ id: e.id as string, verb: e.verb as string })),
  };
}

/**
 * Plan a reset, and carry it out when asked.
 *
 * `apply: false` reads and decides and writes nothing — the same dry-run-then-apply shape
 * `/api/import` has, and for the same reason: the useful output of a destructive tool is the list
 * of what it would destroy.
 */
export async function resetEngagement(
  engagementId: string, name: string | null, { apply }: { apply: boolean },
): Promise<ResetRun> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, refusals: [{ message: "Supabase is not configured.", fix: "Check .env.local." }] };

  const planned = planReset(await snapshotEngagement(engagementId));
  if (!planned.ok) return { ok: false, refusals: planned.refusals };
  if (!apply) return { ok: true, engagementId, name, plan: planned.plan, cleared: false };

  // `document.current_version_id` references `document_version` with no `on delete` rule. Nulling
  // it first makes the cascade unambiguous instead of depending on how Postgres orders a delete
  // that takes the parent and the row it points at in one statement.
  const docIds = planned.plan.deletes.find((d) => d.table === "document")?.ids ?? [];
  for (let i = 0; i < docIds.length; i += CHUNK) {
    const { error } = await sb.from("document")
      .update({ current_version_id: null }).in("id", docIds.slice(i, i + CHUNK));
    if (error) throw new Error(`clear current_version_id: ${error.message}`);
  }

  // In the planned order. No transaction is available through PostgREST, so this is RE-RUNNABLE
  // rather than atomic: every step is a delete by id, so running it twice removes nothing extra.
  for (const step of planned.plan.deletes) {
    for (let i = 0; i < step.ids.length; i += CHUNK) {
      const { error } = await sb.from(step.table).delete().in("id", step.ids.slice(i, i + CHUNK));
      if (error) throw new Error(`delete ${step.table}: ${error.message}`);
    }
  }

  return { ok: true, engagementId, name, plan: planned.plan, cleared: true };
}
