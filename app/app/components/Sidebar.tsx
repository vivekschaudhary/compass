"use client";

import { Role, Program } from "@/app/lib/data";

type View = "dashboard" | "jobs" | "playbook" | "activity" | "metrics";

function Icon({ path }: { path: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></> },
  { id: "plan", label: "Plan", icon: <><path d="M3 6h18M3 12h18M3 18h18" /><circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="11" cy="18" r="1.6" fill="currentColor" stroke="none" /></> },
  { id: "jobs", label: "Jobs to do", icon: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8.5 12l2.2 2.2 4.8-4.8" /></> },
  { id: "playbook", label: "Playbook", icon: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" /></> },
  { id: "activity", label: "Activity", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { id: "metrics", label: "Metrics", icon: <><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="5" rx="0.5" /><rect x="12" y="8" width="3" height="9" rx="0.5" /><rect x="17" y="5" width="3" height="12" rx="0.5" /></> },
  { id: "help", label: "Execution help", icon: <><path d="M21 11.5a8.5 8.5 0 0 1-12.2 7.7L3 20.5l1.4-5.4A8.5 8.5 0 1 1 21 11.5Z" /><path d="M9 11h.01M12 11h.01M15 11h.01" /></> },
];

export function Sidebar({
  role,
  program,
  view,
  setView,
  onExecutionHelp,
}: {
  role: Role;
  program: Program;
  view: View;
  setView: (v: View) => void;
  onExecutionHelp: () => void;
}) {
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-line bg-card lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid size-8 place-items-center rounded-[9px] bg-ink text-white">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="9" />
            <path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="text-[14.5px] font-semibold text-ink">Compass</div>
          <div className="text-[11px] text-faint">Delivery control tower</div>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.filter((n) => n.id !== "activity" || ["pm", "delivery-manager"].includes(role.roleCode)).map((n) => {
          const active = (n.id === "dashboard" && view === "dashboard") || (n.id === "jobs" && view === "jobs") || (n.id === "playbook" && view === "playbook") || (n.id === "activity" && view === "activity") || (n.id === "metrics" && view === "metrics");
          const onClick = () => {
            if (n.id === "dashboard") setView("dashboard");
            else if (n.id === "jobs") setView("jobs");
            else if (n.id === "playbook") setView("playbook");
            else if (n.id === "activity") setView("activity");
            else if (n.id === "metrics") setView("metrics");
            else if (n.id === "help") onExecutionHelp();
          };
          return (
            <button
              key={n.id}
              onClick={onClick}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors ${
                active ? "bg-shell font-semibold text-ink" : "font-medium text-muted hover:bg-shell/70 hover:text-body"
              }`}
            >
              <span className={active ? "text-brand" : "text-faint"}>
                <Icon path={n.icon} />
              </span>
              {n.label}
              {n.id === "help" && <span className="ml-auto inline-block size-1.5 rounded-pill bg-bad pulse-dot" />}
            </button>
          );
        })}
      </nav>

      <div className="mx-3 mt-5 rounded-xl border border-line bg-shell/60 p-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wide text-faint">Engagement</div>
          <a href="/settings" title="Engagement settings" aria-label="Engagement settings"
            className="grid size-6 place-items-center rounded-md text-faint hover:bg-card hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </a>
        </div>
        <div className="mt-1 text-[13px] font-semibold text-ink">{program.name}</div>
        {/* An engagement that has finished Phase A but not yet had its SOW extracted has no
            pricing — a first-class state since provisioning was split from intake, and one you sit
            in for as long as the connectors take. `.toLowerCase()` on that null 500s the whole
            dashboard, so the field is simply omitted until it exists. */}
        <div className="mono mt-0.5 text-[11.5px] text-muted">
          {program.sow}{program.pricing ? ` · ${program.pricing.toLowerCase()}` : ""}
        </div>
      </div>

      <div className="mt-auto border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="grid size-8 place-items-center rounded-full bg-brand-weak text-[12px] font-semibold text-brand-ink">
            {role.initials}
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-medium text-ink">{role.name}</div>
            <div className="text-[11.5px] text-muted">{role.title}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
