// Inside a job — a conversation, with its context and its output beside it.
//
// The first version gave the three panes equal weight and rendered every turn in full. Five runs
// later it was nine pages: the same document printed once in the chat and again in the document
// pane, behind five essay-length summaries with nothing collapsed.
//
// What someone opening a job wants is what just happened and what to do about it. So the chat is
// the page; the context that used to fill a column is a strip you can open; the document is a
// panel beside it, and the artifact itself lives on the content screen.

import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveActor, rolesOnEngagement } from "@/app/lib/data/actor";
import { buildContext } from "@/app/lib/agent/context";
import {
  conversation,
  openQuestions,
  draftOf,
  taskState,
  childRunBlock,
} from "@/app/lib/data/job";
import { nestedWorkflowOf, childRunsOf } from "@/app/lib/data/phases";
import { storedStatusFor } from "@/app/lib/data/gates";
import { documentTree } from "@/app/lib/data/documents";
import { commentsForSections } from "@/app/lib/data/comments";
import { readyAllMet } from "../Gate";
import { describeCriterion } from "../../../../_ui/criterion";
import { Tag } from "../../../../_ui/primitives";
import { Conversation } from "./Conversation";
import { ContextStrip } from "./ContextStrip";
import { DraftPanel } from "./DraftPanel";
import { Composer } from "./Composer";
import { ApprovePanel } from "./ApprovePanel";
import { NestedRunPanel } from "./NestedRunPanel";
import { RealtimeRefresh } from "./RealtimeRefresh";
import { DocTreeNav } from "./DocTreeNav";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  idle: "not started",
  running: "started",
  awaiting: "waiting on you",
  hitl: "drafted — awaiting approval",
  closed: "closed",
};

