// The generic per-role workflow specs — ONE definition, imported by both the server runner
// (app/api/workflow/route.ts) and the client (which needs the key→label map to render buttons).
//
// #148: these used to live inside the route module, which forced a hand-kept "client-safe mirror"
// in lib/data.ts (`GENERIC_WORKFLOWS`) with only a code comment enforcing the sync. A key present
// in one and not the other is either a button that renders and does nothing, or an action with no
// button — and both had to be caught by eye. The specs are pure data with no server imports, so
// they were only un-importable because of where the file sat. `GENERIC_WORKFLOWS` is now DERIVED.
//
// A spec says who owns the workflow, what artifact it produces, and whether a human must gate it.
// The runner does startWork → produce artifact → handoff (gated) | resolve.
export type WorkflowSpec = {
  role: string;               // roleCode that owns the workflow
  verb: string;               // human label for the artifact ("Design spec", "Security scan"…)
  artifact: "confluence" | "comment";
  gate: boolean;              // true = a human must approve → Awaiting HITL approval
  gateRole?: string;          // who approves (default pm)
  focus: string;              // the role-specific instruction handed to the agent
};

export const WORKFLOW_SPECS: Record<string, WorkflowSpec> = {
  "design-spec":    { role: "designer",     verb: "Design spec",      artifact: "confluence", gate: true,  gateRole: "pm",       focus: "Produce a design spec: user flows, key screens (described), states, and interaction notes. Functional, not visual pixel-detail." },
  "copy":           { role: "ux-writer",    verb: "UX copy",          artifact: "confluence", gate: true,  gateRole: "pm",       focus: "Produce the UX copy deck: screen-by-screen microcopy, empty/error/success states, and voice notes. Exact strings, ready to paste." },
  "tech-design":    { role: "architect",    verb: "Tech design",      artifact: "confluence", gate: true,  gateRole: "engineer", focus: "Produce a technical design: approach, key components/interfaces, data shape, risks, and a build sequence. No code." },
  "bet-architecture":{ role: "architect",   verb: "Epic architecture",artifact: "confluence", gate: true,  gateRole: "engineer", focus: "Produce the epic-level architecture: boundaries, sequencing of the stories, and cross-cutting concerns." },
  "launch-plan":    { role: "gtm",          verb: "Launch plan",      artifact: "confluence", gate: true,  gateRole: "pm",       focus: "Produce a go-to-market launch plan: audience, positioning, channels, timeline, and success metrics." },
  "release-comms":  { role: "gtm",          verb: "Release comms",    artifact: "confluence", gate: true,  gateRole: "pm",       focus: "Produce release communications: changelog-style highlights, an internal note, and a customer-facing announcement." },
  "execute-change": { role: "sre",          verb: "Change plan",      artifact: "comment",    gate: true,  gateRole: "delivery-manager", focus: "Produce a change-execution plan: steps, blast radius, rollback, and verification checks. Concise, checklist-style." },
  "e2e":            { role: "automation",   verb: "E2E test plan",    artifact: "comment",    gate: false,                       focus: "Produce an end-to-end test plan: the critical user journeys, cases, and expected assertions. Checklist-style." },
  "review-pr":      { role: "reviewer",     verb: "PR review",        artifact: "comment",    gate: false,                       focus: "Produce a code-review summary against the acceptance criteria: risks, gaps, and a clear approve/needs-work call." },
  "scan":           { role: "scanner",      verb: "Security scan",    artifact: "comment",    gate: false,                       focus: "Produce a security scan summary: likely risk areas for this work, severity, and recommended mitigations." },
  "docs":           { role: "tech-writer",  verb: "Docs update",      artifact: "confluence", gate: false,                       focus: "Produce the docs update this work implies: what pages change and the new/updated content." },
  "runbook":        { role: "sre",          verb: "Runbook",          artifact: "confluence", gate: false,                       focus: "Produce an operational runbook: alerts, dashboards, common failures, and step-by-step responses." },
  "status":         { role: "delivery-manager", verb: "Status roll-up", artifact: "comment", gate: false,                       focus: "Produce a crisp delivery status roll-up for this ticket: state, risks, and next step." },
};

// Workflow keys the generic runner (/api/workflow) can execute → their human label. DERIVED from
// the specs, so it can no longer drift from what it describes.
export const GENERIC_WORKFLOWS: Record<string, string> = Object.fromEntries(
  Object.entries(WORKFLOW_SPECS).map(([key, spec]) => [key, spec.verb]),
);
