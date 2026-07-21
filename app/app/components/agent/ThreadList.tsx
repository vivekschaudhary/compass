"use client";

import { useEffect, useState } from "react";

export type ThreadSummary = { id: string; title: string | null; anchor_kind: string; anchor_id: string | null; updated_at: string };

// The dock's conversation drawer — start a new chat or reopen a saved one (role-scoped).
export function ThreadList({ engagementId, role, activeId, refreshKey, onPick, onNew }: {
  engagementId: string;
  role: string;
  activeId: string | null;
  refreshKey: number;              // bump to re-fetch after a new thread is created
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/agent/threads?engagementId=${encodeURIComponent(engagementId)}&role=${encodeURIComponent(role)}`);
        const j = await res.json();
        if (!cancelled) setThreads(j.threads ?? []);
      } catch { /* keep prior list */ }
    })();
    return () => { cancelled = true; };
  }, [engagementId, role, refreshKey]);

  return (
    <div className="flex flex-col gap-1 border-b border-line bg-shell/60 px-2 py-2">
      <button onClick={onNew} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12.5px] font-medium text-brand-ink hover:bg-brand-weak">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        New chat
      </button>
      {threads.length > 0 && (
        <div className="max-h-32 overflow-y-auto">
          {threads.map((t) => (
            <button key={t.id} onClick={() => onPick(t.id)}
              className={`flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-left text-[12px] ${t.id === activeId ? "bg-card text-ink ring-1 ring-line" : "text-muted hover:bg-card/60"}`}>
              {t.anchor_kind !== "none" && t.anchor_id && (
                <span className="mono shrink-0 rounded-pill bg-card px-1.5 py-0.5 text-[9.5px] text-faint ring-1 ring-line">{t.anchor_id}</span>
              )}
              <span className="truncate">{t.title || "New chat"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
