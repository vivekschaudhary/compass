"use client";

// The plan, as a board — one lane per phase, one card per workflow (or cycle), left to right.
//
// FLATTENED, not nested. `planFor` still returns a tree (a phase's root workflow nests its own
// children — `sprint-0` nests `timeline`, `product-brief`, and so on), but a Kanban lane shows
// siblings, not a hierarchy: `sprint-0` and everything it nests all belong to the SAME phase, so
// they all become cards in the SAME lane. `flattenPhase` below is the one place that walks the tree
// — nothing about what was already fetched changes, this is presentation only. Where the accordion
// version put a node's own task list inline under a `<details>`, that same list is now what a
// double-click's popup shows — the data is identical, only where it renders moved.
//
// NO DRAG. These cards are a mirror of state, not a board someone plans by dragging across — the
// column a card is in is decided by `planFor`, never by a viewer's mouse.

import { useState } from "react";
import type { PlanPhase, PlanWorkflowNode, PlanCycle, PlanTaskNode } from "@/app/lib/data/plan-view";
import { Tag } from "@/app/_ui/primitives";

const STATE_LABEL: Record<string, string> = {
  idle: "not started", open: "in progress", closed: "closed",
  running: "running", awaiting: "waiting", hitl: "awaiting approval",
};
const STATE_TONE: Record<string, "outline" | "accent" | "accent-2"> = {
  idle: "outline",
  open: "accent", running: "accent", awaiting: "accent", hitl: "accent",
  closed: "accent-2",
};

function StateChip({ state }: { state: string }) {
  return <Tag tone={STATE_TONE[state] ?? "outline"}>{STATE_LABEL[state] ?? state}</Tag>;
}

/** One lane's cards — the node itself, then whatever it nests, walked all the way down. Order is
 *  depth-first: a workflow's own card comes before the cards for what it opens, which is the same
 *  order its tasks appear in the source tree. */
function flattenPhase(roots: PlanWorkflowNode[]): PlanWorkflowNode[] {
  const out: PlanWorkflowNode[] = [];
  const walk = (nodes: PlanWorkflowNode[]) => {
    for (const n of nodes) {
      out.push(n);
      for (const step of n.steps) walk(step.nested);
    }
  };
  walk(roots);
  return out;
}

type Selected =
  | { kind: "workflow"; node: PlanWorkflowNode }
  | { kind: "cycle"; cycle: PlanCycle };

function WorkflowCard({ node, engagement, onOpen }: {
  node: PlanWorkflowNode; engagement: string; onOpen: () => void;
}) {
  return (
    <div
      className="plan-card"
      role="button"
      tabIndex={0}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      title="Double-click for details"
    >
      <div className="plan-card-head">
        <span className="plan-card-title">{node.label}</span>
        <StateChip state={node.state} />
      </div>
      <div className="plan-card-meta">
        {node.ownerRole && <span className="chip">{node.ownerRole}</span>}
        {node.totalCount > 0 && (
          <span className="text-muted plan-count">{node.closedCount}/{node.totalCount} closed</span>
        )}
      </div>
    </div>
  );
}

function CycleCard({ cycle, onOpen }: { cycle: PlanCycle; onOpen: () => void }) {
  const count = cycle.issues?.length ?? null;
  return (
    <div
      className="plan-card"
      role="button"
      tabIndex={0}
      onDoubleClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      title="Double-click for details"
    >
      <div className="plan-card-head">
        <span className="plan-card-title">{cycle.label}</span>
        {cycle.issues === null && <Tag tone="outline">tracker unavailable</Tag>}
      </div>
      <div className="plan-card-meta">
        {count !== null && (
          <span className="text-muted plan-count">{count} issue{count === 1 ? "" : "s"}</span>
        )}
      </div>
    </div>
  );
}

function TaskDetailRow({ task, engagement }: { task: PlanTaskNode; engagement: string }) {
  const href = `/e/${engagement}/jobs/${task.taskId}${task.roleCode ? `?role=${task.roleCode}` : ""}`;
  return (
    <tr className="row">
      <td><a href={href} className="plan-row-title">{task.title}</a></td>
      <td>{task.roleCode ?? "—"}</td>
      <td><StateChip state={task.state} /></td>
    </tr>
  );
}

function DetailModal({ selected, engagement, onClose }: {
  selected: Selected; engagement: string; onClose: () => void;
}) {
  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="dialog plan-modal" role="dialog" aria-modal="true">
        <div className="plan-modal-head">
          <span className="dialog-title">
            {selected.kind === "workflow" ? selected.node.label : selected.cycle.label}
          </span>
          <button className="btn btn-secondary btn-compact" onClick={onClose}>Close</button>
        </div>

        {selected.kind === "workflow" ? (
          selected.node.steps.length === 0 ? (
            <p className="text-muted">Not opened yet.</p>
          ) : (
            <table className="queue-table plan-issue-table">
              <thead><tr><th>Task</th><th>Role</th><th>State</th></tr></thead>
              <tbody>
                {selected.node.steps.map((s) => (
                  <TaskDetailRow key={s.taskId} task={s} engagement={engagement} />
                ))}
              </tbody>
            </table>
          )
        ) : selected.cycle.issues === null ? (
          <p className="text-muted">
            The tracker isn&apos;t reachable for this cycle — check the engagement&apos;s Jira credentials.
          </p>
        ) : selected.cycle.issues.length === 0 ? (
          <p className="text-muted">Nothing labelled for this cycle yet.</p>
        ) : (
          <table className="queue-table plan-issue-table">
            <thead><tr><th>Key</th><th>Summary</th><th>Status</th><th>Assignee</th></tr></thead>
            <tbody>
              {selected.cycle.issues.map((i) => (
                <tr key={i.key} className="row">
                  <td>{i.key}</td>
                  <td>{i.summary}</td>
                  <td>{i.status}</td>
                  <td>{i.assignee ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function PlanBoard({ phases, engagement }: {
  phases: PlanPhase[]; engagement: string; role: string;
}) {
  const [selected, setSelected] = useState<Selected | null>(null);

  return (
    <>
      <div className="plan-board">
        {phases.map((phase) => {
          const cards = flattenPhase(phase.roots);
          return (
            <div key={phase.code} className="plan-lane">
              <div className="plan-lane-head">
                <h3 className="phases-head">{phase.label}</h3>
                <span className="text-muted plan-count">{cards.length + (phase.cycles?.length ?? 0)}</span>
              </div>
              <div className="plan-lane-cards">
                {phase.cycles?.map((c) => (
                  <CycleCard key={`cycle-${c.n}`} cycle={c} onOpen={() => setSelected({ kind: "cycle", cycle: c })} />
                ))}
                {cards.length === 0 && !phase.cycles?.length ? (
                  <p className="text-muted plan-lane-empty">Not opened yet.</p>
                ) : (
                  cards.map((node) => (
                    <WorkflowCard
                      key={node.runId ?? node.taskId ?? node.code}
                      node={node}
                      engagement={engagement}
                      onOpen={() => setSelected({ kind: "workflow", node })}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <DetailModal selected={selected} engagement={engagement} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
