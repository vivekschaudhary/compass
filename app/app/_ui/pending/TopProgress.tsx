"use client";

// A thin bar across the top of the viewport while any navigation is pending. The per-control
// spinner says WHICH thing was clicked; this says "the app heard you" for every one of them, in the
// same place, including slow routes where the old page would otherwise just sit there.

import { useSyncExternalStore } from "react";
import { progressStore } from "./progress-store";

export function TopProgress() {
  const active = useSyncExternalStore(progressStore.subscribe, progressStore.get, progressStore.getServer);
  if (!active) return null;
  return <div className="top-progress" role="progressbar" aria-label="Loading" />;
}
