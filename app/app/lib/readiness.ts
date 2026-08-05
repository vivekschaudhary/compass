import { supabaseAdmin } from "./supabase";
import { resolveJira, projectStatuses } from "./jira";
import { probeDocs } from "./docstore";
import { STATUS } from "./lifecycle";

// Phase A readiness — is this engagement provisioned enough for delivery work to run?
//
// Phase A (provisioning) is NOT a workflow: no basis, no deliverable, no approval gate. It is
// configuration, and its control is an ASSERTED state rather than a human sign-off. See
// compass/framework/engagement-setup.md.
//
// This exists because every failure it catches is otherwise SILENT:
//   · no doc tree scaffolded → a workflow writes its page but `01-foundation/...` points nowhere,
//     so the next workflow reads an empty scaffold while the run reports success. (Verified
//     2026-08-05: all three live engagements had zero doc_page rows.)
//   · no gate status on the board → `moveTo` logs "(skipped)" and carries on, so every human
//     gate fails to transition while the board looks healthy.
//   · unreachable docs provider → `writeProviderDoc` returns null at the point the work is
//     already done, indistinguishable from "not configured".
//
// Checks are independent and never throw: a probe that errors is reported as not-ready with the
// reason, because "we could not tell" must never read as "ready".

export type ReadinessCheck = {
  key: "docs.wired" | "tickets.wired" | "scm.wired" | "tree.scaffolded";
  label: string;
  ok: boolean;
  detail: string;      // what we found — shown to the human
  remedy?: string;     // the ONE next action when not ok
};

export type Readiness = { ok: boolean; checks: ReadinessCheck[]; blocking: ReadinessCheck[] };

async function checkDocs(eng: Record<string, unknown>): Promise<ReadinessCheck> {
  const base = { key: "docs.wired" as const, label: "Document storage" };
  const provider = eng.docs_provider === "teams" ? "Teams/SharePoint" : "Confluence";
  const reason = await probeDocs(eng as Parameters<typeof probeDocs>[0]);
  if (reason) {
    return { ...base, ok: false, detail: reason, remedy: `Set the ${provider} connector in Settings.` };
  }
  const dest = eng.docs_provider === "teams" ? String(eng.teams_site ?? "") : String(eng.confluence_space ?? "");
  const root = eng.docs_provider === "teams" ? eng.teams_root_item_id : eng.confluence_root_page_id;
  // Reachable but un-parented is a WARNING we surface as detail, not a blocker: pages land at the
  // space root instead of under the engagement, which is untidy, not broken.
  return {
    ...base, ok: true,
    detail: `${provider} · ${dest}${root ? " · filed under the engagement root page" : " · no root page set — pages land at the space root"}`,
  };
}

async function checkTickets(eng: Record<string, unknown>): Promise<ReadinessCheck> {
  const base = { key: "tickets.wired" as const, label: "Ticketing" };
  const jira = resolveJira(eng as Parameters<typeof resolveJira>[0]);
  if (!jira) {
    return { ...base, ok: false, detail: "no Jira project configured", remedy: "Set the Jira connector in Settings." };
  }
  const statuses = await projectStatuses(jira);
  if (!statuses) {
    return { ...base, ok: false, detail: `could not read project ${jira.project} (auth or permission)`, remedy: `Check the Jira credentials and that project ${jira.project} exists.` };
  }
  if (!statuses.includes(STATUS.gate)) {
    return {
      ...base, ok: false,
      detail: `project ${jira.project} has no "${STATUS.gate}" status — human gates would silently fail to transition`,
      remedy: `Add a "${STATUS.gate}" status to the ${jira.project} board.`,
    };
  }
  return { ...base, ok: true, detail: `${jira.project} · "${STATUS.gate}" present on the board` };
}

async function checkScm(engagementId: string): Promise<ReadinessCheck> {
  const base = { key: "scm.wired" as const, label: "Source control" };
  const sb = supabaseAdmin();
  const { data: repos } = (await sb!.from("repo").select("id").eq("engagement_id", engagementId)) ?? { data: null };
  const n = repos?.length ?? 0;
  return n > 0
    ? { ...base, ok: true, detail: `${n} repo${n === 1 ? "" : "s"} linked` }
    : { ...base, ok: false, detail: "no repo linked", remedy: "Link the delivery repo in Settings (needed for build/fix, not for docs)." };
}

async function checkTree(engagementId: string): Promise<ReadinessCheck> {
  const base = { key: "tree.scaffolded" as const, label: "Doc tree" };
  const sb = supabaseAdmin();
  const { data: pages } = (await sb!.from("doc_page").select("path").eq("engagement_id", engagementId)) ?? { data: null };
  const n = pages?.length ?? 0;
  if (n === 0) {
    return {
      ...base, ok: false,
      detail: "not scaffolded — no pages exist, so there is nowhere to read a SOW from or write a brief to",
      remedy: "Approve the doc tree and scaffold it (Settings → Doc tree).",
    };
  }
  const hasSow = pages!.some((p) => p.path === "02-scope/sow");
  return { ...base, ok: true, detail: `${n} pages scaffolded${hasSow ? " · 02-scope/sow present" : " · no 02-scope/sow slot"}` };
}

/**
 * Compute Phase A readiness for an engagement.
 *
 * `blocking` is the subset that stops DOC workflows. `scm.wired` is reported but not blocking —
 * a repo is needed for build/fix, not to draft a product brief, and refusing doc work for a
 * missing repo would be a gate that does not match the invariant it claims to protect.
 */
export async function engagementReadiness(engagementId: string): Promise<Readiness> {
  const sb = supabaseAdmin();
  if (!sb) {
    const c: ReadinessCheck = { key: "docs.wired", label: "Document storage", ok: false, detail: "Supabase not configured" };
    return { ok: false, checks: [c], blocking: [c] };
  }
  const { data: eng } = await sb.from("engagement").select("*").eq("id", engagementId).maybeSingle();
  if (!eng) {
    const c: ReadinessCheck = { key: "docs.wired", label: "Document storage", ok: false, detail: "engagement not found" };
    return { ok: false, checks: [c], blocking: [c] };
  }

  const checks = await Promise.all([
    checkDocs(eng), checkTickets(eng), checkScm(engagementId), checkTree(engagementId),
  ]);
  const blocking = checks.filter((c) => !c.ok && c.key !== "scm.wired");
  return { ok: blocking.length === 0, checks, blocking };
}

/** A one-line refusal naming every blocking item and its remedy — for a workflow's gate. */
export function readinessRefusal(r: Readiness): string {
  return "Engagement not provisioned (Phase A). " + r.blocking
    .map((c) => `${c.key}: ${c.detail}${c.remedy ? ` → ${c.remedy}` : ""}`)
    .join("  ·  ");
}
