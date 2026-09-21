// A person editing a section of a draft, on the record.
//
// The engagement's rule is "don't edit outside the app", not "don't edit". An edit made in
// Confluence has no author, no version and no trail, and the next publish overwrites it without
// anyone noticing — so the answer is to make editing HERE the better option, which means it has to
// be at least as well recorded as an agent's draft.
//
// REUSES `file_document`. That routine already derives the next version, sets the actor for the
// audit trigger, and refuses an empty section list. A second write path would be a second set of
// those rules to keep in agreement, and this repo has been bitten by exactly that shape before.
//
// THE FLOOR CANNOT BE BROKEN HERE, BY CONSTRUCTION. A templated document must contain every section
// its template declares, and the obvious risk is a person deleting one. So this operation edits a
// section's BODY and nothing else: it cannot add, remove, rename or reorder. There is no floor
// check because there is no way to fail it — which is a better guarantee than a check, since a
// check can be forgotten by whoever adds the next write path. If section add/remove is ever
// offered, it needs `missingSections` applied the way `runAgent` applies it.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { emit } from "./events";
import type { Actor } from "./actor";

export type EditResult =
  | { ok: true; version: string }
  | { ok: false; error: string };

/**
 * Replace one section's body, as a new version authored by this person.
 *
 * `sectionId` identifies the section within the CURRENT version. If someone else has filed a new
 * version since the page was rendered — the agent re-ran, another reviewer saved — the id will not
 * be found, and this refuses rather than guessing which of the new sections was meant. Overwriting
 * on a stale read is how one person's edit silently erases another's.
 */
export async function editSection(
  actor: Actor,
  path: string,
  sectionId: string,
  body: string,
): Promise<EditResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  if (!body.trim()) {
    // An empty body is almost never the intent, and it is indistinguishable from a section that was
    // deleted — which is the one thing this path must not be able to do.
    return { ok: false, error: "A section cannot be emptied. Say what it should contain, or ask the agent to remove it." };
  }

  const { data: doc } = await sb
    .from("document")
    .select("id, title, current_version_id, owner_role_code")
    .eq("engagement_id", actor.engagementId)
    .eq("path", path)
    .maybeSingle();
  if (!doc?.current_version_id) return { ok: false, error: `No document at ${path}.` };

  const { data: sections } = await sb
    .from("document_section")
    .select("id, heading, body, ord, edited")
    .eq("document_version_id", doc.current_version_id)
    .order("ord");
  if (!sections?.length) return { ok: false, error: "That version has no sections." };

  const target = sections.find((s) => s.id === sectionId);
  if (!target) {
    return {
      ok: false,
      error:
        "That section is not in the current version — it has been redrafted since this page was " +
        "loaded. Reload and make the change again.",
    };
  }
  if (target.body === body) return { ok: false, error: "Nothing changed." };

  const { data: eng } = await sb
    .from("engagement").select("org_id").eq("id", actor.engagementId).maybeSingle();
  if (!eng?.org_id) return { ok: false, error: "Could not resolve the organisation." };

  const who = actor.holder ?? actor.roleCode;

  const { data: versionId, error } = await sb.rpc("file_document", {
    p_org_id: eng.org_id,
    p_engagement_id: actor.engagementId,
    p_path: path,
    p_title: doc.title,
    p_sections: sections.map((s) => ({
      heading: s.heading,
      body: s.id === sectionId ? body : s.body,
    })),
    p_actor: who,
    p_actor_role: actor.roleCode,
    p_owner_role: doc.owner_role_code,
  });
  if (error) return { ok: false, error: error.message };

  // Authorship, and which sections a person has touched.
  //
  // Written after filing rather than passed through `file_document`: the routine's signature is the
  // agent's contract and every caller would have to learn two more parameters to say "an agent did
  // this", which is what they all mean. The cost is that a failure here leaves a correctly filed
  // version attributed to an agent, so it is reported rather than swallowed.
  const { error: attrErr } = await sb
    .from("document_version")
    .update({ author_kind: "human", authored_by: who })
    .eq("id", versionId as string);

  // `edited` is CARRIED FORWARD, not just set on this one. Sections are created fresh per version,
  // so a section a person rewrote two versions ago would quietly lose the mark — and its citations
  // would start reading as though they described the current text again.
  const editedHeadings = new Set(
    sections.filter((s) => s.edited || s.id === sectionId).map((s) => s.heading as string),
  );
  const { error: flagErr } = await sb
    .from("document_section")
    .update({ edited: true })
    .eq("document_version_id", versionId as string)
    .in("heading", [...editedHeadings]);

  const { data: filed } = await sb
    .from("document_version").select("version").eq("id", versionId as string).maybeSingle();

  await emit({
    engagementId: actor.engagementId,
    subjectType: "document",
    subjectId: versionId as string,
    verb: "document.edited",
    actorKind: "human",
    actorRoleCode: actor.roleCode,
    actorUserId: who,
    payload: { path, section: target.heading, version: filed?.version ?? null },
  });

  if (attrErr || flagErr) {
    return {
      ok: false,
      error:
        `The edit was filed as v${filed?.version ?? "?"}, but its authorship could not be ` +
        `recorded: ${(attrErr ?? flagErr)!.message}. The version exists and may be attributed ` +
        `to the agent.`,
    };
  }

  return { ok: true, version: (filed?.version as string) ?? "?" };
}
