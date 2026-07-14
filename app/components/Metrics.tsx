"use client";

import { ProgramModel } from "@/app/lib/data";

// Product + engineering metric taxonomy — instrumentation lands next; for now we show the
// categories + the metrics captured under each, values empty ("—").
const PRODUCT_METRICS: { category: string; metrics: string[] }[] = [
  { category: "Acquisition", metrics: ["New users", "Sign-up conversion", "Traffic / visitors", "CAC"] },
  { category: "Activation", metrics: ["Activation rate", "Time to first value", "Onboarding completion"] },
  { category: "Engagement", metrics: ["DAU", "WAU", "MAU", "Stickiness (DAU/MAU)", "Sessions / user", "Feature adoption"] },
  { category: "Retention", metrics: ["Day-1 retention", "Day-7 retention", "Day-30 retention", "Churn rate"] },
  { category: "Revenue", metrics: ["MRR", "ARPU", "Free → paid conversion", "LTV"] },
  { category: "Satisfaction", metrics: ["NPS", "CSAT", "CES"] },
];

// "Delivery performance" = the four delivery signals (deploy freq · lead time · change-fail rate ·
// time to restore); "Flow & quality" = supporting engineering metrics.
const ENG_METRICS: { category: string; metrics: string[] }[] = [
  { category: "Delivery performance", metrics: ["Deployment frequency", "Lead time for changes", "Change failure rate", "Time to restore service"] },
  { category: "Flow & quality", metrics: ["PR cycle time", "Review turnaround", "Test coverage", "Build success rate", "Escaped defects"] },
];

const BET_METRICS = ["Primary outcome", "Adoption", "Impact vs baseline"];

function CategoryCard({ category, metrics }: { category: string; metrics: string[] }) {
  return (
    <div className="overflow-hidden rounded-tile border border-line bg-card">
      <div className="border-b border-line bg-shell/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-faint">{category}</div>
      <div>
        {metrics.map((m) => (
          <div key={m} className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[12.5px] first:border-t-0">
            <span className="text-body">{m}</span>
            <span className="mono text-[11.5px] text-faint">—</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Metrics({ model }: { model: ProgramModel }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-card border border-line bg-card p-5 rise">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Product metrics</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Overall product health across the funnel. Instrumentation lands next — categories + metrics shown.</p>
          </div>
          <span className="rounded-pill bg-shell px-2.5 py-1 text-[11px] font-medium text-muted">not tracked yet</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_METRICS.map((c) => <CategoryCard key={c.category} {...c} />)}
        </div>
      </section>

      <section className="rounded-card border border-line bg-card p-5 rise" style={{ animationDelay: "80ms" }}>
        <h2 className="text-[15px] font-semibold text-ink">Bet outcomes</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">Each epic is a measurable bet — its outcome metrics vs target.</p>
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-[1fr_repeat(3,120px)] gap-3 border-b border-line px-1 pb-2 text-[10.5px] font-medium uppercase tracking-wide text-faint">
              <span>Epic</span>{BET_METRICS.map((m) => <span key={m} className="text-right">{m}</span>)}
            </div>
            {model.epics.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-muted">No epics yet — create one to track its outcome.</p>
            ) : model.epics.map((e) => (
              <div key={e.id} className="grid grid-cols-[1fr_repeat(3,120px)] items-center gap-3 border-b border-line px-1 py-2.5 text-[12.5px]">
                <span className="min-w-0 truncate"><span className="mono text-[11px] text-faint">{e.id}</span> <span className="text-body">{e.title}</span></span>
                {BET_METRICS.map((m) => <span key={m} className="mono text-right text-[11.5px] text-faint">—</span>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-card border border-line bg-card p-5 rise" style={{ animationDelay: "160ms" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Engineering delivery</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Delivery performance + flow &amp; quality — the signals of a healthy delivery pipeline.</p>
          </div>
          <span className="rounded-pill bg-shell px-2.5 py-1 text-[11px] font-medium text-muted">not tracked yet</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {ENG_METRICS.map((c) => <CategoryCard key={c.category} {...c} />)}
        </div>
      </section>
    </div>
  );
}
