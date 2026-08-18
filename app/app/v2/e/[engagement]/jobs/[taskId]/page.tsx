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
import { conversation, openQuestions, draftOf, taskState } from "@/app/lib/data/job";
import { storedStatusFor } from "@/app/lib/data/gates";
import { describeCriterion } from "../../../../_ui/criterion";
import { Tag } from "../../../../_ui/primitives";
import { Conversation } from "./Conversation";
import { ContextStrip } from "./ContextStrip";
import { DraftPanel } from "./DraftPanel";
import { AnswerForm } from "./AnswerForm";
import { RunButton } from "./RunButton";
import { ApprovePanel } from "./ApprovePanel";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  idle: "not started",
  running: "started",
  awaiting: "waiting on you",
  hitl: "drafted — awaiting approval",
  closed: "closed",
};

export default async function JobPage(props: PageProps<"/v2/e/[engagement]/jobs/[taskId]">) {
  const { engagement, taskId } = await props.params;
  const search = await props.searchParams;
  const role = Array.isArray(search.role) ? search.role[0] : search.role;

  const roles = await rolesOnEngagement(engagement);
  const roleCode = role ?? roles.find((r) => r.holder)?.code;
  if (!roleCode) notFound();

  const actor = await resolveActor(engagement, roleCode);
  if (!actor) notFound();

  const ctx = await buildContext(actor, taskId);
  if (!ctx) notFound();

  const [turns, questions, draft, gates, state] = await Promise.all([
    conversation(taskId), openQuestions(taskId), draftOf(actor, ctx.produces),
    storedStatusFor([taskId]), taskState(actor, taskId),
  ]);

  const statuses = gates.get(taskId) ?? [];
  const doneCriteria = statuses.filter((g) => g.kind === "done")
    .map((g) => ({ id: g.id, statement: describeCriterion(g), satisfied: g.satisfied, source: g.source, detail: g.detail }));

  return (
    <div className="job">
      <div className="job-head">
        <Link href={`/v2/e/${engagement}/jobs${role ? `?role=${role}` : ""}`} className="job-back">← Jobs to do</Link>
        <div className="job-title-row">
          <h2>{ctx.taskTitle}</h2>
          <Tag tone={state === "closed" ? "accent-2" : state === "hitl" ? "accent" : "outline"}>
            {STATE_LABEL[state ?? ""] ?? state}
          </Tag>
        </div>
      </div>

      {/* Everything the old left column held, folded into one line you can open. */}
      <ContextStrip
        inputs={ctx.inputs} doneCriteria={ctx.doneCriteria} statuses={statuses}
        produces={ctx.produces}
      />

      <div className="job-body">
        <section className="chat-col">
          <Conversation turns={turns} />

          {questions.length > 0 && (
            <AnswerForm engagement={engagement} role={roleCode} taskId={taskId} questions={questions} />
          )}

          {state === "hitl" && draft && doneCriteria.length > 0 && (
            <ApprovePanel engagement={engagement} role={roleCode} taskId={taskId} criteria={doneCriteria} />
          )}

          {state === "closed" ? (
            <p className="closed-note">Closed. Approved and published.</p>
          ) : (
            <RunButton
              engagement={engagement} role={roleCode} taskId={taskId}
              hasOpenQuestions={questions.length > 0} secondary={state === "hitl"}
            />
          )}
        </section>

        <DraftPanel path={ctx.produces} draft={draft} engagement={engagement} role={roleCode} />
      </div>
    </div>
  );
}
