"use client";

// Answering a question with a file, from the form.
//
// Its own module for the same reason `run-agent.ts` is: it goes through an API ROUTE rather than a
// server action, because a server action caps its body at 1 MB by default and contracts are
// routinely larger. The cap that stops an upload should be the one `uploads.ts` states out loud.

import { readEnvelope, describeFailure } from "@/app/lib/envelope";

export type UploadOutcome =
  | { ok: true; message: string; remaining: number }
  | { ok: false; message: string };

export async function uploadAnswer(
  engagement: string, role: string, taskId: string, questionId: string, file: File,
): Promise<UploadOutcome> {
  const form = new FormData();
  form.append("engagement", engagement);
  form.append("role", role);
  form.append("taskId", taskId);
  form.append("questionId", questionId);
  form.append("file", file);

  try {
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const d = await readEnvelope<{
      filed: { path: string; url: string | null }[];
      attached: { ok: boolean; filename: string; error?: string }[];
      chars: number;
      remaining: number;
    }>(res);
    // A refusal names the file and what to do about it — "that PDF is a scan" is the whole value
    // of the message, so it is shown as it arrived rather than replaced with a generic failure.
    if (!d.ok) return { ok: false, message: describeFailure(d) };

    const where = d.filed.map((f) => `\`${f.path}\``).join(", ") || "the document";
    // A failed attachment is NOT a failed upload: the document is filed and published. Said in the
    // same breath so nobody discovers the missing original later.
    const problem = d.attached.find((a) => !a.ok);
    return {
      ok: true,
      remaining: d.remaining,
      message: problem
        ? `Filed ${d.chars.toLocaleString()} characters at ${where}. The original could not be attached: ${problem.error}`
        : `Filed ${d.chars.toLocaleString()} characters at ${where}, with ${file.name} attached to the page.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The upload failed." };
  }
}
