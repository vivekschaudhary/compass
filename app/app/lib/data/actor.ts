// Who is acting, and how much they may see.
//
// Everything in lib/data takes an Actor. Nothing takes a raw engagement id and a hope that the
// caller remembered to filter — that is how v1's cross-engagement leak happened, where an
// unfiltered `story` fetch put another client's slipping story into a brand-new engagement's
// "Needs attention", and it was caught by eye and patched in JavaScript.
//
// Scope comes from the role's row, not from a constant in the code. A practice can change what a
// role sees by re-importing a CSV, and no query changes.

import "server-only";
import { supabaseAdmin, must } from "../supabase";

export type Scope = "mine" | "workstream" | "everyone";

export type Actor = {
  orgId: string;
  engagementId: string;
  roleCode: string;
  roleLabel: string;
  /** The person holding this role on this engagement, from the roster. */
  holder: string | null;
  scope: Scope;
  workstreamCode: string | null;
  /** The agent file that runs this role's work — "PM agent" on a card. */
  agent: string | null;
  tier: string;
  capabilities: string[];
};

/**
 * Resolve the acting identity.
 *
 * THE SEAM. In demo mode the role is whatever the switcher passed. When real identity lands, this
 * reads the session and looks the role up from the user's grants instead — and no call site
 * changes, because every one of them already takes an Actor.
 */
export async function resolveActor(
  engagementId: string,
  roleCode: string,
  orgCode = "default",
): Promise<Actor | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;

  const org = must(
    "read org",
    await sb.from("org").select("id").eq("code", orgCode).maybeSingle(),
  );
  if (!org) return null;

  // Engagement override first, org default second — the same precedence reads use everywhere.
  const roles = must(
    "read role",
    await sb
      .from("role")
      .select(
        "code, label, tier, scope, workstream_code, agent, capabilities, engagement_id",
      )
      .eq("org_id", org.id)
      .eq("code", roleCode)
      .or(`engagement_id.eq.${engagementId},engagement_id.is.null`),
  );

  const role = (roles ?? []).find((r) => r.engagement_id) ?? (roles ?? [])[0];
  if (!role) return null;

  const { data: member } = await sb
    .from("member")
    .select("name")
    .eq("engagement_id", engagementId)
    .eq("role", roleCode)
    .maybeSingle();

  return {
    orgId: org.id,
    engagementId,
    roleCode: role.code,
    roleLabel: role.label,
    holder: member?.name ?? null,
    scope: (role.scope ?? "mine") as Scope,
    workstreamCode: role.workstream_code ?? null,
    agent: role.agent ?? null,
    tier: role.tier ?? "practitioner",
    capabilities: role.capabilities ?? [],
  };
}

/** Every role on this engagement that has a row — what the "Working as" switcher offers. */
export async function rolesOnEngagement(
  engagementId: string,
  orgCode = "default",
) {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: org } = await sb
    .from("org")
    .select("id")
    .eq("code", orgCode)
    .maybeSingle();
  if (!org) return [];

  const { data: roles } = await sb
    .from("role")
    .select("code, label, tier")
    .eq("org_id", org.id)
    .eq("enabled", true)
    .order("code");
  const { data: members } = await sb
    .from("member")
    .select("name, role")
    .eq("engagement_id", engagementId);

  const holderOf = new Map(
    (members ?? []).map((m) => [m.role, m.name as string | null]),
  );

  // Ordered by tier, not alphabetically. Alphabetical put `architect` first, which meant a visit
  // with no ?role= landed on a practitioner scoped to a workstream with no work — an empty queue
  // that looked like a bug. Oversight roles see the engagement, so they are the sane landing.
  const TIER_ORDER: Record<string, number> = {
    oversight: 0,
    practitioner: 1,
    platform: 2,
  };

  return (roles ?? [])
    .map((r) => ({
      code: r.code as string,
      label: r.label as string,
      tier: r.tier as string,
      holder: holderOf.get(r.code) ?? null,
      initials: initialsOf(holderOf.get(r.code) ?? r.label),
    }))
    .sort(
      (a, b) =>
        (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9) ||
        a.label.localeCompare(b.label),
    );
}

function initialsOf(name: string | null): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
