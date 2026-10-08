import { runScaffold } from "../generate-run";
import { parseScaffoldRepos } from "../../data/scaffold-repos";
import { approve, measureTask } from "../../data/gates";
import { recordTurn } from "./turn-context";
import { finished, handOver, releaseExecutor } from "./effects";
import type { AgentOutcome, Turn } from "./types";

/**
 * The `scaffold` tool — scaffolding's own hand-off, not `code`'s.
 *
 * `code`'s handler is build-shaped: it requires a Jira story (`storyFor`) and treats its output as
 * a diff against code that already exists. A greenfield scaffold has neither — no story, nothing to
 * diff against — which is why aliasing `scaffold` onto `code` produced "this build run has no story
 * on the tracker" on every live run. This handler never asks for one.
 *
 * The model writes the intent (a framework and what the repo should be); the generator writes the
 * files, runs the checks, and opens the pull request only on green. What comes back is the
 * generator's recorded result, not a claim.
 */
export async function handleScaffold({ actor, taskId, ctx, message, call }: Turn): Promise<AgentOutcome> {
  const input = call.input as { summary?: string; framework?: string; options?: string };

  // Enforced, not just prompted: a repo the accepted record never named has no plan to carry out.
  // The model improvising one anyway (live: `app`/kindtree-swap got art-swap-backend's content,
  // borrowed from the only real repo it could see) is worse than refusing, because it ships a real
  // PR on a real repo under a false description. Checked against the SAME record this run was
  // handed, not a second read — the repo list the model saw is the repo list enforced here.
  const repoKey = ctx.subject?.ref ?? null;
  const record = ctx.inputs.find((i) => i.path === "scaffold-record")?.body
    ?? ctx.inputs.find((i) => i.body)?.body ?? null;
  const { repos: acceptedRepos } = record ? parseScaffoldRepos(record) : { repos: [] };
  if (!repoKey || !acceptedRepos.some((r) => r.key === repoKey)) {
    const msg = `**Refused.** '${repoKey ?? "(no subject)"}' is not listed in the accepted ` +
      `scaffold-record's Repositories table, so there is nothing to scaffold it against. ` +
      `Nothing was built.`;
    await recordTurn(taskId, msg, ctx);
    await releaseExecutor(taskId, ctx, { failed: true });
    return { kind: "error", message: msg };
  }

  const intent =
    `**Scaffolding.** ${input.summary ?? ""}\n\n` +
    `**Framework.** ${input.framework ?? ""}\n\n` +
    (input.options ? `**Options.** ${input.options}\n` : "");
  // Written BEFORE the generator runs — a run that dies still leaves a record of what it was trying.
  await recordTurn(taskId, intent, ctx);

  const result = await runScaffold(actor.engagementId, taskId, {
    summary: input.summary ?? "", framework: input.framework ?? "", options: input.options ?? "",
  });

  const outcome = result.status === "shipped"
    ? `**Scaffolded.** Checks passed and the pull request is open: ${result.pr_url}` +
      (result.branch ? `\n\nBranch \`${result.branch}\`.` : "")
    : `**UNSHIPPED — ${result.status}.** ${result.refusal ?? result.checks.failed ?? "no pull request"}`;
  await recordTurn(taskId, outcome, ctx);

  // A SHIPPED scaffold closes itself. Its own criteria are machine-checked now (ci green, a PR
  // linked) — judgment moved to `approve-repo-scaffold`, which judges the two now sitting there
  // against the actual PR (migration 20261007073000). Nothing here is left for a human to attest;
  // same discipline `settleSupplied` already uses for a fact a machine check settled.
  if (result.status === "shipped") {
    await measureTask(actor, taskId);
    const closed = await approve(actor, taskId, []);
    if (closed.ok) {
      await releaseExecutor(taskId, ctx, { failed: false });
      await finished(ctx.engagementId, taskId, ctx.roleCode, "scaffolded", message, {
        branch: result.branch ?? null, pr: result.pr_url ?? null, status: result.status, closed: true,
      });
    } else {
      // The gate said no — a criterion isn't actually measured as met yet. Never leave the row
      // mid-flight: hand it to a person with the reason, same as a failed close anywhere else.
      await recordTurn(taskId, `Shipped, but this row could not close itself: ${closed.error}`, ctx);
      await handOver(actor, taskId, ctx, "scaffolded", message, {
        branch: result.branch ?? null, pr: result.pr_url ?? null, status: result.status, closed: false,
      });
    }
  } else {
    // hitl: a failed scaffold still needs a person to look, not an agent retrying forever.
    await handOver(actor, taskId, ctx, "scaffold-failed", message, {
      branch: result.branch ?? null, pr: result.pr_url ?? null, status: result.status,
    });
  }

  return result.status === "shipped"
    ? { kind: "drafted", summary: outcome, sections: 0, path: result.pr_url ?? null }
    : { kind: "error", message: `The scaffold did not ship: ${result.refusal ?? result.status}.` };
}
