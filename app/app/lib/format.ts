// Small shared formatting helpers — used by the history table, job cards, and activity view.

// A task ref → a deep link: a Jira key (KAN-12) → the Jira issue; a full URL (a Confluence page)
// → itself. Returns null when it isn't linkable (e.g. a deliverable code).
export function relatedLink(related: string | undefined, base: string): string | null {
  if (!related) return null;
  if (/^https?:\/\//i.test(related)) return related;
  if (/^[A-Z][A-Z0-9]+-\d+$/.test(related) && base) return `${base.replace(/\/+$/, "")}/browse/${related}`;
  return null;
}

export function timeAgo(iso: string): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
