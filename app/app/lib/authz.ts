import { supabaseAdmin } from "./supabase";

// Who may do what.
//
// READ THIS BEFORE RELYING ON IT: there is no authentication in this app. `actor` is a string the
// client sends and nothing verifies it. So this module answers "what would this identity be
// allowed to do", not "who is this" — the second question has no trustworthy answer yet.
//
// It exists anyway because the alternative is worse: without a single place to ask, permission
// logic ends up inlined across an editor, an API route and a promote action, and wiring real auth
// later means finding all of them. There is one call site per capability, and one function to
// change when a login exists.
//
// Call sites ask for a CAPABILITY, never a role. `can(actor, "edit-org-defaults")` survives the
// mapping changing; `role === "org-admin"` scattered through routes does not.

/** Platform roles — about operating Compass. Deliberately NOT in COMPASS_ROLES, which is the
 *  DELIVERY vocabulary that drives agent dispatch and the per-role job queues: adding "org-admin"
 *  there would conjure an org-admin work queue and an org-admin agent. */
export const PLATFORM_ROLES = ["org-admin", "engagement-admin"] as const;

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

/** Every role an actor holds, org-wide plus (optionally) on one engagement. */
export async function rolesFor(actor: string | null | undefined, engagementId?: string): Promise<string[]> {
  const sb = supabaseAdmin();
  if (!sb || !actor?.trim()) return [];
  const { data } = await sb.from("user_role").select("role, engagement_id").eq("user_id", actor.trim());
  // An org-wide grant (null engagement_id) applies everywhere; a scoped grant only on its own
  // engagement. Filtering here rather than in the query keeps it one round trip.
  return (data ?? [])
    .filter((r) => r.engagement_id === null || (engagementId && r.engagement_id === engagementId))
    .map((r) => r.role);
}

/**
 * Whether `actor` holds a capability.
 *
 * BOOTSTRAP: while no user exists at all, this returns true. An unconfigured install is a single
 * operator running their own control tower, and refusing them access to the screens that would
 * create the first user is a deadlock — you would have to reach for the SQL editor, which is the
 * exact thing this work exists to avoid. The moment ONE user row exists the system is considered
 * configured and grants are enforced.
 *
 * That trade is only sound because there is no login yet: an open install is already open. It
 * MUST be revisited when auth lands — see the open issue.
 */
export async function can(
  actor: string | null | undefined, capability: Capability, engagementId?: string,
): Promise<boolean> {
  const sb = supabaseAdmin();
  if (!sb) return false;
  const { count } = await sb.from("app_user").select("id", { count: "exact", head: true });
  if (!count) return true;                                   // unconfigured → single-operator mode
  const held = await rolesFor(actor, engagementId);
  return held.some((r) => GRANTS[capability].includes(r));
}

/** A refusal that names the capability, so the UI can say what is missing rather than "denied". */
export function permissionRefusal(capability: Capability): string {
  return `Not permitted: "${capability}" requires one of ${GRANTS[capability].join(", ")}.`;
}
