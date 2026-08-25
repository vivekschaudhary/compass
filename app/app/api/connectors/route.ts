import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { encryptSecret } from "@/app/lib/crypto";
import { ConnectorsInput, RepoRef, TeamMember } from "@/app/lib/data";
import { canonicalProjectKey } from "@/app/lib/docstore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { engagementId, connectors, repos, members } = (await req.json()) as {
    engagementId: string; connectors: ConnectorsInput; repos: RepoRef[]; members?: TeamMember[];
  };
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 400 });

  const update: Record<string, unknown> = {
    figma_url: connectors.figma_url || null,
    docs_provider: connectors.docs_provider === "teams" ? "teams" : "confluence",
    confluence_space: connectors.confluence_space || null,
    confluence_root_page_id: connectors.confluence_root_page_id || null,
    atlassian_base_url: connectors.atlassian_base_url || null,
    atlassian_email: connectors.atlassian_email || null,
    teams_site: connectors.teams_site || null,
    graph_tenant_id: connectors.graph_tenant_id || null,
    graph_client_id: connectors.graph_client_id || null,
    // Same invariant as intake: Jira's API is case-sensitive on the project key, so a key edited
    // here in lowercase would 404 every later call and re-introduce the bug intake now prevents.
    jira_project: canonicalProjectKey(connectors.jira_project),
    jira_board_id: connectors.jira_board_id || null,
    updated_at: new Date().toISOString(),
  };
  // secrets are write-only: only overwrite when a new value was actually typed (blank = keep)
  // encrypted at rest — encryptSecret throws SecretKeyMissing rather than silently
  // storing plaintext, so a missing key fails loudly at the moment of writing.
  if (connectors.atlassian_api_token) update.atlassian_api_token = encryptSecret(connectors.atlassian_api_token);
  if (connectors.graph_client_secret) update.graph_client_secret = encryptSecret(connectors.graph_client_secret);

  await sb.from("engagement").update(update).eq("id", engagementId);

  // replace the repo set (the form sends the full list)
  await sb.from("repo").delete().eq("engagement_id", engagementId);
  const rows = (repos || [])
    .filter((r) => (r.name || r.url || r.key))
    .map((r, i) => ({
      id: r.id || `${engagementId}-repo-${i}`, engagement_id: engagementId,
      key: r.key || `repo${i + 1}`, name: r.name || "", url: r.url || "", area: r.area || "shared",
      default_branch: r.default_branch || "main", local_path: r.local_path || null,
      build_cmd: r.build_cmd || null, test_cmd: r.test_cmd || null, ord: i,
    }));
  if (rows.length) await sb.from("repo").insert(rows);

  // replace the team roster (only when the form sends it, so connector-only saves don't wipe it)
  if (members) {
    await sb.from("member").delete().eq("engagement_id", engagementId);
    const memRows = members
      .filter((m) => (m.name || "").trim())
      .map((m, i) => ({
        id: m.id || `${engagementId}-m-${(m.role || "eng")}-${i}`, engagement_id: engagementId,
        role: m.role || "eng", name: m.name, initials: m.initials || null, title: m.title || null,
        start_date: m.start_date || null, end_date: m.end_date || null, comments: m.comments || null, ord: i,
      }));
    if (memRows.length) await sb.from("member").insert(memRows);
  }

  return NextResponse.json({ ok: true, repos: rows.length, members: members?.length ?? 0 });
}
