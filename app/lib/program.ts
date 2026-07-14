import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase";
import { FIXTURE, ProgramModel, Health, Pillar, Attention, Lane, Epic, Phase, COMPASS_ROLES } from "./data";

const DISCIPLINES = ["Product", "Engineering", "QA", "Design"];
const LEAD: Record<string, string> = { Product: "Jen", Engineering: "Maria", QA: "Priya", Design: "Alex" };

// Read the engagement from Supabase and compute the model. Falls back to FIXTURE on any
// miss (unconfigured / empty / error) so the dashboard never white-screens.
export async function getProgram(): Promise<ProgramModel & { source: "supabase" | "fixture" }> {
  const sb = supabaseAdmin();
  if (!sb) return { ...FIXTURE, source: "fixture" };

  try {
    const cookieStore = await cookies();
    const wanted = cookieStore.get("compass_eng")?.value;
    const { data: engList } = await sb.from("engagement").select("*").order("updated_at", { ascending: false });
    if (!engList || !engList.length) return { ...FIXTURE, source: "fixture" };
    const eng = engList.find((e) => e.id === wanted) ?? engList[0];
    const id = eng.id;
    const engagements = engList.map((e) => ({ id: e.id, name: e.name, sow: e.sow }));

    const [{ data: dels }, { data: mems }, { data: epics }, { data: stories }, { data: crs }, { data: runs }, { data: jobRows }] =
      await Promise.all([
        sb.from("deliverable").select("*").eq("engagement_id", id).order("ord"),
        sb.from("member").select("*").eq("engagement_id", id),
        sb.from("epic").select("*").eq("engagement_id", id).order("ord"),
        sb.from("story").select("*"),
        sb.from("change_request").select("*").eq("engagement_id", id),
        sb.from("run").select("*").eq("engagement_id", id).order("created_at", { ascending: false }),
        sb.from("job").select("*").eq("engagement_id", id).order("ord"),  // missing table → null, fixture fallback
      ]);

    const { data: repoRows } = await sb.from("repo").select("*").eq("engagement_id", id).order("ord");
    const { data: activityRows } = await sb.from("activity").select("*").eq("engagement_id", id).order("created_at", { ascending: false }).limit(60);
    const { data: metricRows } = await sb.from("metric").select("*").eq("engagement_id", id).order("ord");

    const deliverables = dels ?? [];
    const epicRows = epics ?? [];
    const storyRows = stories ?? [];
    const pendingCRs = (crs ?? []).filter((c) => c.status === "pending");
    const lateStories = storyRows.filter((s) => s.status === "warn" || s.status === "bad").length;

    // ── pillars, computed from the engagement row + counts ──────────────────
    const costPct = Math.round((eng.cost_spent / Math.max(eng.cost_budget, 1)) * 100);
    const totalDel = deliverables.length || 5;
    const pillars: Pillar[] = [
      {
        key: "cost", label: "Cost", status: costPct <= 45 ? "good" : costPct <= 75 ? "warn" : "bad",
        headline: `$${Math.round(eng.cost_spent / 1000)}k`,
        sub: `of $${Math.round(eng.cost_budget / 1000)}k · ${costPct}% burned · on curve`,
        pct: costPct, spark: eng.cost_spark ?? [],
      },
      {
        key: "scope", label: "Scope", status: pendingCRs.length ? "warn" : "good",
        headline: `${totalDel} / ${totalDel}`,
        sub: `deliverables grounded · ${pendingCRs.length} crossing${pendingCRs.length === 1 ? "" : "s"} pending`,
        pct: 100, spark: eng.scope_spark ?? [],
      },
      {
        key: "time", label: "Time", status: eng.time_days_left <= 7 || eng.stories_late > 0 ? "warn" : "good",
        headline: `${eng.time_milestone} in ${eng.time_days_left}d`,
        sub: `milestone at risk · ${eng.stories_late} stories late`,
        pct: eng.time_spark?.slice(-1)[0] ?? 60, spark: eng.time_spark ?? [],
      },
      {
        key: "quality", label: "Quality", status: eng.quality_ac_pass >= 90 && eng.quality_criticals === 0 ? "good" : "warn",
        headline: `${eng.quality_ac_pass}%`,
        sub: `AC pass · ${eng.quality_criticals} criticals open`,
        pct: eng.quality_ac_pass, spark: eng.quality_spark ?? [],
      },
    ];

    // ── needs attention ─────────────────────────────────────────────────────
    const attention: Attention[] = [];
    for (const d of deliverables.filter((x) => x.status === "at-risk")) {
      const epic = epicRows.find((e) => e.deliverable_code === d.code);
      const blocked = storyRows.find((s) => s.epic_id === epic?.id && s.blocked_reason);
      attention.push({
        id: `d-${d.code}`, pillar: "time", tone: "warn",
        title: `${d.title} — ${blocked?.id ?? epic?.id ?? d.code} at risk`,
        detail: blocked?.blocked_reason
          ? `Waiting on the design sub-task — ${blocked.blocked_reason}. Puts milestone ${eng.time_milestone} at risk.`
          : `${d.title} is behind. The roll-up has it amber.`,
        actions: ["See detail", "Nudge"],
      });
    }
    for (const c of pendingCRs) {
      attention.push({ id: c.id, pillar: "scope", tone: "bad", title: c.title, detail: c.detail, actions: ["Raise change request", "Map to a deliverable"] });
    }
    if (lateStories > 0) {
      attention.push({ id: "late", pillar: "time", tone: "warn", title: `Engineering — ${lateStories} stories slipping`, detail: "Stories behind their phase target; the roll-up has D3 amber.", actions: ["See plan"] });
    }

    // ── plan grid: epics grouped by discipline, then phase ──────────────────
    const lanes: Lane[] = DISCIPLINES.map((disc) => {
      const cells: Partial<Record<Phase, Epic[]>> = {};
      for (const e of epicRows.filter((x) => x.discipline === disc)) {
        const ph = e.phase as Phase;
        (cells[ph] ??= []).push({
          key: e.id, title: e.title, status: e.status as Health,
          assignee: LEAD[disc] ?? "—", deliverable: e.deliverable_code, note: e.note ?? undefined,
        });
      }
      return { discipline: disc, cells };
    });

    // ── roles for the switcher — every team member is a view; jobs route by roleCode ──
    const order = COMPASS_ROLES.map((r) => r.code);
    const rank = (r: string) => { const i = order.indexOf(r); return i === -1 ? 99 : i; };
    const roles = (mems ?? [])
      .slice()
      .sort((a, b) => rank(a.role) - rank(b.role) || (a.name ?? "").localeCompare(b.name ?? ""))
      .map((m) => ({ id: m.id, name: m.name, title: m.title, initials: m.initials, roleCode: m.role }));

    const jobs = jobRows && jobRows.length
      ? jobRows.map((j) => ({ id: j.id, role: j.role, kind: j.kind, title: j.title, subtitle: j.subtitle, meta: j.meta ?? undefined, related: j.related ?? undefined, primary: j.primary_label ?? undefined, secondary: j.secondary_label ?? undefined, tone: j.tone ?? undefined }))
      : FIXTURE.jobs;

    const run = runs?.[0];
    const failedRun = run
      ? { runId: run.id, role: run.role, story: run.story, failedStep: run.failed_step, error: run.error, diagnosis: run.diagnosis, fix: run.fix, resumeFrom: run.resume_from }
      : FIXTURE.failedRun;

    return {
      program: {
        name: eng.name, sow: eng.sow, client: eng.client, pricing: eng.pricing,
        budget: eng.budget, months: eng.months, qualityBar: eng.quality_bar,
        phase: eng.phase, overall: (eng.overall as Health) ?? "warn",
      },
      pillars, attention, lanes,
      discoveryDone: DISCIPLINES,
      roles: roles.length ? roles : FIXTURE.roles,
      jobs,
      failedRun,
      engagements,
      activeEngagementId: id,
      connectors: {
        figma_url: eng.figma_url ?? "",
        docs_provider: eng.docs_provider === "teams" ? "teams" : "confluence",
        confluence_space: eng.confluence_space ?? "", confluence_root_page_id: eng.confluence_root_page_id ?? "",
        atlassian_base_url: eng.atlassian_base_url ?? "", atlassian_email: eng.atlassian_email ?? "",
        teams_site: eng.teams_site ?? "",
        graph_tenant_id: eng.graph_tenant_id ?? "", graph_client_id: eng.graph_client_id ?? "",
        jira_project: eng.jira_project ?? "", jira_board_id: eng.jira_board_id ?? "",
        has_atlassian_token: Boolean(eng.atlassian_api_token), has_graph_secret: Boolean(eng.graph_client_secret),
      },
      repos: (repoRows ?? []).map((r) => ({
        id: r.id, key: r.key, name: r.name, url: r.url, area: r.area,
        default_branch: r.default_branch ?? "main", local_path: r.local_path ?? "",
        build_cmd: r.build_cmd ?? "", test_cmd: r.test_cmd ?? "",
      })),
      deliverables: deliverables.map((d) => ({ code: d.code, title: d.title, status: d.status })),
      epics: epicRows.map((e) => ({ id: e.id, title: e.title, discipline: e.discipline, stories: storyRows.filter((s) => s.epic_id === e.id).length, research: e.research_status ?? "none" })),
      metrics: (metricRows ?? []).map((m) => ({ id: m.id, epicId: m.epic_id ?? null, scope: m.scope ?? "", category: m.category ?? "", name: m.name ?? "", target: m.target ?? "", value: m.value ?? "" })),
      atlassianBase: eng.atlassian_base_url || process.env.ATLASSIAN_BASE_URL || "",
      activity: (activityRows ?? []).map((a) => ({ id: a.id, role: a.role ?? "", actor: a.actor ?? "", kind: a.kind ?? "", title: a.title ?? "", related: a.related ?? "", status: a.status ?? "done", created_at: a.created_at, run_id: a.run_id ?? null })),
      source: "supabase",
    };
  } catch {
    return { ...FIXTURE, source: "fixture" };
  }
}
