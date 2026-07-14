import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { logActivity } from "@/app/lib/activity";

// Job actions — the web analog of the Python cockpit's /decide + /run: a role's button
// writes back to Supabase (the source of truth) and the board recomputes on refresh.
// Effects are explicit per job so the demo cascades are deterministic.

export const dynamic = "force-dynamic";

type Result = { complete: boolean; note?: string };

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 400 });

  const { jobId, action, actor } = (await req.json()) as { jobId: string; action: "primary" | "secondary"; actor?: string };
  const { data: job } = await sb.from("job").select("engagement_id, role, kind, title, related, primary_label, secondary_label").eq("id", jobId).maybeSingle();

  // PM approves a research draft → unlocks the PO's Refine on that epic.
  if (jobId.startsWith("research-approve-")) {
    const epicId = jobId.replace("research-approve-", "");
    await sb.from("epic").update({ research_status: "approved" }).eq("id", epicId);
    const { data: ep } = await sb.from("epic").select("engagement_id, title").eq("id", epicId).maybeSingle();
    if (ep) await logActivity(sb, { engagementId: ep.engagement_id, role: "pm", actor, kind: "approve", title: `Approved research — ${ep.title}`, related: epicId });
    await sb.from("job").delete().eq("id", jobId);
    return NextResponse.json({ ok: true, complete: true, note: "Research approved — refinement unlocked" });
  }

  const effects: Record<string, (a: string) => Promise<Result>> = {
    // Exec approves/declines the CSV change request → scope pillar clears the pending crossing.
    "j-exec-1": async (a) => {
      await sb.from("change_request").update({ status: a === "primary" ? "approved" : "rejected" }).eq("id", "cr-csv");
      return { complete: true, note: a === "primary" ? "CR approved — scope updated" : "CR declined" };
    },
    // Designer delivers KAN-30d → unblocks KAN-112, epic + deliverable heal, one fewer late story,
    // and the engineer's blocked job resolves. The amber cascade reverses.
    "j-design-1": async () => {
      await sb.from("story").update({ status: "good", blocked_reason: null }).eq("id", "KAN-112");
      await sb.from("epic").update({ status: "good", note: null }).eq("id", "KAN-30");
      await sb.from("deliverable").update({ status: "in-progress" }).eq("id", "acme-D3");
      await sb.from("engagement").update({ stories_late: 1 }).eq("id", "acme");
      await sb.from("job").delete().eq("id", "j-eng-2"); // engineer's blocked job is now unblocked
      return { complete: true, note: "Design delivered — KAN-112 unblocked" };
    },
    // Engineer reviews + merges the login PR.
    "j-eng-1": async () => {
      await sb.from("story").update({ status: "good", ac_pass_pct: 100 }).eq("id", "KAN-101");
      return { complete: true, note: "KAN-101 merged" };
    },
    // Engineer's blocked KAN-112: "Get help" is client-only (opens the dock); "Raise CR" files one
    // but the job stays blocked until design is delivered.
    "j-eng-2": async (a) => {
      if (a === "secondary") {
        await sb.from("change_request").upsert({ id: "cr-timeline", engagement_id: "acme", title: "Timeline extension — D3 slip", detail: "Filed from a blocked story; needs client sign-off.", status: "pending" });
        return { complete: false, note: "Change request filed" };
      }
      return { complete: false };
    },
  };

  const res = (await effects[jobId]?.(action)) ?? { complete: true };
  if (res.complete) {
    if (job) {
      const label = (action === "primary" ? job.primary_label : job.secondary_label) || job.kind;
      await logActivity(sb, { engagementId: job.engagement_id, role: job.role, actor, kind: job.kind, title: `${label} — ${job.title}`, related: job.related });
    }
    await sb.from("job").delete().eq("id", jobId);
  }

  return NextResponse.json({ ok: true, ...res });
}
