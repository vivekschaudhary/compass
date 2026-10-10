import { describe, expect, it } from "vitest";
import { ownHistory, SHOWN } from "./history-rows";
import type { DoneJob } from "@/app/lib/data/history";

const job = (id: string, roleCode: string): DoneJob => ({
  id, title: id, workflowCode: null, roleCode, state: "closed", closedAt: null, closedBy: null,
  startedAt: null, produced: null, criteria: { total: 0, met: 0, byHuman: 0 }, turns: 0, openComments: 0,
});

describe("ownHistory", () => {
  it("keeps only the viewer's own role, even when history returned everyone's", () => {
    const { rows, total } = ownHistory([job("a", "designer"), job("b", "product-manager"), job("c", "designer")], "designer");
    expect(rows.map((j) => j.id)).toEqual(["a", "c"]);
    expect(total).toBe(2);
  });

  it("caps the rows but still reports the full count", () => {
    const many = Array.from({ length: SHOWN + 3 }, (_, i) => job(`j${i}`, "designer"));
    const { rows, total } = ownHistory(many, "designer");
    expect(rows).toHaveLength(SHOWN);
    expect(total).toBe(SHOWN + 3);
    expect(rows[0].id).toBe("j0");
  });

  it("is empty for a role with nothing closed", () => {
    expect(ownHistory([job("a", "designer")], "engineer")).toEqual({ rows: [], total: 0 });
  });
});
