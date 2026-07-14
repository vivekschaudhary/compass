// Robust "summary + document" extraction for AI deliverables. Embedding a full HTML doc inside
// JSON is fragile — the doc's quotes/braces/newlines routinely break JSON.parse. Instead we ask the
// model for a delimited plain-text response and split it, so the document body can contain anything.

export const DOC_FORMAT = `Respond in EXACTLY this format and nothing else (no JSON, no markdown fences):
SUMMARY: <2–4 sentences capturing the deliverable + the key recommendation>
===DOC===
<the full deliverable as HTML with <h2> section headings>`;

// Parse the delimited response into { summary, html }. Degrades gracefully if the model omits the
// delimiter (treat the whole thing as the doc) so a formatting slip never fails the whole run.
export function parseDoc(text: string): { summary: string; html: string } {
  const raw = (text || "").trim();
  const idx = raw.indexOf("===DOC===");
  if (idx === -1) {
    const body = raw.replace(/^SUMMARY:\s*/i, "").trim();
    const firstPara = body.split(/\n\s*\n/)[0]?.replace(/<[^>]+>/g, " ").trim() ?? "";
    return { summary: firstPara.slice(0, 400), html: body || "<p>(no content)</p>" };
  }
  const summary = raw.slice(0, idx).replace(/^SUMMARY:\s*/i, "").trim();
  const html = raw.slice(idx + "===DOC===".length).trim();
  return { summary: summary || html.replace(/<[^>]+>/g, " ").trim().slice(0, 200), html: html || "<p>(no content)</p>" };
}
