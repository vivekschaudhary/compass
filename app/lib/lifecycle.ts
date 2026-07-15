import type { SupabaseClient } from "@supabase/supabase-js";
import { transitionIssue, addRemoteLink, addComment, type JiraCreds } from "./jira";

// The AI-native ticket lifecycle — the cross-cutting spine EVERY role's workflow uses so Jira
// reflects ground truth in real time. Status = phase (this small stable set); role = a label
// (see DELIVERY_ROLES); assignee = who has the ball. Never multiply statuses by role.
export const STATUS = {
  backlog: "Backlog",                 // raw, just created (KAN's leftmost status)
  ready: "To Do",                     // refined — an agent can pick it up
  inProgress: "In Progress",          // an agent is executing
  gate: "Awaiting HITL approval",     // AI done — a human must decide (the first-class HITL gate)
  done: "Done",                       // approved / complete
} as const;

// The delivery roles that OWN a story (and become its Jira label). Creation/gate roles
// (pm, product-owner, delivery-manager) don't own build tickets, so they're not in this set.
export const DELIVERY_ROLES = ["researcher", "designer", "ux-writer", "engineer", "automation", "architect", "reviewer", "tech-writer", "gtm", "sre", "scanner"] as const;

// Coerce a model-provided or user-provided role into a valid, label-safe code (default engineer).
export function normalizeRole(raw: string | undefined | null, fallback = "engineer"): string {
  const r = (raw ?? "").toLowerCase().trim().replace(/\s+/g, "-");
  return (DELIVERY_ROLES as readonly string[]).includes(r) ? r : fallback;
}

type Step = (s: string) => void;

// Move a ticket to `status`, logging the outcome honestly into the step stream. Returns whether
// the ticket ended up in that status (false when Jira isn't wired or the status isn't on the board).
async function moveTo(jira: JiraCreds | null, ticket: string, status: string, step: Step): Promise<boolean> {
  if (!jira) { step(`  • ${ticket} → ${status} (local — Jira not wired)`); return false; }
  const ok = await transitionIssue(jira, ticket, status);
  step(`  ${ok ? "✓" : "•"} ${ticket} → ${status}${ok ? "" : " (skipped — add the status to the board?)"}`);
  return ok;
}

// An agent has picked up the ticket → In Progress.
export function startWork(jira: JiraCreds | null, ticket: string, step: Step) {
  return moveTo(jira, ticket, STATUS.inProgress, step);
}

// Work is complete and needs no human gate → Done.
export function resolveWork(jira: JiraCreds | null, ticket: string, step: Step) {
  return moveTo(jira, ticket, STATUS.done, step);
}

// A build/fix run went green → the Engineer agent's deliverable is a PR. Treat the PR as the HITL
// gate exactly like a doc's approval: link the PR on the ticket, move it to Awaiting HITL approval,
// and file the generic approve-<ticket> job. Approve (= merge reviewed) → Done, via the same handler.
export async function gateOnPr(
  sb: SupabaseClient,
  jira: JiraCreds | null,
  opts: { ticket: string; engagementId: string; workflow: "build" | "fix"; log: string },
  step: Step,
) {
  const pr = (opts.log.match(/https?:\/\/github\.com\/[^\s)\]]+\/pull\/\d+/) || [])[0];
  if (jira && pr) {
    await addRemoteLink(jira, opts.ticket, pr, `PR — ${opts.ticket}`);
    await addComment(jira, opts.ticket, `${opts.workflow === "fix" ? "Fix" : "Build"} complete — PR ready for review: ${pr}`);
    step(`  ✓ PR linked on ${opts.ticket} — ${pr}`);
  } else {
    step(`  • no PR URL found in the run output`);
  }
  await handoffForApproval(sb, jira, {
    ticket: opts.ticket, engagementId: opts.engagementId, gateRole: "engineer",
    title: `Review PR — ${opts.ticket}`,
    subtitle: pr ? "The engineer agent built it and opened a PR. Review + merge, then approve." : `${opts.workflow} complete — review, then approve.`,
    related: pr ?? opts.ticket, hook: `${opts.workflow}:${opts.ticket}`,
  }, step);
}

// AI produced a deliverable and a human must sign off → Awaiting HITL approval, and a generic
// `approve-<ticket>` job is filed for the gating role. One handshake for every role's gate.
export async function handoffForApproval(
  sb: SupabaseClient,
  jira: JiraCreds | null,
  opts: { ticket: string; engagementId: string; gateRole: string; title: string; subtitle?: string; related?: string; hook?: string },
  step: Step,
) {
  await moveTo(jira, opts.ticket, STATUS.gate, step);
  try {
    await sb.from("job").upsert({
      id: `approve-${opts.ticket}`, engagement_id: opts.engagementId, role: opts.gateRole, kind: "approve",
      title: opts.title,
      subtitle: opts.subtitle ?? "AI finished this — review the work, then approve to move it to Done.",
      meta: opts.hook ?? "hitl approval", related: opts.related ?? opts.ticket,
      primary_label: "Approve", secondary_label: null, tone: "default", ord: 0,
    });
    step(`  ✓ HITL approval filed for ${opts.gateRole}`);
  } catch { step(`  • approval job not filed (jobs table?)`); }
}
