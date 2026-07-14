import { supabaseAdmin } from "@/app/lib/supabase";
import { resolveJira, createIssue } from "@/app/lib/jira";
import { streamExecution } from "@/app/lib/exec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Product Owner adds one story under an epic — a real Jira Story parented to the epic (acceptance
// → its description), mirrored to the board. Streamed execution. Points come from refinement.
export async function POST(req: Request) {
  const { engagementId, epicId, title, points, acceptance, actor } = (await req.json().catch(() => ({}))) as
    { engagementId?: string; epicId?: string; title?: string; points?: number; acceptance?: string; actor?: string };

  return streamExecution({ engagementId: engagementId ?? "", role: "product-owner", kind: "story", actor }, async (step) => {
    const sb = supabaseAdmin();
    if (!sb) throw new Error("Supabase not configured");
    if (!epicId) throw new Error("Pick an epic to add the story to");
    const clean = (title ?? "").trim();
    if (!clean) throw new Error("A story title is required");
    const ac = (acceptance ?? "").trim();

    const { data: eng } = await sb.from("engagement")
      .select("atlassian_base_url, atlassian_email, atlassian_api_token, jira_project").eq("id", engagementId).maybeSingle();
    const jira = resolveJira(eng ?? {});

    step(`▸ creating story under ${epicId}${jira ? " (Jira)" : " (local)"}…`);
    let id = "", jiraCreated = false;
    if (jira) {
      const iss = await createIssue(jira, { type: "Story", summary: clean, description: ac || undefined, parentKey: epicId });
      if (iss) { id = iss.key; jiraCreated = true; }
    }
    if (!id) {
      const { data: existing } = await sb.from("story").select("id").eq("epic_id", epicId);
      id = `${epicId}-s${(existing?.length ?? 0) + 1}`;
    }
    await sb.from("story").insert({
      id, epic_id: epicId, title: clean, assignee: "—", status: "idle",
      estimate_pts: points && points > 0 ? points : 0, ac_pass_pct: 0, acceptance: ac || null,
    });
    step(`✓ ${id} — ${clean}${ac ? " · acceptance set" : ""}`);

    return { result: { ok: true, story: id, jira: jiraCreated }, title: `Added story — ${clean}`, related: id };
  });
}
