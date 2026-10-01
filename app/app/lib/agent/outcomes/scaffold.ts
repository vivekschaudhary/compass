import { runScaffold } from "../scaffold-run";
import { recordTurn } from "./turn-context";
import { finished, handOver, releaseExecutor } from "./effects";
import type { AgentOutcome, Turn } from "./types";

/**
 * The `scaffold` tool — scaffolding's own hand-off, not `code`'s.
 *
 * `code`'s handler is entirely build-shaped: it requires a story (`storyFor`), records the outcome
 * as a comment on that story, and treats "intent" as a diff against code that already exists. A
 * repo being scaffolded has none of that — no story, no prior code — which is exactly why aliasing
 * `scaffold` onto `code` produced "this build run has no story on the tracker" for every scaffold
 * run. This handler never asks for one.
 */
export async function handleScaffold({ actor, taskId, ctx, message, call }: Turn): Promise<AgentOutcome> {
  const input = call.input as { summary?: string; framework?: string; options?: string };

  const intent =
    `**Scaffolding.** ${input.summary ?? ""}\n\n` +
    `**Framework.** ${input.framework ?? ""}\n\n` +
    (input.options ? `**Options.** ${input.options}\n` : "");

  // Written BEFORE the spawn, same discipline as `handleCode` — a scaffold that dies mid-flight
  // still leaves a record of what it was trying to do.
  await recordTurn(taskId, intent, ctx);

  const built = await runScaffold(actor.engagementId, taskId, {
    framework: input.framework ?? "",
    options: input.options ?? "",
  });

  if (built.refusal) {
    await recordTurn(taskId, `**The scaffold did not start.** ${built.refusal}`, ctx);
    await releaseExecutor(taskId, ctx, { failed: true });
    await finished(ctx.engagementId, taskId, ctx.roleCode, "scaffold-refused", message, {
      refusal: built.refusal,
    });
    return { kind: "error", message: built.refusal };
  }

  // No Jira story to comment on — a scaffold's record is the turn and the PR, same as everything
  // else that reaches a repo, minus `code`'s story-comment step (there is no story).
  const outcome = built.ok
    ? `**Scaffolded.** Checks passed and the pull request is open: ${built.prUrl}` +
      (built.branch ? `\n\nBranch \`${built.branch}\`.` : "")
    : `**UNSHIPPED — no pull request.** The orchestrator exited ${built.exit}. ` +
      `Nothing reached review, so there is nothing to merge.` +
      (built.branch ? ` The work is on \`${built.branch}\`.` : "");

  await recordTurn(taskId, `${outcome}\n\n\`\`\`\n${built.log.slice(-4000)}\n\`\`\``, ctx);

  // hitl either way — same reason `handleCode` always hands off: a failed scaffold still needs a
  // person to look, not an agent retrying forever against a generator that cannot run.
  await handOver(actor, taskId, ctx, built.ok ? "scaffolded" : "scaffold-failed", message, {
    branch: built.branch ?? null,
    pr: built.prUrl ?? null,
    exit: built.exit,
  });

  return built.ok
    ? { kind: "drafted", summary: outcome, sections: 0, path: built.prUrl ?? null }
    : { kind: "error", message: `The scaffold produced no pull request (exit ${built.exit}).` };
}
