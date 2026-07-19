import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fetch one run's persisted log + outcome — backs the expandable run detail in the history.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const sb = supabaseAdmin();
  if (!sb || !id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  const { data } = await sb.from("run").select("id, story, role, workflow, status, failed_step, error, log, created_at").eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "run not found" }, { status: 404 });
  return NextResponse.json({ ok: true, run: data });
}
