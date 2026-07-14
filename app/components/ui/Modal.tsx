"use client";

import { ReactNode } from "react";

// The shared modal shell — overlay + card + header + close. Click-outside closes unless `busy`.
// Every action modal (bet, research, workflow, …) renders through this so the chrome lives once.
export function Modal({ open, onClose, busy, title, subtitle, maxWidth = 480, children }: {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  title: string;
  subtitle?: string;
  maxWidth?: number;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4" onMouseDown={() => !busy && onClose()}>
      <div className="w-full rounded-card border border-line bg-card p-5 shadow-xl shadow-black/10" style={{ maxWidth }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[15.5px] font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-[13px] text-muted hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
