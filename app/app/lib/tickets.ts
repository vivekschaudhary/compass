import { StorySummary } from "./data";

// Tickets a role can run a workflow on: those labeled for it, plus unlabeled ones as a transitional
// fallback (they self-heal their label once a workflow runs on them). Shared by the ticket pickers.
export function ticketsForRole(storyList: StorySummary[], roleCode: string): { labeled: StorySummary[]; unlabeled: StorySummary[] } {
  return { labeled: storyList.filter((s) => s.role === roleCode), unlabeled: storyList.filter((s) => !s.role) };
}

export function firstTicketId(storyList: StorySummary[], roleCode: string): string {
  const { labeled, unlabeled } = ticketsForRole(storyList, roleCode);
  return (labeled[0] ?? unlabeled[0])?.id ?? "";
}
