import { NextResponse } from "next/server";
import { generate } from "@/app/lib/dispatch";
import { supabaseAdmin } from "@/app/lib/supabase";
import { seedDocTreeSpec } from "@/app/lib/doctree";
import { adapterColumns, secretColumns } from "@/app/lib/adapters";
import { encryptSecret } from "@/app/lib/crypto";
import { seedEngagementMetrics } from "@/app/lib/metrics";
import { COMPASS_ROLES } from "@/app/lib/data";
import { raiseQuestions, initialsFor as nameInitials, type AgentQuestion } from "@/app/lib/questions";
import { readSprint0, completePhaseA } from "@/app/lib/sprint0";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A gap the intake agent couldn't resolve from the SOW. `field` is a LOGICAL target the create step
// resolves to a concrete allowlisted patch (engagement column, or member:<role> → that member's name).
// [agent-asks-structured-questions]
type IntakeQuestion = {
  key: string;
  prompt: string;
  type: "choice" | "number" | "text";
  options?: string[];
  field: "budget" | "pricing" | "months" | "quality_bar" | "name" | "client" | string; // or "member:<role>"
  because?: string;
};

type Extracted = {
  name: string;
  client: string;
  sow: string;
  pricing: "Fixed-bid" | "T&M";
  budget: number;
  months: number;
  quality_bar: string;
  deliverables: { code: string; title: string; acceptance: string }[];
  milestones?: { code: string; title: string; timeframe: string; detail: string }[];
  staffing?: { role: string; count: number }[];
  team?: { name: string; role: string; title?: string }[];   // named people the SOW states
  questions?: IntakeQuestion[];                                // gaps → the DM's jobs-to-do
};

const ROLE_LABEL: Record<string, string> = Object.fromEntries(COMPASS_ROLES.map((r) => [r.code, r.label]));
const ROLE_CODES = COMPASS_ROLES.map((r) => r.code);
// The standard cross-functional scrum team, seeded when the SOW doesn't state staffing.
const DEFAULT_TEAM = ["delivery-manager", "pm", "researcher", "designer", "ux-writer", "engineer", "automation", "gtm", "sre"];

