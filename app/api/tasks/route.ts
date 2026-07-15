import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { jiraForStory, addComment } from "@/app/lib/jira";
import { normalizeRole } from "@/app/lib/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?storyId= → the story's tasks + AC checklist (so StoryTasks is self-contained).
export async function GET(req: Request) {
  const storyId = new URL(req.url).searchParams.get("storyId");
  const sb = supabaseAdmin();
  if (!sb || !storyId) return NextResponse.json({ ok: false, error: "storyId required" }, { status: 400 });
  const { data } = await sb.from("task").select("id, story_id, title, role, kind, done, ord").eq("story_id", storyId).order("kind").order("ord");
  return NextResponse.json({ ok: true, tasks: (data ?? []).map((t) => ({ id: t.id, storyId: t.story_id, title: t.title, role: t.role, kind: t.kind, done: !!t.done, ord: t.ord })) });
}

// The playbook's data endpoint — tasks under a story (the tracked, on-platform version of a doc's
// action items) + the AC checklist. Three actions:
//   promote  — insert the user-reviewed action items as tasks (kind='task') + mirror to the Jira story
//   seed-ac  — split the story's acceptance into a checklist (kind='ac'), once
//   toggle   — check/uncheck a task
type Item = { title: string; role?: string };

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as
    { action?: string; storyId?: string; items?: Item[]; taskId?: number; done?: boolean };

  if (body.action === "toggle") {
    if (body.taskId == null) return NextResponse.json({ ok: false, error: "taskId required" }, { status: 400 });
    await sb.from("task").update({ done: !!body.done, status: body.done ? "done" : "todo" }).eq("id", body.taskId);
    return NextResponse.json({ ok: true });
  }

  const storyId = body.storyId;
  if (!storyId) return NextResponse.json({ ok: false, error: "storyId required" }, { status: 400 });

  if (body.action === "seed-ac") {
    const { data: existing } = await sb.from("task").select("id").eq("story_id", storyId).eq("kind", "ac").limit(1);
    if (existing?.length) return NextResponse.json({ ok: true, seeded: 0 });
    const { data: st } = await sb.from("story").select("acceptance").eq("id", storyId).maybeSingle();
    const lines = String(st?.acceptance ?? "").split(/\r?\n/).map((l: string) => l.replace(/^\s*[-*•\d.]+\s*/, "").trim()).filter(Boolean);
    if (!lines.length) return NextResponse.json({ ok: true, seeded: 0 });
    const rows = lines.map((title: string, i: number) => ({ story_id: storyId, title, kind: "ac", ord: i }));
    await sb.from("task").insert(rows);
    return NextResponse.json({ ok: true, seeded: rows.length });
  }

  if (body.action === "promote") {
    const items = (body.items ?? []).filter((i) => i?.title?.trim());
    if (!items.length) return NextResponse.json({ ok: false, error: "no items" }, { status: 400 });
    const { data: existing } = await sb.from("task").select("id").eq("story_id", storyId).eq("kind", "task");
    let ord = existing?.length ?? 0;
    const rows = items.map((i) => ({ story_id: storyId, title: i.title.trim(), role: normalizeRole(i.role), kind: "task", ord: ord++ }));
    await sb.from("task").insert(rows);

    // mirror the playbook onto the Jira story as a comment (each item its own line/paragraph)
    const jira = await jiraForStory(storyId);
    let mirrored = false;
    if (jira && /^[A-Z][A-Z0-9]+-\d+$/.test(storyId)) {
      const list = rows.map((r) => `• ${r.title} · ${r.role}`).join("\n\n");
      mirrored = await addComment(jira, storyId, `Playbook — tasks drafted from the AI deliverable:\n\n${list}`);
    }
    return NextResponse.json({ ok: true, created: rows.length, mirrored });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
