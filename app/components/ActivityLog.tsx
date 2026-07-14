"use client";

import { useState } from "react";
import { Activity, COMPASS_ROLES } from "@/app/lib/data";

const LABEL: Record<string, string> = Object.fromEntries(COMPASS_ROLES.map((r) => [r.code, r.label]));
const DOT: Record<string, string> = { done: "bg-good", failed: "bg-bad", filed: "bg-brand" };

// a task ref → a deep link: Jira key → the Jira issue; a URL → itself.
function relatedLink(related: string | undefined, base: string): string | null {
  if (!related) return null;
  if (/^https?:\/\//i.test(related)) return related;
  if (/^[A-Z][A-Z0-9]+-\d+$/.test(related) && base) return `${base.replace(/\/+$/, "")}/browse/${related}`;
  return null;
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <label className="flex items-center gap-1.5 text-[12px]">
      <span className="text-faint">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-line bg-shell/40 px-2 py-1 text-[12.5px] text-body outline-none focus:border-brand">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}

// Cross-role, all-users program history — the oversight view for PM + Delivery Manager.
type RunDetail = { log?: string; status?: string; failed_step?: string | null; error?: string | null; loading?: boolean };

export function ActivityLog({ activity, atlassianBase = "" }: { activity: Activity[]; atlassianBase?: string }) {
  const [role, setRole] = useState("all");
  const [user, setUser] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, RunDetail>>({});

  async function toggle(runId: string | null) {
    if (!runId) return;
    if (open === runId) { setOpen(null); return; }
    setOpen(runId);
    if (!runs[runId]) {
      setRuns((r) => ({ ...r, [runId]: { loading: true } }));
      try {
        const res = await fetch(`/api/run-log?id=${encodeURIComponent(runId)}`);
        const j = await res.json();
        setRuns((r) => ({ ...r, [runId]: j.ok ? j.run : { log: "(run not found)" } }));
      } catch { setRuns((r) => ({ ...r, [runId]: { log: "(failed to load log)" } })); }
    }
  }

  const roles = [...new Set(activity.map((a) => a.role).filter(Boolean))];
  const users = [...new Set(activity.map((a) => a.actor).filter(Boolean))];
  const rows = activity.filter((a) => (role === "all" || a.role === role) && (user === "all" || a.actor === user));

  return (
    <section className="rounded-card border border-line bg-card rise">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Program activity</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Every task, across all roles and people — the full delivery record.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select label="Role" value={role} onChange={setRole} options={[{ v: "all", l: "All roles" }, ...roles.map((r) => ({ v: r, l: LABEL[r] ?? r }))]} />
          <Select label="Person" value={user} onChange={setUser} options={[{ v: "all", l: "Everyone" }, ...users.map((u) => ({ v: u, l: u }))]} />
          <span className="tnum rounded-pill bg-shell px-2.5 py-1 text-[12px] font-medium text-muted">{rows.length}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-[13.5px] font-medium text-ink">No activity yet</p>
          <p className="mt-0.5 text-[12.5px] text-muted">Completed tasks — epics, builds, fixes, triage, approvals — will appear here as the team works.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[112px_1fr_120px_150px_96px_44px] items-center gap-3 border-b border-line px-5 py-2 text-[10.5px] font-medium uppercase tracking-wide text-faint">
              <span>Task</span><span>Description</span><span>Role</span><span>Person</span><span>Status</span><span className="text-right">Log</span>
            </div>
            <div className="divide-y divide-line">
              {rows.map((a) => {
                const link = relatedLink(a.related, atlassianBase);
                const isOpen = open === a.run_id;
                const detail = a.run_id ? runs[a.run_id] : undefined;
                return (
                  <div key={a.id}>
                    <div className="grid grid-cols-[112px_1fr_120px_150px_96px_44px] items-center gap-3 px-5 py-2.5 text-[12.5px]">
                      <span className="mono truncate text-[11px]">
                        {a.related
                          ? (link ? <a href={link} target="_blank" rel="noreferrer" className="text-brand hover:underline">{a.related}</a> : <span className="text-faint">{a.related}</span>)
                          : <span className="text-faint">—</span>}
                      </span>
                      <span className="min-w-0 truncate text-body" title={a.title}>{a.title}</span>
                      <span><span className="rounded-pill bg-shell px-2 py-0.5 text-[11px] font-medium text-muted">{LABEL[a.role] ?? a.role}</span></span>
                      <span className="truncate text-[12px] text-ink">{a.actor || "—"}</span>
                      <span className={`inline-flex items-center gap-1.5 text-[11.5px] ${a.status === "failed" ? "text-bad" : a.status === "filed" ? "text-brand" : "text-good"}`} title={timeAgo(a.created_at)}>
                        <span className={`inline-block size-1.5 rounded-pill ${DOT[a.status] ?? "bg-faint"}`} />{a.status}
                      </span>
                      <span className="text-right">
                        {a.run_id ? (
                          <button onClick={() => toggle(a.run_id)} className={`rounded-md p-1 hover:bg-shell hover:text-ink ${isOpen ? "text-brand" : "text-faint"}`} title="View execution log">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="2.5" /></svg>
                          </button>
                        ) : <span className="text-[11px] text-faint">—</span>}
                      </span>
                    </div>
                    {isOpen && (
                      <div className="mx-5 mb-3 overflow-hidden rounded-tile border border-line">
                        <div className="flex items-center gap-2 border-b border-line bg-ink px-3 py-1.5">
                          <span className={`inline-block size-2 rounded-pill ${detail?.status === "failed" ? "bg-bad" : "bg-good"}`} />
                          <span className="text-[10.5px] font-medium text-white/90">execution log · {a.related}{detail?.failed_step ? ` · failed at ${detail.failed_step}` : ""}</span>
                          <span className="mono ml-auto text-[10px] text-white/40">{a.run_id}</span>
                        </div>
                        <pre className="mono max-h-72 overflow-auto bg-[#0e1420] px-3 py-2 text-[10.5px] leading-relaxed text-[#c8cdd6] whitespace-pre-wrap">{detail?.loading ? "loading…" : detail?.log || "(no log captured)"}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
