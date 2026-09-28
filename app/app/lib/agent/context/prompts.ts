import { describeTemplate } from "../../render/template";
import type { ResolvedTemplate } from "../../data/templates";
import { ASK_BATCH, ASK_ROUNDS_MAX, type AgentContext, type SprintContext } from "./types";

/**
 * The agent file minus its task catalogue.
 *
 * `compass/agents/<role>.md` goes into the prompt whole, and it still carries `## Tasks I own` — a
 * list of tasks the app never dispatches, because the app takes its instruction from the ROW.
 * AGENTS.md already rules that those sections "are the initial design and are not what runs… they
 * are to be ignored rather than followed"; nothing enforced it.
 *
 * On the first live run of `file-sow` the agent followed `intake-sow` from that catalogue instead of
 * the row it was given, and asked five questions — roster, quality bar, sprint cadence, comms
 * channel — for a row whose whole job is one document. It named `intake-sow` in its own reply.
 *
 * REMOVES THE SECTION, DOES NOT TRUNCATE AT IT. `## Refusal rules`, `## Anti-patterns` and
 * `## Output summary contract` all come AFTER `## Tasks I own` in every one of the seventeen files,
 * and they are the discipline this system runs on — the reason that same agent correctly refused to
 * invent the SOW. Cutting the file at that heading would have deleted them: a scope fix that
 * silently became a discipline regression.
 *
 * The FILE keeps its sections. It is a paste-into-any-host document per
 * `[agent-as-surface-independent-unit]`, and re-authoring the seventeen of them is its own job. This
 * is only about what goes into a prompt.
 */
