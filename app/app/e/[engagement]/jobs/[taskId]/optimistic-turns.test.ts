import { describe, it, expect } from "vitest";
import { mergeTurns, pendingAsTurn, pendingSurvivesRealCountChange } from "./optimistic-turns";
import type { Turn } from "@/app/lib/data/job";

const real: Turn[] = [
  { id: "t1", ord: 0, authorKind: "agent", authorRoleCode: "pm", authorUserId: null, body: "hi", createdAt: "2026-01-01T00:00:00Z" },
];

describe("pendingAsTurn", () => {
  it("shapes a pending echo exactly like a real Turn, plus pending: true", () => {
    const t = pendingAsTurn({ id: "p1", body: "hello", createdAt: "2026-01-01T00:00:01Z", authorUserId: "Alex" });
    expect(t.authorKind).toBe("human");
    expect(t.body).toBe("hello");
    expect(t.authorUserId).toBe("Alex");
    expect(t.pending).toBe(true);
  });
});

describe("mergeTurns", () => {
  it("puts every pending entry after the real conversation, in order", () => {
    const merged = mergeTurns(real, [
      { id: "p1", body: "first", createdAt: "2026-01-01T00:00:01Z", authorUserId: "Alex" },
      { id: "p2", body: "second", createdAt: "2026-01-01T00:00:02Z", authorUserId: "Alex" },
    ]);
    expect(merged.map((t) => t.id)).toEqual(["t1", "p1", "p2"]);
  });

  it("is just the real list when nothing is pending", () => {
    expect(mergeTurns(real, [])).toEqual(real);
  });
});

describe("pendingSurvivesRealCountChange", () => {
  it("survives when the real count hasn't moved", () => {
    expect(pendingSurvivesRealCountChange(3, 3)).toBe(true);
  });

  it("does not survive once the real count changes either way", () => {
    expect(pendingSurvivesRealCountChange(3, 4)).toBe(false);
    expect(pendingSurvivesRealCountChange(4, 3)).toBe(false);
  });
});
