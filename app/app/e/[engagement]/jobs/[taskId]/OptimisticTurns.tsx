"use client";

// The React wiring around `optimistic-turns.ts`'s pure logic — deliberately thin and untested on
// its own. This repo has no component-test infrastructure (no jsdom, no RTL — see
// `vitest.config.mts`'s own comment), so the merge/reconciliation RULES live in a plain function
// that IS unit-tested, and this file is just the state and the plumbing.
//
// A context rather than lifting state into `page.tsx` (a server component, which cannot hold it) or
// threading a callback prop between `Conversation` and `Composer` (siblings today, not parent/child
// — see `page.tsx`'s own JSX). Provided once, high enough to wrap both.

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { pendingSurvivesRealCountChange, type PendingTurn } from "./optimistic-turns";

type Ctx = {
  pending: PendingTurn[];
  /** Returns the new entry's id, so the caller can remove exactly this one on a failed write. */
  addPending: (body: string, authorUserId: string | null) => string;
  removePending: (id: string) => void;
};

const OptimisticTurnsContext = createContext<Ctx | null>(null);

export function OptimisticTurnsProvider({
  realCount, children,
}: {
  /** `turns.length` as the server last handed it — watched, not read, so this stays a MERGE point
   *  rather than a second copy of the conversation. */
  realCount: number;
  children: React.ReactNode;
}) {
  const [pending, setPending] = useState<PendingTurn[]>([]);
  const prevRealCount = useRef(realCount);

  useEffect(() => {
    if (!pendingSurvivesRealCountChange(prevRealCount.current, realCount)) {
      setPending([]);
    }
    prevRealCount.current = realCount;
  }, [realCount]);

  function addPending(body: string, authorUserId: string | null): string {
    const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPending((p) => [...p, { id, body, createdAt: new Date().toISOString(), authorUserId }]);
    return id;
  }

  function removePending(id: string) {
    setPending((p) => p.filter((t) => t.id !== id));
  }

  return (
    <OptimisticTurnsContext.Provider value={{ pending, addPending, removePending }}>
      {children}
    </OptimisticTurnsContext.Provider>
  );
}

export function useOptimisticTurns(): Ctx {
  const ctx = useContext(OptimisticTurnsContext);
  if (!ctx) throw new Error("useOptimisticTurns must be used within OptimisticTurnsProvider");
  return ctx;
}
