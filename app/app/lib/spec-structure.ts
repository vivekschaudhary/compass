import type { ValidateResult } from "./spec-validate";

// Comparing what a draft parses into against what the current version parses into.
//
// WHY THIS IS NOT A COUNT. The plan for this originally gated on `hitl_count` dropping. Measured
// against the real corpus, that check does not catch the actual failure. Demote a single
// `### Step N.` heading in create-product-brief.md and its body merges into the step before it:
//
//   before   1 researcher · 2 HITL · 3 pm · 4 HITL · 5 delivery-manager      hitl_count = 2
//   after    1 HITL (no agent) · 3 pm · 4 HITL · 5 delivery-manager          hitl_count = 2
//
// The researcher stops being dispatched, a dispatch step silently becomes a human gate, a step
// disappears — and every total still looks right. So the comparison has to be structural: which
// steps exist, which are gates, and which agents actually get dispatched.
//
// This compares PARSED OUTPUT, not markdown. It is data comparison, not a second parser — the
// regexes stay in graph.py where they belong.

export type ChangeSeverity = "danger" | "info";

export type StructuralChange = {
  kind: "step-removed" | "step-added" | "gate-removed" | "gate-added"
      | "step-became-gate" | "gate-became-step" | "agent-removed" | "agent-added"
      | "hosts-changed" | "rows-removed" | "rows-added";
  severity: ChangeSeverity;
  detail: string;
};

/** Changes that lose something a human was relying on. These require explicit confirmation —
 *  they are legitimate (a DM may genuinely drop a step for a client) but must never be silent. */
export function isDangerous(c: StructuralChange): boolean {
  return c.severity === "danger";
}

function danger(kind: StructuralChange["kind"], detail: string): StructuralChange {
  return { kind, severity: "danger", detail };
}
function info(kind: StructuralChange["kind"], detail: string): StructuralChange {
  return { kind, severity: "info", detail };
}

/**
 * What changed structurally between `before` and `after`.
 *
 * `before` may be null (nothing to compare — a first override of a file with no prior version),
 * in which case there is no regression to report: you cannot lose a gate you never had here.
 */
export function structuralChanges(
  before: ValidateResult | null, after: ValidateResult | null,
): StructuralChange[] {
  if (!before || !after || before.kind !== after.kind) return [];

  if (before.kind === "workflow" && after.kind === "workflow") {
    const changes: StructuralChange[] = [];
    const byN = (r: typeof before) => new Map(r.steps.map((s) => [s.n, s]));
    const b = byN(before), a = byN(after);

    for (const [n, step] of b) {
      const next = a.get(n);
      if (!next) {
        // The merge signature: the step is simply gone, and its work with it.
        changes.push(danger("step-removed", `Step ${n} (${step.title}) no longer exists.`));
        continue;
      }
      if (step.hitl && !next.hitl) {
        changes.push(danger("gate-removed", `Step ${n} was a human approval gate and is now an automated step.`));
      }
      if (!step.hitl && next.hitl) {
        // Not obviously a loss — but it means whatever that step used to dispatch no longer runs,
        // which is how the heading-damage corruption presents.
        changes.push(danger("step-became-gate",
          `Step ${n} used to dispatch ${step.agent ?? "an agent"} and is now a human gate — that work would stop running.`));
      }
    }
    for (const [n, step] of a) {
      if (!b.has(n)) changes.push(info("step-added", `Step ${n} (${step.title}) is new.`));
      else if (!b.get(n)!.hitl && step.hitl) { /* already reported as step-became-gate */ }
    }

    const lostGates = before.hitl_count - after.hitl_count;
    if (lostGates > 0 && !changes.some((c) => c.kind === "gate-removed")) {
      // A gate that vanished with its whole step is already covered by step-removed; this catches
      // any other way the count can fall.
      changes.push(danger("gate-removed", `${lostGates} human approval gate${lostGates === 1 ? "" : "s"} removed.`));
    }
    if (after.hitl_count > before.hitl_count) {
      changes.push(info("gate-added", `${after.hitl_count - before.hitl_count} human approval gate(s) added.`));
    }

    for (const ag of before.agents) {
      if (!after.agents.includes(ag)) {
        changes.push(danger("agent-removed", `${ag} is no longer dispatched by this workflow.`));
      }
    }
    for (const ag of after.agents) {
      if (!before.agents.includes(ag)) changes.push(info("agent-added", `${ag} is now dispatched.`));
    }
    return changes;
  }

  if (before.kind === "agent" && after.kind === "agent") {
    const changes: StructuralChange[] = [];
    const bh = before.preferred_hosts.join(","), ah = after.preferred_hosts.join(",");
    if (bh !== ah) {
      // Which model runs an agent is a cost and capability decision, not a typo-level detail.
      changes.push(danger("hosts-changed", `Hosts change from [${bh}] to [${ah}].`));
    }
    const lost = before.executor_tools.filter((t) => !after.executor_tools.includes(t));
    if (lost.length) {
      changes.push(danger("hosts-changed", `Tools removed: ${lost.join(", ")} — the agent loses that access mid-run.`));
    }
    return changes;
  }

  if (before.kind === "table" && after.kind === "table") {
    const changes: StructuralChange[] = [];
    const lost = before.rows.length - after.rows.length;
    if (lost > 0) {
      // For sprint-0 this is a kickoff ticket that will never be created for this engagement.
      changes.push(danger("rows-removed", `${lost} row${lost === 1 ? "" : "s"} removed.`));
    } else if (lost < 0) {
      changes.push(info("rows-added", `${-lost} row(s) added.`));
    }
    return changes;
  }

  return [];
}

/** A one-line summary for the confirmation prompt and the audit entry. */
export function summarizeChanges(changes: StructuralChange[]): string {
  const d = changes.filter(isDangerous);
  return d.length ? d.map((c) => c.detail).join(" ") : "No structural regressions.";
}
