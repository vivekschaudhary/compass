"use client";

import { useState } from "react";
import { phases, Lane, Epic, Phase } from "@/app/lib/data";
import { StatusDot } from "./ui";

const TILE: Record<string, string> = {
  good: "border-line bg-card hover:border-line-2",
  warn: "border-warn-line bg-warn-weak hover:border-warn",
  bad: "border-bad-weak bg-bad-weak/60 hover:border-bad",
  idle: "border-dashed border-line bg-shell/60 hover:border-line-2",
};

function EpicTile({ epic, onClick, active }: { epic: Epic; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} className={`w-full rounded-tile border px-2.5 py-2 text-left transition-colors ${TILE[epic.status]} ${active ? "ring-2 ring-brand/50" : ""}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="mono text-[10.5px] text-faint">{epic.key}</span>
        <StatusDot status={epic.status} pulse={epic.status === "warn"} />
      </div>
      <div className="mt-0.5 truncate text-[12.5px] font-medium text-ink">{epic.title}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
        <span className="mono text-faint">{epic.deliverable}</span><span>·</span><span>{epic.assignee}</span>
      </div>
    </button>
  );
}

export function PlanGrid({ lanes, discoveryDone }: { lanes: Lane[]; discoveryDone: string[] }) {
  const [sel, setSel] = useState<Epic | null>(null);
  const hasEpics = lanes.some((l) => Object.values(l.cells).some((a) => a && a.length));

  return (
    <section className="rounded-card border border-line bg-card rise" style={{ animationDelay: "180ms" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Plan</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">One cross-functional team — disciplines × phases; epics roll up to the pillars.</p>
        </div>
        <div className="flex items-center rounded-lg border border-line p-0.5 text-[12px]">
          <span className="rounded-md bg-shell px-2.5 py-1 font-medium text-ink">By discipline</span>
          <span className="px-2.5 py-1 text-muted">By deliverable</span>
        </div>
      </div>

      {!hasEpics ? (
        <div className="px-5 pb-5">
          <div className="rounded-tile border border-dashed border-line bg-shell/40 px-5 py-8 text-center">
            <p className="text-[13.5px] font-semibold text-ink">No plan yet</p>
            <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-snug text-muted">No epics yet. The <span className="font-medium">Product Manager</span> creates epics or decomposes deliverables from <span className="font-medium">My jobs</span>.</p>
          </div>
        </div>
      ) : (
      <div className="overflow-x-auto px-3 pb-3">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[96px_repeat(4,1fr)] gap-2 px-1 pb-2">
            <div />
            {phases.map((p) => (
              <div key={p} className="text-[11px] font-medium uppercase tracking-wide text-faint">{p}</div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            {lanes.map((lane) => (
              <div key={lane.discipline} className="grid grid-cols-[96px_repeat(4,1fr)] items-stretch gap-2">
                <div className="flex items-center text-[12.5px] font-medium text-body">{lane.discipline}</div>
                {phases.map((ph) => {
                  const epics = lane.cells[ph];
                  return (
                    <div key={ph} className="flex flex-col gap-1.5">
                      {ph === "Discovery" && !epics && discoveryDone.includes(lane.discipline) ? (
                        <div className="flex h-full min-h-[52px] items-center justify-center rounded-tile border border-line bg-good-weak/50 text-[11.5px] font-medium text-good">✓ done</div>
                      ) : epics ? (
                        epics.map((e) => <EpicTile key={e.key} epic={e} active={sel?.key === e.key} onClick={() => setSel(e)} />)
                      ) : (
                        <div className="min-h-[52px] rounded-tile border border-dashed border-line/70" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {sel && (
        <div className="rise border-t border-line bg-shell/50 px-5 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <StatusDot status={sel.status} />
              <span className="mono text-[12px] text-muted">{sel.key}</span>
              <span className="text-[13.5px] font-semibold text-ink">{sel.title}</span>
            </div>
            <button onClick={() => setSel(null)} className="text-[12px] text-muted hover:text-ink">Close</button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-4">
            <Field k="Deliverable" v={sel.deliverable} />
            <Field k="Discipline" v={laneOf(lanes, sel.key)} />
            <Field k="Owner" v={sel.assignee} />
            <Field k="Status" v={sel.status === "warn" ? "At risk" : sel.status === "good" ? "On track" : "Not started"} />
          </div>
          {sel.note && (
            <p className="mt-2 rounded-lg border border-warn-line bg-warn-weak px-3 py-2 text-[12.5px] text-warn">⚠ {sel.note}</p>
          )}
        </div>
      )}
    </section>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-faint">{k}</div>
      <div className="mt-0.5 font-medium text-body">{v}</div>
    </div>
  );
}

function laneOf(lanes: Lane[], key: string) {
  return lanes.find((l) => Object.values(l.cells).flat().some((e) => e?.key === key))?.discipline ?? "—";
}
