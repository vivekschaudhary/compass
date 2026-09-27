// The pure half of the optimistic-send fix — what a pending message looks like once it is merged
// alongside the real conversation, kept apart from the React wiring (`OptimisticTurns.tsx`) so it
// can be unit-tested the way this repo tests everything else: no jsdom, no component rendering,
// just the logic. See that file's own header for why the wiring itself stays untested — this repo
// has never carried component-test infrastructure, and one optimistic-UI feature is not the reason
// to start.
//
// The bug this exists to fix: your own message didn't show up until the FULL round trip — the
// server write, then a whole-page refetch — had finished. `Conversation` renders only the `turns`
// prop the server hands it; there was nowhere for a just-typed message to live in the meantime.

import type { Turn } from "@/app/lib/data/job";

export type PendingTurn = {
  id: string;
  body: string;
  createdAt: string;
  authorUserId: string | null;
};

/** A `PendingTurn`, shaped exactly like a real `Turn` so `Conversation` renders it identically —
 *  plus `pending: true`, the one bit that lets it style the echo as not-yet-confirmed. */
export function pendingAsTurn(p: PendingTurn): Turn & { pending: true } {
  return {
    id: p.id,
    ord: Number.MAX_SAFE_INTEGER, // always last — a pending message is always the newest thing said
    authorKind: "human",
    authorRoleCode: null,
    authorUserId: p.authorUserId,
    body: p.body,
    createdAt: p.createdAt,
    pending: true,
  };
}

/** Pending always trails the real conversation — it is the newest thing said, not yet confirmed. */
export function mergeTurns(
  real: Turn[], pending: PendingTurn[],
): (Turn & { pending?: true })[] {
  return [...real, ...pending.map(pendingAsTurn)];
}

/**
 * Should a pending echo still be shown, given the real turn count just changed?
 *
 * The reconciliation rule is deliberately blunt: ANY change in how many real turns exist — from
 * this tab's own refresh, or from `RealtimeRefresh` picking up someone else's — is treated as "what
 * was pending has now either landed for real or definitely never will," and every pending entry is
 * dropped rather than tracked one at a time. A dropped optimistic echo that turns out to have
 * failed is still covered: `submitNote`/`submitAnswer` remove their OWN pending entry immediately on
 * a failed write, before this rule would ever run.
 */
export function pendingSurvivesRealCountChange(
  prevRealCount: number, nextRealCount: number,
): boolean {
  return prevRealCount === nextRealCount;
}