export function withoutTaskCatalogue(md: string): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^## Tasks I own\s*$/.test(l));
  if (start === -1) return md;              // nothing to remove is not an error

  // The next SIBLING heading. `^## ` cannot match `### `, so the task subsections inside are
  // consumed rather than ending the scan at the first one.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }

  return [...lines.slice(0, start), ...lines.slice(end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");            // the seam, not a reformat of the whole file
}

/**
 * The system prompt.
 *
 * The Done criteria go in as the stopping condition, not as decoration. They are what the work is
 * measured against, so the agent should know them before it starts rather than be graded on them
 * afterwards — that was the whole point of holding them as structure.
 */
export function systemPrompt(ctx: AgentContext): string {
  const parts: string[] = [];

  parts.push(ctx.agentFile
    ? ctx.agentFile
    : `You are the ${ctx.roleCode} on a delivery engagement. No agent definition file was found for this role, so you are working without its usual discipline — say so in your first message rather than improvising one.`);

  if (ctx.inventory.length) {
    const unspecified = ctx.inventory.filter((w) => w.stepCount === 0);
    parts.push(`
# The workflows this engagement can run

This is the complete list. Do not name a workflow that is not on it, and do not assume a workflow
exists because the work obviously needs doing — if a piece of scope has no workflow here, that is
a real gap and naming it is more useful than inventing a row to cover it.

${ctx.inventory.map((w) =>
  `- \`${w.code}\` — ${w.label}${w.workstream ? ` · ${w.workstream}` : ""}${w.ownerRole ? ` · owned by ${w.ownerRole}` : ""}` +
  (w.stepCount === 0 ? " · STEPS UNSPECIFIED" : ` · ${w.stepCount} steps`)).join("\n")}
${unspecified.length ? `
${unspecified.length} of these have no steps specified — the command exists but its dispatch graph was never
written. You may place work against them; you cannot say what they do step by step.` : ""}`.trim());
  } else {
    parts.push(`
# The workflows this engagement can run

No workflow inventory was found. Say so rather than working from what you assume Compass provides —
any workflow name you produce would be a guess.`.trim());
  }

  if (ctx.phaseRows.length) {
    parts.push(`
# The rest of this phase

Each row below is somebody's work, with its own deliverable and its own gate.

A row AFTER yours is not a gap for you to fill. What it produces is that row's to gather — and
asking for it here does not just make the human answer twice: **the answer is lost**. It lands in
this task's conversation, and the row that needs it never reads it. Name the row instead, and let
the person hear that it is coming.

A row BEFORE yours has already produced something. If you were not given it and you need it, say
which row and which document rather than asking the human to retype what Compass already has.

${ctx.phaseRows.map((r) =>
  `- ${r.ord} · ${r.title}${r.role ? ` — ${r.role}` : ""}` +
  (r.produces ? ` → ${r.produces}` : "") +
  (r.later ? "   (after yours)" : "")).join("\n")}`.trim());
  }

  parts.push(`
# This task

${ctx.taskTitle}${ctx.taskSubtitle ? ` — ${ctx.taskSubtitle}` : ""}
${ctx.produces ? `\nYou are producing: ${ctx.produces}` : ""}

# When this is done

${ctx.doneCriteria.length
    ? ctx.doneCriteria.map((c) => `- ${c}`).join("\n")
    : "- No done criteria are recorded. Say so; do not invent a bar for your own work."}

These are the criteria your output is measured against. Work to them.

# How to work
${(() => {
  // Mirrors `toolsFor`'s own condition exactly — `ask` alone is what a `doc-review`/`code-review`
  // row gets (nothing to file, so `draft` is withheld, the same reason `supplied` withholds it),
  // and a `supplied` row (received, not authored) gets it too, via `TOOL_FOR`. Said HERE, not just
  // decided in the tool list, because "you have two tools and must use one" told a review row with
  // nothing left to ask that it had to invent a question anyway — the model said so outright: "this
  // call is only to satisfy the required structured-output step." A hardcoded instruction is advice
  // that stopped matching what was actually offered, and the fix is the prompt agreeing with the
  // tool list rather than a model being right that something was demanded of it that made no sense.
  const askOnly = !ctx.produces || ctx.output === "supplied";
  if (askOnly) {
    return `
You have one tool: \`ask\`. Use it when something you need is genuinely not in what you were given
and you cannot responsibly infer it — the same discipline as any other row: dates never agreed,
people never named, standards nobody wrote down are things to ask about, not invent.

This row does not author a document. When you have nothing left that needs asking — including a
review that is simply finished — say so in plain text and call no tool at all. That is a complete,
successful turn here, not a gap to fill with a question that only exists to have used the tool.
Inventing a filler question ("anything else needed?") when you have nothing to ask is worse than
silence: it reopens a round the person already closed.`.trim();
  }
  return `
You have two tools and must use one of them.

Use \`ask\` when something you need is genuinely not in what you were given and you cannot
responsibly infer it. Deriving a plan from a contract means reading what the contract says — it
does not mean filling in what it omits. Dates that were never agreed, people who were never named,
and standards nobody wrote down are things to ask about, not to invent.

Ask the way a colleague would, not the way a form does. Take the few things that decide the shape of
everything else and ask those first — the answers come back to you and you get another turn, so
anything a later answer would settle is not for this round. Order your questions by how much each
answer changes the rest of the work: only the first ${ASK_BATCH} reach the human, so that ordering
is your decision about what matters, not a formality. You get at most ${ASK_ROUNDS_MAX} rounds, and
you will be told when you are on your last.

Use \`draft\` when you can produce the deliverable from what you have. Every section carries the
document paths it was derived from. A claim you cannot trace to a source you were given does not
belong in the draft — if it is important and unsupported, that is an \`ask\`.

If some of your inputs are missing, say which, and say what that costs. Producing a confident
deliverable from a third of the intended inputs, without noting it, is the failure this whole
system exists to prevent.`.trim();
})()}
${ctx.hasWebSearch ? `
# Web search

You have real web search. Use it for anything that has to come from outside what you were given —
market data, competitors, what users actually say in public, current facts a document cannot hold.
It is the difference between citing a source and guessing one; do not answer from training data
where a search would give you something real and current instead.` : ""}`.trim());

  return parts.join("\n\n---\n\n");
}

/**
 * What to say about the previous attempt.
 *
 * Appended as its own turn rather than folded into the system prompt: this is feedback on work,
 * and it belongs in the conversation where the work was discussed.
 */
export function revisionPrompt(ctx: AgentContext): string | null {
  if (!ctx.priorDraft) return null;

  // NOT FOR A SUPPLIED ROW. On one of those `priorDraft` is the CLIENT'S document — pasted by a
  // person — and everything below says "you already produced this, revise it". Handed that
  // alongside the supplied instruction ("you do not write it, never restructure it"), the model
  // resolved the contradiction the only way it could: it asked the person for a revised version,
  // and `file-requirements` looped. It never produced this, and must not be told that it did.
  if (ctx.output === "supplied") return null;

  const parts = [
    `You already produced \`${ctx.produces}\` at v${ctx.priorDraft.version}. Here it is:`,
    ctx.priorDraft.sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n"),
  ];

  if (ctx.rejections.length) {
    parts.push(
      `A reviewer read it and rejected ${ctx.rejections.length} of the completion criteria:\n\n` +
      ctx.rejections.map((r) => `- **${r.criterion}** — ${r.by} says: ${r.reason}`).join("\n") +
      `\n\nRevise the document to address these. Keep everything that was not objected to: a rewrite ` +
      `that silently drops sections nobody complained about is not a revision, and a reviewer who has ` +
      `already read this should not have to re-read all of it. If you disagree with a rejection, say so ` +
      `and explain — do not quietly comply with something you think is wrong.`);
  } else {
    parts.push(
      `Revise it rather than starting over. Keep what still holds, change what should change. Say ` +
      `what you changed and why in \`summary\` — plainly, a couple of sentences, the way the tool's ` +
      `own description asks; the revised sections themselves are where the detail and citations go, ` +
      `not the summary. If nothing needs changing, say that instead of redrafting.`);
  }

  return parts.join("\n\n");
}

