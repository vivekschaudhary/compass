import type { SupabaseClient } from "@supabase/supabase-js";

// The standard metric taxonomy captured per engagement (SOW-level) and per epic (bet outcome).
// Definitions live in the DB (table `metric`); values are filled by instrumentation later.
export const PRODUCT_METRICS: { category: string; metrics: string[] }[] = [
  { category: "Acquisition", metrics: ["New users", "Sign-up conversion", "Traffic / visitors", "CAC"] },
  { category: "Activation", metrics: ["Activation rate", "Time to first value", "Onboarding completion"] },
  { category: "Engagement", metrics: ["DAU", "WAU", "MAU", "Stickiness (DAU/MAU)", "Sessions / user", "Feature adoption"] },
  { category: "Retention", metrics: ["Day-1 retention", "Day-7 retention", "Day-30 retention", "Churn rate"] },
  { category: "Revenue", metrics: ["MRR", "ARPU", "Free → paid conversion", "LTV"] },
  { category: "Satisfaction", metrics: ["NPS", "CSAT", "CES"] },
];
// "Delivery performance" = the four delivery signals (deploy freq · lead time · change-fail · restore).
export const ENG_METRICS: { category: string; metrics: string[] }[] = [
  { category: "Delivery performance", metrics: ["Deployment frequency", "Lead time for changes", "Change failure rate", "Time to restore service"] },
  { category: "Flow & quality", metrics: ["PR cycle time", "Review turnaround", "Test coverage", "Build success rate", "Escaped defects"] },
];
export const BET_OUTCOME = ["Primary outcome", "Adoption", "Impact vs baseline"];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

// Seed the project (SOW-level) product + engineering metrics for an engagement. Idempotent.
export async function seedEngagementMetrics(sb: SupabaseClient, engagementId: string) {
  try {
    const { data: existing } = await sb.from("metric").select("id").eq("engagement_id", engagementId).is("epic_id", null).limit(1);
    if (existing?.length) return;
    const rows: Record<string, unknown>[] = [];
    let ord = 0;
    for (const [scope, groups] of [["product", PRODUCT_METRICS], ["engineering", ENG_METRICS]] as const) {
      for (const g of groups) for (const m of g.metrics) {
        rows.push({ id: `${engagementId}-m-${slug(g.category)}-${slug(m)}`, engagement_id: engagementId, epic_id: null, scope, category: g.category, name: m, target: null, value: null, unit: null, ord: ord++ });
      }
    }
    if (rows.length) await sb.from("metric").insert(rows);
  } catch { /* table not migrated yet — ignore */ }
}

// Seed the bet-outcome metrics for one epic. Idempotent.
export async function seedEpicMetrics(sb: SupabaseClient, engagementId: string, epicId: string) {
  try {
    const { data: existing } = await sb.from("metric").select("id").eq("epic_id", epicId).limit(1);
    if (existing?.length) return;
    const rows = BET_OUTCOME.map((m, i) => ({ id: `${epicId}-m-${slug(m)}`, engagement_id: engagementId, epic_id: epicId, scope: "bet", category: "Bet outcome", name: m, target: null, value: null, unit: null, ord: i }));
    await sb.from("metric").insert(rows);
  } catch { /* table not migrated yet — ignore */ }
}
