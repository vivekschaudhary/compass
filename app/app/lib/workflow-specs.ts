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
  command?: string;           // the /slash-command this spec implements, when it has one.
                              // Sprint 0 tickets name their closing workflow as "via /x" in
                              // their acceptance; this is what lets that card offer a REAL
                              // action instead of being informational. One definition, per #148.
};

export const WORKFLOW_SPECS: Record<string, WorkflowSpec> = {
  // ── Foundation (Sprint 0) ──
  // The head of the lifecycle, and the workflow that closes Sprint 0 ticket #2 ("Create
  // product foundation"). The EVIDENCE half is the app's existing research workflow
  // (`/api/research` + ResearchModal) — run and approve that first; this is deliberately
  // not a second research implementation. Gated, because an approved product brief is a
  // commitment a human has to actually sign off on.
  "product-brief":  { role: "pm",           verb: "Product brief",     artifact: "confluence", gate: true, gateRole: "pm", command: "/create-product-brief",
                      focus: "Produce the engagement's product brief with these sections, all mandatory: Vision · Target users · Problem · Access & data posture · Scope (in and out) · Objectives and Key Results. Every Key Result needs a metric, baseline, target and timeframe — a KR with no threshold is not done. Access & data posture means auth posture, data sensitivity and regulatory regime: these are PRODUCT decisions architecture derives from, so state them explicitly or record why each is not applicable. Do NOT infer them — where you lack the answer, say so and list it as an open question with 3 concrete options for the human to choose from rather than guessing." },

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

// /slash-command → the spec keys that implement it, in run order. DERIVED, so a Sprint 0
// card can ask "is my closing workflow runnable yet?" without a second hand-kept list.
// A command maps to MORE than one key when it gates more than once (product brief:
// research, then the brief itself).
export const SPECS_BY_COMMAND: Record<string, string[]> = Object.entries(WORKFLOW_SPECS)
  .reduce((acc, [key, spec]) => {
    if (spec.command) (acc[spec.command] ??= []).push(key);
    return acc;
  }, {} as Record<string, string[]>);

/** The next spec key to run for a /command, or undefined when the command isn't app-runnable. */
export function firstSpecForCommand(command?: string | null): string | undefined {
  return command ? SPECS_BY_COMMAND[command]?.[0] : undefined;
}
