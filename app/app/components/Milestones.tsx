import { ProgramModel } from "@/app/lib/data";

// The SOW's plan — a read-only milestone timeline. The SOW is the ground truth committed to the
// client/product leader, so the app never edits it; it only surfaces what was loaded.
export function Milestones({ milestones }: { milestones: ProgramModel["milestones"] }) {
  if (!milestones.length) return null;
  return (
    <section className="rounded-card border border-line bg-card p-5 rise">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Plan · milestones</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">From the SOW — the committed plan. Read-only.</p>
        </div>
        <span className="rounded-pill bg-shell px-2.5 py-1 text-[11px] font-medium text-muted">{milestones.length} milestone{milestones.length === 1 ? "" : "s"}</span>
      </div>
      <ol className="mt-4 flex flex-col">
        {milestones.map((m, i) => (
          <li key={m.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < milestones.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-line" />}
            <span className="z-10 grid size-7 shrink-0 place-items-center rounded-full bg-brand-weak text-[10.5px] font-semibold text-brand-ink">{m.code || i + 1}</span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-medium text-ink">{m.title}</span>
                {m.timeframe && <span className="rounded-pill bg-shell px-2 py-0.5 text-[11px] font-medium text-muted">{m.timeframe}</span>}
              </div>
              {m.detail && <p className="mt-0.5 text-[12px] leading-snug text-muted">{m.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