function normTeamRole(raw: string): string | null {
  const r = (raw || "").toLowerCase().trim().replace(/\s+/g, "-");
  if (ROLE_CODES.includes(r)) return r;
  const byLabel = COMPASS_ROLES.find((x) => x.label.toLowerCase() === (raw || "").toLowerCase().trim());
  return byLabel?.code ?? null;
}
function initialsFor(code: string): string {
  return (ROLE_LABEL[code] ?? code).split(/[\s-]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

const SYSTEM = `You are Compass's Delivery Manager agent running intake. Extract a Statement of Work into a structured delivery engagement.
Return ONLY valid JSON — no markdown, no prose — with this exact shape:
{"name":string,"client":string,"sow":string,"pricing":"Fixed-bid"|"T&M","budget":number,"months":number,"quality_bar":string,
 "deliverables":[{"code":"D1","title":string,"acceptance":string}],
 "milestones":[{"code":"M1","title":string,"timeframe":string,"detail":string}],
 "staffing":[{"role":string,"count":number}],
 "team":[{"name":string,"role":string,"title":string}],
 "questions":[{"key":string,"prompt":string,"type":"choice"|"number"|"text","options":[string],"field":string,"because":string}]}
Rules: be faithful to the SOW — do NOT invent scope it doesn't imply. Number deliverables D1..Dn.
- "name": the engagement/project name EXACTLY as stated (e.g. the text after "Engagement:"), NOT a summary you invent.
- "sow": a SHORT reference label only — an SOW number/code if the doc states one, else a 2–4 word short title (e.g. "Compass DPP"). NEVER the full SOW text.
budget is an integer in USD (0 if not stated). months is an integer best-estimate.
- "milestones": the SOW's timeline / phases / milestones — code M1.., title, timeframe (e.g. "Month 3" / "Sprint 6" / "Phase 2"), a short detail of what closes it. Empty array if the SOW states none.
- "staffing": the delivery team — role + count. Use ONLY these role codes: ${ROLE_CODES.join(", ")}. Empty array if the SOW states none.
- "team": named INDIVIDUALS the SOW states, each mapped to ONE of the role codes above (e.g. {"name":"Sam Okoro","role":"engineer","title":"Engineer"}). Empty array if the SOW names no people.
- "questions": DO NOT silently guess or default. For every ENGAGEMENT field you had to infer/default because the SOW doesn't state it clearly, emit ONE structured clarifying question:
    • "field" is the field the answer sets — one of budget|pricing|months|quality_bar|name|client.
    • "type": "choice" with "options" for a small fixed set (e.g. pricing → ["Fixed-bid","T&M"]); "number" for budget/months; "text" for free text.
    • "key": a short stable slug (e.g. "budget","pricing"). "because": the gap in one line.
  Emit an EMPTY questions array when the SOW states every field. Prefer asking over guessing.
  (Do NOT ask for individual people's names here — extract the ones the SOW names into "team"; the app asks who fills every remaining role automatically.)
Keep any inference conservative and clearly bounded.`;

function parseJson(text: string): Extracted {
  const cleaned = text.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function analyze(sow: string): Promise<Extracted> {
  const text = await generate({ system: SYSTEM, user: `Statement of Work:\n\n${sow}`, maxTokens: 1500 });
  return parseJson(text);
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 18);
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    mode: "provision" | "complete-phase-a" | "analyze" | "create";
    sow?: string; data?: Extracted; engagementId?: string;
    // adapter fields are keyed by engagement column and whitelisted against the registry
    provision?: { name: string; client: string; docs_provider?: string } & Record<string, string | undefined>;
  };

  // ── Phase A · provision ───────────────────────────────────────────────────
  // Stand up the CONTAINER before any SOW exists. Phase A is configuration, not a workflow —
  // no basis, no deliverable, no gate (compass/framework/mvp-brd.md). It needs only
  // enough identity for the row to exist, because connectors are stored ON that row and the
  // doc tree cannot be scaffolded until it does.
  //
  // Why this mode has to exist: the SOW is the ROOT BASIS of everything downstream, so it
  // belongs IN the doc store at `02-scope/sow` — not pasted into a form where it has no
  // version and no link. That requires the store to be wired first, which requires the
  // engagement to exist first. Hence: provision → scaffold → load the SOW → extract.
  if (body.mode === "provision") {
    const sb = supabaseAdmin();
    const p = body.provision;
    if (!sb || !p?.name?.trim() || !p?.client?.trim()) {
      return NextResponse.json({ ok: false, error: "name and client are required" }, { status: 400 });
    }
    const id = `${slug(p.client || p.name)}-${Date.now().toString(36).slice(-4)}`;
    // Adapter fields arrive as a flat map keyed by engagement column (lib/adapters.ts), so a new
    // provider is a registry entry rather than an edit here. Whitelisted against the registry:
    // an unknown key would be a PostgREST error at insert time, and silently dropping one would
    // mean an engagement that looks configured but isn't.
    const allowed = new Set(adapterColumns());
    const secretCols = new Set(secretColumns());
    const adapterValues = Object.fromEntries(
      Object.entries(p).filter(([k, v]) => allowed.has(k) && typeof v === "string" && v.trim())
        // credentials are encrypted at rest, here too — this path can carry a token straight
        // from the setup screen, and it would otherwise be the one place that stores plaintext.
        .map(([k, v]) => [k, secretCols.has(k) ? encryptSecret((v as string).trim()) : (v as string).trim()]),
    );
    const { error } = await sb.from("engagement").insert({
      id, name: p.name.trim(), client: p.client.trim(),
      sow: "SOW pending",                       // replaced by the extraction in Phase B
      phase: "Setup · Phase A", overall: "good",
      docs_provider: p.docs_provider === "teams" ? "teams" : "confluence",
      ...adapterValues,
      cost_spent: 0, cost_spark: [0], scope_spark: [], time_spark: [],
      time_milestone: "Setup", stories_late: 0, quality_ac_pass: 100, quality_criticals: 0, quality_spark: [],
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await seedDocTreeSpec(id);   // the refinable tree; the client scaffolds it next
    // Sprint 0 is NOT created here. Provisioning stores credentials; it does not prove they work,
    // and a backlog cut against unverified Jira falls silently back to local ids that idempotency
    // then makes permanent. It happens at `complete-phase-a`, after the readiness probe.
    return NextResponse.json({ ok: true, id });
  }

  // ── Phase A · complete ────────────────────────────────────────────────────
  // The end of Phase A, asserted rather than assumed. Readiness passes → the kickoff backlog is
  // materialized in the tracker that was just proven reachable. A wired Jira with an empty board
  // is setup that has not actually landed, so this is where the tracker starts being used.
  if (body.mode === "complete-phase-a") {
    const id = body.engagementId?.trim();
    if (!id) return NextResponse.json({ ok: false, error: "engagementId required" }, { status: 400 });
    const r = await completePhaseA(id);
    // 409, not 400: the request is well-formed, the engagement just isn't ready yet. The client
    // shows the blocking checks and lets the human fix them, so this is a state conflict.
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error, readiness: r.readiness }, { status: 409 });
    return NextResponse.json({ ok: true, sprint0: r.sprint0, sprint0InJira: r.jira, closed: r.closed });
  }

  if (body.mode === "analyze") {
    try {
      const data = await analyze(body.sow ?? "");
      return NextResponse.json({ ok: true, data });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "analyze failed" }, { status: 400 });
    }
  }

  // create
  const sb = supabaseAdmin();
  const d = body.data;
  if (!sb || !d) return NextResponse.json({ ok: false, error: "not configured" }, { status: 400 });

  // Phase B against a provisioned shell: FILL the existing engagement rather than inserting a
  // second one. Without this the Phase A container (and its connectors, and its scaffolded doc
  // tree) would be orphaned the moment the SOW was extracted.
  const existingId = body.engagementId?.trim() || null;
  const suffix = Date.now().toString(36).slice(-4);
  const id = existingId ?? `${slug(d.client || d.name || "engagement")}-${suffix}`;
  const days = Math.max(7, Math.round((d.months || 3) * 30));

  // `sow` is a SHORT reference chip, never the full doc — guard against the agent dumping prose.
  const sowRef = d.sow && d.sow.trim().length > 0 && d.sow.trim().length <= 60
    ? d.sow.trim()
    : (d.name || d.client || "SOW").split(/\s+/).slice(0, 3).join(" ");

  // What the SOW tells us. On a provisioned shell this UPDATES (connectors + scaffolded tree
  // survive); with no shell it inserts, preserving the original one-shot flow.
  const fromSow = {
    name: d.name, client: d.client, sow: sowRef, pricing: d.pricing,
    budget: d.budget, months: d.months, quality_bar: d.quality_bar,
    phase: "Kickoff · Phase 1", overall: "good",
    cost_budget: d.budget, time_milestone: "Kickoff", time_days_left: days,
  };
  const { error: e1 } = existingId
    ? await sb.from("engagement").update(fromSow).eq("id", existingId)
    : await sb.from("engagement").insert({
        id, ...fromSow, cost_spent: 0, cost_spark: [0],
        scope_spark: [], stories_late: 0, time_spark: [],
        quality_ac_pass: 100, quality_criticals: 0, quality_spark: [],
      });
  if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 400 });

  const rows = (d.deliverables || []).map((x, i) => ({
    id: `${id}-${x.code || "D" + (i + 1)}`, engagement_id: id,
    code: x.code || `D${i + 1}`, title: x.title, acceptance: x.acceptance, status: "planned", ord: i + 1,
  }));
  if (rows.length) await sb.from("deliverable").insert(rows);

  // the plan/milestones from the SOW — read-only ground truth (M#, timeframe, what closes it)
  const ms = (d.milestones || []).map((m, i) => ({
    engagement_id: id, code: m.code || `M${i + 1}`, title: m.title, timeframe: m.timeframe || null, detail: m.detail || null, ord: i + 1,
  })).filter((m) => m.title);
  if (ms.length) await sb.from("milestone").insert(ms);

  // auto-seed the team roster so role routing works from day 1. Real names where the SOW states them
  // (d.team, mapped to role codes); "Unassigned" otherwise. Any role a clarifying question will name
  // (`member:<role>`) is seeded too, so the question has a member row to patch.
  const namedByRole = new Map<string, string[]>();
  for (const t of d.team ?? []) {
    const code = normTeamRole(t.role); const nm = (t.name || "").trim();
    if (code && nm) namedByRole.set(code, [...(namedByRole.get(code) ?? []), nm]);
  }
  const baseCodes = d.staffing?.length ? d.staffing.map((s) => normTeamRole(s.role)).filter((c): c is string => !!c) : DEFAULT_TEAM;
  const qRoles = (d.questions ?? []).filter((q) => q.field.startsWith("member:")).map((q) => normTeamRole(q.field.slice(7))).filter((c): c is string => !!c);
  // Always seed the delivery-manager (owns intake + kickoff visibility) AND every Sprint 0 ticket
  // owner (pm, architect, …) — else those roles have no roster entry, no role view, and their
  // Sprint 0 tickets + clarifying questions would be invisible in the switcher.
  // Read the engagement's OWN spec: if this client's kickoff adds a ticket owned by a role the
  // framework default never names, that role still needs a roster entry or its ticket lands
  // invisible.
  const s0Roles = (await readSprint0(id)).map((r) => normTeamRole(r.owner)).filter((c): c is string => !!c);
  const roleCodes = [...new Set(["delivery-manager", ...baseCodes, ...namedByRole.keys(), ...qRoles, ...s0Roles])];
  const members = roleCodes.flatMap((code) => {
    const names = namedByRole.get(code) ?? [];
    if (!names.length) return [{ id: `${id}-${code}`, engagement_id: id, role: code, name: "Unassigned", initials: initialsFor(code), title: ROLE_LABEL[code] ?? code }];
    return names.map((nm, i) => ({ id: i === 0 ? `${id}-${code}` : `${id}-${code}-${i + 1}`, engagement_id: id, role: code, name: nm, initials: nameInitials(nm), title: ROLE_LABEL[code] ?? code }));
  });
  if (members.length) await sb.from("member").insert(members);

  // seed the engagement's OWN (refinable) copy of the doc tree from the framework default. Folders
  // are NOT created yet — the user refines the tree in Sprint 0 ("Connect systems of record") and
  // approves it; /api/scaffold then creates the structure. [sprint-0-materializes-refinable-defaults]
  await seedDocTreeSpec(id);
  // capture the SOW-level product + engineering metric definitions
  await seedEngagementMetrics(sb, id);
  // Legacy one-shot path (a `create` with no prior `provision`): still try to close Phase A, so an
  // engagement made this way gets its kickoff backlog. Goes through completePhaseA rather than
  // calling createSprint0 directly — bypassing the readiness assertion here would reintroduce
  // exactly the unverified-tracker problem it exists to prevent. Not ready → 0, and the DM sees the
  // blocking checks on the readiness panel. No-op when Phase A already completed.
  const phaseA = await completePhaseA(id);
  const sprint0 = phaseA.ok ? phaseA.sprint0 : 0;

  // file the DM agent's still-open clarifying questions into its jobs-to-do — resolving each logical
  // `field` to a concrete allowlisted target now that ids exist. Answered ones were already applied
  // to `data` in the /new wizard. [agent-asks-structured-questions]
  const qs: AgentQuestion[] = (d.questions ?? []).map((q) => {
    const isMember = q.field.startsWith("member:");
    const mrole = isMember ? (normTeamRole(q.field.slice(7)) ?? "delivery-manager") : "";
    const target = isMember
      ? { table: "member", id: `${id}-${mrole}`, column: "name" }
      : { table: "engagement", id, column: q.field };
    return { key: q.key, prompt: q.prompt, type: q.type, options: q.options, target, because: q.because };
  });

  // Completeness: ask WHO fills every seeded-but-unnamed role — not just the few the LLM flagged.
  // The roster loads the standard team; leaving some members "Unassigned" with no ask is exactly the
  // silent-default this primitive exists to prevent. One name question per Unassigned member (deduped
  // against any the LLM already raised), all owned by the DM (staffing is the DM's kickoff work).
  const askedRoles = new Set(qs.filter((q) => q.target.table === "member").map((q) => q.target.id));
  const nameQs: AgentQuestion[] = members
    .filter((m) => m.name === "Unassigned" && !askedRoles.has(m.id))
    .map((m) => ({
      key: `lead-${m.role}`,
      prompt: `Who is the ${m.title} on this engagement?`,
      type: "text" as const,
      target: { table: "member", id: m.id, column: "name" },
      because: `${m.title} is on the team but unnamed — assign a person, or skip to staff later.`,
    }));

  const questions = await raiseQuestions(sb, { engagementId: id, role: "delivery-manager", source: "intake" }, [...qs, ...nameQs]);

  return NextResponse.json({ ok: true, engagementId: id, deliverables: rows.length, milestones: ms.length, team: members.length, sprint0, questions });
}
