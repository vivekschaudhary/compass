import { supabaseAdmin } from "./supabase";

// Who may do what.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// AUTH MODE — read this before trusting any answer from this module.
//
//   demo  (today, the default)  The actor's roles come from the role picker in the header. That
//                               is a DROPDOWN. Anyone can change it, and the app cannot tell one
//                               person from another. It shapes the UI and demonstrates the
//                               org-admin / delivery-manager distinction; it is NOT a security
//                               control and must never be described as one.
//
//   entra (deferred)            Sign-in against the organisation's Microsoft Entra directory,
//                               roles granted per user in `user_role`. The tables exist (019) and
//                               `rolesFor` already reads them. What is missing is the session.
//
// Everything above the `resolveActor` seam is written once. Switching modes changes ONE function,
// not the call sites — which is the entire reason this module exists rather than `if (role === …)`
// scattered across an editor, an API route and a promote action.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Call sites ask for a CAPABILITY, never a role. `can(actor, "edit-org-defaults")` survives the
// mapping changing; `role === "org-admin"` in a route does not.

export type AuthMode = "demo" | "entra";

/** Default demo, so a fresh clone runs with no identity provider configured. */
export function authMode(): AuthMode {
  return process.env.COMPASS_AUTH_MODE === "entra" ? "entra" : "demo";
}

/** Platform roles — about operating Compass. Deliberately NOT in COMPASS_ROLES, which is the
 *  DELIVERY vocabulary that drives agent dispatch and the per-role job queues: adding "org-admin"
 *  there would conjure an org-admin work queue and an org-admin agent.
 *
 *  In demo mode these are appended to the header's role picker, so the tiering is demonstrable:
 *  an org admin edits the firm's defaults, a delivery manager only their own engagement. */
export const PLATFORM_ROLES = [
  { code: "org-admin", label: "Org Admin", title: "Compass administrator" },
  { code: "engagement-admin", label: "Engagement Admin", title: "Engagement configuration" },
] as const;

export type Capability =
  | "edit-org-defaults"        // change how the whole firm works
  | "edit-engagement-specs"    // adapt one client's process
  | "manage-users";

const GRANTS: Record<Capability, readonly string[]> = {
  "edit-org-defaults": ["org-admin"],
  // A DM adapts their own engagement; an org admin can do anything an engagement admin can.
  "edit-engagement-specs": ["org-admin", "engagement-admin", "delivery-manager"],
  "manage-users": ["org-admin"],
};

/** Who is acting. `roles` is what capabilities are decided from; `userId` is null in demo mode,
 *  because there is genuinely no user — pretending otherwise would put a fictional id into
 *  `updated_by` and an audit trail that reads as real. */
export type Actor = { userId: string | null; roles: string[]; mode: AuthMode };

/**
 * Resolve the acting identity.
 *
 * THE SEAM. In demo mode the role is whatever the caller passed — the header's picker, forwarded
 * by the client. In entra mode this reads the session and looks up granted roles instead, and no
 * call site changes.
 */
export async function resolveActor(input: { role?: string | null; actor?: string | null } = {}): Promise<Actor> {
  if (authMode() === "demo") {
    const role = (input.role ?? "").trim();
    return { userId: null, roles: role ? [role] : [], mode: "demo" };
  }
  // entra: `input.actor` is the authenticated user id; roles come from the grants table.
  const userId = (input.actor ?? "").trim() || null;
  return { userId, roles: userId ? await rolesFor(userId) : [], mode: "entra" };
}

/** Every role a USER holds, org-wide plus (optionally) on one engagement. Entra mode only —
 *  demo mode has no user to look up. */
export async function rolesFor(userId: string | null | undefined, engagementId?: string): Promise<string[]> {
  const sb = supabaseAdmin();
  if (!sb || !userId?.trim()) return [];
  const { data } = await sb.from("user_role").select("role, engagement_id").eq("user_id", userId.trim());
  // An org-wide grant (null engagement_id) applies everywhere; a scoped grant only on its own
  // engagement. Filtering here rather than in the query keeps it one round trip.
  return (data ?? [])
    .filter((r) => r.engagement_id === null || (engagementId && r.engagement_id === engagementId))
    .map((r) => r.role);
}

/**
 * Whether `actor` holds a capability.
 *
 * Identical in both modes — only where `actor.roles` came from differs. In demo that is a
 * dropdown, so this decides what the UI OFFERS, not what a determined person can reach.
 */
export function can(actor: Actor, capability: Capability): boolean {
  return actor.roles.some((r) => GRANTS[capability].includes(r));
}

/** A refusal that names the capability, so the UI can say what is missing rather than "denied". */
export function permissionRefusal(capability: Capability): string {
  return `Not permitted: "${capability}" requires one of ${GRANTS[capability].join(", ")}.`;
}

/** True when the answer above is advisory rather than enforced — so surfaces that let someone
 *  change how every engagement runs can say so out loud instead of implying a control that is
 *  not there. */
export function isAdvisoryOnly(): boolean {
  return authMode() === "demo";
}
