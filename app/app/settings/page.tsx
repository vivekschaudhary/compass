import { getProgram } from "../lib/program";
import { supabaseAdmin } from "../lib/supabase";
import { SettingsForm } from "../components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const model = await getProgram();
  const sb = supabaseAdmin();
  const res = sb ? await sb.from("doc_page").select("*").eq("engagement_id", model.activeEngagementId).order("ord") : { data: [] };
  const docs = (res.data ?? []).map((d) => ({ path: d.path, title: d.title, kind: d.kind, status: d.status, url: d.external_url ?? d.confluence_url }));
  const memRes = sb ? await sb.from("member").select("*").eq("engagement_id", model.activeEngagementId).order("ord") : { data: [] };
  const members = (memRes.data ?? []).map((m) => ({
    id: m.id, role: m.role ?? "eng", name: m.name ?? "", initials: m.initials ?? "", title: m.title ?? "",
    start_date: m.start_date ?? "", end_date: m.end_date ?? "", comments: m.comments ?? "",
  }));
  return (
    <SettingsForm
      engagementId={model.activeEngagementId}
      engagementName={model.program.name}
      initialConnectors={model.connectors}
      initialRepos={model.repos}
      initialDocs={docs}
      initialMembers={members}
    />
  );
}
