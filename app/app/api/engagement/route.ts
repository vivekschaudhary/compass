import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { deleteProviderDoc } from "@/app/lib/docstore";
import { resolveJira, deleteIssue } from "@/app/lib/jira";

// Engagement admin — list + delete. Used by the hidden /cleanup page for test teardown.
//
// Deleting an engagement row cascades every engagement-scoped table (epic→story→task,
// run→chat_message, doc_page, doc_tree_spec, spec_file, member, …). What it CANNOT reach is the
// world outside the database: the Confluence pages and Jira issues Compass created are real
// artifacts in real systems, and the cascade leaves them behind — orphaned, and now harder to find
// because the rows naming them are gone.
//
// So `?external=1` tears those down too. It is OPT-IN rather than the default: on a real
// engagement the artifacts are the deliverable and should outlive the Compass record. On a test
// engagement they are litter. Only the caller knows which this is.

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "not configured" }, { status: 400 });
  const { data } = await sb.from("engagement").select("id, name, client, updated_at").order("updated_at", { ascending: false });

  // Count the real artifacts alongside each row. Deleting is irreversible and reaches outside the
  // database, so the number of pages and issues at stake belongs on screen BEFORE the click — not
  // in a summary afterwards.
  const engagements = await Promise.all((data ?? []).map(async (e) => {
    const f = await externalFootprint(sb, e.id);
    return { ...e, docCount: f.docs.length, issueCount: f.issueKeys.length };
  }));
  return NextResponse.json({ ok: true, engagements });
}

/** What external teardown would remove — read BEFORE deleting, since the cascade erases the
 *  pointers. Surfaced by GET so the UI can say "and 20 Confluence pages" before you commit. */
async function externalFootprint(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, id: string) {
  const { data: pages } = await sb.from("doc_page")
    .select("provider, external_id, confluence_page_id").eq("engagement_id", id);
  const { data: epics } = await sb.from("epic").select("id").eq("engagement_id", id);
  const epicIds = (epics ?? []).map((e) => e.id);
  const { data: stories } = epicIds.length
    ? await sb.from("story").select("id").in("epic_id", epicIds)
    : { data: [] as { id: string }[] };
  // Only ids that look like tracker keys (PROJ-123) exist in Jira; the rest are local fallbacks.
  const isKey = (k: string) => /^[A-Z][A-Z0-9]+-\d+$/.test(k);
  return {
    docs: (pages ?? []).filter((p) => p.external_id || p.confluence_page_id),
    issueKeys: [...(stories ?? []).map((s) => s.id), ...epicIds].filter(isKey),   // children first
  };
}

export async function DELETE(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "not configured" }, { status: 400 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const external = url.searchParams.get("external") === "1";
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const { data: eng } = await sb.from("engagement").select("*").eq("id", id).maybeSingle();
  if (!eng) return NextResponse.json({ ok: false, error: "engagement not found" }, { status: 404 });

  const report = { docsDeleted: 0, docsFailed: 0, issuesDeleted: 0, issuesFailed: 0 };

  if (external) {
    const { docs, issueKeys } = await externalFootprint(sb, id);

    for (const d of docs) {
      const ok = await deleteProviderDoc(eng, { provider: d.provider, external_id: d.external_id ?? d.confluence_page_id });
      if (ok) report.docsDeleted++; else report.docsFailed++;
    }

    // Stories before epics: deleting a parent with live children either fails or orphans them.
    // `externalFootprint` already returns them in that order.
    const jira = resolveJira(eng);
    if (jira) {
      for (const key of issueKeys) {
        const ok = await deleteIssue(jira, key);
        if (ok) report.issuesDeleted++; else report.issuesFailed++;
      }
    }
  }

  // The row goes last. If external teardown half-failed, the engagement still exists and can be
  // retried — deleting the row first would strand whatever was left with no pointer to it.
  const { error } = await sb.from("engagement").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message, ...report }, { status: 400 });

  return NextResponse.json({ ok: true, deleted: id, external, ...report });
}
