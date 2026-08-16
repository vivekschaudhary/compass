// Ready and Done, as evidence rather than a claim.
//
// Three states, and the third is the point: a criterion nobody could evaluate yet is NOT a failed
// one. "Waiting to be checked" and "checked and failed" look nothing alike here, because they are
// nothing alike — and conflating them is how a board starts lying.

import type { StoredStatus } from "@/app/lib/data/gates";
import { describeCriterion } from "@/app/lib/data/gates";

function mark(s: StoredStatus) {
  if (s.satisfied === true) return { glyph: "✓", cls: "gate-ok", label: "met" };
  if (s.satisfied === false) return { glyph: "✗", cls: "gate-no", label: "not met" };
  return { glyph: "○", cls: "gate-unknown", label: "not checked" };
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

export function Gate({ statuses, kind }: { statuses: StoredStatus[]; kind: "ready" | "done" }) {
  const mine = statuses.filter((s) => s.kind === kind);
  if (!mine.length) return null;

  const met = mine.filter((s) => s.satisfied === true).length;
  const unchecked = mine.filter((s) => s.satisfied === null).length;

  return (
    <div className="gate">
      <div className="gate-head">
        <span className="gate-title">{kind === "ready" ? "Ready" : "Done"}</span>
        {/* "2 of 3 met" and nothing else would hide that one was never checked. Both numbers. */}
        <span className="gate-count">
          {met} of {mine.length} met{unchecked > 0 && `, ${unchecked} not checked`}
        </span>
      </div>
      <ul className="gate-list">
        {mine.map((s) => {
          const m = mark(s);
          return (
            <li key={s.id} className={`gate-item ${m.cls}`}>
              <span className="gate-glyph" aria-label={m.label}>{m.glyph}</span>
              <span className="gate-text">
                {describeCriterion(s)}
                {s.detail && <span className="gate-detail">{s.detail}</span>}
              </span>
              <span className="gate-when">
                {s.satisfied === null
                  ? "—"
                  : `${s.source ?? "?"} · ${ago(s.measuredAt)}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
