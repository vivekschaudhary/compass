"use client";

import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";

type Item = { id: string; title: string; pts: number };
type Review = { phase: string; delivered: Item[]; deliveredPts: number; totalStories: number; inProgress: number; next: Item[]; pillars: Record<string, string> };

// Product Owner — end-of-sprint demo: delivered, four-pillar snapshot, next focus (read-only).
export function SprintReviewModal({ open, onClose, engagementId, programName }: {
  open: boolean; onClose: () => void; engagementId: string; programName: string;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true); setReview(null);
    fetch(`/api/sprint-review?engagementId=${encodeURIComponent(engagementId)}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setReview(j.review); })
      .finally(() => setLoading(false));
  }, [open, engagementId]);

  return (
    <Modal open={open} onClose={onClose} maxWidth={560} title={`Sprint review · ${programName}`} subtitle={review?.phase ?? "End-of-sprint demo — delivered, pillars, next focus."}>
      {loading || !review ? (
        <p className="mt-6 text-center text-[12.5px] text-muted">Assembling the review…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Delivered · {review.delivered.length} of {review.totalStories} · {review.deliveredPts} pts</div>
            <div className="mt-1.5 flex flex-col gap-1">
              {review.delivered.length === 0 && <p className="text-[12.5px] text-muted">Nothing accepted yet this sprint.</p>}
              {review.delivered.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="inline-block size-1.5 rounded-pill bg-good" />
                  <span className="min-w-0 flex-1 truncate text-body">{s.title}</span>
                  <span className="mono text-[11px] text-faint">{s.id}</span>
                  {s.pts > 0 && <span className="tnum text-[11px] text-muted">{s.pts}pt</span>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Four-pillar snapshot</div>
            <div className="mt-1.5 grid grid-cols-2 gap-2 text-[12px]">
              {Object.entries(review.pillars).map(([k, v]) => (
                <div key={k} className="rounded-tile border border-line bg-shell/40 px-3 py-2"><span className="text-faint capitalize">{k}</span><div className="mt-0.5 text-body">{v}</div></div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Next focus · {review.next.length}</div>
            <div className="mt-1.5 flex flex-col gap-1">
              {review.next.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[12.5px]">
                  <span className="inline-block size-1.5 rounded-pill bg-faint" />
                  <span className="min-w-0 flex-1 truncate text-body">{s.title}</span>
                  <span className="mono text-[11px] text-faint">{s.id}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
