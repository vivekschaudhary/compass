import { NextResponse } from "next/server";
import { generate } from "@/app/lib/dispatch";
import { supabaseAdmin } from "@/app/lib/supabase";
import { seedDocTreeSpec } from "@/app/lib/doctree";
import { seedEngagementMetrics } from "@/app/lib/metrics";
import { COMPASS_ROLES } from "@/app/lib/data";
import { raiseQuestions, initialsFor as nameInitials, type AgentQuestion } from "@/app/lib/questions";
import { readFileSync } from "fs";
import { resolve } from "path";

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
// The framework's compass/ dir — where the specs live (sprint-0.md, workflows). Same resolution as repo.ts.
const COMPASS_DIR = process.env.COMPASS_DIR || `${process.env.COMPASS_REPO || resolve(process.cwd(), "..")}/compass`;

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

// ── Sprint 0 (spec-driven kickoff backlog) ──────────────────────────────────
// Read compass/templates/sprint-0.md and materialize its ticket TABLE onto the board:
// a "Sprint 0" epic + one story per row. The SPEC is the source of truth — add a row there
// and every new engagement starts with that ticket, no code change. Created locally at intake
// (systems-of-record aren't connected yet — that's literally ticket #1); mirror to Jira on connect.
type Sprint0Row = { ticket: string; workflow: string; owner: string; gate: string };
function readSprint0(): Sprint0Row[] {
  let md = "";
  try { md = readFileSync(`${COMPASS_DIR}/templates/sprint-0.md`, "utf8"); } catch { return []; }
  const section = md.split(/^##\s+/m).find((s) => /^tickets/i.test(s.trim())) ?? "";
  const rows: Sprint0Row[] = [];
  for (const line of section.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    const c = t.split("|").slice(1, -1).map((x) => x.trim());
    if (c.length < 5 || !/^\d+$/.test(c[0])) continue;   // data rows only (skip header + separator)
    rows.push({ ticket: c[1], workflow: c[2], owner: c[3], gate: c[4] });
  }
  return rows;
}

async function createSprint0(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, engagementId: string): Promise<number> {
  const rows = readSprint0();
  if (!rows.length) return 0;
  const epicId = `${engagementId}-S0`;
  await sb.from("epic").insert({
    id: epicId, engagement_id: engagementId, title: "Sprint 0 · Foundation & Setup",
    deliverable_code: null, discipline: "Product", phase: "Kickoff", status: "idle",
    note: "Foundation setup — created from the sprint-0.md spec at kickoff.", ord: 0,
  });
  const stories = rows.map((r, i) => ({
    id: `${epicId}-s${i + 1}`, epic_id: epicId, title: r.ticket, assignee: "—", status: "idle",
    estimate_pts: 0, ac_pass_pct: 0,
    acceptance: `Done: ${r.gate}${r.workflow.startsWith("/") ? ` · via ${r.workflow}` : ""}`,
    role: normTeamRole(r.owner) ?? "delivery-manager",
  }));
  await sb.from("story").insert(stories);
  return stories.length;
}

export async function POST(req: Request) {
  const body = (await req.json()) as { mode: "analyze" | "create"; sow?: string; data?: Extracted };

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

  const suffix = Date.now().toString(36).slice(-4);
  const id = `${slug(d.client || d.name || "engagement")}-${suffix}`;
  const days = Math.max(7, Math.round((d.months || 3) * 30));

  // `sow` is a SHORT reference chip, never the full doc — guard against the agent dumping prose.
  const sowRef = d.sow && d.sow.trim().length > 0 && d.sow.trim().length <= 60
    ? d.sow.trim()
    : (d.name || d.client || "SOW").split(/\s+/).slice(0, 3).join(" ");

  const { error: e1 } = await sb.from("engagement").insert({
    id, name: d.name, client: d.client, sow: sowRef, pricing: d.pricing,
    budget: d.budget, months: d.months, quality_bar: d.quality_bar,
    phase: "Kickoff · Phase 1", overall: "good",
    cost_budget: d.budget, cost_spent: 0, cost_spark: [0],
    scope_spark: [], time_milestone: "Kickoff", time_days_left: days, stories_late: 0, time_spark: [],
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
  const s0Roles = readSprint0().map((r) => normTeamRole(r.owner)).filter((c): c is string => !!c);
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
  // spec-driven kickoff: materialize the Sprint 0 foundation backlog from sprint-0.md
  const sprint0 = await createSprint0(sb, id);

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
