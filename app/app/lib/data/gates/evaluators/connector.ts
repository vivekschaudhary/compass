import { supabaseAdmin } from "../../../supabase";
import { probeDocs, type DocEng } from "../../../docstore";
import { resolveJira, projectStatuses } from "../../../jira";
import type { Actor } from "../../actor";
import type { CriterionRow, Verdict } from "../types";

/**
 * Is the connector actually reachable?
 *
 * This used to read the engagement's own settings back and call a non-empty field "wired". That is
 * a check of what somebody typed, not of what works — and it passed for weeks on an engagement
 * whose documents were being published nowhere, because nothing had ever tried.
 *
 * Now it calls the API. `probeDocs` asks the provider for the space; `projectStatuses` asks Jira
 * for the project. Both fail with a reason, and the reason is what lands on the card — "space
 * Test not found" sends someone somewhere useful in a way that "not configured" never did.
 *
 * The cost is that a gate check now makes a network call and can be slow or flaky. That is the
 * correct trade: a fast check that cannot fail is not a check.
 */
export async function evaluateConnector(
  actor: Actor,
  c: CriterionRow,
): Promise<Verdict> {
  const sb = supabaseAdmin();
  if (!sb) return { state: "unmeasurable", why: "no database" };

  const { data: e } = await sb
    .from("engagement")
    .select(
      "id, name, docs_provider, confluence_space, confluence_root_page_id, atlassian_base_url, atlassian_email, atlassian_api_token, teams_site, teams_root_item_id, graph_tenant_id, graph_client_id, graph_client_secret, jira_project, jira_board_id",
    )
    .eq("id", actor.engagementId)
    .maybeSingle();
  if (!e) return { state: "unmeasurable", why: "engagement not found" };

  if (c.subjectRef === "docs") {
    let problem: string | null;
    try {
      problem = await probeDocs(e as DocEng);
    } catch (err) {
      // A network failure is not the same as a misconfigured space, and saying "not configured"
      // when the truth is "the office wifi dropped" sends someone to change settings that are fine.
      return {
        state: "unmeasurable",
        why: `could not reach ${e.docs_provider ?? "the doc store"}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return problem === null
      ? {
          state: "satisfied",
          source: e.docs_provider ?? "docs",
          detail: `${e.docs_provider === "teams" ? "Teams site" : `Confluence space ${e.confluence_space}`} answered.`,
        }
      : {
          state: "unsatisfied",
          source: e.docs_provider ?? "docs",
          detail: problem,
        };
  }

  if (c.subjectRef === "tickets") {
    if (!e.jira_project) {
      return {
        state: "unsatisfied",
        source: "compass",
        detail: "No tracker project is configured for this engagement.",
      };
    }
    const creds = resolveJira(e as Parameters<typeof resolveJira>[0]);
    if (!creds) {
      return {
        state: "unsatisfied",
        source: "compass",
        detail: "No Jira credentials (base url / email / token).",
      };
    }
    let statuses: string[] | null;
    try {
      statuses = await projectStatuses(creds);
    } catch (err) {
      return {
        state: "unmeasurable",
        why: `could not reach Jira: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return statuses
      ? {
          state: "satisfied",
          source: "jira",
          detail: `Project ${e.jira_project} answered with ${statuses.length} statuses.`,
        }
      : {
          state: "unsatisfied",
          source: "jira",
          detail: `Jira did not return project ${e.jira_project} — check the key and the credentials' access to it.`,
        };
  }

  return {
    state: "unmeasurable",
    why: `no evaluator for connector '${c.subjectRef}'`,
  };
}
