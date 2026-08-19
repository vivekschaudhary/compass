// Starting an engagement, the v2 way.
//
// v1's intake stored the SOW as a SHORT REFERENCE CHIP — sixty characters, "never the full doc" —
// and the actual contract text nowhere. That is the gap this whole rebuild kept running into: an
// agent asked to derive a backlog from the SOW had no SOW to read, so it derived one from its own
// assumptions and nothing could tell the difference.
//
// Here the SOW is a document: filed, versioned, sectioned, citable. Everything downstream reads it
// rather than a label about it.
//
// The other difference is that this OPENS THE WORK. v1 created a shell and waited for someone to
// know what to do next; here the workflow whose trigger is `project-created` opens its run, so the
// first job exists before anyone asks for it. Nothing starts itself — but the queue is not empty.

import "server-only";
import { supabaseAdmin } from "../supabase";
import { readShippedDocTree } from "../doctree";
import { publishToDocs } from "./publish";
import { canonicalSpaceKey, canonicalProjectKey, type DocEng } from "../docstore";
import { emit } from "./events";

export type NewEngagement = {
  name: string;
  client: string;
  sowText: string;
  /** Who runs it. Required: an engagement nobody is on cannot be worked. */
  deliveryManager: string;
  orgCode?: string;
  docsProvider?: "confluence" | "teams";
  confluenceSpace?: string;
  confluenceRootPageId?: string;
  jiraProject?: string;
  /** Publish the SOW and the tree to the doc store as part of intake. */
  publish?: boolean;
};

export type OnboardResult = {
  engagementId: string;
  documents: number;
  sowVersionId: string | null;
  sowSections: number;
  openedWorkflow: string | null;
  published: number;
  problems: string[];
};

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "engagement";

/**
 * Split a pasted SOW into sections.
 *
 * Deliberately mechanical — headings are lines that look like headings. No model call: intake
 * should not depend on one, and a wrong split is recoverable while a failed intake is not. If
 * nothing looks like a heading the whole thing becomes one section, which is honest and still
 * readable.
 */
