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

/** One person in one role, and whether they are this engagement's or the org's. */
export type Holder = {
  id: string;
  role: string;
  name: string | null;
  /** Null means the org's default — this person holds the role on every engagement in it. */
  engagementId: string | null;
};

/**
 * Who holds which role here: this engagement's roster, with the org's defaults behind it.
 *
 * SOME ROLES BELONG TO THE ORGANISATION, not to any one engagement. The PMO Analyst is the case
 * this exists for — it owns `setup`, the phase that brings an engagement into being, so somebody
 * has to hold it before the first engagement exists. 056 gave `member` an `org_id` and made
 * `engagement_id is null` mean "the org's, on every engagement in it".
 *
 * PRECEDENCE IS PER ROLE, not per query. An engagement that names its own delivery manager uses
 * that person; one that does not falls back to the org's. Resolving it globally — "any engagement
 * row at all suppresses every org default" — would silently drop the PMO analyst the moment
 * somebody was staffed to anything, which is the bug this shape exists to avoid.
 *
 * The same two-tier idiom `role` and `spec_file` already use, and `resolveActor` uses it for the
 * role row twelve lines below. A second convention for one idea is the drift this repo keeps
 * paying for.
 *
 * ORDINARY MULTIPLICITY IS PRESERVED. Two engineers on one engagement is normal, so this returns
 * rows rather than one-per-role and lets callers decide. `tracker.ts` had to avoid `resolveActor`
 * for exactly this reason — its `.maybeSingle()` threw the moment a role had two holders.
 */
export async function holdersOn(engagementId: string): Promise<Holder[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  // The engagement names its own org since 055, so no caller has to pass one.
  const { data: eng } = await sb
    .from("engagement")
    .select("org_id")
    .eq("id", engagementId)
    .maybeSingle();
  if (!eng?.org_id) return [];

  const { data: rows } = await sb
    .from("member")
    .select("id, role, name, engagement_id")
    .eq("org_id", eng.org_id)
    .or(`engagement_id.eq.${engagementId},engagement_id.is.null`)
    .order("ord");

  const staffedHere = new Set(
    (rows ?? []).filter((m) => m.engagement_id).map((m) => m.role as string),
  );

  return (rows ?? [])
    .filter((m) => m.engagement_id || !staffedHere.has(m.role as string))
    .map((m) => ({
      id: m.id as string,
      role: m.role as string,
      name: (m.name as string | null) ?? null,
      engagementId: (m.engagement_id as string | null) ?? null,
    }));
}

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

  // Through `holdersOn`, so an org-level holder is found and a role with two holders does not
  // throw. The previous `.maybeSingle()` did both wrong: it saw only engagement rows, and it
  // errored on the second holder of a role — which `tracker.ts` had already worked around rather
  // than fixed. First by `ord` is the roster's own order.
  const holders = await holdersOn(engagementId);
  const holder = holders.find((h) => h.role === roleCode) ?? null;

  return {
    orgId: org.id,
    engagementId,
    roleCode: role.code,
    roleLabel: role.label,
    holder: holder?.name ?? null,
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
  // Org-level holders included, so the PMO Analyst shows as held rather than vacant on an
  // engagement nobody has staffed them to. First writer per role wins, which is roster order.
  const holderOf = new Map<string, string | null>();
  for (const h of await holdersOn(engagementId)) {
    if (!holderOf.has(h.role)) holderOf.set(h.role, h.name);
  }

  // Ordered by tier, not alphabetically. Alphabetical put `architect` first — the role now called
  // `staff-engineer` — which meant a visit with no ?role= landed on a practitioner scoped to a
  // workstream with no work: an empty queue that looked like a bug. Oversight roles see the
  // engagement, so they are the sane landing. The example is kept in its original spelling because
  // it is a record of what happened, and `staff-engineer` does not sort first.
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
