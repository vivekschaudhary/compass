"use client";

import { useState } from "react";
import { ProgramModel } from "@/app/lib/data";

// "Viewing as <role>" — picks which role's lens the app shows. Writes the role to the URL
// (via setRole) so the current view is shareable/bookmarkable.
export function RoleSwitcher({ roles, roleId, setRole }: { roles: ProgramModel["roles"]; roleId: string; setRole: (roleCode: string) => void }) {
  const [open, setOpen] = useState(false);
  const role = roles.find((r) => r.id === roleId) ?? roles[0];
  if (!role) return null;
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
              onMouseDown={() => { setRole(r.roleCode); setOpen(false); }}
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
