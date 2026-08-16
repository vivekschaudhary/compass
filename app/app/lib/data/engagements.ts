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
