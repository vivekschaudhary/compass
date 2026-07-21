"use client";

// The per-write confirmation gate. The agent proposed an allowlisted action; nothing executes until
// the human clicks Approve. Deny tells the agent to back off and suggest an alternative.
export function ConfirmCard({ name, summary, input, state, onDecide }: {
  name: string;
  summary: string;
  input: unknown;
  state: "pending" | "approved" | "denied";
  onDecide: (approved: boolean) => void;
}) {
  const decided = state !== "pending";
  return (
    <div className="rounded-tile border border-brand-weak bg-brand-weak/30 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="inline-block size-1.5 rounded-pill bg-brand" />
        <span className="text-[12px] font-semibold text-ink">Action needs your OK</span>
        <span className="mono ml-auto rounded-pill bg-card px-1.5 py-0.5 text-[10px] text-muted ring-1 ring-line">{name}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-body">{summary}</p>
      <details className="mt-1">
        <summary className="cursor-pointer text-[11px] text-faint hover:text-muted">details</summary>
        <pre className="mono mt-1 max-h-28 overflow-auto rounded-md bg-shell px-2 py-1.5 text-[10.5px] text-muted">{JSON.stringify(input, null, 2)}</pre>
      </details>
      {decided ? (
        <p className={`mt-2 text-[11.5px] font-medium ${state === "approved" ? "text-good" : "text-muted"}`}>
          {state === "approved" ? "✓ Approved — running" : "Declined"}
        </p>
      ) : (
        <div className="mt-2.5 flex gap-2">
          <button onClick={() => onDecide(true)} className="flex-1 rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90">Approve</button>
          <button onClick={() => onDecide(false)} className="rounded-lg border border-line bg-card px-3 py-1.5 text-[12.5px] font-medium text-body hover:bg-shell">Deny</button>
        </div>
      )}
    </div>
  );
}
