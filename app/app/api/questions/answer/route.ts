import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { applyAnswer } from "@/app/lib/questions";

// Answer ONE agent-question: apply the human's structured value to its allowlisted target
// (engagement/member/story/… column), then mark the row answered. The board re-derives on refresh
// and the resolved question drops out of the asking role's jobs-to-do.
// [agent-asks-structured-questions] — the answer side of the primitive.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as
    { questionId?: string; value?: string; answers?: { questionId: string; value: string }[] };

  // Batch (the grouped "Staff the team" card) — apply each non-empty answer; empties are skipped
  // (staff later). Returns how many applied.
  if (Array.isArray(body.answers)) {
    let applied = 0;
    for (const a of body.answers) {
      if (!a.questionId || !(a.value ?? "").trim()) continue;
      const r = await applyAnswer(sb, a.questionId, a.value);
      if (r.ok) applied++;
    }
    return NextResponse.json({ ok: true, applied });
  }

  if (!body.questionId) return NextResponse.json({ ok: false, error: "questionId required" }, { status: 400 });
  const res = await applyAnswer(sb, body.questionId, body.value ?? "");
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