export function sectionise(text: string): { heading: string; body: string }[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const isHeading = (l: string) => {
    const t = l.trim();
    if (!t || t.length > 80) return false;
    if (/^#{1,4}\s/.test(t)) return true;                        // markdown
    if (/^[A-Z][^.!?]*:$/.test(t)) return true;                  // "Scope & Core Features:"
    if (/^\d+[.)]\s+[A-Z]/.test(t) && t.length < 60) return true; // "1. Commercial terms"
    // Title Case with no sentence punctuation, e.g. "Schedule & Milestone Breakdown"
    return /^[A-Z][A-Za-z0-9 &/,'’-]+$/.test(t) && !/[.!?]$/.test(t) && t.split(/\s+/).length <= 8;
  };

  const out: { heading: string; body: string[] }[] = [];
  for (const line of lines) {
    if (isHeading(line)) out.push({ heading: line.trim().replace(/^#{1,4}\s*/, "").replace(/:$/, ""), body: [] });
    else if (out.length) out[out.length - 1].body.push(line);
    else if (line.trim()) out.push({ heading: "Statement of work", body: [line] });
  }

  const sections = out
    .map((s) => ({ heading: s.heading, body: s.body.join("\n").trim() }))
    .filter((s) => s.body.length > 0);

  return sections.length ? sections : [{ heading: "Statement of work", body: text.trim() }];
}

/**
 * Create the engagement, file its SOW, scaffold its tree, and open the first workflow.
 *
 * Order matters and is not arbitrary: the engagement must exist before documents can reference it,
 * the SOW must be filed before the first workflow opens (its Ready gate asks for a published SOW),
 * and publishing happens last because a doc-store failure must not cost the intake.
 */
export async function createEngagement(input: NewEngagement): Promise<OnboardResult> {
  const sb = supabaseAdmin();
  const problems: string[] = [];
  if (!sb) return { engagementId: "", documents: 0, sowVersionId: null, sowSections: 0, openedWorkflow: null, published: 0, problems: ["Supabase is not configured."] };

  if (!input.deliveryManager?.trim()) {
    // Found by creating the second engagement: intake happily made one with no members, so no role
    // had a holder, the queue resolved to nobody and the page 404'd. An engagement is work someone
    // does; creating one without saying who is creating something unusable.
    return { engagementId: "", documents: 0, sowVersionId: null, sowSections: 0, openedWorkflow: null, published: 0,
      problems: ["No delivery manager. An engagement with nobody on it has no queue to open."] };
  }

  if (!input.sowText?.trim()) {
    return { engagementId: "", documents: 0, sowVersionId: null, sowSections: 0, openedWorkflow: null, published: 0,
      problems: ["No SOW text. Everything downstream derives from it, so intake refuses without one."] };
  }

  const { data: org } = await sb.from("org").select("id").eq("code", input.orgCode ?? "default").maybeSingle();
  if (!org) return { engagementId: "", documents: 0, sowVersionId: null, sowSections: 0, openedWorkflow: null, published: 0,
    problems: [`No org '${input.orgCode ?? "default"}'. Import the seed first.`] };

  const id = `${slug(input.client || input.name)}-${Date.now().toString(36).slice(-4)}`;

  // What a person types is not what the API expects. `Test` is a Jira project key only in
  // uppercase, and in Confluence it is a space NAME whose key is `Test1`. Both were typed exactly
  // that way on the first real intake, and both failed several steps later with an error about
  // something else. Resolve once, here, and store canonical.
  const docsProvider = input.docsProvider ?? "confluence";
  const jiraProject = input.jiraProject ? canonicalProjectKey(input.jiraProject) : null;
  const confluenceSpace = input.confluenceSpace && docsProvider === "confluence"
    ? await canonicalSpaceKey(
        { id, name: input.name, docs_provider: docsProvider } as DocEng, input.confluenceSpace)
    : (input.confluenceSpace ?? null);

  if (input.confluenceSpace && confluenceSpace !== input.confluenceSpace) {
    problems.push(`Confluence space '${input.confluenceSpace}' resolved to '${confluenceSpace}'.`);
  }
  if (input.jiraProject && jiraProject !== input.jiraProject) {
    problems.push(`Jira project '${input.jiraProject}' resolved to '${jiraProject}'.`);
  }

  const { error: engErr } = await sb.from("engagement").insert({
    id, name: input.name, client: input.client,
    // A short label for the UI. The CONTRACT is the document — this is a chip, and v1's mistake was
    // letting the chip be the only copy.
    sow: (input.name || "SOW").split(/\s+/).slice(0, 3).join(" "),
    phase: "Kickoff · Phase 1", overall: "good",
    docs_provider: docsProvider,
    confluence_space: confluenceSpace,
    confluence_root_page_id: input.confluenceRootPageId ?? null,
    jira_project: jiraProject,
    cost_spent: 0, cost_spark: [0], scope_spark: [], stories_late: 0,
    time_spark: [], quality_ac_pass: 100, quality_criticals: 0, quality_spark: [],
  });
  if (engErr) return { engagementId: "", documents: 0, sowVersionId: null, sowSections: 0, openedWorkflow: null, published: 0,
    problems: [`create engagement: ${engErr.message}`] };

  // The first person on it. The rest are staffed by `staff-engagement`, which is a job — but
  // somebody has to be there to run that job, and that somebody is whoever set this up.
  const dmName = input.deliveryManager.trim();
  const { error: memberErr } = await sb.from("member").insert({
    id: `${id}-delivery-manager`, engagement_id: id, role: "delivery-manager",
    name: dmName, title: "Delivery Manager", ord: 0,
    initials: dmName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
  });
  if (memberErr) problems.push(`staff the delivery manager: ${memberErr.message}`);

  // The scaffolding: the framework's own doc tree, as v2 documents. Folders and empty docs, so the
  // shape of the engagement is visible before anything is written into it.
  const tree = readShippedDocTree();
  const docRows = tree.map((n, i) => ({
    org_id: org.id, engagement_id: id, path: n.path, title: n.title,
    kind: (["folder", "doc", "template"].includes(n.kind) ? n.kind : "doc"),
    ord: i,
  }));
  if (docRows.length) {
    const { error } = await sb.from("document").insert(docRows);
    if (error) problems.push(`scaffold tree: ${error.message}`);
  }

  // Parents by path prefix, once every node exists.
  const { data: all } = await sb.from("document").select("id, path").eq("engagement_id", id);
  const byPath = new Map((all ?? []).map((d) => [d.path, d.id]));
  for (const d of all ?? []) {
    const slash = d.path.lastIndexOf("/");
    if (slash < 0) continue;
    const parent = byPath.get(d.path.slice(0, slash));
    if (parent) await sb.from("document").update({ parent_id: parent }).eq("id", d.id);
  }

  // The SOW, in full. This is the difference from v1.
  const sections = sectionise(input.sowText);
  const { data: sowVersionId, error: sowErr } = await sb.rpc("file_document", {
    p_org_id: org.id, p_engagement_id: id,
    p_path: "02-scope/sow", p_title: "SOW (source)",
    p_sections: sections, p_version: null,
    p_actor: "intake", p_actor_role: "engagement-admin",
    p_owner_role: "delivery-manager", p_task_id: null,
  });
  if (sowErr) problems.push(`file the SOW: ${sowErr.message}`);

  // Intake opens NOTHING, and that is the change.
  //
  // It used to open whichever workflow declared `project-created`, so creating a project silently
  // started work. An engagement existing is not the same as an engagement being ready to start —
  // the admin may create it days before anyone is free to run it, and the delivery manager is the
  // one who decides. So intake provisions and stops; the DM initiates basecamp when they mean to.
  //
  // The empty queue is therefore correct, not a failure, and must not be reported as one.
  const openedWorkflow: string | null = null;

  // Publishing last, and failures are reported rather than thrown: a doc-store outage must not
  // cost an intake that otherwise succeeded.
  let published = 0;
  if (input.publish && sowVersionId) {
    const r = await publishToDocs(id, sowVersionId as string);
    if (r.ok) published += 1;
    else problems.push(`publish the SOW: ${r.error}`);
  }

  await emit({
    engagementId: id, subjectType: "engagement", subjectId: id,
    verb: "engagement.created", actorKind: "human",
    actorRoleCode: "engagement-admin", actorUserId: dmName,
    payload: {
      name: input.name, client: input.client, deliveryManager: dmName,
      docsProvider: input.docsProvider ?? "confluence", jiraProject: input.jiraProject ?? null,
      sowSections: sections.length, documents: docRows.length,
      openedWorkflow, problems,
    },
  });

  return {
    engagementId: id,
    documents: docRows.length,
    sowVersionId: (sowVersionId as string) ?? null,
    sowSections: sections.length,
    openedWorkflow, published, problems,
  };
}
