"use client";

import { ProgramModel, Metric } from "@/app/lib/data";

// Metric definitions come from the DB now (table `metric`), captured per project + per epic.
const BET_COLS_FALLBACK = ["Primary outcome", "Adoption", "Impact vs baseline"];

function groupByCategory(metrics: Metric[]): { category: string; metrics: Metric[] }[] {
  const out: { category: string; metrics: Metric[] }[] = [];
  for (const m of metrics) {
    let g = out.find((x) => x.category === m.category);
    if (!g) { g = { category: m.category, metrics: [] }; out.push(g); }
    g.metrics.push(m);
  }
  return out;
}

function CategoryCard({ category, metrics }: { category: string; metrics: Metric[] }) {
  return (
    <div className="overflow-hidden rounded-tile border border-line bg-card">
      <div className="border-b border-line bg-shell/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-faint">{category}</div>
      <div>
        {metrics.map((m) => (
          <div key={m.id} className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[12.5px] first:border-t-0">
            <span className="text-body">{m.name}{m.target ? <span className="ml-1.5 text-[11px] text-faint">· target {m.target}</span> : null}</span>
            <span className="mono text-[11.5px] text-faint">{m.value || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>
      </div>
      <span className="rounded-pill bg-shell px-2.5 py-1 text-[11px] font-medium text-muted">not tracked yet</span>
    </div>
  );
}

export function Metrics({ model }: { model: ProgramModel }) {
  const product = groupByCategory(model.metrics.filter((m) => m.scope === "product"));
  const engineering = groupByCategory(model.metrics.filter((m) => m.scope === "engineering"));
  const bet = model.metrics.filter((m) => m.scope === "bet");
  const betCols = [...new Set(bet.map((m) => m.name))];
  const cols = betCols.length ? betCols : BET_COLS_FALLBACK;
  const valueFor = (epicId: string, name: string) => bet.find((m) => m.epicId === epicId && m.name === name)?.value || "—";
  const gridStyle = { gridTemplateColumns: `1fr repeat(${cols.length}, 120px)` };

  return (
    <div className="flex flex-col gap-5">
      {model.metrics.length === 0 && (
        <div className="rounded-card border border-dashed border-line bg-shell/40 px-5 py-8 text-center">
          <p className="text-[13.5px] font-medium text-ink">Metrics not captured yet</p>
          <p className="mt-1 text-[12.5px] text-muted">Run <span className="mono">011_metrics.sql</span> + the backfill to capture the metric definitions for this engagement. Structure preview below.</p>
        </div>
      )}

      {product.length > 0 && (
        <section className="rounded-card border border-line bg-card p-5 rise">
          <Header title="Product metrics" sub="Overall product health across the funnel — captured per project (SOW)." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{product.map((c) => <CategoryCard key={c.category} {...c} />)}</div>
        </section>
      )}

      <section className="rounded-card border border-line bg-card p-5 rise" style={{ animationDelay: "80ms" }}>
        <h2 className="text-[15px] font-semibold text-ink">Bet outcomes</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">Each epic is a measurable bet — its outcome metrics, captured per epic.</p>
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid items-center gap-3 border-b border-line px-1 pb-2 text-[10.5px] font-medium uppercase tracking-wide text-faint" style={gridStyle}>
              <span>Epic</span>{cols.map((m) => <span key={m} className="text-right">{m}</span>)}
            </div>
            {model.epics.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-muted">No epics yet — create one to track its outcome.</p>
            ) : model.epics.map((e) => (
              <div key={e.id} className="grid items-center gap-3 border-b border-line px-1 py-2.5 text-[12.5px]" style={gridStyle}>
                <span className="min-w-0 truncate"><span className="mono text-[11px] text-faint">{e.id}</span> <span className="text-body">{e.title}</span></span>
                {cols.map((m) => <span key={m} className="mono text-right text-[11.5px] text-faint">{valueFor(e.id, m)}</span>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {engineering.length > 0 && (
        <section className="rounded-card border border-line bg-card p-5 rise" style={{ animationDelay: "160ms" }}>
          <Header title="Engineering delivery" sub="Delivery performance + flow & quality — the signals of a healthy delivery pipeline." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">{engineering.map((c) => <CategoryCard key={c.category} {...c} />)}</div>
        </section>
      )}
    </div>
  );
}
