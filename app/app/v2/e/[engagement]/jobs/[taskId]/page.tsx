// Inside a job — the three panes.
//
// Context on the left, the conversation in the middle, the document on the right. The panes are not
// three views of the same thing: they are what the agent READ, what it SAID, and what it PRODUCED,
// and keeping them apart is what makes the middle one auditable.

import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveActor, rolesOnEngagement } from "@/app/lib/data/actor";
import { buildContext } from "@/app/lib/agent/context";
import { conversation, openQuestions, draftOf } from "@/app/lib/data/job";
import { storedStatusFor, describeCriterion } from "@/app/lib/data/gates";
import { taskState } from "@/app/lib/data/job";
import { Tag, SectionLabel } from "../../../../_ui/primitives";
import { Gate } from "../Gate";
import { AnswerForm } from "./AnswerForm";
import { RunButton } from "./RunButton";
import { ApprovePanel } from "./ApprovePanel";

export const dynamic = "force-dynamic";

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
    conversation(taskId), openQuestions(taskId), draftOf(actor, ctx.produces), storedStatusFor([taskId]),
    taskState(actor, taskId),
  ]);

  // The approval panel appears when there is something to approve — a draft, and a task waiting at
  // the gate. Showing it earlier would invite a signature on work that does not exist yet.
  const doneCriteria = (gates.get(taskId) ?? [])
    .filter((g) => g.kind === "done")
    .map((g) => ({ id: g.id, statement: describeCriterion(g), satisfied: g.satisfied }));

  const backHref = `/v2/e/${engagement}/jobs${role ? `?role=${role}` : ""}`;

  return (
    <div className="job">
      <div className="job-head">
        <Link href={backHref} className="job-back">← Jobs to do</Link>
        <h2>{ctx.taskTitle}</h2>
        {ctx.taskSubtitle && <p className="text-muted job-sub">{ctx.taskSubtitle}</p>}
      </div>

      <div className="job-panes">
        {/* ── what it reads ─────────────────────────────────────────────── */}
        <aside className="pane pane-context">
          <SectionLabel>Reads</SectionLabel>
          <div className="pin-list">
            {ctx.inputs.length === 0 && <p className="text-muted pane-empty">Nothing pinned — this task declares no inputs.</p>}
            {ctx.inputs.map((i) => (
              <div key={i.path} className={i.body ? "pin" : "pin pin-missing"}>
                <div className="pin-title">{i.title ?? i.path}</div>
                <div className="pin-path">{i.path}</div>
                {/* The version is the point: this is what the agent read, not what the file says now. */}
                {i.version
                  ? <Tag tone="accent-2">pinned v{i.version}</Tag>
                  : <span className="pin-none">not drafted — read as empty</span>}
              </div>
            ))}
          </div>

          <SectionLabel>Done when</SectionLabel>
          <ul className="done-list">
            {ctx.doneCriteria.length === 0 && <li className="text-muted">No done criteria recorded.</li>}
            {ctx.doneCriteria.map((c, i) => <li key={i}>{c}</li>)}
          </ul>

          <Gate statuses={gates.get(taskId) ?? []} kind="ready" />
        </aside>

        {/* ── what it said ──────────────────────────────────────────────── */}
        <section className="pane pane-talk">
          <SectionLabel>Conversation</SectionLabel>
          {turns.length === 0 && (
            <p className="text-muted pane-empty">Nothing yet. Run the agent and it will read the pinned documents.</p>
          )}
          {turns.map((t) => (
            <article key={t.id} className={`turn turn-${t.authorKind}`}>
              <div className="turn-who">
                {t.authorKind === "agent" ? `${t.authorRoleCode ?? "agent"} agent` : t.authorUserId ?? "you"}
                <span className="turn-when">{new Date(t.createdAt).toLocaleTimeString()}</span>
              </div>
              <div className="turn-body">{t.body}</div>
            </article>
          ))}

          {questions.length > 0 && (
            <AnswerForm
              engagement={engagement} role={roleCode} taskId={taskId} questions={questions}
            />
          )}

          {state === "hitl" && draft && doneCriteria.length > 0 && (
            <ApprovePanel
              engagement={engagement} role={roleCode} taskId={taskId} criteria={doneCriteria}
            />
          )}

          {state === "closed" ? (
            <p className="closed-note">Closed. Approved and published.</p>
          ) : (
            <RunButton
              engagement={engagement} role={roleCode} taskId={taskId}
              hasOpenQuestions={questions.length > 0}
            />
          )}
        </section>

        {/* ── what it produced ──────────────────────────────────────────── */}
        <aside className="pane pane-doc">
          <SectionLabel>{ctx.produces ?? "Produces nothing"}</SectionLabel>
          {!draft && (
            <p className="text-muted pane-empty">
              Not drafted yet.{ctx.produces ? " This is where the deliverable appears." : ""}
            </p>
          )}
          {draft && (
            <>
              <div className="draft-meta">
                <Tag tone={draft.status === "published" ? "accent-2" : "outline"}>
                  {draft.status} v{draft.version}
                </Tag>
              </div>
              {draft.sections.map((s) => (
                <div key={s.id} className="draft-section">
                  <h4>{s.heading}</h4>
                  <div className="draft-body">{s.body}</div>
                  {/* Provenance under the claim it supports, not in a footnote nobody opens. */}
                  {s.cites.length > 0 && (
                    <div className="draft-cites">
                      from {s.cites.map((c) => `${c.path} v${c.version}`).join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
