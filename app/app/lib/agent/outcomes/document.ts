import { supabaseAdmin } from "../../supabase";
import { emit } from "../../data/events";
import { publishToDocs } from "../../data/publish";
import { normaliseBacklog, sectionsOf, recordBacklog } from "../../data/backlog";
import { commitmentsSection, overviewSection } from "../../data/sprint-rows";
import { normaliseRosterRows, rosterSection } from "../../data/roster-rows";
import { resolveCommitments } from "../../data/sprint";
import { missingSections } from "../../render/template";
import type { AgentContext } from "../context";
import { asSections, recordTurn } from "./turn-context";
import { handOver, releaseExecutor } from "./effects";
import type { AgentOutcome, Turn } from "./types";

/**
 * `draft`, `backlog`, `sprint` and `roster` are one path deliberately.
 *
 * All four produce the same deliverable — a filed, versioned, cited document that a human
 * approves — and they differ only in what the model returned and what happens to it afterwards.
 * Giving each its own branch would mean a third copy of filing, citations, the empty-output
 * diagnosis, the superseded-questions sweep and the HITL transition, and the copies are where
 * they would drift.
 *
 * Moved out of `runAgent` as-is.
 */
export async function handleDocument({ actor, taskId, ctx, message, text, call, truncated }: Turn): Promise<AgentOutcome> {
  const sb = supabaseAdmin();
  if (!sb) return { kind: "error", message: "Supabase is not configured." };

  const isBacklog = call.name === "backlog";
  const isSprint = call.name === "sprint";
  const isRoster = call.name === "roster";
  const input = call.input as {
    summary?: string; sections?: unknown; epics?: unknown;
    goal?: string; starts?: string; ends?: string; commitments?: unknown; rows?: unknown;
  };

  // The backlog arrives as structure and is turned into sections HERE, so everything downstream —
  // the filed document, its citations, a redraft's `priorDraft` — is unchanged. The structure is
  // ALSO kept, below, because that is what becomes issues on the board.
  const { epics, problems: backlogProblems } = isBacklog
    ? normaliseBacklog(input.epics)
    : { epics: [], problems: [] as string[] };

  // A sprint plan is a readable page AND a set of commitments. The page is what the agent wrote;
  // the commitments are rendered from the tool's structure into one section, never written
  // freehand, so that approval can read them back mechanically. See `sprint-rows.ts` for why the
  // document carries them rather than a table.
  const { commitments, problems: sprintProblems } = isSprint
    ? await resolveCommitments(actor.engagementId, input.commitments)
    : { commitments: [], problems: [] as string[] };

  // The roster arrives as rows for the same reason the backlog does: a name that exists only as
  // a sentence in a page is a name the app cannot act on. Rendered into the exact table
  // `parseRoster`/`materialiseRoster` already read, so nothing downstream of the document changes
  // — the tool is the whole fix.
  const { rows: rosterRows, problems: rosterProblems } = isRoster
    ? normaliseRosterRows(input.rows)
    : { rows: [], problems: [] as string[] };

  // The commitments/roster table is APPENDED to what the agent wrote, so the plan reads as a page
  // and still carries the structure approval needs. Guarded on length: appending unconditionally
  // would mean a plan that committed or staffed nothing still produced a section, and the "no
  // document was produced" check below — which counts sections — would never fire on the one
  // outcome that most needs to halt.
  const sections = isBacklog
    ? sectionsOf(epics)
    : isSprint
      ? (commitments.length
          ? [
              // The number is OURS, not the model's. `ctx.sprint` allocated it and the labels
              // will use it; letting the prose name a different one is how the page and the
              // board end up describing two different sprints.
              overviewSection({
                number: ctx.sprint?.number ?? 0,
                goal: input.goal ?? "",
                starts: input.starts ?? "",
                ends: input.ends ?? "",
              }),
              ...asSections(input.sections),
              commitmentsSection(commitments),
            ]
          : [])
      : isRoster
        ? (rosterRows.length
            ? [...asSections(input.sections), rosterSection(rosterRows)]
            : [])
        : asSections(input.sections);

  // The conversation gets the SUMMARY, not the document. Writing the whole draft into the turn
  // made it render twice — once in the chat and again in the document pane — and turned a
  // readable exchange into nine pages of duplicated text. The chat is where you talk about the
  // work; the document pane is where the work is.
  //
  // Durability is still handled, just not by duplication: if filing fails, the draft is written
  // as a recovery turn below, which is the only case where the conversation is the last copy.
  await recordTurn(
    taskId,
    // What the normaliser dropped or renamed goes to the human, not just to a log. A backlog is
    // approved on the strength of being complete, and "one of your epics had no title so it is
    // not here" is precisely what the approver needs to know before they say yes.
    [text, input.summary, backlogProblems.length
      ? `_Reading the backlog:_\n${backlogProblems.map((p) => `- ${p}`).join("\n")}`
      : "", sprintProblems.length
      ? `_Committing to the sprint:_\n${sprintProblems.map((p) => `- ${p}`).join("\n")}`
      : "", rosterProblems.length
      ? `_Reading the roster:_\n${rosterProblems.map((p) => `- ${p}`).join("\n")}`
      : ""].filter(Boolean).join("\n\n"),
    ctx,
  );

  if (!sections.length) {
    // An EMPTY array is not unreadable output — it parsed perfectly and contained nothing. Saying
    // "could not be read" sends someone to debug a parser when the actual cause is usually that
    // the model ran out of room after writing its summary. Name which one it was.
    const returned = isBacklog ? input.epics : isSprint ? input.commitments : isRoster ? input.rows : input.sections;
    const noun = isBacklog ? "epics" : isSprint ? "commitments" : isRoster ? "rows" : "sections";
    const why = truncated
      ? "It hit the token limit after writing its summary, so the document itself never came. Run it again — the budget is larger now."
      : Array.isArray(returned)
        ? `It returned an empty list of ${noun}, having written a summary. Running again usually resolves it.`
        : `Its ${noun} came back in a shape that could not be read; the raw output is below.`;

    await recordTurn(
      taskId,
      `**No document was produced.** ${why}` +
        (Array.isArray(returned) && !returned.length
          ? ""
          : "\n\n```json\n" +
            JSON.stringify(returned ?? call.input, null, 2).slice(
              0,
              40000,
            ) +
            "\n```"),
      ctx,
    );
    await releaseExecutor(taskId, ctx, { failed: true });
    return {
      kind: "error",
      message: `The agent wrote a summary but produced no document. ${why}`,
    };
  }

  // A path naming a subject the run does not have halts here rather than filing. Filing it at the
  // literal `…/{epic}` would put every epic's design at one path, each overwriting the last, and
  // the Done gate would pass on all of them — a false green built out of real-looking documents.
  if (ctx.unresolvedProduces) {
    await releaseExecutor(taskId, ctx, { failed: true });
    return {
      kind: "error",
      message:
        `This step produces \`${ctx.unresolvedProduces}\`, which names a subject this run does ` +
        `not have. The run was opened without one — nothing was filed.`,
    };
  }

  if (!ctx.produces) {
    await releaseExecutor(taskId, ctx, { failed: true });
    return {
      kind: "error",
      message:
        "The agent drafted, but this step declares no document to produce.",
    };
  }

  // Where this deliverable goes — parsed in `buildContext`, so `ctx.produces` is already the bare
  // path everywhere it is used. `02-scope/deliverables@tickets` files the document in Compass and
  // creates the issues on the board instead of publishing a page; a bare path is the doc store, as
  // every existing step means.
  //
  // An UNKNOWN slot halts rather than defaulting. `@scm` or a typo would otherwise publish to the
  // doc store and look exactly like it worked, which is the failure that is impossible to notice.
  if (ctx.destination === null) {
    await releaseExecutor(taskId, ctx, { failed: true });
    return {
      kind: "error",
      message:
        `This step's destination for \`${ctx.produces}\` is not one this app knows. ` +
        `It must be \`@docs\` or \`@tickets\`, or absent for the doc store.`,
    };
  }

  // THE TEMPLATE IS A FLOOR. Every section it declares must be present; anything beyond it is
  // the agent's to add, and extras are kept in the order they arrived.
  //
  // Checked BEFORE `file_document`, which is the whole point. Filing first and complaining after
  // would leave a document that is missing "Scope of Work" sitting at its path, published, with
  // the row marked drafted — and its Done criterion asks whether a document exists, so the gate
  // would pass on it. A half-written deliverable that reads as finished is the exact false green
  // this app is built to refuse.
  //
  // Not exempted for backlog and sprint rows even though their sections are generated from the
  // tool's structure rather than written by the model. If such a row declares a template and the
  // sections do not satisfy it, that is a misconfiguration worth seeing; a silent exemption is a
  // rule with a hole nobody can find.
  if (ctx.template) {
    const missing = missingSections(ctx.template.sections, sections.map((s) => s.heading));
    if (missing.length) {
      // The list goes into the TURN, so the model reads it on the next run and the human can see
      // why nothing was filed. Naming them in the template's own spelling is what makes it
      // actionable — "2. Scope of Work" says where to look in a way "scope of work" does not.
      await recordTurn(
        taskId,
        `**Not filed — the draft is missing ${missing.length} section(s) the ` +
          `\`${ctx.templateName}\` template requires:**\n` +
          missing.map((m) => `- ${m}`).join("\n") +
          `\n\nEverything else was kept. Run again and include them; extra sections beyond the ` +
          `template are welcome.`,
        ctx,
      );
      await releaseExecutor(taskId, ctx, { failed: true });
      return {
        kind: "error",
        message:
          `The draft is missing ${missing.length} required section(s): ${missing.join(", ")}. ` +
          `Nothing was filed.`,
      };
    }
  }

  const { data: org } = await sb
    .from("engagement")
    .select("org_id")
    .eq("id", actor.engagementId)
    .maybeSingle();

  const { data: versionId, error } = await sb.rpc("file_document", {
    p_org_id: org?.org_id ?? actor.orgId,
    p_engagement_id: actor.engagementId,
    p_path: ctx.produces,
    p_title: ctx.taskTitle,
    p_sections: sections.map((s) => ({ heading: s.heading, body: s.body })),
    // null = the routine derives the next version. Picking a number here is what made a
    // redraft collide on (document_id, version) and lose a two-minute run at the last step.
    p_version: null,
    p_actor: actor.holder ?? actor.roleCode,
    p_actor_role: actor.roleCode,
    p_owner_role: ctx.roleCode,
    p_task_id: taskId,
  });
  if (!error && versionId) {
    await emit({
      engagementId: ctx.engagementId,
      subjectType: "document",
      subjectId: versionId as string,
      verb: "document.filed",
      actorKind: "agent",
      actorRoleCode: ctx.roleCode,
      payload: { taskId, path: ctx.produces, sections: sections.length },
    });
  }
  if (error) {
    // Filing failed, so the conversation IS the last copy. Write it out in full — this is the
    // one case where the duplication is worth it, because the alternative is losing the run.
    await recordTurn(
      taskId,
      `**Filing failed — the draft is preserved here.** ${error.message}\n\n` +
        sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n"),
      ctx,
    );
    await releaseExecutor(taskId, ctx, { failed: true });
    return { kind: "error", message: `filing the draft: ${error.message}` };
  }

  await recordCitations(versionId as string, sections, ctx);

  // The backlog's STRUCTURE, kept beside the document it was just filed as.
  //
  // Written now, at draft time, with no ticket keys — so the human approving the gate is looking
  // at the rows that will become issues, not at a page somebody must read and trust. The issues
  // themselves are created on approval, by the materialiser.
  if (isBacklog) {
    const recorded = await recordBacklog(
      org?.org_id ?? actor.orgId, actor.engagementId, taskId, epics,
    );
    if (recorded.problems.length) {
      await recordTurn(
        taskId,
        `Filed the backlog, with a note:\n` +
          recorded.problems.map((p) => `- ${p}`).join("\n"),
        ctx,
      );
    }
  }

  // Publish to the engagement's doc store — unless this deliverable's destination is the tracker.
  //
  // Per `[docs-primary]` (#154) the page is the record for everyone who does not open Compass, and
  // for a backlog that audience reads the BOARD. Publishing a page of epics beside the epics
  // themselves would make two records of the same thing, and the page would be the one that goes
  // stale the first time somebody edits an issue.
  const published = ctx.destination === "tickets"
    ? { ok: true as const, url: null, id: null }
    : await publishToDocs(actor.engagementId, versionId as string);
  if (!published.ok) {
    await recordTurn(
      taskId,
      `Filed in Compass, but publishing to the engagement's doc store failed: ${published.error}\n\n` +
        `The document is complete and versioned here; it is not yet visible in the doc store.`,
      ctx,
    );
  }

  // Drafting is a decision to proceed without the outstanding answers. Those questions stop
  // blocking — but they were never answered, so they are superseded, not resolved. Leaving them
  // open is what made the queue look like the agent was asking the same things forever.
  const { data: dropped } = await sb
    .from("question")
    .update({
      state: "superseded",
      superseded_at: new Date().toISOString(),
      superseded_reason:
        "The agent drafted without these answers and named what was unresolved in the document.",
    })
    .eq("task_id", taskId)
    .eq("state", "open")
    .select("id, prompt");

  // Superseded is not answered. A question worked around leaves a line saying so, or the record
  // reads as though it was resolved.
  for (const q of dropped ?? []) {
    await emit({
      engagementId: ctx.engagementId,
      subjectType: "question",
      subjectId: q.id,
      verb: "question.superseded",
      actorKind: "agent",
      actorRoleCode: ctx.roleCode,
      payload: {
        taskId,
        prompt: q.prompt,
        reason: "drafted without an answer",
      },
    });
  }

  // Drafted, not done. A human still approves it — that is the HITL gate, and skipping it here
  // would make the agent both maker and checker.
  await handOver(actor, taskId, ctx, "drafted", message, {
    path: ctx.produces,
    sections: sections.length,
    published: published.ok,
  });
  return {
    kind: "drafted",
    summary: input.summary ?? "",
    sections: sections.length,
    path: ctx.produces,
    publishedUrl: published.ok ? published.url : null,
  };
}

