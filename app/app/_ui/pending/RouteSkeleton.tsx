// What a route shows while its server render is pending.
//
// Next serves the nearest `loading.tsx` the moment a navigation starts, so a one-line file per
// route picks a variant from here. Server-safe: no hooks, no state, and no style of its own —
// every look lives in compass.css under `.skeleton-*`.

type Variant = "queue" | "detail" | "table" | "form";

const BARS: Record<Variant, number[]> = {
  queue: [3, 2, 2, 2],
  detail: [2, 4],
  table: [1, 5],
  form: [1, 4],
};

export function RouteSkeleton({ variant = "queue" }: { variant?: Variant }) {
  return (
    <div className="page page-wide skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="skeleton-bar skeleton-title" />
      <div className="skeleton-bar skeleton-sub" />
      {BARS[variant].map((rows, i) => (
        <div key={i} className="skeleton-block">
          {Array.from({ length: rows }, (_, j) => (
            <div key={j} className="skeleton-bar skeleton-row" />
          ))}
        </div>
      ))}
    </div>
  );
}
