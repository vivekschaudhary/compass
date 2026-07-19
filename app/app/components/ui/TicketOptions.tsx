import { StorySummary } from "@/app/lib/data";
import { ticketsForRole } from "@/app/lib/tickets";

// <option>s for a role's ticket picker: labeled tickets first, then an "— unlabeled —" group as a
// transitional fallback so existing (pre-label) stories are still selectable.
export function TicketOptions({ storyList, roleCode }: { storyList: StorySummary[]; roleCode: string }) {
  const { labeled, unlabeled } = ticketsForRole(storyList, roleCode);
  if (!labeled.length && !unlabeled.length) return <option value="">— no tickets yet —</option>;
  return (
    <>
      {labeled.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.title}</option>)}
      {unlabeled.length > 0 && (
        <optgroup label="— unlabeled —">
          {unlabeled.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.title}</option>)}
        </optgroup>
      )}
    </>
  );
}
