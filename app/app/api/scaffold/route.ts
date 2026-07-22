import { NextResponse } from "next/server";
import { scaffoldDocs, seedDocTreeSpec } from "@/app/lib/doctree";
import { supabaseAdmin } from "@/app/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NodeIn = { path: string; title: string; kind?: string; parent_path?: string; body?: string | null; ord?: number };

// GET ?engagementId=… → the engagement's refinable doc tree + approval state (seeds it if missing).
export async function GET(req: Request) {
  const engagementId = new URL(req.url).searchParams.get("engagementId") ?? "";
  const sb = supabaseAdmin();
  if (!sb || !engagementId) return NextResponse.json({ ok: false, error: "no db / engagementId" }, { status: 400 });
  await seedDocTreeSpec(engagementId); // idempotent — no-op if already seeded
  const { data: nodes } = await sb.from("doc_tree_spec").select("*").eq("engagement_id", engagementId).order("ord");
  const { data: eng } = await sb.from("engagement").select("doc_tree_approved").eq("id", engagementId).maybeSingle();
  return NextResponse.json({ ok: true, nodes: nodes ?? [], approved: Boolean(eng?.doc_tree_approved) });
}

// PUT { engagementId, nodes[] } → replace the engagement's doc tree (a refinement). Re-opens approval:
// the structure must be re-approved before it scaffolds again.
export async function PUT(req: Request) {
  const { engagementId, nodes } = (await req.json()) as { engagementId: string; nodes: NodeIn[] };
  const sb = supabaseAdmin();
  if (!sb || !engagementId) return NextResponse.json({ ok: false, error: "no db / engagementId" }, { status: 400 });
  const rows = (nodes ?? []).map((n, i) => ({
    engagement_id: engagementId, path: n.path, title: n.title,
    kind: n.kind === "folder" || n.kind === "template" ? n.kind : "doc",
    parent_path: n.parent_path ?? "", body: n.body ?? null, ord: n.ord ?? i,
  }));
  await sb.from("doc_tree_spec").delete().eq("engagement_id", engagementId);
  if (rows.length) await sb.from("doc_tree_spec").insert(rows);
  await sb.from("engagement").update({ doc_tree_approved: false }).eq("id", engagementId);
  return NextResponse.json({ ok: true, nodes: rows.length });
}

// POST { engagementId } → approve the tree and scaffold it into the wired docs provider. This is the
// docs.wired half of Sprint 0 ticket "Connect systems of record".
export async function POST(req: Request) {
  const { engagementId } = (await req.json()) as { engagementId: string };
  const sb = supabaseAdmin();
  if (!sb || !engagementId) return NextResponse.json({ ok: false, error: "no db / engagementId" }, { status: 400 });
  await sb.from("engagement").update({ doc_tree_approved: true }).eq("id", engagementId);
  const r = await scaffoldDocs(engagementId);
  return NextResponse.json({ ...r, approved: true });
}
