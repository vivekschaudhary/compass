// A design arrives as an HTML prototype attached to the designer's Jira ticket.
//
// The row that receives it is `supplied`: a person gives Compass the document and it is filed as
// written. Pasting a prototype into a chat box is not a way to hand over a file, so the designer
// attaches it to the ticket the row already has and replies "attached"; this reads it from there.
//
// Filed as TEXT, in a fenced block, because that is what a Compass document is. The fence keeps it
// a code listing for whoever opens the published page, and it is long enough never to be closed by
// anything inside the file (a script that contains backticks is ordinary).
//
// NEVER A GUESS. No ticket, no credentials, a ticket that cannot be read, no HTML on it, or a file
// too large to file all come back as a reason the person can act on — nothing is recorded half-way.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { jiraForEngagement, issueAttachments, attachmentBytes } from "../jira";

/** The same ceiling `uploads.ts` puts on one filed document, for the same reason. */
export const MAX_DESIGN_CHARS = 500_000;
/** A prototype is HTML; a gigabyte of video is not. Refused before it is read. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Documents that are designs: the ones whose deliverable is a prototype, not prose. */
export const isDesignPath = (path: string | null | undefined): boolean => (path ?? "").startsWith("design/");

/** The reply that means "I attached it". Exact, so an answer that says anything else is filed as typed. */
export const isAttachedReply = (answer: string): boolean => /^\s*attached[.!]?\s*$/i.test(answer);

const isHtml = (name: string) => /\.html?$/i.test(name);

/** `name` and its HTML as a fenced block whose fence cannot be closed from inside. */
export function fenced(name: string, html: string): string {
  const longest = Math.max(0, ...(html.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `### ${name}\n\n${fence}html\n${html.replace(/\s+$/, "")}\n${fence}\n`;
}

export type DesignFromTicket =
  | { ok: true; text: string; names: string[]; ticket: string }
  | { ok: false; reason: string };

export async function designFromTicket(engagementId: string, taskId: string): Promise<DesignFromTicket> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, reason: "Supabase is not configured." };

  const { data: task } = await sb.from("work_task")
    .select("ticket_key").eq("id", taskId).eq("engagement_id", engagementId).maybeSingle();
  const ticket = (task?.ticket_key as string | null) ?? null;
  if (!ticket) {
    return {
      ok: false,
      reason: "This task has no Jira ticket yet, so there is nowhere to read an attachment from. " +
        "Put the run on the board first, or paste the HTML here instead.",
    };
  }

  let creds: Awaited<ReturnType<typeof jiraForEngagement>> = null;
  try {
    creds = await jiraForEngagement(engagementId);
  } catch (e) {
    return { ok: false, reason: `Jira credentials could not be read: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!creds) return { ok: false, reason: "Jira is not configured for this engagement, so the attachment cannot be read." };

  const all = await issueAttachments(creds, ticket);
  if (all === null) return { ok: false, reason: `${ticket} could not be read from Jira. Try again, or paste the HTML here instead.` };

  // The newest of each file name: a designer re-attaching a revision does not want the old one filed too.
  const latest = new Map<string, (typeof all)[number]>();
  for (const a of all.filter((a) => isHtml(a.filename))) {
    const held = latest.get(a.filename);
    if (!held || a.created > held.created) latest.set(a.filename, a);
  }
  const files = [...latest.values()].sort((a, b) => a.filename.localeCompare(b.filename));
  if (!files.length) {
    const others = all.map((a) => a.filename);
    return {
      ok: false,
      reason: `${ticket} has no \`.html\` attachment.` +
        (others.length ? ` It has: ${others.map((n) => `\`${n}\``).join(", ")}.` : " It has no attachments.") +
        " Attach the prototype as an HTML file and reply \"attached\" again.",
    };
  }

  const blocks: string[] = [];
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return { ok: false, reason: `\`${f.filename}\` is ${(f.size / 1024 / 1024).toFixed(1)} MB, over the 5 MB limit for one prototype.` };
    }
    const bytes = await attachmentBytes(creds, f.id);
    if (!bytes) return { ok: false, reason: `\`${f.filename}\` could not be downloaded from ${ticket}. Try again.` };
    const html = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
    if (!html.trim()) return { ok: false, reason: `\`${f.filename}\` on ${ticket} is empty.` };
    blocks.push(fenced(f.filename, html));
  }

  const text = blocks.join("\n");
  if (text.length > MAX_DESIGN_CHARS) {
    return {
      ok: false,
      reason: `The prototype is ${text.length.toLocaleString()} characters, over the ` +
        `${MAX_DESIGN_CHARS.toLocaleString()} limit for one document.`,
    };
  }
  return { ok: true, text, names: files.map((f) => f.filename), ticket };
}
