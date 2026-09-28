"use client";

// The React wiring around `optimistic-turns.ts`'s pure logic — deliberately thin and untested on
// its own. This repo has no component-test infrastructure (no jsdom, no RTL — see
// `vitest.config.mts`'s own comment), so the merge/reconciliation RULES live in a plain function
// that IS unit-tested, and this file is just the state and the plumbing.
//
// A context rather than lifting state into `page.tsx` (a server component, which cannot hold it) or
// threading callback props between `Conversation`, `Composer` and `RealtimeRefresh` (siblings today
// — see `page.tsx`'s own JSX, and `RealtimeRefresh`'s own header). Provided once, high enough to
// wrap all three.
//
// OWNS THE REAL TURNS LIST NOW, not just the pending overlay. `turns` starts from `initialTurns` (the
// server's own read, for a fast first paint) and after that is updated ONLY by `refreshTurns` — a
// direct, scoped server action (`getConversationAction`), never by `router.refresh()`. That is the
// whole point: a new chat message must not cost re-fetching the draft, the gates, the document tree
// and everything else on the page just to bring in one more turn. `initialTurns` is read once, on
// mount, and never re-synced from a later prop change — a second source of truth for the same list
// (the server-rendered prop, on some LATER page-level refresh) racing this one is worse than not
// having it; `RealtimeRefresh`'s `work_task` handler calls `refreshTurns` itself alongside its own
// `router.refresh()` for exactly this reason, rather than relying on prop reconciliation here.

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { pendingSurvivesRealCountChange, type PendingTurn } from "./optimistic-turns";
import type { Turn } from "@/app/lib/data/job";
import { getConversationAction } from "./actions";

type Ctx = {
  turns: Turn[];
  pending: PendingTurn[];
  /** Returns the new entry's id, so the caller can remove exactly this one on a failed write. */
  addPending: (body: string, authorUserId: string | null) => string;
  removePending: (id: string) => void;
  /** Re-fetch the conversation directly — no page-level refresh involved. */
  refreshTurns: () => Promise<void>;
};

const OptimisticTurnsContext = createContext<Ctx | null>(null);

export function OptimisticTurnsProvider({
  engagement, role, taskId, holderId, initialTurns, children,
}: {
  engagement: string;
  role: string;
  taskId: string;
  holderId?: string | null;
  initialTurns: Turn[];
  children: React.ReactNode;
}) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [pending, setPending] = useState<PendingTurn[]>([]);
  const prevRealCount = useRef(turns.length);

  const refreshTurns = useCallback(async () => {
    const r = await getConversationAction(engagement, role, taskId, holderId);
    if (!r.ok) return; // best-effort — a stale list is a worse failure mode than a thrown error here
    setTurns(r.turns);
    if (!pendingSurvivesRealCountChange(prevRealCount.current, r.turns.length)) {
      setPending([]);
    }
    prevRealCount.current = r.turns.length;
  }, [engagement, role, taskId, holderId]);

  function addPending(body: string, authorUserId: string | null): string {
    const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPending((p) => [...p, { id, body, createdAt: new Date().toISOString(), authorUserId }]);
    return id;
  }

  function removePending(id: string) {
    setPending((p) => p.filter((t) => t.id !== id));
  }

  return (
    <OptimisticTurnsContext.Provider
      value={{ turns, pending, addPending, removePending, refreshTurns }}
    >
      {children}
    </OptimisticTurnsContext.Provider>
  );
}

export function useOptimisticTurns(): Ctx {
  const ctx = useContext(OptimisticTurnsContext);
  if (!ctx) throw new Error("useOptimisticTurns must be used within OptimisticTurnsProvider");
  return ctx;
}
