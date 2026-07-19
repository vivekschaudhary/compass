import type { SupabaseClient } from "@supabase/supabase-js";

// Log one completed task to the activity history. Best-effort — never throws into a request path
// (a missing `activity` table just no-ops until 007_activity.sql is run).
export async function logActivity(
  sb: SupabaseClient,
  row: { engagementId: string; role?: string; actor?: string; kind: string; title: string; related?: string; status?: string; runId?: string },
) {
  try {
    await sb.from("activity").insert({
      engagement_id: row.engagementId,
      role: row.role ?? null,
      actor: row.actor ?? null,
      kind: row.kind,
      title: row.title,
      related: row.related ?? null,
      status: row.status ?? "done",
      run_id: row.runId ?? null,
    });
  } catch { /* table not migrated yet — ignore */ }
}
