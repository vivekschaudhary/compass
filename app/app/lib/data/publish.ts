// Publishing a document to the engagement's doc store.
//
// `[docs-primary]` (#154): the page IS the record for anyone who does not open Compass — which is
// most of a client team. Compass authors the document, holds it as structure (versions, sections,
// citations), and publishes it to whichever provider the engagement uses.
//
// Deliberately NOT inside `file_document`. That routine is one transaction in the database, and an
// HTTP call to Confluence has no business inside it: a slow or failing provider would roll back a
// draft that is perfectly good. Filing succeeds first; publishing is a separate act that is
// recorded whether it worked or not.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { writeProviderDoc, type DocEng } from "../docstore";

export type PublishResult =
  | { ok: true; url: string; id: string }
  | { ok: false; error: string };

/** Sections → HTML. Kept minimal on purpose: the structured copy lives in Compass. */
function toHtml(title: string, sections: { heading: string; body: string }[], version: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Markdown tables are the bulk of what agents write, so they are converted; the rest is
  // paragraphs. Anything richer belongs in Compass, and the page says where to find it.
  const block = (body: string) => body.split(/\n{2,}/).map((para) => {
    const lines = para.trim().split("\n");
    const isTable = lines.length > 1 && lines[0].includes("|") && /^[\s|:-]+$/.test(lines[1] ?? "");
    if (isTable) {
      const cells = (l: string) => l.split("|").slice(1, -1).map((c) => esc(c.trim()));
      const head = `<tr>${cells(lines[0]).map((c) => `<th>${c}</th>`).join("")}</tr>`;
      const rows = lines.slice(2).map((l) => `<tr>${cells(l).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
      return `<table>${head}${rows}</table>`;
    }
    if (/^[-*]\s/.test(lines[0])) {
      return `<ul>${lines.map((l) => `<li>${esc(l.replace(/^[-*]\s/, ""))}</li>`).join("")}</ul>`;
    }
    return `<p>${esc(para.trim()).replace(/\n/g, "<br/>")}</p>`;
  }).join("");

  return [
    `<p><em>Authored by Compass · ${esc(title)} · v${esc(version)}</em></p>`,
    ...sections.map((s) => `<h2>${esc(s.heading)}</h2>${block(s.body)}`),
  ].join("");
}

/**
 * Publish a version to the engagement's doc store, and record the outcome either way.
 *
 * A failure is written to `publish_error` rather than thrown. The draft is filed and good; what
 * failed is the projection, and a document that exists in Compass but not in Confluence is a state
 * worth being able to see and retry rather than an exception that vanishes into a log.
 */
export async function publishToDocs(
  engagementId: string, versionId: string,
): Promise<PublishResult> {
  const sb = supabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase is not configured." };

  const { data: version } = await sb.from("document_version")
    .select("id, version, document_id").eq("id", versionId).maybeSingle();
  if (!version) return { ok: false, error: "No such version." };

  const { data: doc } = await sb.from("document")
    .select("id, path, title, external_id").eq("id", version.document_id).maybeSingle();
  if (!doc) return { ok: false, error: "No such document." };

  const { data: eng } = await sb.from("engagement")
    .select("id, name, docs_provider, confluence_space, confluence_root_page_id, atlassian_base_url, atlassian_email, atlassian_api_token, teams_site, teams_root_item_id, graph_tenant_id, graph_client_id, graph_client_secret")
    .eq("id", engagementId).maybeSingle();
  if (!eng) return { ok: false, error: "No such engagement." };

  const { data: sections } = await sb.from("document_section")
    .select("heading, body").eq("document_version_id", versionId).order("ord");
  if (!sections?.length) return { ok: false, error: "Nothing to publish — the version has no sections." };

  const title = `${doc.title} — ${doc.path}`;
  const html = toHtml(doc.title, sections, version.version);

  let result: { id: string; url: string } | null = null;
  let failure: string | null = null;
  try {
    result = await writeProviderDoc(eng as DocEng, title, html);
    if (!result) failure = "The provider is not configured, or refused the write.";
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }

  if (!result) {
    await sb.from("document_version").update({ publish_error: failure }).eq("id", versionId);
    return { ok: false, error: failure ?? "unknown" };
  }

  await sb.from("document_version").update({
    external_id: result.id, external_url: result.url,
    published_to_docs_at: new Date().toISOString(), publish_error: null,
  }).eq("id", versionId);
  await sb.from("document").update({ external_id: result.id, external_url: result.url }).eq("id", doc.id);

  return { ok: true, url: result.url, id: result.id };
}

/**
 * Publish every current version on an engagement, and report each one.
 *
 * Lives here rather than in the route because the engagement filter belongs in this layer — the
 * lint rule that keeps a raw client out of routes exists so a call site cannot forget it, and a
 * backfill that publishes another client's documents to this client's space is the exact failure
 * that rule is guarding against.
 */
export async function publishAll(
  engagementId: string,
): Promise<{ path: string; ok: boolean; url?: string; error?: string }[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];

  const { data: docs } = await sb.from("document")
    .select("id, path, current_version_id")
    .eq("engagement_id", engagementId).not("current_version_id", "is", null).order("path");

  const out: { path: string; ok: boolean; url?: string; error?: string }[] = [];
  for (const d of docs ?? []) {
    const r = await publishToDocs(engagementId, d.current_version_id as string);
    out.push(r.ok ? { path: d.path, ok: true, url: r.url } : { path: d.path, ok: false, error: r.error });
  }
  return out;
}
