// Putting the uploaded original on the page its text was published to.
//
// Compass keeps no file store, deliberately. The doc store already holds the record for everyone
// who does not open Compass — `[docs-primary]` — so the contract a client actually sent belongs on
// the same page as the text derived from it, where the person approving it can open both. A second
// store here would be one more thing to secure, back up, and clear on reset.
//
// NEVER FATAL. The document is filed, versioned and published before this runs; that is the
// deliverable. A failed attachment is reported on the task, the way a failed publish already is —
// and it is reported, because an original that silently never arrived is indistinguishable from one
// nobody uploaded.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { attachToProviderDoc } from "../docstore";
import type { DocEng } from "../docstore";
import type { Actor } from "./actor";
import type { FiledAnswer } from "./job";
import { noteFromCompass } from "./job";
import { emit } from "./events";

export type Attached = { path: string; filename: string; ok: boolean; error?: string };

/**
 * Attach one uploaded file to each document this answer filed.
 *
 * `filed` comes back from `recordAnswers`, so the page id is the one just published rather than one
 * looked up again — a second lookup could find a different page if the path moved between the two.
 */
export async function attachOriginal(
  actor: Actor,
  taskId: string,
  filed: FiledAnswer[],
  file: { name: string; type?: string | null; bytes: ArrayBuffer },
): Promise<Attached[]> {
  if (!filed.length) return [];

  const sb = supabaseAdmin();
  if (!sb) return [];

  // ONE STRING, as `publish.ts` writes the identical select. Broken across lines with `+`, the
  // client's types cannot read the column list and the row comes back as `GenericStringError` —
  // it type-checks nowhere and only fails at the cast.
  const { data: eng } = await sb.from("engagement")
    .select("id, name, docs_provider, confluence_space, confluence_root_page_id, atlassian_base_url, atlassian_email, atlassian_api_token, teams_site, teams_root_item_id, graph_tenant_id, graph_client_id, graph_client_secret")
    .eq("id", actor.engagementId).maybeSingle();
  if (!eng) return [];

  const out: Attached[] = [];
  for (const f of filed) {
    // No page means publishing failed, and `fileAnswer` already said so on the task. Attaching to
    // nothing is not an error worth a second note about the same failure.
    if (!f.externalId) continue;

    const result = await attachToProviderDoc(eng as DocEng, f.externalId, file);

    if (result.ok) {
      out.push({ path: f.path, filename: file.name, ok: true });
      await emit({
        engagementId: actor.engagementId, subjectType: "document", subjectId: f.versionId,
        verb: "document.original_attached", actorKind: "human",
        actorRoleCode: actor.roleCode, actorUserId: actor.holder ?? actor.roleCode,
        payload: { taskId, path: f.path, filename: file.name, bytes: file.bytes.byteLength },
      });
      continue;
    }

    out.push({ path: f.path, filename: file.name, ok: false, error: result.error });
    await noteFromCompass(
      actor, taskId,
      `\`${f.path}\` is filed and published from \`${file.name}\`, but attaching the original to ` +
      `the page failed: ${result.error}\n\nThe document is complete; what is missing is the file ` +
      `itself beside it.`,
    );
  }

  return out;
}