/** The user turn: the pinned material, with absences stated rather than omitted. */
export function inputPrompt(ctx: AgentContext): string {
  const present = ctx.inputs.filter((i) => i.body);
  const missing = ctx.inputs.filter((i) => !i.body);

  const parts = present.map((i) =>
    `<document path="${i.path}" version="${i.version}" title="${i.title ?? ""}">\n${i.body}\n</document>`);

  if (!ctx.inputs.length) {
    // True only when the STEP declares no reads. It used to be said whenever pinning had not
    // happened, which told an agent it had no inputs while its step declared one — and it went and
    // asked the human for a document already filed and published.
    //
    // A PART, not an early return. Returning here skipped everything appended below — so a row with
    // no reads got no template, no sprint block and, once supplied rows existed, no supplied
    // instruction at all. `file-sow` was told only "this task declares no input documents" and
    // behaved correctly by luck: it had no `draft` tool, so asking was the only thing left.
    parts.push("This task declares no input documents. Say so before doing anything else.");
  }

  if (missing.length) {
    parts.push(
      `<missing>\nThese documents are declared inputs to this task but have not been drafted:\n` +
      missing.map((m) => `- ${m.path}${m.title ? ` (${m.title})` : ""}`).join("\n") +
      `\n\nThey are empty, not withheld. Take this into account and say what it costs.\n</missing>`);
  }

  if (ctx.sprint) parts.push(sprintPrompt(ctx.sprint));
  if (ctx.template) parts.push(templatePrompt(ctx.template));
  if (ctx.output === "supplied") parts.push(suppliedPrompt(ctx));

  return parts.join("\n\n");
}

/**
 * This deliverable is handed over, not written.
 *
 * The TOOLS already enforce it — a supplied row is given `ask` and nothing else, so there is no
 * way to author the document. This block exists so the model does not spend a turn discovering
 * that, and so the question it asks is the right shape: the answer IS the deliverable.
 *
 * It also says what to do on the run AFTER the document is filed, which is the only interesting
 * case: with something to compare against, report the comparison and stop. Without that sentence a
 * model handed a filed document and a source tends to try to improve one of them.
 */
function suppliedPrompt(ctx: AgentContext): string {
  const path = ctx.produces ?? "the path this row produces";
  const head = [
    `<supplied path="${ctx.produces ?? ""}">`,
    `This deliverable is SUPPLIED BY A PERSON. You do not write it.`,
    ``,
  ];

  // NOT SUPPLIED YET.
  if (!ctx.priorDraft) {
    return [
      ...head,
      `It has not been supplied yet. Ask for it, in ONE question, and say what it is for. Say that`,
      `they can paste the text, give a link, or upload the file itself — a PDF, a Word document or`,
      `a spreadsheet — because Compass reads all three. What you are given is filed verbatim at`,
      `\`${path}\` — do not summarise it, restructure it, correct it or improve it. It is the`,
      `client's document and it is the record.`,
      ``,
      `If you need anything else, ask for it in a SEPARATE question — never in the one that carries`,
      `the document, because that answer is filed as the document itself.`,
      `</supplied>`,
    ].join("\n");
  }

  // ALREADY SUPPLIED. Shown here, as the supplied document, and nowhere else.
  //
  // It used to reach the model only through `revisionPrompt`, labelled "you already produced this".
  // So the instruction to compare it had nothing to point at, and the one thing the model could see
  // told it to revise a document it had also been told it must never revise.
  const filed = [
    `<supplied-document path="${ctx.produces ?? ""}" version="${ctx.priorDraft.version}">`,
    ctx.priorDraft.sections.map((x) => `## ${x.heading}\n\n${x.body}`).join("\n\n"),
    `</supplied-document>`,
  ].join("\n");

  const next = ctx.inputs.length
    ? `Compare it against the document(s) above and say plainly where they agree and where they do ` +
      `not — dates, scope, deliverables, anything one states and the other contradicts. Report that ` +
      `in your reply. There is nothing to file and nothing to ask. Then stop.`
    : `There is nothing to compare it against, so this row is finished. Say so and stop.`;

  return [
    ...head,
    `It HAS been supplied and is already filed at \`${path}\` as v${ctx.priorDraft.version}. Here it is:`,
    ``,
    filed,
    ``,
    next,
    ``,
    // The exact move the model made when it had nowhere else to go: it asked for "the revised
    // requirements text". Ruled out by name, because a general instruction did not cover it.
    `Do NOT ask for it again, and do NOT ask for a revised version. If it needs revising, the`,
    `person will supply one and this row will run again with it.`,
    `</supplied>`,
  ].join("\n");
}