/**
 * Record what each section was derived from.
 *
 * A citation points at the pinned VERSION, never the path — that is why `source_version_id` is NOT
 * NULL. A cite naming a document that was not among this task's inputs is dropped rather than
 * stored: the agent cannot have derived anything from a document it was never given, and recording
 * the claim would make the provenance trail lie.
 */
async function recordCitations(
  versionId: string,
  sections: { heading: string; cites: string[] }[],
  ctx: AgentContext,
): Promise<void> {
  const sb = supabaseAdmin();
  if (!sb || !versionId) return;

  const { data: rows } = await sb
    .from("document_section")
    .select("id, ord")
    .eq("document_version_id", versionId)
    .order("ord");
  if (!rows?.length) return;

  // Resolve each pinned input to the document AND the version id the agent actually read. Both are
  // stored: the document so "what cites this file" is one query, the version so the citation keeps
  // resolving to the text it was written from after the source is edited.
  const sources = new Map<string, { docId: string; versionId: string }>();
  for (const input of ctx.inputs) {
    if (!input.version) continue;
    const { data: doc } = await sb
      .from("document")
      .select("id")
      .eq("engagement_id", ctx.engagementId)
      .eq("path", input.path)
      .maybeSingle();
    if (!doc) continue;
    const { data: v } = await sb
      .from("document_version")
      .select("id")
      .eq("document_id", doc.id)
      .eq("version", input.version)
      .maybeSingle();
    if (v) sources.set(input.path, { docId: doc.id, versionId: v.id });
  }

  const citations = sections.flatMap((s, i) => {
    const section = rows[i];
    if (!section) return [];
    return s.cites
      .map((path) => ({ path, src: sources.get(path) }))
      .filter(
        (c): c is { path: string; src: { docId: string; versionId: string } } =>
          Boolean(c.src),
      )
      .map((c) => ({
        document_section_id: section.id,
        source_document_id: c.src.docId,
        source_version_id: c.src.versionId,
        locator: c.path,
      }));
  });

  if (citations.length) await sb.from("citation").insert(citations);
}
