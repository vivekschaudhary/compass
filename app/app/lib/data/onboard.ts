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
import {
  checkSpaceKey,
  checkProjectKey,
  canonicalSpaceKey,
  canonicalProjectKey,
  type DocEng,
} from "../docstore";
import { emit } from "./events";

export type NewEngagement = {
  name: string;
  client: string;
  // sowText: string;
  /**
   * A product brief or BRD the client already has.
   *
   * Optional, and supplied far more often than written: in consulting the requirements document
   * exists before the engagement does. When it is here, `create-product-brief` has an input rather
   * than a blank page — and epics are written FROM it, which is the whole point of the ordering.
   */
  //    s
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
  //documents: number;
  // sowVersionId: string | null;
  // sowSections: number;
  // openedWorkflow: string | null;
  published: number;
  problems: string[];
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "engagement";

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
    if (/^#{1,4}\s/.test(t)) return true; // markdown
    if (/^[A-Z][^.!?]*:$/.test(t)) return true; // "Scope & Core Features:"
    if (/^\d+[.)]\s+[A-Z]/.test(t) && t.length < 60) return true; // "1. Commercial terms"
    // Title Case with no sentence punctuation, e.g. "Schedule & Milestone Breakdown"
    return (
      /^[A-Z][A-Za-z0-9 &/,'’-]+$/.test(t) &&
      !/[.!?]$/.test(t) &&
      t.split(/\s+/).length <= 8
    );
  };

  const out: { heading: string; body: string[] }[] = [];
  for (const line of lines) {
    if (isHeading(line))
      out.push({
        heading: line
          .trim()
          .replace(/^#{1,4}\s*/, "")
          .replace(/:$/, ""),
        body: [],
      });
    else if (out.length) out[out.length - 1].body.push(line);
    else if (line.trim())
      out.push({ heading: "Statement of work", body: [line] });
  }

  const sections = out
    .map((s) => ({ heading: s.heading, body: s.body.join("\n").trim() }))
    .filter((s) => s.body.length > 0);

  return sections.length
    ? sections
    : [{ heading: "Statement of work", body: text.trim() }];
}

/**
 * Create the engagement, file its SOW, scaffold its tree, and open the first workflow.
 *
 * Order matters and is not arbitrary: the engagement must exist before documents can reference it,
 * the SOW must be filed before the first workflow opens (its Ready gate asks for a published SOW),
 * and publishing happens last because a doc-store failure must not cost the intake.
 */
export async function createEngagement(
  input: NewEngagement,
): Promise<OnboardResult> {
  const sb = supabaseAdmin();
  const problems: string[] = [];
  if (!sb)
    return {
      engagementId: "",
      //documents: 0,
      //sowVersionId: null,
      //sowSections: 0,
      //openedWorkflow: null,
      published: 0,
      problems: ["Supabase is not configured."],
    };

  if (!input.deliveryManager?.trim()) {
    // Found by creating the second engagement: intake happily made one with no members, so no role
    // had a holder, the queue resolved to nobody and the page 404'd. An engagement is work someone
    // does; creating one without saying who is creating something unusable.
    return {
      engagementId: "",
      // documents: 0,
      // sowVersionId: null,
      // sowSections: 0,
      // openedWorkflow: null,
      published: 0,
      problems: [
        "No delivery manager. An engagement with nobody on it has no queue to open.",
      ],
    };
  }

  const { data: org } = await sb
    .from("org")
    .select("id")
    .eq("code", input.orgCode ?? "default")
    .maybeSingle();
  if (!org)
    return {
      engagementId: "",
      // documents: 0,
      // sowVersionId: null,
      // sowSections: 0,
      // openedWorkflow: null,
      published: 0,
      problems: [
        `No org '${input.orgCode ?? "default"}'. Import the seed first.`,
      ],
    };

  const id = `${slug(input.client || input.name)}-${Date.now().toString(36).slice(-4)}`;

  // Check the keys BEFORE creating anything, and refuse rather than correct.

  const docsProvider = input.docsProvider ?? "confluence";
  const probe = { id, name: input.name, docs_provider: docsProvider } as DocEng;

  const keyProblems = (
    await Promise.all([
      input.confluenceSpace && docsProvider === "confluence"
        ? checkSpaceKey(probe, input.confluenceSpace)
        : null,
      input.jiraProject ? checkProjectKey(probe, input.jiraProject) : null,
    ])
  ).filter(Boolean) as string[];

  if (keyProblems.length) {
    return {
      engagementId: "",
      // documents: 0,
      // sowVersionId: null,
      // sowSections: 0,
      // openedWorkflow: null,
      published: 0,
      problems: keyProblems,
    };
  }

  // Store the spelling the system of record uses, not the one that was typed.
  //
  // The check above passes a key that differs only by case, so without this the row would hold a
  // value the provider will not answer to. Jira is case-SENSITIVE at the API — `GET
  // /project/test1/statuses` 404s where `TEST1` returns 200 — so a lowercase key stored here means
  // `projectStatuses` returns null, setup's `tickets` criterion reads unsatisfied, and the machine
  // row never closes. The failure would land three screens away from its cause.
  //
  // `canonicalSpaceKey` returns null when Confluence cannot be reached, and the given value stands:
  // "could not check" must not silently change what someone entered.
  const confluenceSpace =
    (input.confluenceSpace && docsProvider === "confluence"
      ? await canonicalSpaceKey(probe, input.confluenceSpace)
      : null) ?? input.confluenceSpace ?? null;
  const jiraProject = canonicalProjectKey(input.jiraProject);

  const { error: engErr } = await sb.from("engagement").insert({
    id,
    name: input.name,
    client: input.client,
    // A short label for the UI. The CONTRACT is the document — this is a chip, and v1's mistake was
    // letting the chip be the only copy.
    sow: (input.name || "SOW").split(/\s+/).slice(0, 3).join(" "),
    phase: "Kickoff · Phase 1",
    overall: "good",
    docs_provider: docsProvider,
    confluence_space: confluenceSpace,
    confluence_root_page_id: input.confluenceRootPageId ?? null,
    jira_project: jiraProject,
    cost_spent: 0,
    cost_spark: [0],
    scope_spark: [],
    stories_late: 0,
    time_spark: [],
    quality_ac_pass: 100,
    quality_criticals: 0,
    quality_spark: [],
  });
  if (engErr)
    return {
      engagementId: "",
      // documents: 0,
      // sowVersionId: null,
      // sowSections: 0,
      // openedWorkflow: null,
      published: 0,
      problems: [`create engagement: ${engErr.message}`],
    };

  // The first person on it. The rest are staffed by `staff-engagement`, which is a job — but
  // somebody has to be there to run that job, and that somebody is whoever set this up.
  const dmName = input.deliveryManager.trim();
  const { error: memberErr } = await sb.from("member").insert({
    id: `${id}-delivery-manager`,
    engagement_id: id,
    role: "delivery-manager",
    name: dmName,
    title: "Delivery Manager",
    ord: 0,
    initials: dmName
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
  });
  if (memberErr)
    problems.push(`staff the delivery manager: ${memberErr.message}`);

  // // The scaffolding: the framework's own doc tree, as v2 documents. Folders and empty docs, so the
  // // shape of the engagement is visible before anything is written into it.
  // const tree = readShippedDocTree();
  // const docRows = tree.map((n, i) => ({
  //   org_id: org.id,
  //   engagement_id: id,
  //   path: n.path,
  //   title: n.title,
  //   kind: ["folder", "doc", "template"].includes(n.kind) ? n.kind : "doc",
  //   ord: i,
  // }));
  // if (docRows.length) {
  //   const { error } = await sb.from("document").insert(docRows);
  //   if (error) problems.push(`scaffold tree: ${error.message}`);
  // }

  // // Parents by path prefix, once every node exists.
  // const { data: all } = await sb
  //   .from("document")
  //   .select("id, path")
  //   .eq("engagement_id", id);
  // const byPath = new Map((all ?? []).map((d) => [d.path, d.id]));
  // for (const d of all ?? []) {
  //   const slash = d.path.lastIndexOf("/");
  //   if (slash < 0) continue;
  //   const parent = byPath.get(d.path.slice(0, slash));
  //   if (parent)
  //     await sb.from("document").update({ parent_id: parent }).eq("id", d.id);
  // }

  // // THE SOW IS NOT FILED HERE. Intake used to take the text and file it, which put a deliverable
  // // into the engagement before anyone had picked the engagement up — and left `pre-sprint-0` row 1
  // // ("File the SOW") as a task with nothing to do and a gate already green. That is the shape of a
  // // phase that looks busy and is not.
  // //
  // // Filing it is the delivery manager's first act on initiating pre-sprint 0. Intake provisions the
  // // place for it and stops.
  // const sections: { heading: string; body: string }[] = [];
  // const sowVersionId: string | null = null;

  // // Intake opens NOTHING, and that is the change.
  // //
  // // It used to open whichever workflow declared `project-created`, so creating a project silently
  // // started work. An engagement existing is not the same as an engagement being ready to start —
  // // the admin may create it days before anyone is free to run it, and the delivery manager is the
  // // one who decides. So intake provisions, scaffolds and stops; the DM initiates setup when they mean to.
  // //
  // // The empty queue is therefore correct, not a failure, and must not be reported as one.
  // const openedWorkflow: string | null = null;

  // // The supplied brief, for the same reason the SOW is not: it is a BASIS someone hands over, not a
  // // deliverable intake accepts on the engagement's behalf. Kept for now because `pre-sprint-0` row 2
  // // reads it and produces the real brief from it, so a supplied one is an input rather than a
  // // substitute — but it is the same shape as the SOW above and wants the same call.
  // let briefVersionId: string | null = null;
  // if (input.briefText?.trim()) {
  //   const briefSections = sectionise(input.briefText);
  //   const { data: v, error } = await sb.rpc("file_document", {
  //     p_org_id: org.id,
  //     p_engagement_id: id,
  //     p_path: "01-foundation/product-brief",
  //     p_title: "Product brief (supplied)",
  //     p_sections: briefSections,
  //     p_version: null,
  //     p_actor: "intake",
  //     p_actor_role: "pmo-analyst",
  //     p_owner_role: "product-manager",
  //     p_task_id: null,
  //   });
  //   if (error) problems.push(`file the product brief: ${error.message}`);
  //   else briefVersionId = v as string;
  // }

  // // Publishing last, and failures are reported rather than thrown: a doc-store outage must not
  // // cost an intake that otherwise succeeded.
  // let published = 0;
  // if (input.publish && sowVersionId) {
  //   const r = await publishToDocs(id, sowVersionId as string);
  //   if (r.ok) published += 1;
  //   else problems.push(`publish the SOW: ${r.error}`);
  // }
  // if (input.publish && briefVersionId) {
  //   const r = await publishToDocs(id, briefVersionId);
  //   if (r.ok) published += 1;
  //   else problems.push(`publish the product brief: ${r.error}`);
  // }

  await emit({
    engagementId: id,
    subjectType: "engagement",
    subjectId: id,
    verb: "engagement.created",
    actorKind: "human",
    actorRoleCode: "pmo-analyst",
    actorUserId: dmName,
    payload: {
      name: input.name,
      client: input.client,
      deliveryManager: dmName,
      docsProvider: input.docsProvider ?? "confluence",
      jiraProject: input.jiraProject ?? null,
      // sowSections: sections.length,
      // documents: docRows.length,
      // openedWorkflow,
      problems,
    },
  });

  return {
    engagementId: id,
    // documents: docRows.length,
    // Always null and zero now — kept in the shape because callers read them, and reporting "0
    // sections filed" is true rather than a field quietly disappearing.
    // sowVersionId,
    // sowSections: sections.length,
    // openedWorkflow,
    published: 0,
    problems,
  };
}
