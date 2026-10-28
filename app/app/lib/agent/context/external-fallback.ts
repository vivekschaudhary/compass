// What an agent is given when Compass has no document for a path it was told to read.
//
// The page may exist where the client keeps it: the document row can point at a Confluence page that
// was never mirrored back, and a ticket's description is often where a story or a design actually
// lives. The order is the one the owner set — Compass's own documents first (the caller has already
// tried them), then the provider page the row points at, then the Jira ticket named by the path.
//
// A source that cannot be read is skipped, not treated as empty, and when none answers the result is
// null: the caller reports the input missing, with the path, rather than inventing one. What comes
// back says where it came from in `version`, because text from a ticket is not a Compass version and
// must not be cited as one.

import "server-only";
import { supabaseAdmin } from "../../supabase";
import { jiraForEngagement, issueText } from "../../jira";
import { readProviderDoc, type DocEng } from "../../docstore";
import type { PinnedInput } from "./types";

type Subject = { ref?: string | null; key?: string | null; epicKey?: string | null } | null;

const TICKET = /^[A-Z][A-Z0-9]+-\d+$/;

/**
 * The Jira key a path points at: `epic/CT-288` and `stories/CT-288` both name the epic, but for a
 * run about one story `stories/…` is best answered by the STORY's own ticket — that is where its
 * text is, and the epic's description does not carry it.
 */
export function ticketForPath(path: string, subject: Subject): string | null {
  const m = /^(epic|stories)\/(.+)$/.exec(path);
  if (!m || !TICKET.test(m[2])) return null;
  if (m[1] === "stories" && subject?.key && subject.epicKey === m[2]) return subject.key;
  return m[2];
}

export async function externalFallback(
  engagementId: string, path: string, subject: Subject,
): Promise<PinnedInput | null> {
  const sb = supabaseAdmin();

  // 1. The provider page the document row points at.
  if (sb) {
    const { data: doc } = await sb.from("document")
      .select("title, provider, external_id").eq("engagement_id", engagementId).eq("path", path).maybeSingle();
    if (doc?.external_id) {
      const { data: eng } = await sb.from("engagement").select("*").eq("id", engagementId).maybeSingle();
      const text = eng ? await readProviderDoc(eng as DocEng, doc).catch(() => null) : null;
      if (text?.trim()) {
        return { path, title: (doc.title as string | null) ?? null, version: "confluence", body: text.trim() };
      }
    }
  }

  // 2. The ticket the path names.
  const key = ticketForPath(path, subject);
  if (!key) return null;
  const creds = await jiraForEngagement(engagementId).catch(() => null);
  const issue = creds ? await issueText(creds, key) : null;
  if (!issue?.description) return null;
  return { path, title: issue.summary, version: `jira ${key}`, body: `## ${issue.summary}\n${issue.description}` };
}
