// Answering an agent's request for a document with a FILE.
//
//   POST /api/upload   multipart/form-data: engagement, role, taskId, questionId, file
//
// A route rather than a server action because a server action's body is capped at 1 MB by default
// and a contract is routinely larger — the cap that matters should be the one `uploads.ts` states
// out loud, not one a framework default imposes invisibly.
//
// Everything after extraction is the path a typed answer already takes: `recordAnswers` closes the
// question, writes the turn, files the document at the question's `files_to` and publishes it. The
// only thing this adds is the original, attached to the page that was just published.

import { resolveActor } from "@/app/lib/data/actor";
import { recordAnswers } from "@/app/lib/data/job";
import { readUpload } from "@/app/lib/data/uploads";
import { attachOriginal } from "@/app/lib/data/attach";
import { ok, refuse, fail } from "@/app/lib/http";

export const dynamic = "force-dynamic";
// Extraction of a large PDF is seconds, not milliseconds, and the default would cut it off.
export const maxDuration = 120;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refuse("Send the file as multipart/form-data.", 400);
  }

  const engagement = String(form.get("engagement") ?? "");
  const role = String(form.get("role") ?? "");
  const taskId = String(form.get("taskId") ?? "");
  const questionId = String(form.get("questionId") ?? "");
  const file = form.get("file");

  if (!engagement || !role || !taskId || !questionId) {
    return refuse("engagement, role, taskId and questionId are all required.", 400);
  }
  if (!(file instanceof File)) return refuse("No file was sent.", 400);

  // Scope first, as every route does: a task id from another engagement must not reach a write.
  const actor = await resolveActor(engagement, role);
  if (!actor) return refuse("That role does not exist on this engagement.", 400);

  try {
    const read = await readUpload({
      name: file.name,
      type: file.type,
      bytes: await file.arrayBuffer(),
    });
    // A refusal is the useful answer, not an error: it names what to do about the file.
    if (!read.ok) return refuse(read.reason, 422);

    // The reference that goes on the record and into the conversation. The DOCUMENT is `read.text`,
    // handed to `recordAnswers` separately — see why in its `uploads` parameter.
    const size = file.size >= 1024 * 1024
      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    const reference = `Supplied \`${file.name}\` — ${size}, ${read.chars.toLocaleString()} characters.`;

    const recorded = await recordAnswers(
      actor, taskId, { [questionId]: reference },
      { [questionId]: { filename: file.name, bytes: file.size, text: read.text } },
    );
    if (!recorded.ok) return refuse(recorded.error, 422);

    // The original, onto the page its text was just published to. Never fatal: the document is
    // filed and published, which is the deliverable — a missing attachment is reported on the task
    // rather than failing an upload that otherwise worked.
    const attached = await attachOriginal(actor, taskId, recorded.filed, {
      name: file.name,
      type: file.type,
      bytes: await file.arrayBuffer(),
    });

    return ok({
      filed: recorded.filed.map((f) => ({ path: f.path, url: f.externalUrl })),
      attached,
      chars: read.chars,
      kind: read.kind,
      remaining: recorded.remaining,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The upload failed.");
  }
}
