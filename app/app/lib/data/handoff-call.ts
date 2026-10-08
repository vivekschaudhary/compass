// The record of one handoff to something outside the app's process (today, the generator).
//
// Written BEFORE the spawn with the request, and closed AFTER with the result, so a run that dies
// mid-flight still leaves a row that says it was attempted. The migration enforces the rules that
// matter (a shipped row has a PR, a closed row has a result); this module only writes what the
// caller actually got and throws on any database error rather than returning a half-written row.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerateResult } from "./generate-contract";

export type HandoffCallRow = {
  id: string;
  status: "running" | "shipped" | "checks_failed" | "generator_failed" | "refused";
  result: GenerateResult | null;
  pr_url: string | null;
};

export async function openHandoffCall(
  sb: SupabaseClient,
  args: { id: string; orgId: string; engagementId: string; taskId: string; kind: "generate"; request: unknown },
): Promise<string> {
  const { data, error } = await sb
    .from("handoff_call")
    .insert({
      id: args.id,
      org_id: args.orgId,
      engagement_id: args.engagementId,
      work_task_id: args.taskId,
      kind: args.kind,
      request: args.request,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not open the handoff record: ${error?.message ?? "no row returned"}`);
  return data.id as string;
}

export async function closeHandoffCall(sb: SupabaseClient, id: string, result: GenerateResult): Promise<void> {
  const { error } = await sb
    .from("handoff_call")
    .update({
      status: result.status,
      result,
      pr_url: result.pr_url,
      closed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`could not close the handoff record ${id}: ${error.message}`);
}

/** The newest handoff for a task, or null when none has run. */
export async function latestHandoffCall(sb: SupabaseClient, taskId: string): Promise<HandoffCallRow | null> {
  const { data, error } = await sb
    .from("handoff_call")
    .select("id, status, result, pr_url")
    .eq("work_task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`could not read the handoff record: ${error.message}`);
  return (data as HandoffCallRow | null) ?? null;
}

/**
 * The most recent handoff that actually RAN the generator — skipping `refused` rows that come
 * after it. `refused` means the generator was never spawned (no checkout, a non-empty worktree, a
 * malformed request), so it carries no information about whether a prior run's checks pass. A
 * precondition failure must not be able to overwrite a `shipped` result just because something
 * (a stray re-run, a chat message that re-triggered the agent) tried again and never got as far as
 * the generator. Falls back to the newest row of any status when every row is a refusal, so a task
 * that has genuinely never run still reports that honestly.
 */
export async function latestRanHandoffCall(sb: SupabaseClient, taskId: string): Promise<HandoffCallRow | null> {
  const { data, error } = await sb
    .from("handoff_call")
    .select("id, status, result, pr_url")
    .eq("work_task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`could not read the handoff record: ${error.message}`);
  const rows = (data as HandoffCallRow[] | null) ?? [];
  if (!rows.length) return null;
  return rows.find((r) => r.status !== "refused") ?? rows[0];
}
