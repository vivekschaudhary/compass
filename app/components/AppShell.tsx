"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProgramModel } from "@/app/lib/data";
import { Sidebar } from "./Sidebar";
import { FourPillarHero } from "./FourPillarHero";
import { NeedsAttention } from "./NeedsAttention";
import { PlanGrid } from "./PlanGrid";
import { AssistantDock } from "./AssistantDock";
import { JobsQueue } from "./JobsQueue";
import { ActivityLog } from "./ActivityLog";
import { Metrics } from "./Metrics";
import { runStreamed } from "@/app/lib/exec-client";

type View = "dashboard" | "jobs" | "activity" | "metrics";
// PM + Delivery Manager get the cross-role, all-users program history.
const OVERSIGHT_ROLES = ["pm", "delivery-manager"];

type Model = ProgramModel & { source: "supabase" | "fixture" };

function RoleSwitcher({ roles, roleId, setRoleId }: { roles: ProgramModel["roles"]; roleId: string; setRoleId: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const role = roles.find((r) => r.id === roleId) ?? roles[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[13px] hover:bg-shell"
      >
        <span className="grid size-6 place-items-center rounded-full bg-brand-weak text-[10.5px] font-semibold text-brand-ink">{role.initials}</span>
        <span className="text-faint">Viewing as</span>
        <span className="font-medium text-ink">{role.name.split(" ")[0]} · {role.title}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-faint"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-60 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-lg shadow-black/5">
          {roles.map((r) => (
            <button
              key={r.id}
              onMouseDown={() => { setRoleId(r.id); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-shell ${r.id === roleId ? "bg-shell/60" : ""}`}
            >
              <span className="grid size-7 place-items-center rounded-full bg-brand-weak text-[11px] font-semibold text-brand-ink">{r.initials}</span>
              <span className="leading-tight">
                <span className="block font-medium text-ink">{r.name}</span>
                <span className="block text-[11.5px] text-muted">{r.title}</span>
              </span>
              {r.id === roleId && <span className="ml-auto text-brand">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EngagementSwitcher({ engagements, activeId, name }: { engagements: ProgramModel["engagements"]; activeId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  function pick(id: string) {
    document.cookie = `compass_eng=${id}; path=/; max-age=31536000`;
    setOpen(false);
    router.refresh();
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)} className="flex items-center gap-1.5 rounded-md hover:bg-shell/60">
        <h1 className="text-[19px] font-semibold text-ink">{name}</h1>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-faint"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-lg shadow-black/5">
          <div className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Engagements</div>
          {engagements.map((e) => (
            <button key={e.id} onMouseDown={() => pick(e.id)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-shell ${e.id === activeId ? "bg-shell/60" : ""}`}>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{e.name}</span>
              <span className="mono text-[11px] text-faint">{e.sow}</span>
              {e.id === activeId && <span className="text-brand">✓</span>}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <a href="/new" className="flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-brand hover:bg-shell">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            New engagement
          </a>
        </div>
      )}
    </div>
  );
}

// Live step log for a running AI action — the streamed execution, cockpit-style.
function ExecLog({ log }: { log: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [log]);
  if (!log) return null;
  return (
    <div className="mt-3 overflow-hidden rounded-tile border border-line">
      <div className="flex items-center gap-2 border-b border-line bg-ink px-3 py-1.5">
        <span className="inline-block size-1.5 rounded-pill bg-good pulse-dot" />
        <span className="text-[10.5px] font-medium text-white/90">execution</span>
      </div>
      <pre ref={ref} className="mono max-h-48 overflow-y-auto bg-[#0e1420] px-3 py-2 text-[10.5px] leading-relaxed text-[#c8cdd6] whitespace-pre-wrap">{log}</pre>
    </div>
  );
}

export function AppShell({ model }: { model: Model }) {
  const { program, pillars, attention, lanes, discoveryDone, roles, failedRun, engagements, activeEngagementId, deliverables, epics } = model;
  const [roleId, setRoleId] = useState(roles.find((r) => r.roleCode === "eng")?.id ?? roles[0]?.id);
  const [dockOpen, setDockOpen] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const role = roles.find((r) => r.id === roleId) ?? roles[0];
  const canSeeHistory = OVERSIGHT_ROLES.includes(role?.roleCode ?? "");

  const [decomposing, setDecomposing] = useState(false);
  const [execLog, setExecLog] = useState(""); // live step log for the running AI action's modal
  const [betOpen, setBetOpen] = useState(false);
  const [betTitle, setBetTitle] = useState("");
  const [betBrief, setBetBrief] = useState("");
  const [betDel, setBetDel] = useState("");
  const [creatingBet, setCreatingBet] = useState(false);
  const [betErr, setBetErr] = useState<string | null>(null);

  const [triageOpen, setTriageOpen] = useState(false);
  const [trTitle, setTrTitle] = useState("");
  const [trDesc, setTrDesc] = useState("");
  const [triaging, setTriaging] = useState(false);
  const [trErr, setTrErr] = useState<string | null>(null);
  const [trResult, setTrResult] = useState<{ key: string; severity: string; area: string; recommendation: string } | null>(null);

  async function onTriage() {
    if (!trTitle.trim()) { setTrErr("Describe the issue first."); return; }
    setTriaging(true); setTrErr(null); setExecLog("");
    try {
      const j = await runStreamed<{ ok?: boolean; key?: string; severity?: string; area?: string; recommendation?: string }>("/api/triage", { engagementId: activeEngagementId, title: trTitle, description: trDesc, actor: role?.name }, setExecLog);
      if (!j.ok) { setTrErr("Triage failed — see the log."); return; }
      setTrResult({ key: j.key ?? "", severity: j.severity ?? "", area: j.area ?? "", recommendation: j.recommendation ?? "" });
      setTrTitle(""); setTrDesc("");
      router.refresh();
    } catch (e) {
      setTrErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setTriaging(false);
    }
  }

  // Product Owner — add a story under an epic (title · points · acceptance)
  const [storyOpen, setStoryOpen] = useState(false);
  const [storyEpic, setStoryEpic] = useState("");
  const [storyTitle, setStoryTitle] = useState("");
  const [storyPts, setStoryPts] = useState("");
  const [storyAcc, setStoryAcc] = useState("");
  const [creatingStory, setCreatingStory] = useState(false);
  const [storyErr, setStoryErr] = useState<string | null>(null);

  async function onCreateStory(keepOpen: boolean) {
    if (!storyEpic) { setStoryErr("Pick an epic to add the story to."); return; }
    if (!storyTitle.trim()) { setStoryErr("Give the story a title."); return; }
    setCreatingStory(true); setStoryErr(null); setExecLog("");
    try {
      const r = await runStreamed<{ ok?: boolean }>("/api/story", { engagementId: activeEngagementId, epicId: storyEpic, title: storyTitle, points: storyPts ? Number(storyPts) : 0, acceptance: storyAcc, actor: role?.name }, setExecLog);
      if (!r.ok) { setStoryErr("Could not add the story — see the log."); return; }
      setStoryTitle(""); setStoryPts(""); setStoryAcc("");
      if (!keepOpen) setStoryOpen(false);
      router.refresh();
    } catch (e) { setStoryErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setCreatingStory(false); }
  }

  // Product Owner — sprint review / demo
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<null | { phase: string; delivered: { id: string; title: string; pts: number }[]; deliveredPts: number; totalStories: number; inProgress: number; next: { id: string; title: string; pts: number }[]; pillars: Record<string, string> }>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  async function onSprintReview() {
    setReviewOpen(true); setReviewLoading(true); setReview(null);
    try {
      const res = await fetch(`/api/sprint-review?engagementId=${encodeURIComponent(activeEngagementId)}`);
      const j = await res.json();
      if (j.ok) setReview(j.review);
    } finally { setReviewLoading(false); }
  }

  // Researcher — run the research workflow on an epic
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchEpic, setResearchEpic] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchErr, setResearchErr] = useState<string | null>(null);
  const [researchUrl, setResearchUrl] = useState<string | null>(null);

  async function doRunResearch() {
    if (!researchEpic) { setResearchErr("Pick an epic to research."); return; }
    setResearching(true); setResearchErr(null); setResearchUrl(null); setExecLog("");
    try {
      const r = await runStreamed<{ ok?: boolean; url?: string | null }>("/api/research", { engagementId: activeEngagementId, epicId: researchEpic, actor: role?.name }, setExecLog);
      if (!r.ok) { setResearchErr("Research failed — see the log."); return; }
      setResearchUrl(r.url ?? null);
      router.refresh();
    } catch (e) { setResearchErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setResearching(false); }
  }

  // Product Owner — refine from approved research (propose → accept)
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineEpic, setRefineEpic] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineErr, setRefineErr] = useState<string | null>(null);
  const [proposals, setProposals] = useState<{ title: string; acceptance?: string; points?: number }[] | null>(null);
  const [sel, setSel] = useState<boolean[]>([]);
  const approvedEpics = epics.filter((e) => e.research === "approved");

  async function doPropose() {
    if (!refineEpic) { setRefineErr("Pick an epic with approved research."); return; }
    setRefining(true); setRefineErr(null); setProposals(null); setExecLog("");
    try {
      const r = await runStreamed<{ ok?: boolean; proposals?: { title: string; acceptance?: string; points?: number }[] }>("/api/refine", { engagementId: activeEngagementId, epicId: refineEpic, mode: "propose" }, setExecLog);
      if (!r.ok) { setRefineErr("Could not propose — see the log."); return; }
      setProposals(r.proposals ?? []); setSel((r.proposals ?? []).map(() => true));
    } catch (e) { setRefineErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setRefining(false); }
  }
  async function doAcceptRefine() {
    const picked = (proposals ?? []).filter((_, i) => sel[i]);
    if (!picked.length) { setRefineErr("Select at least one story."); return; }
    setRefining(true); setRefineErr(null); setExecLog("");
    try {
      const r = await runStreamed<{ ok?: boolean; created?: number }>("/api/refine", { engagementId: activeEngagementId, epicId: refineEpic, mode: "accept", stories: picked, actor: role?.name }, setExecLog);
      if (!r.ok) { setRefineErr("Could not add the stories — see the log."); return; }
      setRefineOpen(false); setProposals(null);
      router.refresh();
    } catch (e) { setRefineErr(e instanceof Error ? e.message : "Request failed"); }
    finally { setRefining(false); }
  }

  async function onCreateBet() {
    if (!betTitle.trim()) { setBetErr("Give the epic a title."); return; }
    setCreatingBet(true); setBetErr(null); setExecLog("");
    try {
      const r = await runStreamed<{ ok?: boolean }>("/api/bet", { engagementId: activeEngagementId, title: betTitle, brief: betBrief, deliverableCode: betDel || undefined, actor: role?.name }, setExecLog);
      if (!r.ok) { setBetErr("Could not create the epic — see the log."); return; }
      setBetOpen(false); setBetTitle(""); setBetBrief(""); setBetDel("");
      router.refresh();
    } catch (e) {
      setBetErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setCreatingBet(false);
    }
  }

  async function onAction(jobId: string, which: "primary" | "secondary") {
    setBusy(jobId);
    try {
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action: which, actor: role?.name }),
      });
      router.refresh(); // re-runs getProgram() on the server → board + queue update
    } finally {
      setBusy(null);
    }
  }

  async function onDecompose() {
    setDecomposing(true);
    try {
      await fetch("/api/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId: activeEngagementId, actor: role?.name }),
      });
      router.refresh();
    } finally {
      setDecomposing(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} program={program} view={view} setView={setView} onExecutionHelp={() => setDockOpen(true)} />

      <div className="flex min-w-0 flex-1">
        <main className="flex-1 overflow-y-auto">
          <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-shell/85 px-6 py-4 backdrop-blur">
            <div>
              <div className="flex items-center gap-2.5">
                <EngagementSwitcher engagements={engagements} activeId={activeEngagementId} name={program.name} />
                <span className="mono rounded-pill bg-card px-2 py-0.5 text-[11.5px] text-muted ring-1 ring-line">{program.sow}</span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11px] font-medium ${model.source === "supabase" ? "bg-good-weak text-good" : "bg-shell text-faint"}`}
                  title={model.source === "supabase" ? "Reading from Supabase" : "Seed fixture — add Supabase keys to go live"}
                >
                  <span className={`inline-block size-1.5 rounded-pill ${model.source === "supabase" ? "bg-good pulse-dot" : "bg-faint"}`} />
                  {model.source === "supabase" ? "live · Supabase" : "seed data"}
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted">
                {program.phase} · updated just now
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!dockOpen && (
                <button onClick={() => setDockOpen(true)} className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[13px] font-medium text-body hover:bg-shell">
                  <span className="inline-block size-1.5 rounded-pill bg-bad pulse-dot" />
                  Execution help
                </button>
              )}
              {role && <RoleSwitcher roles={roles} roleId={roleId!} setRoleId={setRoleId} />}
            </div>
          </header>

          <div className="mx-auto flex max-w-[880px] flex-col gap-4 px-6 py-6">
            {view === "metrics" ? (
              <Metrics model={model} />
            ) : view === "activity" && canSeeHistory ? (
              <ActivityLog activity={model.activity} atlassianBase={model.atlassianBase} />
            ) : view === "dashboard" || (view === "activity" && !canSeeHistory) ? (
              <>
                <FourPillarHero program={program} pillars={pillars} />
                <NeedsAttention attention={attention} />
                <PlanGrid lanes={lanes} discoveryDone={discoveryDone} />
              </>
            ) : (
              role && <JobsQueue role={role} jobs={model.jobs} onGetHelp={() => setDockOpen(true)} onAction={onAction} busy={busy}
                onCreateBet={() => { setBetErr(null); setBetOpen(true); }} onDecompose={onDecompose}
                onTriage={() => { setTrErr(null); setTrResult(null); setTriageOpen(true); }} decomposing={decomposing} activity={model.activity}
                onCreateStory={() => { setStoryErr(null); setStoryEpic(epics[0]?.id ?? ""); setStoryOpen(true); }} onSprintReview={onSprintReview} atlassianBase={model.atlassianBase}
                onRunResearch={() => { setResearchErr(null); setResearchUrl(null); setResearchEpic(epics[0]?.id ?? ""); setResearchOpen(true); }}
                onRefine={() => { setRefineErr(null); setProposals(null); setRefineEpic(approvedEpics[0]?.id ?? ""); setRefineOpen(true); }} />
            )}
          </div>
        </main>

        {dockOpen && role && (
          <div className="fixed inset-y-0 right-0 z-30 w-full max-w-[340px] lg:static lg:z-auto lg:max-w-none">
            <AssistantDock role={role} failedRun={failedRun} onClose={() => setDockOpen(false)} />
          </div>
        )}
      </div>

      {betOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onMouseDown={() => !creatingBet && setBetOpen(false)}>
          <div className="w-full max-w-[480px] rounded-card border border-line bg-card p-5 shadow-xl shadow-black/10" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[15.5px] font-semibold text-ink">Create an epic</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">Your PM agent turns a brief into an epic + functional stories, added to the backlog.</p>
              </div>
              <button onClick={() => setBetOpen(false)} className="text-[13px] text-muted hover:text-ink">✕</button>
            </div>

            <label className="mt-4 block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Epic title</span>
              <input autoFocus value={betTitle} onChange={(e) => setBetTitle(e.target.value)} placeholder="e.g. Recurring-spend alerts"
                className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
            </label>
            <label className="mt-3 block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Brief</span>
              <textarea value={betBrief} onChange={(e) => setBetBrief(e.target.value)} rows={4} placeholder="The problem, who it's for, and the outcome. A few sentences is enough."
                className="mt-1 w-full resize-none rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
            </label>
            <label className="mt-3 block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Grounds to deliverable (optional)</span>
              <select value={betDel} onChange={(e) => setBetDel(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
                <option value="">— none —</option>
                {deliverables.map((d) => <option key={d.code} value={d.code}>{d.code} · {d.title}</option>)}
              </select>
            </label>

            <ExecLog log={execLog} />
            {betErr && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{betErr}</p>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setBetOpen(false)} disabled={creatingBet} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">Cancel</button>
              <button onClick={onCreateBet} disabled={creatingBet} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {creatingBet ? (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg> PM agent drafting…</>) : "Create epic"}
              </button>
            </div>
          </div>
        </div>
      )}

      {triageOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onMouseDown={() => !triaging && setTriageOpen(false)}>
          <div className="w-full max-w-[480px] rounded-card border border-line bg-card p-5 shadow-xl shadow-black/10" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[15.5px] font-semibold text-ink">Triage an issue</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">The triage agent classifies it (type · severity · area) and files a routed Jira issue.</p>
              </div>
              <button onClick={() => setTriageOpen(false)} className="text-[13px] text-muted hover:text-ink">✕</button>
            </div>

            {trResult ? (
              <div className="mt-4 rounded-tile border border-good-line bg-good-weak/50 p-4">
                <div className="text-[13.5px] font-semibold text-ink">Filed <span className="mono">{trResult.key}</span></div>
                <div className="mt-1 text-[12.5px] text-body">Severity <span className="font-medium">{trResult.severity}</span> · Area <span className="font-medium">{trResult.area}</span> · <span className="font-medium">{trResult.recommendation}</span></div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setTrResult(null)} className="rounded-lg border border-line bg-card px-3 py-1.5 text-[12.5px] font-medium text-body hover:bg-shell">Triage another</button>
                  <button onClick={() => setTriageOpen(false)} className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-muted hover:text-ink">Done</button>
                </div>
              </div>
            ) : (
              <>
                <label className="mt-4 block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Issue</span>
                  <input autoFocus value={trTitle} onChange={(e) => setTrTitle(e.target.value)} placeholder="e.g. CSV import drops rows with negative amounts"
                    className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
                </label>
                <label className="mt-3 block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Details (optional)</span>
                  <textarea value={trDesc} onChange={(e) => setTrDesc(e.target.value)} rows={3} placeholder="Steps, impact, where it happens…"
                    className="mt-1 w-full resize-none rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
                </label>
                <ExecLog log={execLog} />
                {trErr && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{trErr}</p>}
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button onClick={() => setTriageOpen(false)} disabled={triaging} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">Cancel</button>
                  <button onClick={onTriage} disabled={triaging} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {triaging ? (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg> Triaging…</>) : "Triage & file"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {storyOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onMouseDown={() => !creatingStory && setStoryOpen(false)}>
          <div className="w-full max-w-[480px] rounded-card border border-line bg-card p-5 shadow-xl shadow-black/10" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[15.5px] font-semibold text-ink">Add a story</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">Add a functional story under an epic. Points come from refinement (offline).</p>
              </div>
              <button onClick={() => setStoryOpen(false)} className="text-[13px] text-muted hover:text-ink">✕</button>
            </div>
            <label className="mt-4 block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Epic</span>
              <select value={storyEpic} onChange={(e) => setStoryEpic(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
                {epics.length === 0 && <option value="">— no epics yet —</option>}
                {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.id} · {ep.title} · {ep.stories} {ep.stories === 1 ? "story" : "stories"}</option>)}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Story title</span>
              <input autoFocus value={storyTitle} onChange={(e) => setStoryTitle(e.target.value)} placeholder="As a user, I can …"
                className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
            </label>
            <label className="mt-3 block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Acceptance criteria</span>
              <textarea value={storyAcc} onChange={(e) => setStoryAcc(e.target.value)} rows={3} placeholder="Given / when / then — what must be true for this to be done."
                className="mt-1 w-full resize-none rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
            </label>
            <label className="mt-3 block w-32">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Points (optional)</span>
              <input value={storyPts} onChange={(e) => setStoryPts(e.target.value.replace(/[^0-9]/g, ""))} placeholder="—" inputMode="numeric"
                className="mono mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand" />
            </label>
            <ExecLog log={execLog} />
            {storyErr && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{storyErr}</p>}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setStoryOpen(false)} disabled={creatingStory} className="mr-auto rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">Cancel</button>
              <button onClick={() => onCreateStory(true)} disabled={creatingStory} className="rounded-lg border border-line bg-card px-3 py-2 text-[13px] font-medium text-body hover:bg-shell disabled:opacity-40">{creatingStory ? "Adding…" : "Create & add another"}</button>
              <button onClick={() => onCreateStory(false)} disabled={creatingStory} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {creatingStory ? "Adding…" : "Create story"}
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onMouseDown={() => setReviewOpen(false)}>
          <div className="w-full max-w-[560px] rounded-card border border-line bg-card p-5 shadow-xl shadow-black/10" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[15.5px] font-semibold text-ink">Sprint review · {program.name}</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">{review?.phase ?? "End-of-sprint demo — delivered, pillars, next focus."}</p>
              </div>
              <button onClick={() => setReviewOpen(false)} className="text-[13px] text-muted hover:text-ink">✕</button>
            </div>
            {reviewLoading || !review ? (
              <p className="mt-6 text-center text-[12.5px] text-muted">Assembling the review…</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Delivered · {review.delivered.length} of {review.totalStories} · {review.deliveredPts} pts</div>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {review.delivered.length === 0 && <p className="text-[12.5px] text-muted">Nothing accepted yet this sprint.</p>}
                    {review.delivered.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-[12.5px]">
                        <span className="inline-block size-1.5 rounded-pill bg-good" />
                        <span className="min-w-0 flex-1 truncate text-body">{s.title}</span>
                        <span className="mono text-[11px] text-faint">{s.id}</span>
                        {s.pts > 0 && <span className="tnum text-[11px] text-muted">{s.pts}pt</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Four-pillar snapshot</div>
                  <div className="mt-1.5 grid grid-cols-2 gap-2 text-[12px]">
                    {Object.entries(review.pillars).map(([k, v]) => (
                      <div key={k} className="rounded-tile border border-line bg-shell/40 px-3 py-2"><span className="text-faint capitalize">{k}</span><div className="mt-0.5 text-body">{v}</div></div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Next focus · {review.next.length}</div>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {review.next.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-[12.5px]">
                        <span className="inline-block size-1.5 rounded-pill bg-faint" />
                        <span className="min-w-0 flex-1 truncate text-body">{s.title}</span>
                        <span className="mono text-[11px] text-faint">{s.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {researchOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onMouseDown={() => !researching && setResearchOpen(false)}>
          <div className="w-full max-w-[460px] rounded-card border border-line bg-card p-5 shadow-xl shadow-black/10" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[15.5px] font-semibold text-ink">Run research</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">Reads the product brief and drafts a research doc into {model.connectors.docs_provider === "teams" ? "Teams/SharePoint" : "Confluence"} — the PM approves it before refinement.</p>
              </div>
              <button onClick={() => setResearchOpen(false)} className="text-[13px] text-muted hover:text-ink">✕</button>
            </div>
            <label className="mt-4 block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Epic</span>
              <select value={researchEpic} onChange={(e) => setResearchEpic(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
                {epics.length === 0 && <option value="">— no epics yet —</option>}
                {epics.map((ep) => <option key={ep.id} value={ep.id}>{ep.id} · {ep.title}{ep.research !== "none" ? ` · research ${ep.research}` : ""}</option>)}
              </select>
            </label>
            <ExecLog log={execLog} />
            {researchErr && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{researchErr}</p>}
            {researchUrl !== null && !researchErr && (
              <p className="mt-3 rounded-lg border border-good-line bg-good-weak/50 px-3 py-2 text-[12px] text-good">Draft created — sent to the PM for approval.{researchUrl && <> · <a href={researchUrl} target="_blank" rel="noreferrer" className="underline">open doc ↗</a></>}</p>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setResearchOpen(false)} disabled={researching} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">{researchUrl !== null ? "Done" : "Cancel"}</button>
              <button onClick={doRunResearch} disabled={researching} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {researching ? (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg> Research agent drafting…</>) : "Run research"}
              </button>
            </div>
          </div>
        </div>
      )}

      {refineOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onMouseDown={() => !refining && setRefineOpen(false)}>
          <div className="w-full max-w-[520px] rounded-card border border-line bg-card p-5 shadow-xl shadow-black/10" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[15.5px] font-semibold text-ink">Refine from research</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">Propose new build stories from the approved research. You accept — nothing is overwritten.</p>
              </div>
              <button onClick={() => setRefineOpen(false)} className="text-[13px] text-muted hover:text-ink">✕</button>
            </div>

            {approvedEpics.length === 0 ? (
              <p className="mt-4 rounded-tile border border-dashed border-line bg-shell/40 px-4 py-6 text-center text-[12.5px] text-muted">No epics with <span className="font-medium">approved research</span> yet. Run research and have the PM approve it first.</p>
            ) : (
              <>
                <label className="mt-4 block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-faint">Epic (research approved)</span>
                  <select value={refineEpic} onChange={(e) => { setRefineEpic(e.target.value); setProposals(null); }} className="mt-1 w-full rounded-lg border border-line bg-shell/40 px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
                    {approvedEpics.map((ep) => <option key={ep.id} value={ep.id}>{ep.id} · {ep.title}</option>)}
                  </select>
                </label>

                <ExecLog log={execLog} />
                {proposals === null ? (
                  <div className="mt-4 flex items-center justify-end gap-2">
                    <button onClick={() => setRefineOpen(false)} disabled={refining} className="rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">Cancel</button>
                    <button onClick={doPropose} disabled={refining} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                      {refining ? (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin"><path d="M12 3a9 9 0 1 0 9 9" /></svg> Reading research…</>) : "Propose stories"}
                    </button>
                  </div>
                ) : proposals.length === 0 ? (
                  <p className="mt-4 rounded-tile border border-dashed border-line bg-shell/40 px-4 py-6 text-center text-[12.5px] text-muted">The research didn&apos;t surface new stories beyond what&apos;s there. Nothing to add.</p>
                ) : (
                  <>
                    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                      {proposals.map((p, i) => (
                        <label key={i} className="flex cursor-pointer items-start gap-2.5 rounded-tile border border-line p-3 hover:bg-shell/40">
                          <input type="checkbox" checked={sel[i] ?? false} onChange={(e) => setSel(sel.map((v, j) => (j === i ? e.target.checked : v)))} className="mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2"><span className="text-[13px] font-medium text-ink">{p.title}</span>{p.points ? <span className="tnum text-[11px] text-muted">{p.points}pt</span> : null}</span>
                            {p.acceptance && <span className="mt-0.5 block text-[12px] leading-snug text-muted">{p.acceptance}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                    {refineErr && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{refineErr}</p>}
                    <div className="mt-4 flex items-center justify-end gap-2">
                      <button onClick={() => setProposals(null)} disabled={refining} className="mr-auto rounded-lg px-3 py-2 text-[13px] font-medium text-muted hover:text-ink disabled:opacity-40">← Back</button>
                      <button onClick={doAcceptRefine} disabled={refining} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                        {refining ? "Adding…" : `Accept ${sel.filter(Boolean).length} ${sel.filter(Boolean).length === 1 ? "story" : "stories"}`}
                      </button>
                    </div>
                  </>
                )}
                {refineErr && proposals === null && <p className="mt-3 rounded-lg border border-bad-weak bg-bad-weak/50 px-3 py-2 text-[12px] text-bad">{refineErr}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
