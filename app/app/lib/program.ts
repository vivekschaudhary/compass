import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase";
import { FIXTURE, ProgramModel, Health, Pillar, Attention, Lane, Epic, Phase, COMPASS_ROLES } from "./data";
import { PLATFORM_ROLES } from "./authz";
import { listEditablePaths } from "./specs";

const DISCIPLINES = ["Product", "Engineering", "QA", "Design"];
const LEAD: Record<string, string> = { Product: "Jen", Engineering: "Maria", QA: "Priya", Design: "Alex" };

// Read the engagement from Supabase and compute the model. Falls back to FIXTURE on any
// miss (unconfigured / empty / error) so the dashboard never white-screens.
export async function getProgram(engagementId?: string): Promise<ProgramModel & { source: "supabase" | "fixture" }> {
  const sb = supabaseAdmin();
  if (!sb) return { ...FIXTURE, source: "fixture" };

  try {
    const cookieStore = await cookies();
    // An explicit engagement id (e.g. from the URL) wins over the active-engagement cookie.
    const wanted = engagementId || cookieStore.get("compass_eng")?.value;
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
    const { data: milestoneRows } = await sb.from("milestone").select("*").eq("engagement_id", id).order("ord");
    const { data: questionRows } = await sb.from("agent_question").select("*").eq("engagement_id", id).eq("status", "open").order("ord");
    const deliverables = dels ?? [];
    const epicRows = epics ?? [];
    // Scope stories to THIS engagement's epics. The `story` fetch above is unfiltered (global), so
    // without this a warn/bad story from another engagement (e.g. the Acme fixture's KAN-112) leaks
    // into a brand-new engagement's "Needs attention" as a phantom "1 story slipping".
    const storyRows = (stories ?? []).filter((s) => epicRows.some((e) => e.id === s.epic_id));
    const storyIds = storyRows.map((s) => s.id);
    const { data: taskRows } = storyIds.length
      ? await sb.from("task").select("*").in("story_id", storyIds).order("ord")
      : { data: [] as { id: number; story_id: string; title: string; role: string | null; kind: string; done: boolean; ord: number }[] };
    const pendingCRs = (crs ?? []).filter((c) => c.status === "pending");
    const lateStories = storyRows.filter((s) => s.status === "warn" || s.status === "bad").length;

    // ── pillars, computed from the engagement row + counts ──────────────────
    // A brand-new engagement is UNMEASURED — don't paint it green. "Measured" means real
    // execution has happened, NOT merely that a backlog was seeded: intake now materializes a
    // Sprint 0 epic + stories at creation time, so `epicRows.length > 0` is true immediately on
    // a fresh SOW and can't stand in for "work has started". Gate on actual progress instead —
    // spend, a story/epic that moved off idle, or a resolved run.
    const started =
      (eng.cost_spent ?? 0) > 0 ||
      storyRows.some((s) => (s.status ?? "idle") !== "idle") ||
      epicRows.some((e) => (e.status ?? "idle") !== "idle") ||
      (runs ?? []).some((r) => r.status === "resolved");
    const costPct = Math.round((eng.cost_spent / Math.max(eng.cost_budget, 1)) * 100);
    const totalDel = deliverables.length || 5;
    const pillars: Pillar[] = started
      ? [
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
        ]
      : [
          { key: "cost", label: "Cost", status: "idle", headline: `$0k`, sub: `of $${Math.round(eng.cost_budget / 1000)}k · not started`, pct: 0, spark: [] },
          { key: "scope", label: "Scope", status: "idle", headline: `${totalDel}`, sub: `deliverables defined · not measured yet`, pct: 0, spark: [] },
          { key: "time", label: "Time", status: "idle", headline: `Kickoff`, sub: `${eng.months}-month program · not started`, pct: 0, spark: [] },
          { key: "quality", label: "Quality", status: "idle", headline: `—`, sub: `no acceptance measured yet`, pct: 0, spark: [] },
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
    // Process overrides that have fallen behind the tier below. ONE card, never one per file:
    // this is a delivery surface, and a configuration changelog here would drown the things that
    // actually threaten the engagement.
    const driftedSpecs = (await listEditablePaths(id)).filter((f) => f.drifted).length;
    if (driftedSpecs > 0) {
      attention.push({
        id: "spec-drift", pillar: "scope", tone: "warn",
        title: `${driftedSpecs} process file${driftedSpecs === 1 ? "" : "s"} behind the default`,
        detail: `This engagement overrides ${driftedSpecs} file${driftedSpecs === 1 ? "" : "s"} whose default has since changed. `
              + `Your version still runs — review what changed and keep or take it.`,
        actions: ["Review in Settings"],
      });
    }
    if (lateStories > 0) {
      attention.push({ id: "late", pillar: "time", tone: "warn", title: `Engineering — ${lateStories} ${lateStories === 1 ? "story" : "stories"} slipping`, detail: "Stories behind their phase target.", actions: ["See plan"] });
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

    // Platform roles are appended to the switcher, not stored on the roster: they are about
    // OPERATING Compass, not delivering the engagement. Keeping them out of `member` is what stops
    // a pmo-analyst appearing as a staffed person with a work queue and an agent — and it is why
    // they are absent from COMPASS_ROLES, which drives dispatch.
    //
    // In demo mode this picker is the whole identity story, so without them the org/engagement
    // tiering cannot be shown at all. Once real sign-in lands these come from the user's grants
    // and this block goes away.
    for (const p of PLATFORM_ROLES) {
      roles.push({
        id: `platform-${p.code}`, name: p.label, title: p.title,
        initials: p.label.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
        roleCode: p.code,
      });
    }

    // Real engagement (Supabase) → real data only. No FIXTURE fallback here, or the Acme demo's
    // jobs/failed-run leak into every fresh engagement (the "D3/D4/KAN-112" phantom cards).
    const realJobs = (jobRows ?? []).map((j) => ({ id: j.id, role: j.role, kind: j.kind, title: j.title, subtitle: j.subtitle, meta: j.meta ?? undefined, related: j.related ?? undefined, primary: j.primary_label ?? undefined, secondary: j.secondary_label ?? undefined, tone: j.tone ?? undefined }));

    // Surface a Build card for every story that's ready to build. A refined, unbuilt story owned by
    // a build role IS the build job — so it's derived here, not filed separately (the old flow had no
    // path to file build jobs for a real engagement, so nothing was buildable). Clicking Build runs
    // the real orchestrator against the repo and opens a PR (the HITL gate). Excludes stories that
    // already have a real job (e.g. an approval gate) or a completed build run, so a story that's
    // mid-gate or done doesn't re-offer Build; a failed build stays offered so it can be retried.
    const BUILD_ROLES = new Set(["engineer", "automation"]);
    const jobbedStories = new Set(realJobs.map((j) => j.related).filter(Boolean));
    const builtStories = new Set((runs ?? []).filter((r) => r.workflow === "build" && r.status === "resolved").map((r) => r.story));
    const buildJobs = storyRows
      .filter((s) => BUILD_ROLES.has(s.role) && (s.status ?? "idle") === "idle" && (s.acceptance ?? "").trim() && !jobbedStories.has(s.id) && !builtStories.has(s.id))
      .map((s) => ({
        id: `build-${s.id}`, role: s.role, kind: "build" as const,
        title: `Build — ${s.id} · ${s.title}`,
        subtitle: "Ready to build. Your engineer agent implements it against the repo, runs the checks, and opens a PR for your approval.",
        meta: s.estimate_pts ? `${s.estimate_pts}pt · ready` : "ready",
        related: s.id, primary: "Build", secondary: undefined, tone: undefined,
      }));
    // Sprint 0 · Foundation & Setup — the DM-owned kickoff backlog, seeded at intake as the `<id>-S0`
    // epic + one story per sprint-0.md row. Surface each open ticket as a job in its OWNING role's
    // queue (mostly delivery-manager; pm/architect for tickets 2–3) — its visible home. The story's
    // acceptance is "Done: <gate> · via <workflow>"; offer the workflow as the primary action.
    // Informational (no fake action button) — the Sprint 0 workflows (/create-product-brief, …) aren't
    // app-runnable yet; the card's job is to make the kickoff backlog VISIBLE in its owner's queue
    // and name the gate. `meta` carries the workflow that closes it.
    // Found by MARK, not by id: the epic's id is its Jira key when the tracker is wired, so
    // reconstructing `<id>-S0` matched only the un-wired fallback — the backlog went invisible in
    // this queue exactly when Jira worked. `kind` holds either way (018_sprint0_epic_kind.sql).
    const s0Epic = epicRows.find((e) => e.kind === "sprint-0") ?? epicRows.find((e) => e.id === `${id}-S0`);
    const sprint0Jobs = s0Epic
      ? storyRows
          .filter((s) => s.epic_id === s0Epic.id && (s.status ?? "idle") !== "done")
          .map((s) => {
            const wf = (s.acceptance ?? "").match(/via (\/[a-z-]+)/)?.[1];
            return {
              id: `s0-${s.id}`, role: s.role || "delivery-manager", kind: "deliver" as const,
              title: `Sprint 0 — ${s.title}`,
              subtitle: (s.acceptance ?? "Foundation setup ticket.").replace(/^Done:\s*/, "Done when: "),
              meta: wf ? `kickoff · ${wf}` : "kickoff", related: s.id,
              primary: undefined, secondary: undefined, tone: undefined,
            };
          })
      : [];

    // The agent-asks-questions primitive — every open question surfaces in the ASKING role's
    // jobs-to-do, answered inline with a structured pick/field. [agent-asks-structured-questions]
    // Roster-name questions ("who fills this role?") are the exception: they'd flood the DM queue
    // one-per-role, so they're bundled into a single "Staff the team" card per asking role.
    const isName = (q: { target?: { table?: string; column?: string } }) => q.target?.table === "member" && q.target?.column === "name";
    const nameRows = (questionRows ?? []).filter(isName);
    const otherRows = (questionRows ?? []).filter((q) => !isName(q));

    const questionJobs = otherRows.map((q) => ({
      id: `q-${q.id}`, role: q.role || "delivery-manager", kind: "question" as const,
      title: q.prompt, subtitle: q.because ?? "The agent needs this to proceed.",
      meta: "needs answer", related: q.related ?? undefined, tone: "warn" as const,
      question: { id: q.id, key: q.key, type: q.type, options: q.options ?? undefined, target: q.target },
    }));

    // one grouped staffing card per asking role (usually just the DM)
    const nameByRole = new Map<string, typeof nameRows>();
    for (const q of nameRows) { const r = q.role || "delivery-manager"; nameByRole.set(r, [...(nameByRole.get(r) ?? []), q]); }
    const staffingJobs = [...nameByRole.entries()].map(([role, rows]) => ({
      id: `staffing-${id}-${role}`, role, kind: "staffing" as const,
      title: "Staff the team",
      subtitle: `${rows.length} role${rows.length === 1 ? "" : "s"} unnamed — assign a person to each, or skip to staff later.`,
      meta: "needs answer", tone: "warn" as const,
      staffing: rows.map((q) => {
        const m = (mems ?? []).find((x) => x.id === q.target?.id);
        return { id: q.id, role: m?.role ?? "", title: m?.title ?? (q.prompt ?? "").replace(/^Who is the |\?.*$/g, "") };
      }),
    }));

    const jobs = [...realJobs, ...buildJobs, ...sprint0Jobs, ...questionJobs, ...staffingJobs];

    const run = runs?.[0];
    const failedRun = run
      ? { runId: run.id, role: run.role, story: run.story, failedStep: run.failed_step, error: run.error, diagnosis: run.diagnosis, fix: run.fix, resumeFrom: run.resume_from }
      : { runId: "", role: "", story: "", failedStep: "", error: "", diagnosis: "", fix: "", resumeFrom: "" };

    return {
      program: {
        name: eng.name, sow: eng.sow, client: eng.client, pricing: eng.pricing,
        budget: eng.budget, months: eng.months, qualityBar: eng.quality_bar,
        phase: eng.phase, overall: started ? ((eng.overall as Health) ?? "warn") : "idle",
      },
      pillars, attention, lanes,
      // Only disciplines whose Discovery is ACTUALLY complete — at least one Discovery epic present
      // and all on-track. Don't hardcode all disciplines (that painted a phantom "✓ done" on every
      // fresh SOW, which has no Discovery epics at all).
      discoveryDone: DISCIPLINES.filter((disc) => {
        const discovery = epicRows.filter((e) => e.discipline === disc && (e.phase as Phase) === "Discovery");
        return discovery.length > 0 && discovery.every((e) => e.status === "good");
      }),
      roles,
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
      storyList: storyRows
        .filter((s) => epicRows.some((e) => e.id === s.epic_id))
        .map((s) => ({ id: s.id, epicId: s.epic_id, title: s.title, role: s.role ?? null, status: s.status ?? "idle" })),
      tasks: (taskRows ?? []).map((t) => ({ id: t.id, storyId: t.story_id, title: t.title, role: t.role ?? null, kind: (t.kind === "ac" ? "ac" : "task") as "task" | "ac", done: !!t.done, ord: t.ord ?? 0 })),
      metrics: (metricRows ?? []).map((m) => ({ id: m.id, epicId: m.epic_id ?? null, scope: m.scope ?? "", category: m.category ?? "", name: m.name ?? "", target: m.target ?? "", value: m.value ?? "" })),
      milestones: (milestoneRows ?? []).map((m) => ({ id: m.id, code: m.code ?? "", title: m.title ?? "", timeframe: m.timeframe ?? "", detail: m.detail ?? "" })),
      atlassianBase: eng.atlassian_base_url || process.env.ATLASSIAN_BASE_URL || "",
      activity: (activityRows ?? []).map((a) => ({ id: a.id, role: a.role ?? "", actor: a.actor ?? "", kind: a.kind ?? "", title: a.title ?? "", related: a.related ?? "", status: a.status ?? "done", created_at: a.created_at, run_id: a.run_id ?? null })),
      source: "supabase",
    };
  } catch {
    return { ...FIXTURE, source: "fixture" };
  }
}
