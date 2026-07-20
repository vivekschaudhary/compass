import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";

// Engagement admin — list + delete. Delete cascades: every engagement-scoped table FKs
// `engagement(id) on delete cascade`, and epic→story→task + run→chat_message cascade in turn, so
// removing the engagement row wipes all its data. Used by the hidden /cleanup page for test teardown.

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "not configured" }, { status: 400 });
  const { data } = await sb.from("engagement").select("id, name, client, updated_at").order("updated_at", { ascending: false });
  return NextResponse.json({ ok: true, engagements: data ?? [] });
}

export async function DELETE(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "not configured" }, { status: 400 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const { error } = await sb.from("engagement").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, deleted: id });
}
