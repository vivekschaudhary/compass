"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProgramModel } from "@/app/lib/data";

// Switches the active engagement (persisted in a cookie the server reads in getProgram()).
export function EngagementSwitcher({ engagements, activeId, name }: { engagements: ProgramModel["engagements"]; activeId: string; name: string }) {
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
