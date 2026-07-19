"use client";

import { useState } from "react";
import { Activity, COMPASS_ROLES } from "@/app/lib/data";
import { HistoryTable } from "./HistoryTable";

const LABEL: Record<string, string> = Object.fromEntries(COMPASS_ROLES.map((r) => [r.code, r.label]));

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

// Cross-role, all-users program history — the oversight view for PM + Delivery Manager. The table
// itself is the shared HistoryTable (also used per-role in Jobs to do); this adds role/person filters.
export function ActivityLog({ activity, atlassianBase = "" }: { activity: Activity[]; atlassianBase?: string }) {
  const [role, setRole] = useState("all");
  const [user, setUser] = useState("all");

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
        <HistoryTable rows={rows} atlassianBase={atlassianBase} />
      )}
    </section>
  );
}
