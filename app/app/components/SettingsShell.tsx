"use client";

import { useUrlState } from "@/app/lib/useUrlState";
import { SettingsForm, type SettingsSection } from "./SettingsForm";
import { DocTreePanel } from "./DocTreePanel";
import { SpecEditor } from "./SpecEditor";
import type { Connectors, RepoRef, TeamMember } from "@/app/lib/data";

// Engagement settings, as a workspace rather than one long scroll.
//
// It used to stack six unrelated things — connectors, team, repos, the document list, the doc
// tree, and the whole spec editor — on a single page. Finding anything meant scrolling past
// everything, and the spec editor (itself a two-pane browser) sat at the bottom of it.
//
// Same shape as the dashboard: a left rail of sections, content on the right, and the section in
// the URL so a link can point at "this engagement's process" rather than "settings, scroll down".

type DocRow = { path: string; title: string; kind: string; status: string; url: string | null };

type SectionId = SettingsSection | "doctree" | "process";

const SECTIONS: { id: SectionId; label: string; blurb: string; icon: React.ReactNode }[] = [
  { id: "connectors", label: "Connectors", blurb: "Docs, tracker, design",
    icon: <><path d="M9 17H7A5 5 0 0 1 7 7h2" /><path d="M15 7h2a5 5 0 1 1 0 10h-2" /><path d="M8 12h8" /></> },
  { id: "team", label: "Team", blurb: "Who plays which role",
    icon: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 5.3a3.2 3.2 0 0 1 0 5.4" /><path d="M17.5 19a5.5 5.5 0 0 0-2-4.3" /></> },
  { id: "repos", label: "Repositories", blurb: "Where code is built",
    icon: <><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v14H5.5A1.5 1.5 0 0 0 4 18.5Z" /><path d="M4 18.5A1.5 1.5 0 0 1 5.5 17H19v4H5.5A1.5 1.5 0 0 1 4 19.5Z" /></> },
  { id: "docs", label: "Documents", blurb: "What has been created",
    icon: <><path d="M14 3v5h5" /><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8Z" /></> },
  { id: "doctree", label: "Document structure", blurb: "The workspace to scaffold",
    icon: <><path d="M4 5h6v4H4z" /><path d="M14 5h6v4h-6z" /><path d="M9 15h6v4H9z" /><path d="M7 9v3h10V9" /><path d="M12 12v3" /></> },
  { id: "process", label: "Process", blurb: "How delivery runs here",
    icon: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="3.2" /></> },
];

export function SettingsShell({ engagementId, engagementName, connectors, repos, docs, members }: {
  engagementId: string; engagementName: string;
  connectors: Connectors; repos: RepoRef[]; docs: DocRow[]; members: TeamMember[];
}) {
  const { params, set } = useUrlState();
  const raw = params.get("tab");
  const active: SectionId = SECTIONS.some((s) => s.id === raw) ? (raw as SectionId) : "connectors";
  const current = SECTIONS.find((s) => s.id === active)!;

  return (
    <div className="min-h-screen bg-shell">
      <header className="flex items-center justify-between border-b border-line bg-card px-6 py-4">
        <div>
          <div className="text-[14.5px] font-semibold text-ink">Settings — {engagementName}</div>
          <div className="text-[11px] text-faint">How this engagement is wired and how it runs</div>
        </div>
        {/* Keep the role in the URL on the way back: the dashboard reads it as the acting identity
            and losing it here would land you as nobody. */}
        <a href={params.get("role") ? `/?role=${encodeURIComponent(params.get("role")!)}` : "/"}
          className="text-[13px] font-medium text-muted hover:text-ink">← Dashboard</a>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-6 py-6">
        <nav className="hidden w-[212px] shrink-0 flex-col gap-0.5 sm:flex">
          {SECTIONS.map((s) => {
            const on = s.id === active;
            return (
              <button key={s.id} onClick={() => set({ tab: s.id })} aria-current={on ? "page" : undefined}
                className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                  on ? "bg-card font-semibold text-ink shadow-sm" : "text-muted hover:bg-card/60 hover:text-body"}`}>
                <span className={`mt-0.5 shrink-0 ${on ? "text-brand" : "text-faint"}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] leading-tight">{s.label}</span>
                  <span className="block text-[11px] leading-tight text-faint">{s.blurb}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* On a narrow screen the rail collapses to a select rather than disappearing — every
            section must stay reachable, not just the first one. */}
        <div className="min-w-0 flex-1">
          <label className="mb-3 block sm:hidden">
            <select value={active} onChange={(e) => set({ tab: e.target.value })}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-body outline-none focus:border-brand">
              {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>

          <div className="mb-4 hidden sm:block">
            <h1 className="text-[16px] font-semibold text-ink">{current.label}</h1>
            <p className="text-[12.5px] text-muted">{current.blurb}</p>
          </div>

          {active === "doctree" ? (
            <div className="rounded-card border border-line bg-card p-5">
              <DocTreePanel engagementId={engagementId} />
            </div>
          ) : active === "process" ? (
            <SpecEditor scope="engagement" engagementId={engagementId} />
          ) : (
            <SettingsForm
              engagementId={engagementId}
              section={active}
              initialConnectors={connectors}
              initialRepos={repos}
              initialDocs={docs}
              initialMembers={members}
            />
          )}
        </div>
      </div>
    </div>
  );
}
