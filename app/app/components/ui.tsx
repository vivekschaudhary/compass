import { Health, HEALTH_LABEL } from "@/app/lib/data";

const DOT: Record<Health, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  idle: "bg-faint",
};

const PILL: Record<Health, string> = {
  good: "bg-good-weak text-good",
  warn: "bg-warn-weak text-warn",
  bad: "bg-bad-weak text-bad",
  idle: "bg-shell text-faint",
};

const STROKE: Record<Health, string> = {
  good: "var(--color-good)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  idle: "var(--color-faint)",
};

export function StatusDot({ status, pulse }: { status: Health; pulse?: boolean }) {
  return (
    <span
      className={`inline-block size-2 rounded-pill ${DOT[status]} ${pulse ? "pulse-dot" : ""}`}
    />
  );
}

export function HealthPill({ status, label }: { status: Health; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-medium ${PILL[status]}`}
    >
      <span className={`inline-block size-1.5 rounded-pill ${DOT[status]}`} />
      {label ?? HEALTH_LABEL[status]}
    </span>
  );
}

export function Spark({
  data,
  status,
  w = 96,
  h = 30,
}: {
  data: number[];
  status: Health;
  w?: number;
  h?: number;
}) {
  if (!data.length) return <svg width={w} height={h} className="overflow-visible" />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const denom = data.length > 1 ? data.length - 1 : 1; // avoid /0 → NaN for single-point sparks
  const pts = data.map((v, i) => {
    const x = (i / denom) * (w - 2) + 1;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    return [x, y] as const;
  });
  const line = pts.map((p) => p.join(",")).join(" ");
  const area = `1,${h} ${line} ${w - 1},${h}`;
  const id = `g-${status}-${data.join("")}`.replace(/[^a-z0-9-]/gi, "");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={STROKE[status]} stopOpacity="0.16" />
          <stop offset="100%" stopColor={STROKE[status]} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={STROKE[status]} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.4" fill={STROKE[status]} />
    </svg>
  );
}

export function Gauge({ pct, status }: { pct: number; status: Health }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-pill bg-shell">
      <div
        className={`bar-grow h-full rounded-pill ${DOT[status]}`}
        style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
      />
    </div>
  );
}
