import { Attention } from "@/app/lib/data";

export function NeedsAttention({ attention }: { attention: Attention[] }) {
  if (!attention.length) return null;
  return (
    <section className="rounded-card border border-line bg-card rise" style={{ animationDelay: "120ms" }}>
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Needs attention</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Exceptions the roll-up surfaced — nobody reported them.</p>
        </div>
        <span className="tnum rounded-pill bg-warn-weak px-2.5 py-1 text-[12px] font-medium text-warn">{attention.length} open</span>
      </div>

      <div className="flex flex-col gap-2 px-3 pb-3">
        {attention.map((a) => {
          const bad = a.tone === "bad";
          return (
            <div key={a.id} className={`flex flex-wrap items-start justify-between gap-3 rounded-tile border px-4 py-3.5 ${bad ? "border-bad-weak bg-bad-weak/60" : "border-warn-line bg-warn-weak"}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`mt-px inline-block size-1.5 shrink-0 rounded-pill ${bad ? "bg-bad" : "bg-warn"}`} />
                  <p className="text-[13.5px] font-semibold text-ink">{a.title}</p>
                </div>
                <p className="mt-1 pl-3.5 text-[12.5px] leading-snug text-body/90">{a.detail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pl-3.5">
                {a.actions.map((label, i) => (
                  <button
                    key={label}
                    className={`rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors ${
                      i === 0 && bad ? "bg-bad text-white hover:opacity-90" : i === 0 ? "border border-line-2 bg-card text-body hover:bg-shell" : "text-muted hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
