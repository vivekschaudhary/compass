"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProgramModel } from "@/app/lib/data";
import { useUrlState } from "@/app/lib/useUrlState";
import { Sidebar } from "./Sidebar";
import { FourPillarHero } from "./FourPillarHero";
import { NeedsAttention } from "./NeedsAttention";
import { PlanGrid } from "./PlanGrid";
import { AssistantDock } from "./AssistantDock";
import { JobsQueue } from "./JobsQueue";
import { ActivityLog } from "./ActivityLog";
import { Metrics } from "./Metrics";
import { Playbook } from "./Playbook";
import { RoleSwitcher } from "./RoleSwitcher";
import { EngagementSwitcher } from "./EngagementSwitcher";
import { BetModal } from "./modals/BetModal";
import { TriageModal } from "./modals/TriageModal";
import { StoryModal } from "./modals/StoryModal";
import { SprintReviewModal } from "./modals/SprintReviewModal";
import { ResearchModal } from "./modals/ResearchModal";
import { WorkflowModal } from "./modals/WorkflowModal";
import { RefineModal } from "./modals/RefineModal";

type View = "dashboard" | "jobs" | "playbook" | "activity" | "metrics";
const VIEWS: View[] = ["dashboard", "jobs", "playbook", "activity", "metrics"];
// PM + Delivery Manager get the cross-role, all-users program history.
const OVERSIGHT_ROLES = ["pm", "delivery-manager"];

type Model = ProgramModel & { source: "supabase" | "fixture" };
// which action modal is open — a plain string, or the workflow runner keyed by its workflow
type ModalState = null | "bet" | "triage" | "story" | "review" | "research" | "refine" | { workflow: string };

export function AppShell({ model }: { model: Model }) {
  const { program, pillars, attention, lanes, discoveryDone, roles, failedRun, engagements, activeEngagementId, deliverables, epics, storyList } = model;
  const router = useRouter();
  const { params, set } = useUrlState();

  // view + role are URL state → every screen is deep-linkable
  const view: View = (VIEWS.includes(params.get("view") as View) ? params.get("view") : "dashboard") as View;
  const roleParam = params.get("role");
  const role = roles.find((r) => r.roleCode === roleParam) ?? roles.find((r) => r.roleCode === "engineer") ?? roles[0];
  const canSeeHistory = OVERSIGHT_ROLES.includes(role?.roleCode ?? "");
  const providerLabel = model.connectors.docs_provider === "teams" ? "Teams/SharePoint" : "Confluence";

  const [dockOpen, setDockOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [decomposing, setDecomposing] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const close = () => setModal(null);
  const onDone = () => router.refresh();
  const ctx = { engagementId: activeEngagementId, actor: role?.name, onDone };

  async function onAction(jobId: string, which: "primary" | "secondary") {
    setBusy(jobId);
    try {
      await fetch("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, action: which, actor: role?.name }) });
      router.refresh();
    } finally { setBusy(null); }
  }
  async function onDecompose() {
    setDecomposing(true);
    try {
      await fetch("/api/decompose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ engagementId: activeEngagementId, actor: role?.name }) });
      router.refresh();
    } finally { setDecomposing(false); }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={role} program={program} view={view} setView={(v) => set({ view: v === "dashboard" ? null : v })} onExecutionHelp={() => setDockOpen(true)} />

      <div className="flex min-w-0 flex-1">
        <main className="flex-1 overflow-y-auto">
          <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-shell/85 px-6 py-4 backdrop-blur">
            <div>
              <div className="flex items-center gap-2.5">
                <EngagementSwitcher engagements={engagements} activeId={activeEngagementId} name={program.name} />
                <span className="mono rounded-pill bg-card px-2 py-0.5 text-[11.5px] text-muted ring-1 ring-line">{program.sow}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11px] font-medium ${model.source === "supabase" ? "bg-good-weak text-good" : "bg-shell text-faint"}`}
                  title={model.source === "supabase" ? "Reading from Supabase" : "Seed fixture — add Supabase keys to go live"}>
                  <span className={`inline-block size-1.5 rounded-pill ${model.source === "supabase" ? "bg-good pulse-dot" : "bg-faint"}`} />
                  {model.source === "supabase" ? "live · Supabase" : "seed data"}
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted">{program.phase} · updated just now</p>
            </div>
            <div className="flex items-center gap-2">
              {!dockOpen && (
                <button onClick={() => setDockOpen(true)} className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[13px] font-medium text-body hover:bg-shell">
                  <span className="inline-block size-1.5 rounded-pill bg-bad pulse-dot" />
                  Execution help
                </button>
              )}
              {role && <RoleSwitcher roles={roles} roleId={role.id} setRole={(rc) => set({ role: rc })} />}
            </div>
          </header>

          <div className="mx-auto flex max-w-[880px] flex-col gap-4 px-6 py-6">
            {view === "metrics" ? (
              <Metrics model={model} />
            ) : view === "playbook" ? (
              <Playbook storyList={storyList} />
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
                onCreateBet={() => setModal("bet")} onDecompose={onDecompose}
                onTriage={() => setModal("triage")} decomposing={decomposing} activity={model.activity}
                onCreateStory={() => setModal("story")} onSprintReview={() => setModal("review")} atlassianBase={model.atlassianBase}
                onRunResearch={() => setModal("research")} onRunWorkflow={(key) => setModal({ workflow: key })}
                onRefine={() => setModal("refine")} />
            )}
          </div>
        </main>

        {dockOpen && role && (
          <div className="fixed inset-y-0 right-0 z-30 w-full max-w-[340px] lg:static lg:z-auto lg:max-w-none">
            <AssistantDock role={role} failedRun={failedRun} onClose={() => setDockOpen(false)} />
          </div>
        )}
      </div>

      {/* action modals — each self-contained (own state + streamed run) */}
      <BetModal open={modal === "bet"} onClose={close} {...ctx} deliverables={deliverables} />
      <TriageModal open={modal === "triage"} onClose={close} {...ctx} />
      <StoryModal open={modal === "story"} onClose={close} {...ctx} epics={epics} />
      <SprintReviewModal open={modal === "review"} onClose={close} engagementId={activeEngagementId} programName={program.name} />
      <ResearchModal open={modal === "research"} onClose={close} {...ctx} storyList={storyList} providerLabel={providerLabel} />
      <RefineModal open={modal === "refine"} onClose={close} {...ctx} epics={epics} />
      {role && (
        <WorkflowModal open={typeof modal === "object" && modal !== null} onClose={close} {...ctx}
          workflowKey={typeof modal === "object" && modal !== null ? modal.workflow : ""}
          roleCode={role.roleCode} roleTitle={role.title} storyList={storyList} />
      )}
    </div>
  );
}
