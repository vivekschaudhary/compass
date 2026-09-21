// Which shape a deliverable is expected to arrive in.
//
// Three scopes, most specific first: this engagement's row, then the org's, then the default the
// framework seeded. The same tiering `resolveSpec` gives a file, without `resolveSpec`'s dependency
// on `COMPASS_DIR` — a sibling directory on the filesystem that an app deployed on its own does not
// have. See the migration header for why that mattered enough to justify a table.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { parseTemplate, type ParsedTemplate } from "../render/template";

export type Tier = "engagement" | "org" | "default";

export type ResolvedTemplate = ParsedTemplate & {
  name: string;
  tier: Tier;
  /** The raw markdown, for an editor. The parsed sections are what the agent loop uses. */
  body: string;
};

/**
 * Resolve one template by name.
 *
 * Null means NO ROW AT ANY SCOPE, and the caller must treat that as a halt when a step asked for it
 * by name — never as "draft it free-form". A row that declares `sow` and silently gets no shape
 * produces a document that looks finished and is not the deliverable the process asked for, and
 * nothing downstream can tell the difference.
 *
 * Three queries rather than one `or(...)` filter: PostgREST's `or` across nullable columns is
 * exactly where "engagement_id is null" and "engagement_id = x" get muddled, and the precedence
 * here is the whole point of the function. Reading them in order says what is meant, and a template
 * lookup happens once per run.
 */
export async function templateFor(
  name: string,
  engagementId: string | null,
  orgId: string | null,
): Promise<ResolvedTemplate | null> {
  const sb = supabaseAdmin();
  if (!sb || !name) return null;

  const read = async (tier: Tier): Promise<ResolvedTemplate | null> => {
    let q = sb.from("document_template").select("name, title, body").eq("name", name);
    if (tier === "engagement") {
      if (!engagementId) return null;
      q = q.eq("engagement_id", engagementId);
    } else if (tier === "org") {
      if (!orgId) return null;
      q = q.is("engagement_id", null).eq("org_id", orgId);
    } else {
      q = q.is("engagement_id", null).is("org_id", null);
    }
    const { data } = await q.maybeSingle();
    if (!data?.body) return null;
    return { name, tier, body: data.body, ...parseTemplate(data.body) };
  };

  return (await read("engagement")) ?? (await read("org")) ?? (await read("default"));
}

/** Every template visible to an engagement, most specific winning. For an editor and for listing. */
export async function templatesFor(
  engagementId: string | null,
  orgId: string | null,
): Promise<{ name: string; title: string; tier: Tier }[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data } = await sb
    .from("document_template")
    .select("name, title, org_id, engagement_id");

  // Most specific wins, per name.
  const rank = (r: { org_id: string | null; engagement_id: string | null }): number =>
    r.engagement_id ? 3 : r.org_id ? 2 : 1;
  const visible = (r: { org_id: string | null; engagement_id: string | null }): boolean =>
    r.engagement_id
      ? r.engagement_id === engagementId
      : r.org_id
        ? r.org_id === orgId
        : true;

  const best = new Map<string, { name: string; title: string; tier: Tier; r: number }>();
  for (const row of data ?? []) {
    if (!visible(row)) continue;
    const r = rank(row);
    const tier: Tier = r === 3 ? "engagement" : r === 2 ? "org" : "default";
    const held = best.get(row.name as string);
    if (!held || r > held.r) {
      best.set(row.name as string, { name: row.name as string, title: (row.title as string) ?? "", tier, r });
    }
  }
  return [...best.values()]
    .map(({ name, title, tier }) => ({ name, title, tier }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
