// Robust "summary + document + action items" extraction for AI deliverables. Embedding a full HTML
// doc inside JSON is fragile — the doc's quotes/braces/newlines routinely break JSON.parse. Instead
// we ask the model for a delimited plain-text response and split it, so each section can contain
// anything. The ACTION_ITEMS section is the "playbook" — concrete next-step tasks the user promotes.

export type ActionItem = { title: string; role?: string };

export const DOC_FORMAT = `Respond in EXACTLY this format and nothing else (no JSON, no markdown fences):
SUMMARY: <2–4 sentences capturing the deliverable + the key recommendation>
===DOC===
<the full deliverable as HTML with <h2> section headings>
===ACTION_ITEMS===
<one concrete next-step task per line, each as "role: task" — role ∈ researcher|designer|ux-writer|engineer|automation|pm. 3–7 items, the specific work this deliverable implies.>`;

const DOC_DELIM = "===DOC===";
const ACT_DELIM = "===ACTION_ITEMS===";
const ROLES = ["researcher", "designer", "ux-writer", "engineer", "automation", "pm", "product-owner", "architect", "reviewer", "tech-writer", "gtm", "sre", "scanner"];

// Parse "role: title" | "- title" | "title" into an action item (role optional, validated).
function parseActionLine(line: string): ActionItem | null {
  const clean = line.replace(/^\s*[-*•\d.]+\s*/, "").trim();
  if (!clean) return null;
  const m = clean.match(/^([a-z-]+)\s*:\s*(.+)$/i);
  if (m && ROLES.includes(m[1].toLowerCase())) return { title: m[2].trim(), role: m[1].toLowerCase() };
  return { title: clean };
}

// Parse the delimited response into { summary, html, actions }. Degrades gracefully if the model
// omits a delimiter, so a formatting slip never fails the whole run.
export function parseDoc(text: string): { summary: string; html: string; actions: ActionItem[] } {
  const raw = (text || "").trim();
  const actIdx = raw.indexOf(ACT_DELIM);
  const actionsBlock = actIdx === -1 ? "" : raw.slice(actIdx + ACT_DELIM.length);
  const actions = actionsBlock
    .split(/\r?\n/)
    .map(parseActionLine)
    .filter((a): a is ActionItem => a !== null)
    .slice(0, 12);

  const head = actIdx === -1 ? raw : raw.slice(0, actIdx);
  const docIdx = head.indexOf(DOC_DELIM);
  if (docIdx === -1) {
    const body = head.replace(/^SUMMARY:\s*/i, "").trim();
    const firstPara = body.split(/\n\s*\n/)[0]?.replace(/<[^>]+>/g, " ").trim() ?? "";
    return { summary: firstPara.slice(0, 400), html: body || "<p>(no content)</p>", actions };
  }
  const summary = head.slice(0, docIdx).replace(/^SUMMARY:\s*/i, "").trim();
  const html = head.slice(docIdx + DOC_DELIM.length).trim();
  return { summary: summary || html.replace(/<[^>]+>/g, " ").trim().slice(0, 200), html: html || "<p>(no content)</p>", actions };
}
