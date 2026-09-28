import { runCode, storyFor } from "../code-run";
import { jiraForEngagement, addRemoteLink, addComment } from "../../jira";
import { recordTurn } from "./turn-context";
import { handOver, releaseExecutor } from "./effects";
import type { AgentOutcome, Turn } from "./types";

/**
 * The `code` tool — the build hand-off. The only tool whose outcome this app does not author: the
 * orchestrator creates the branch, runs the project's CI-parity checks and opens a pull request
 * ONLY on green; what comes back is a fact, not a claim, which is why the model writes the intent
 * and the app writes the result.
 *
 * Moved out of `runAgent` as-is — the code refusal here releases the claim BEFORE recording why,
 * the reverse of every other exit in this file, and emits no `agent.run.finished`. That is
 * unchanged from before the split; see the Phase 2 PR description for the discrepancy, tracked
 * separately rather than fixed silently as part of a pure move.
 */
export async function handleCode({ actor, taskId, ctx, message, call }: Turn): Promise<AgentOutcome> {
  const input = call.input as { summary?: string; approach?: string; files?: unknown };
  const files = Array.isArray(input.files) ? (input.files as string[]).filter((f) => typeof f === "string") : [];

  const intent =
    `**Building.** ${input.summary ?? ""}\n\n` +
    `**Approach.** ${input.approach ?? ""}\n\n` +
    (files.length ? `**Files expected to change.**\n${files.map((f) => `- \`${f}\``).join("\n")}\n` : "");

  // Written BEFORE the spawn. A build takes minutes and can be killed; if the intent were only
  // recorded on success, a run that died would leave no trace of what it was trying to do.
  await recordTurn(taskId, intent, ctx);

  const built = await runCode(actor.engagementId, taskId, { context: input.summary ?? "" });

  if (built.refusal) {
    await releaseExecutor(taskId, ctx, { failed: true });
    await recordTurn(taskId, `**The build did not start.** ${built.refusal}`, ctx);
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
