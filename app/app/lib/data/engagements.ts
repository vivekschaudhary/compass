// Engagement-level reads.
//
// Small on purpose. v2 only needs enough to name the thing in the top bar; the four-pillar hero
// and everything that fed it is v1's, and stays there until the health view is redesigned.

import "server-only";
import { supabaseAdmin } from "../supabase";

export type EngagementSummary = {
  id: string;
  name: string;
  client: string | null;
  /** Shown beside the name — "Sprint 14" in the mockups. Null before there is one. */
  sprint: string | null;
};

export async function engagementSummary(id: string): Promise<EngagementSummary | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data } = await sb.from("engagement")
    .select("id, name, client, phase").eq("id", id).maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    client: data.client ?? null,
    // `phase` is v1's free-text kickoff label. Until sprints are mirrored from the tracker it is
    // the closest true thing, and showing it beats inventing "Sprint 14".
    sprint: data.phase ?? null,
  };
}

/** Every engagement, for the switcher. */
export async function listEngagements() {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data } = await sb.from("engagement").select("id, name").order("name");
  return data ?? [];
}

export type EngagementRow = {
  id: string; name: string; client: string | null; phase: string | null;
  docsProvider: string | null; jiraProject: string | null;
  openTasks: number; documents: number;
};

/**
 * Every engagement in the org, with enough state to tell them apart.
 *
 * Counts rather than status words: "3 open" is a fact anyone can check, where "on track" is a
 * claim nobody signed. Two queries for the whole list rather than two per row.
 */
export async function engagementsOverview(): Promise<EngagementRow[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: rows } = await sb.from("engagement")
    .select("id, name, client, phase, docs_provider, jira_project").order("name");
  if (!rows?.length) return [];

  const ids = rows.map((r) => r.id);
  const { data: tasks } = await sb.from("work_task")
    .select("engagement_id, state").in("engagement_id", ids);
  const { data: docs } = await sb.from("document")
    .select("engagement_id, current_version_id").in("engagement_id", ids);

  const open = new Map<string, number>();
  for (const t of tasks ?? []) {
    if (["closed", "abandoned"].includes(t.state)) continue;
    open.set(t.engagement_id, (open.get(t.engagement_id) ?? 0) + 1);
  }
  const filed = new Map<string, number>();
  for (const d of docs ?? []) {
    if (!d.current_version_id) continue;
    filed.set(d.engagement_id, (filed.get(d.engagement_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id, name: r.name, client: r.client, phase: r.phase,
    docsProvider: r.docs_provider, jiraProject: r.jira_project,
    openTasks: open.get(r.id) ?? 0, documents: filed.get(r.id) ?? 0,
  }));
}