/**
 * The shape the deliverable must arrive in.
 *
 * LAST in the prompt, after the documents and any sprint block, because it governs what to WRITE
 * rather than what to read — and the instruction closest to the output is the one a model follows
 * most reliably.
 *
 * Stated as a floor, in both directions, because both halves are load-bearing. Omitting a section
 * is refused at filing time, so a model that quietly drops one wastes a whole run; and a model told
 * only "use these headings" will faithfully produce those and nothing else, dropping material the
 * deliverable actually needed because the template did not anticipate it.
 *
 * The headings are given with the template's own numbering and the filing check strips it, so a
 * draft that writes `## Scope of Work` for `## 2. Scope of Work` is accepted. Saying "copy them
 * exactly" would be asking for a precision that is neither needed nor enforced, and instructions
 * the system does not enforce are how a model learns which ones to ignore.
 */
function templatePrompt(t: ResolvedTemplate): string {
  return [
    `<template name="${t.name}">`,
    `This deliverable has a required shape. Produce a section for EVERY heading below, in this`,
    `order, using these headings.`,
    ``,
    `You may ADD sections the deliverable needs — the template is a floor, not a cast, and extra`,
    `sections are kept. You may not omit one: a draft missing any of these is refused and nothing`,
    `is filed. A section that genuinely does not apply still gets its heading, and says so.`,
    ``,
    `The prose under each heading is guidance for what belongs there, written for whoever fills`,
    `the template in. Do not copy it into your draft.`,
    ``,
    describeTemplate(t),
    `</template>`,
  ].join("\n");
}

/**
 * What a sprint plan is given beyond its documents.
 *
 * The number is STATED rather than left to the model. A model that picks its own sprint number
 * picks one that already exists, and the page then names a different sprint from the labels — two
 * records of one sprint, which is the failure this whole design avoids by keeping only one.
 *
 * The tracker's silence is stated too. "No stories are committed yet" and "the board could not be
 * read" produce the same empty list and mean opposite things; an agent that cannot tell them apart
 * will re-commit work already in flight, and every story would look correctly planned.
 */
function sprintPrompt(s: SprintContext): string {
  const roster = s.roster.length
    ? s.roster.map((r) => `- ${r.role}: ${r.holders.join(", ")}`).join("\n")
    : "- Nobody is on the roster. Say what that costs rather than committing against nobody.";

  const stories = s.committable.length
    ? s.committable.map((c) =>
        `- \`${c.ref}\`${c.epic ? ` (epic \`${c.epic}\`)` : ""} — ${c.title}` +
        (c.ticketKey ? ` [${c.ticketKey}]` : " — NOT ON THE BOARD"),
      ).join("\n")
    : "- Nothing. Do not invent stories; say the backlog is empty.";

  const caveat = s.reachedTracker
    ? ""
    : `\n\nTHE TRACKER COULD NOT BE READ. The list above has NOT had already-committed stories ` +
      `removed, so some of it may already be in an earlier sprint. Say this in the plan rather ` +
      `than committing as though the list were clean.`;

  return [
    `<sprint number="${s.number}">`,
    `You are planning sprint ${s.number}. Use that number wherever the plan names the sprint.`,
    ``,
    `Commit ONLY from these stories:`,
    stories,
    ``,
    `The roster you are committing against:`,
    roster,
    caveat,
    `</sprint>`,
  ].join("\n");
}
