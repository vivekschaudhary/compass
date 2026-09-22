// Clear an engagement's work, keeping the engagement.
//
//   GET  /api/cleanup?engagementId=<id>            report only — reading never writes
//   POST /api/cleanup?engagementId=<id>&dry=1      report only
//   POST /api/cleanup?engagementId=<id>            clear it
//
// The shape is `/api/import`'s, deliberately: GET reports, POST applies unless told to be dry, and
// the useful output of a destructive tool is the list of what it would destroy. Same underlying
// code as `scripts/reset-engagement.mts` — `resetEngagement` — so the CLI and the route cannot
// drift into meaning different things by "reset".
//
// WHAT IT DOES NOT TOUCH. The engagement row, its people, its connector config and every imported
// workflow definition survive, so nothing has to be re-imported afterwards. Neither do pages
// already published to Confluence nor issues already created in Jira: `publishedElsewhere` counts
// them and the response says so, because a reset that went quiet about them would read as having
// removed both.
//
// An engagement id is REQUIRED even though the CLI can clear every engagement at once. A URL that
// wipes every engagement on the instance when somebody forgets a parameter is not a convenience.

import { resetEngagement, engagementsToReset } from "@/app/lib/data/reset-apply";
import { describeReset } from "@/app/lib/data/reset";
import { ok, refuse, fail } from "@/app/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function run(engagementId: string | null, apply: boolean) {
  if (!engagementId) {
    return refuse(
      "engagementId is required — this route clears one engagement at a time.",
      400,
    );
  }

  const found = await engagementsToReset(engagementId);
  if (!found.ok) return refuse(found.error, 400);

  try {
    const target = found.targets[0];
    const result = await resetEngagement(target.id, target.name, { apply });
    if (!result.ok) return refuse(result.refusals);

    return ok({
      engagementId: result.engagementId,
      name: result.name,
      cleared: result.cleared,
      // The same lines the CLI prints, so a reader of either sees one account of what happened.
      report: describeReset(result.plan),
      deletes: result.plan.deletes.map((d) => ({ table: d.table, rows: d.ids.length, cascades: d.cascades })),
      keeps: result.plan.keeps,
      publishedElsewhere: result.plan.publishedElsewhere,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The reset failed.");
  }
}

/** Reading must not write, so a GET is always a report however it is called. */
export async function GET(req: Request) {
  return run(new URL(req.url).searchParams.get("engagementId"), false);
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  return run(url.searchParams.get("engagementId"), url.searchParams.get("dry") !== "1");
}
