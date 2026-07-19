import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/app/lib/supabase";
import { FIXTURE } from "@/app/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The guardrail: this assistant can ONLY diagnose a failed run + advise re-execution.
const guard = (role: string) => `You are Compass "Execution Help" — a strictly bounded assistant for the ${role} on a software-delivery program.
You may do EXACTLY two things and nothing else: (1) explain, concisely, why THIS specific run failed, and (2) advise whether and how to re-execute it.
You cannot chat generally, cannot take on other work, cannot touch other roles' runs, and cannot access anything beyond the failed run described below.
Reply in 2–4 short sentences: the root cause (not the symptom), whether it's safe to re-run, and the single next move. Be concrete and calm. No preamble, no greeting.`;

async function getRun(runId: string) {
  const sb = supabaseAdmin();
  if (sb) {
    const { data } = await sb.from("run").select("*").eq("id", runId).maybeSingle();
    if (data) return { role: data.role, story: data.story, step: data.failed_step, error: data.error, diagnosis: data.diagnosis };
  }
  const f = FIXTURE.failedRun;
  return { role: f.role, story: f.story, step: f.failedStep, error: f.error, diagnosis: f.diagnosis };
}

export async function POST(req: Request) {
  const { runId } = (await req.json()) as { runId: string };
  const run = await getRun(runId);
  const key = process.env.ANTHROPIC_API_KEY;
  const enc = new TextEncoder();

  // Fallback: no key → stream the stored diagnosis word-by-word (identical UX).
  if (!key) {
    const text = `${run.diagnosis}\n\n(Live AI is off — add ANTHROPIC_API_KEY to .env.local to make this a real-time diagnosis. Showing the stored one.)`;
    return new Response(new ReadableStream({
      async start(c) {
        for (const w of text.split(" ")) { c.enqueue(enc.encode(w + " ")); await new Promise((r) => setTimeout(r, 16)); }
        c.close();
      },
    }), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const client = new Anthropic({ apiKey: key });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const userMsg = `Failed run: ${run.story}\nStep: ${run.step}\nError: ${run.error}\n\nDiagnose it.`;

  return new Response(new ReadableStream({
    async start(c) {
      try {
        const s = await client.messages.create({
          model, max_tokens: 400, system: guard(run.role),
          messages: [{ role: "user", content: userMsg }], stream: true,
        });
        for await (const ev of s) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            c.enqueue(enc.encode(ev.delta.text));
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "failed";
        c.enqueue(enc.encode(`\n\n[live assistant error: ${msg} — falling back]\n\n${run.diagnosis}`));
      }
      c.close();
    },
  }), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
