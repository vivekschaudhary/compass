import { Program, Pillar } from "@/app/lib/data";
import { Spark, Gauge, HealthPill } from "./ui";

export function FourPillarHero({ program, pillars }: { program: Program; pillars: Pillar[] }) {
  return (
    <section className="rounded-card border border-line bg-card rise">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-semibold text-ink">Delivery health</h2>
          <HealthPill status={program.overall} label={program.overall === "good" ? "On track" : program.overall === "warn" ? "At risk" : "Breach"} />
        </div>
        <p className="text-[12.5px] text-muted">
          Measured against <span className="mono text-body">{program.sow}</span> ·{" "}
          {program.pricing} <span className="tnum">${(program.budget / 1000).toFixed(0)}k</span> · {program.months} months
        </p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {pillars.map((p, i) => (
          <div
            key={p.key}
            className="rise flex flex-col gap-3 px-5 py-4 sm:[&:nth-child(3)]:border-t sm:[&:nth-child(4)]:border-t sm:border-line lg:[&:nth-child(3)]:border-t-0 lg:[&:nth-child(4)]:border-t-0"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-start justify-between">
              <span className="text-[12px] font-medium uppercase tracking-wide text-faint">{p.label}</span>
              <Spark data={p.spark} status={p.status} />
            </div>
            <div>
              <div className="tnum text-[26px] font-semibold leading-none text-ink">{p.headline}</div>
              <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{p.sub}</p>
            </div>
            <div className="mt-auto flex items-center gap-2.5 pt-1">
              <Gauge pct={p.pct} status={p.status} />
              <span className={`shrink-0 text-[11.5px] font-medium ${p.status === "good" ? "text-good" : p.status === "warn" ? "text-warn" : "text-bad"}`}>
                {p.status === "good" ? "On track" : p.status === "warn" ? "At risk" : "Breach"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
