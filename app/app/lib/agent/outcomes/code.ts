import { runCode, storyFor } from "../code-run";
import { jiraForEngagement, addRemoteLink, addComment } from "../../jira";
import { buildReads } from "../context/loaders";
import { recordTurn } from "./turn-context";
import { finished, handOver, releaseExecutor } from "./effects";
import type { AgentOutcome, Turn } from "./types";

/**
 * The `code` tool — the build hand-off. The only tool whose outcome this app does not author: the
 * orchestrator creates the branch, runs the project's CI-parity checks and opens a pull request
 * ONLY on green; what comes back is a fact, not a claim, which is why the model writes the intent
 * and the app writes the result.
 */
export async function handleCode({ actor, taskId, ctx, message, call }: Turn): Promise<AgentOutcome> {
  const input = call.input as { summary?: string; approach?: string; repo?: string; files?: unknown };
  const files = Array.isArray(input.files) ? (input.files as string[]).filter((f) => typeof f === "string") : [];

  // The repo, before anything is recorded or spawned. With several registered, a missing or unknown
  // `repo` is a refusal that names the choices: the model was told them, and guessing is how a story
  // ends up in the wrong repository. With exactly one there is nothing to choose.
  const repoKey = (input.repo ?? "").trim() || null;
  if (ctx.repos.length > 1 && !ctx.repos.some((r) => r.key === repoKey)) {
    const refusal =
      `Name the repository in \`repo\`. ${repoKey ? `'${repoKey}' is not one of them. ` : ""}` +
      `Choose one of: ${ctx.repos.map((r) => `\`${r.key}\`${r.area ? ` (${r.area})` : ""}`).join(", ")} — or \`ask\` if the design does not say.`;
    // Same exits as a refusal from the orchestrator below: say why, give the claim back, close the
    // run in the log. Skipping the release would leave the row looking claimed until the sweep.
    await recordTurn(taskId, `**The build did not start.** ${refusal}`, ctx);
    await releaseExecutor(taskId, ctx, { failed: true });
    await finished(ctx.engagementId, taskId, ctx.roleCode, "build-refused", message, { refusal });
    return { kind: "error", message: refusal };
  }
  const repoName = ctx.repos.find((r) => r.key === repoKey)?.name ?? null;

  // The documents the step declares, before anything is spawned. The orchestrator reads the same
  // list at the same pinned versions and halts on a missing one — after it has cut a branch. Asking
  // here says which input is missing while nothing has been created. Every read is required: the
  // story's design and the design library are what the work is built to. Ones Compass lacks but the
  // client's Confluence or Jira has come back as `external` and are handed to the build as text.
  const { missing, external } = await buildReads(taskId, ctx.engagementId);
  if (missing.length) {
    const refusal =
      `The build needs ${missing.length === 1 ? "this document" : "these documents"} and ` +
      `${missing.length === 1 ? "it is" : "they are"} not in Compass: ${missing.map((p) => `\`${p}\``).join(", ")}. ` +
      `Have ${missing.length === 1 ? "it" : "them"} filed, then start the build again.`;
    await recordTurn(taskId, `**The build did not start.** ${refusal}`, ctx);
    await releaseExecutor(taskId, ctx, { failed: true });
    await finished(ctx.engagementId, taskId, ctx.roleCode, "build-refused", message, { refusal, missing });
    return { kind: "error", message: refusal };
  }

  const intent =
    (repoName ? `**Repository.** ${repoName} (\`${repoKey}\`)\n\n` : "") +
    `**Building.** ${input.summary ?? ""}\n\n` +
    `**Approach.** ${input.approach ?? ""}\n\n` +
    (files.length ? `**Files expected to change.**\n${files.map((f) => `- \`${f}\``).join("\n")}\n` : "");

  // Written BEFORE the spawn. A build takes minutes and can be killed; if the intent were only
  // recorded on success, a run that died would leave no trace of what it was trying to do.
  await recordTurn(taskId, intent, ctx);

  const built = await runCode(actor.engagementId, taskId, { context: input.summary ?? "", repo: repoKey, external });

  if (built.refusal) {
    // Recorded BEFORE releasing, same order as every other exit — the turn is why the row failed,
    // and a release that raced ahead of it used to leave a window where the sweep could pick the
    // row back up before the reason for the last failure was on the record.
    await recordTurn(taskId, `**The build did not start.** ${built.refusal}`, ctx);
    await releaseExecutor(taskId, ctx, { failed: true });
    // Every other exit closes the run in the log; this one silently didn't. A build that never
    // started looked, from the log, like a run that never finished.
    await finished(ctx.engagementId, taskId, ctx.roleCode, "build-refused", message, {
      refusal: built.refusal,
    });
    return { kind: "error", message: built.refusal };
  }

  // The record goes on the STORY, not into a document. A build's deliverable is the pull request;
  // filing a page about it would invent an artifact nobody asked for, and the person who needs
  // the link is looking at the ticket.
  const story = await storyFor(taskId);
  // The build has already run, so a failed credentials read must not throw past this point: that
  // would leave the task `running` with no record of the build. It is caught and said in the turn
  // below instead — the ticket not being updated is a fact the person reviewing needs to see.
  let jira: Awaited<ReturnType<typeof jiraForEngagement>> = null;
  let jiraProblem: string | null = null;
  if (story) {
    try {
      jira = await jiraForEngagement(actor.engagementId);
    } catch (e) {
      jiraProblem = e instanceof Error ? e.message : String(e);
    }
  }
  if (jira && story) {
    if (built.prUrl) await addRemoteLink(jira, story, built.prUrl, `PR — ${story}`);
    await addComment(
      jira, story,
      built.prUrl
        ? `Build complete — checks passed and a pull request is open: ${built.prUrl}`
        : `Build did not ship. The orchestrator exited ${built.exit} and opened no pull request.`,
    );
  }

  const outcome = (built.ok
    ? `**Built.** Checks passed and the pull request is open: ${built.prUrl}` +
      (built.branch ? `\n\nBranch \`${built.branch}\`.` : "")
    // Said plainly, because a run that completes every step and ships nothing is the failure this
    // is most likely to be mistaken for a success.
    : `**UNSHIPPED — no pull request.** The orchestrator exited ${built.exit}. ` +
      `Nothing reached review, so there is nothing to merge.` +
      (built.branch ? ` The work is on \`${built.branch}\`.` : "")) +
    (jiraProblem ? `\n\n**${story} was not updated in Jira.** ${jiraProblem}` : "");

  await recordTurn(taskId, `${outcome}\n\n\`\`\`\n${built.log.slice(-4000)}\n\`\`\``, ctx);

  // hitl either way. A failed build still needs a person to look — silently returning it to the
  // agent would let it retry forever against a repo that cannot build.
  await handOver(actor, taskId, ctx, built.ok ? "built" : "build-failed", message, {
    branch: built.branch ?? null,
    pr: built.prUrl ?? null,
    exit: built.exit,
  });

  return built.ok
    ? { kind: "drafted", summary: outcome, sections: files.length, path: built.prUrl ?? null }
    : { kind: "error", message: `The build produced no pull request (exit ${built.exit}).` };
}