export default async function JobPage(
  props: PageProps<"/e/[engagement]/jobs/[taskId]">,
) {
  const { engagement, taskId } = await props.params;
  const search = await props.searchParams;
  const role = Array.isArray(search.role) ? search.role[0] : search.role;
  const holderId = Array.isArray(search.holder) ? search.holder[0] : search.holder;

  const roles = await rolesOnEngagement(engagement);
  const roleCode = role ?? roles.find((r) => r.holder)?.code;
  if (!roleCode) notFound();

  const actor = await resolveActor(engagement, roleCode, holderId);
  if (!actor) notFound();

  const ctx = await buildContext(actor, taskId);
  if (!ctx) notFound();

  const [
    turns,
    questions,
    draft,
    gates,
    taskRow,
    blocked,
    nests,
    childRuns,
    tree,
  ] = await Promise.all([
    conversation(taskId),
    openQuestions(taskId),
    // `reviewPath` on a review row, `produces` everywhere else — display-side only. `runAgent`
    // reads `ctx.produces` directly and must never see the reviewed document as its own.
    draftOf(actor, ctx.reviewPath ?? ctx.produces),
    storedStatusFor([taskId]),
    taskState(actor, taskId),
    childRunBlock(actor, taskId),
    nestedWorkflowOf(taskId),
    childRunsOf(actor, taskId),
    documentTree(actor),
  ]);
  // Depends on `draft`'s own section ids, so it cannot join the batch above.
  const comments = await commentsForSections(draft?.sections.map((s) => s.id) ?? []);
  const state = taskRow?.state ?? null;

  // Freshly started, on this very load: the row is running, nothing has picked it up yet, and
  // there is no conversation yet either — a task returned to after answering a question, or one an
  // agent already worked and left `running` mid-tool-call, must NOT re-fire just because executor
  // happens to read null at that instant.
  const autoRun =
    state === "running" && taskRow?.executor === null && turns.length === 0;

  const statuses = gates.get(taskId) ?? [];
  const doneCriteria = statuses
    .filter((g) => g.kind === "done")
    .map((g) => ({
      id: g.id,
      statement: describeCriterion(g),
      satisfied: g.satisfied,
      source: g.source,
      detail: g.detail,
    }));

  return (
    <div className="job">
      <RealtimeRefresh taskId={taskId} />
      <div className="job-head">
        <Link
          href={`/e/${engagement}/jobs${role ? `?role=${role}` : ""}`}
          className="job-back"
        >
          ← Jobs to do
        </Link>
        <div className="job-title-row">
          <h2>{ctx.taskTitle}</h2>
          <Tag
            tone={
              state === "closed"
                ? "accent-2"
                : state === "hitl"
                  ? "accent"
                  : "outline"
            }
          >
            {STATE_LABEL[state ?? ""] ?? state}
          </Tag>
        </div>
      </div>

      {/* Everything the old left column held, folded into one line you can open. */}
      <ContextStrip
        inputs={ctx.inputs}
        doneCriteria={ctx.doneCriteria}
        statuses={statuses}
        produces={ctx.reviewPath ?? ctx.produces}
        engagement={engagement}
        role={roleCode}
        taskId={taskId}
      />

      {/* A nesting row whose nested run finished while this row's gate did not pass. The trigger
          has to swallow that exception — raising would roll back the child's close — so without
          this the row just sits open and the reason lives only in the event log. */}
      {blocked && state !== "closed" && (
        <p className="jobs-note">
          The nested run finished, but this row&apos;s gate is not met:{" "}
          {blocked}
        </p>
      )}

      <div className="job-body job-body-2">
        {/* <DocTreeNav engagement={engagement} roleCode={roleCode} tree={tree} produces={ctx.produces} /> */}

        <section className="chat-col">
          <Conversation turns={turns} />

          {/* Pinned below the scrolling conversation, not carried away with it — the approve
              checklist is the actual next action on a hitl row, and "I keep telling the agent
              it's approved in chat" is what happens when it scrolls out of sight behind older
              messages. A chat reply can never close this row (see `runAgent`'s own `doc-review`
              handling); this checklist is the only thing that does, so it stays visible with the
              composer, not above it in the scrolling history. */}
          <div className="chat-action">
            {state === "hitl" && draft && doneCriteria.length > 0 && (
              <ApprovePanel
                engagement={engagement}
                role={roleCode}
                holderId={actor.holderId}
                taskId={taskId}
                criteria={doneCriteria}
                isReview={ctx.renders === "doc-review" || ctx.renders === "code-review"}
              />
            )}

            {nests && state !== "closed" ? (
              /* No agent to run — its work happens in the child run's own steps, so the composer
                 (answer/run) makes no sense here either. */
              <NestedRunPanel
                engagement={engagement}
                role={roleCode}
                taskId={taskId}
                nests={nests}
                runs={childRuns}
              />
            ) : (
              <>
                {state === "closed" && (
                  <p className="closed-note">Closed. Approved and published.</p>
                )}
                {/* Still offered when closed — a note goes on the record, nothing here restarts it.
                    `questions` is always empty by the time a task is closed. */}
                <Composer
                  engagement={engagement}
                  role={roleCode}
                  holderId={actor.holderId}
                  taskId={taskId}
                  questions={state === "closed" ? [] : questions}
                  closed={state === "closed"}
                  hasOpenQuestions={questions.length > 0}
                  secondary={state === "hitl"}
                  reviewOnly={ctx.renders === "doc-review" || ctx.renders === "code-review"}
                  hitl={state === "hitl"}
                  autoRun={autoRun}
                  idle={state === "idle"}
                  readyMet={readyAllMet(statuses)}
                />
              </>
            )}
          </div>
        </section>

        <DraftPanel
          path={ctx.reviewPath ?? ctx.produces}
          draft={draft}
          // A plain object, not the `Map` `commentsForSections` returns — a client component prop
          // crossing the server/client boundary sticks to plain values, same as `statuses`/
          // `doneCriteria` below being read out of the `gates` Map server-side rather than handed
          // the Map itself.
          comments={Object.fromEntries(comments)}
          engagement={engagement}
          role={roleCode}
          holderId={actor.holderId}
          taskId={taskId}
          // A review renders read-only regardless of the task's own state — a reviewer signs off
          // on what the document says, they do not silently rewrite it out from under the row
          // they are gating.
          closed={state === "closed" || ctx.renders === "doc-review" || ctx.renders === "code-review"}
        />
      </div>
    </div>
  );
}
