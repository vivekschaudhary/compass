"use client";

import { useEffect, useRef } from "react";

// The live execution terminal shown inside an action modal while an AI workflow streams its steps.
// Auto-scrolls to the newest line; renders nothing until there's output.
export function ExecLog({ log }: { log: string }) {
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
