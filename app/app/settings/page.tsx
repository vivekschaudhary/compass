import { redirect } from "next/navigation";
import { getProgram } from "../lib/program";
import { supabaseAdmin } from "../lib/supabase";
import { SettingsShell } from "../components/SettingsShell";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ e?: string; role?: string; tab?: string }> }) {
  const { e, role, tab } = await searchParams;
  const model = await getProgram(e);
  // Canonicalize the URL so it always names the engagement being configured (readable + shareable).
  // PRESERVE the other params while doing it: `role` is the acting identity, and dropping it here
  // sent every visitor in as nobody — the editor then refused saves for want of a capability the
  // user actually had. `tab` goes the same way, or a deep link to one section lands on the first.
  if (!e && model.activeEngagementId) {
    const qs = new URLSearchParams({
      e: model.activeEngagementId, ...(role ? { role } : {}), ...(tab ? { tab } : {}),
    });
    redirect(`/settings?${qs}`);
  }

  const sb = supabaseAdmin();
  const res = sb ? await sb.from("doc_page").select("*").eq("engagement_id", model.activeEngagementId).order("ord") : { data: [] };
  const docs = (res.data ?? []).map((d) => ({ path: d.path, title: d.title, kind: d.kind, status: d.status, url: d.external_url ?? d.confluence_url }));
  const memRes = sb ? await sb.from("member").select("*").eq("engagement_id", model.activeEngagementId).order("ord") : { data: [] };
  const members = (memRes.data ?? []).map((m) => ({
    id: m.id, role: m.role ?? "eng", name: m.name ?? "", initials: m.initials ?? "", title: m.title ?? "",
    start_date: m.start_date ?? "", end_date: m.end_date ?? "", comments: m.comments ?? "",
  }));

  return (
    <SettingsShell
      engagementId={model.activeEngagementId}
      engagementName={model.program.name}
      connectors={model.connectors}
      repos={model.repos}
      docs={docs}
      members={members}
    />
  );
}
