// Onboarding an organisation.
//
// THIS PATH DID NOT EXIST. Until now the only way an `org` row came into being was
// `import/store.ts`, which creates one lazily on the first seed import as `{ code, name: code }` —
// so an organisation appeared as a SIDE EFFECT of loading configuration, named after its own slug,
// with nobody attached to it and nothing recording whether it was a customer or somebody's test.
//
// Migration 054 added the columns that answer that (`status`, `onboarded_at`, `owner`, `domain`)
// and deliberately defaulted `status` to 'onboarding', precisely so a lazily-created org could
// never read as live. This is the function that makes one live on purpose.
//
// AND IT STAFFS THE PMO ANALYST, which is the reason it exists rather than being a form over four
// columns. The PMO Analyst owns `setup` — the phase that brings an engagement into being — so
// somebody has to hold that role BEFORE the first engagement does. 056 made that expressible by
// giving `member` an `org_id` and letting `engagement_id` be null. Staffing them here is what makes
// "an org always has a PMO analyst" true by construction rather than by hoping somebody remembers.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { emit } from "./events";

export type NewOrg = {
  /** The slug everything else keys on — `orgCode` in every other signature here. */
  code: string;
  name: string;
  /** Who at Compass owns this relationship. Required: see below. */
  owner: string;
  /** The PMO Analyst's name. Required — an org with no PMO Analyst cannot run `setup`. */
  pmoAnalyst: string;
  /** Email domain, lowercase. Optional; how a person is matched to an org at sign-in. */
  domain?: string;
};

export type OrgResult = {
  orgId: string;
  problems: string[];
};

const initialsOf = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Bring an organisation into being, with the one role that cannot wait for an engagement.
 *
 * REFUSES RATHER THAN INVENTS, the same instinct the importer has. An org with no owner and no PMO
 * Analyst is the shape this function exists to prevent: `createEngagement` learned the same lesson
 * the hard way — intake happily made an engagement with no members, so no role had a holder, the
 * queue resolved to nobody and the page 404'd.
 *
 * `status: 'active'` with `onboarded_at` set, together. 054's check constraint requires them to
 * agree, and the pairing is the point: "active since never" is a status that looks fine and means
 * nothing.
 */
export async function createOrg(input: NewOrg): Promise<OrgResult> {
  const sb = supabaseAdmin();
  if (!sb) return { orgId: "", problems: ["Supabase is not configured."] };

  const code = slug(input.code);
  const name = input.name?.trim();
  const owner = input.owner?.trim();
  const pmo = input.pmoAnalyst?.trim();

  const refusals: string[] = [];
  if (!code) refusals.push("No code. Everything else keys on it.");
  if (!name) refusals.push("No name.");
  if (!owner) refusals.push("No owner. An organisation nobody owns is the status theatre this replaces.");
  if (!pmo) refusals.push("No PMO Analyst. Nobody could run `setup`, so no engagement could start.");
  // Lowercase is ENFORCED by a check constraint rather than corrected on write, so that a caller
  // which does not normalise fails loudly instead of being silently fixed. Refuse here, where the
  // message can say which value and why.
  if (input.domain && input.domain !== input.domain.toLowerCase())
    refusals.push(`Domain "${input.domain}" is not lowercase. Acme.com and acme.com are one organisation and Postgres will not say so.`);
  if (refusals.length) return { orgId: "", problems: refusals };

  const { data: taken } = await sb.from("org").select("id, status").eq("code", code).maybeSingle();
  if (taken) {
    // A lazily-created org from a seed import is the expected collision, and adopting it is right —
    // it is the same organisation, it just came into being sideways. Adopting a LIVE one is not:
    // that would silently rewrite an onboarded customer's name and owner.
    if (taken.status !== "onboarding")
      return { orgId: "", problems: [`An organisation with code "${code}" is already ${taken.status}.`] };
  }

  const row = {
    code,
    name,
    owner,
    domain: input.domain ?? null,
    status: "active" as const,
    onboarded_at: new Date().toISOString(),
  };

  const { data: org, error: orgErr } = taken
    ? await sb.from("org").update(row).eq("id", taken.id).select("id").single()
    : await sb.from("org").insert(row).select("id").single();

  if (orgErr || !org) return { orgId: "", problems: [`create organisation: ${orgErr?.message ?? "no row returned"}`] };

  const problems: string[] = [];

  // The org's PMO Analyst: `engagement_id` null, which 056 defines as "on every engagement in this
  // org". `upsert` on the unique index rather than `insert`, so re-onboarding replaces the holder
  // instead of failing on a constraint the caller cannot see.
  const { error: memberErr } = await sb.from("member").upsert(
    {
      id: `${code}-pmo-analyst`,
      org_id: org.id,
      engagement_id: null,
      role: "pmo-analyst",
      name: pmo,
      title: "PMO Analyst",
      initials: initialsOf(pmo),
      ord: 0,
    },
    { onConflict: "id" },
  );
  if (memberErr) problems.push(`staff the PMO analyst: ${memberErr.message}`);

  await emit({
    engagementId: null,
    orgId: org.id as string,
    subjectType: "org",
    subjectId: org.id as string,
    verb: "org.onboarded",
    actorKind: "human",
    actorRoleCode: "pmo-analyst",
    payload: { code, name, owner, pmoAnalyst: pmo },
  });

  return { orgId: org.id as string, problems };
}
