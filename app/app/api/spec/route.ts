import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/app/lib/supabase";
import { logActivity } from "@/app/lib/activity";
import {
  isEditablePath, resolveSpec, readFrameworkDefault, hashContent, listEditablePaths, DEFAULT_ORG,
  driftOf,
} from "@/app/lib/specs";
import { validateSpec, specKind } from "@/app/lib/spec-validate";
import { structuralChanges, isDangerous, summarizeChanges } from "@/app/lib/spec-structure";
import { resolveActor, can, permissionRefusal, isAdvisoryOnly, type Capability } from "@/app/lib/authz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reading and writing the framework specs an org or an engagement has overridden.
//
// Two things are load-bearing here and neither is the CRUD:
//
//   1. Every path goes through `isEditablePath` before it touches the filesystem or the database.
//      This endpoint's whole job is letting a human edit files the server executes against, so it
//      fails closed on anything it does not recognise.
//   2. A save that structurally REGRESSES the spec — a step that stops existing, an agent that
//      stops being dispatched, a human approval gate that disappears — requires explicit
//      confirmation and is written to the activity log. Those edits are legitimate; doing them
//      silently is not.

type Scope = "org" | "engagement";

function scopeOf(body: { scope?: string; engagementId?: string | null }): { scope: Scope; engagementId: string | null } {
  return body.scope === "org" || !body.engagementId
    ? { scope: "org", engagementId: null }
    : { scope: "engagement", engagementId: body.engagementId };
}

const CAPABILITY: Record<Scope, Capability> = {
  org: "edit-org-defaults",
  engagement: "edit-engagement-specs",
};

/** The row filter for a tier. Exactly one of the two columns is set (checked by the table). */
function tierFilter(scope: Scope, engagementId: string | null) {
  return scope === "org"
    ? { column: "org_id" as const, value: DEFAULT_ORG }
    : { column: "engagement_id" as const, value: engagementId! };
}

/**
 * Record a spec change. ALWAYS — including org-scope changes, which have a null engagement_id.
 *
 * The first version of this skipped the org tier because `logActivity` is engagement-shaped, which
 * meant the edits with the WIDEST blast radius (every engagement at once) were the only ones going
 * unrecorded. `activity.engagement_id` is nullable, so an org row stores fine; it simply does not
 * appear in a per-engagement feed. `spec_file_version` remains the primary trail either way.
 */
async function audit(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  scope: Scope, engagementId: string | null, actor: string | null | undefined, title: string,
) {
  await logActivity(sb, {
    engagementId: engagementId as string,      // null for org scope — nullable by schema
    actor: actor ?? "unknown", kind: "spec", status: "done",
    title: scope === "org" ? `[org default] ${title}` : title,
  });
}

// ── GET: list the whitelist, or read one file ────────────────────────────────────────────────
export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  const engagementId = url.searchParams.get("engagementId");

  if (!path) {
    // `advisoryAuth` rides along with the LIST, not just a single file: the warning is about the
    // whole surface, and hiding it until someone opens a file would mean the screen looks like a
    // permissioned admin panel right up until the moment it matters.
    return NextResponse.json({
      ok: true, files: await listEditablePaths(engagementId), advisoryAuth: isAdvisoryOnly(),
    });
  }
  if (!isEditablePath(path)) {
    return NextResponse.json({ ok: false, error: "Not an editable framework path" }, { status: 400 });
  }

  const resolved = await resolveSpec(engagementId, path);
  const shipped = readFrameworkDefault(path);
  // What this file would be WITHOUT this engagement's own override — the thing a diff is against
  // and the thing a revert falls back to.
  const below = engagementId ? await resolveSpec(null, path) : (shipped === null ? null : { path, content: shipped, tier: "framework" as const });

  // Has the tier below moved since this override was taken? Computed against `below`, which is
  // exactly what a revert would fall back to — so the question asked and the action offered agree.
  const drift = resolved && resolved.tier !== "framework"
    ? driftOf(resolved, below?.content ?? "")
    : { drifted: false, comparable: false, baseContent: null, currentBaseline: below?.content ?? "" };

  return NextResponse.json({
    ok: true,
    path,
    drift,
    content: resolved?.content ?? "",
    tier: resolved?.tier ?? null,
    updatedAt: resolved?.updatedAt ?? null,
    updatedBy: resolved?.updatedBy ?? null,
    below: below ? { content: below.content, tier: below.tier } : null,
    shipped,
    kind: specKind(path),
    validation: resolved ? await validateSpec(path, resolved.content) : null,
    advisoryAuth: isAdvisoryOnly(),
  });
}

// ── POST: validate · save · revert ───────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "validate" | "save" | "revert" | "acknowledge" | "promote";
    scope?: string; engagementId?: string | null; path?: string; content?: string;
    role?: string | null; actor?: string | null;
    confirmStructuralChange?: boolean;
  };

  const path = body.path ?? "";
  if (!isEditablePath(path)) {
    return NextResponse.json({ ok: false, error: "Not an editable framework path" }, { status: 400 });
  }

  // ── validate: pure, no writes, no permission needed ──
  if (body.action === "validate") {
    const validation = await validateSpec(path, body.content ?? "");
    const { engagementId } = scopeOf(body);
    const current = await resolveSpec(engagementId, path);
    const changes = structuralChanges(
      current ? await validateSpec(path, current.content) : null, validation,
    );
    return NextResponse.json({ ok: true, validation, changes });
  }

  const { scope, engagementId } = scopeOf(body);
  const actor = await resolveActor({ role: body.role, actor: body.actor });
  if (!can(actor, CAPABILITY[scope])) {
    return NextResponse.json({ ok: false, error: permissionRefusal(CAPABILITY[scope]) }, { status: 403 });
  }

  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
  const filter = tierFilter(scope, engagementId);

  // ── revert: drop this tier's row so the tier below takes over again ──
  if (body.action === "revert") {
    await sb.from("spec_file").delete().eq(filter.column, filter.value).eq("path", path);
    await audit(sb, scope, engagementId, actor.userId ?? body.role,
                `Reverted ${path} to the inherited default`);
    return NextResponse.json({ ok: true, reverted: true });
  }

  // ── acknowledge: "I read the new default and I am keeping mine" ──
  // Re-anchors the baseline WITHOUT touching content, so the warning clears and the override keeps
  // running as-is. Audited, because it is a decision rather than a dismissal — someone chose to
  // stay behind, and that should be answerable later.
  if (body.action === "acknowledge") {
    const below = engagementId ? await resolveSpec(null, path) : null;
    const baseline = below?.content ?? readFrameworkDefault(path) ?? "";
    const { error } = await sb.from("spec_file")
      .update({ base_hash: baseline ? hashContent(baseline) : null, base_content: baseline || null })
      .eq(filter.column, filter.value).eq("path", path);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await audit(sb, scope, engagementId, actor.userId ?? body.role,
                `Kept the local version of ${path} after the default changed`);
    return NextResponse.json({ ok: true, acknowledged: true });
  }

  // ── promote: this engagement's edit becomes the organisation default ──
  // Requires edit-org-defaults, NOT the engagement capability: a delivery manager may adapt their
  // own client, but changing how every other engagement runs is a different decision with a
  // different blast radius.
  if (body.action === "promote") {
    if (scope !== "engagement" || !engagementId) {
      return NextResponse.json({ ok: false, error: "Only an engagement override can be promoted." }, { status: 400 });
    }
    if (!can(actor, "edit-org-defaults")) {
      return NextResponse.json({ ok: false, error: permissionRefusal("edit-org-defaults") }, { status: 403 });
    }
    const mine = await resolveSpec(engagementId, path);
    if (!mine || mine.tier !== "engagement") {
      return NextResponse.json({ ok: false, error: "Nothing to promote — this file is not overridden here." }, { status: 400 });
    }

    // The same structural gate a direct org edit would face. Promoting a spec that drops a step
    // from the firm's default is exactly as dangerous as typing it there, so it asks the same
    // question — measured against the ORG tier, which is what would change.
    const orgNow = await resolveSpec(null, path);
    const changes = structuralChanges(
      orgNow ? await validateSpec(path, orgNow.content) : null, await validateSpec(path, mine.content),
    );
    const dangerous = changes.filter(isDangerous);
    if (dangerous.length && !body.confirmStructuralChange) {
      return NextResponse.json({ ok: false, needsConfirmation: true, changes, error: summarizeChanges(changes) }, { status: 409 });
    }

    const framework = readFrameworkDefault(path) ?? "";
    await sb.from("spec_file_version").insert({
      org_id: DEFAULT_ORG, engagement_id: null, path, content: mine.content,
      saved_by: actor.userId ?? body.role ?? null,
    });
    const { error } = await sb.from("spec_file").upsert({
      org_id: DEFAULT_ORG, engagement_id: null, path, content: mine.content,
      base_hash: framework ? hashContent(framework) : null, base_content: framework || null,
      updated_at: new Date().toISOString(), updated_by: actor.userId ?? body.role ?? null,
    }, { onConflict: "org_id,engagement_id,path" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    // Drop the engagement row so it INHERITS what it just became, rather than keeping an identical
    // copy that would then drift away from the default it created.
    await sb.from("spec_file").delete().eq("engagement_id", engagementId).eq("path", path);

    await audit(sb, "org", null, actor.userId ?? body.role, `Promoted ${path} from ${engagementId} to the organisation default`);
    await audit(sb, "engagement", engagementId, actor.userId ?? body.role, `Promoted ${path} to the organisation default; now inherited`);
    return NextResponse.json({ ok: true, promoted: true, changes });
  }

  // ── save ──
  if (body.action !== "save") {
    return NextResponse.json({ ok: false, error: "action must be validate | save | revert | acknowledge | promote" }, { status: 400 });
  }
  const content = body.content ?? "";
  if (!content.trim()) {
    return NextResponse.json({ ok: false, error: "Refusing to save an empty file — revert instead if you want the default back." }, { status: 400 });
  }

  const validation = await validateSpec(path, content);
  if (validation && !validation.ok) {
    // Unusable as a spec. Saving it would replace a working default with something that fails at
    // dispatch, far from here and long after.
    return NextResponse.json({
      ok: false, error: "This file would not work if saved.", validation,
    }, { status: 422 });
  }

  const current = await resolveSpec(engagementId, path);
  const changes = structuralChanges(current ? await validateSpec(path, current.content) : null, validation);
  const dangerous = changes.filter(isDangerous);
  if (dangerous.length && !body.confirmStructuralChange) {
    return NextResponse.json({
      ok: false, needsConfirmation: true, changes, validation,
      error: summarizeChanges(changes),
    }, { status: 409 });
  }

  // History BEFORE the write, so a save that breaks something at 2am can be walked back — revert
  // deletes the spec_file row, so this table is the only place the previous text survives.
  await sb.from("spec_file_version").insert({
    org_id: scope === "org" ? DEFAULT_ORG : null,
    engagement_id: engagementId,
    path, content, saved_by: actor.userId ?? body.role ?? null,
  });

  // `base_hash` anchors drift detection: what the tier BELOW said when this fork was taken.
  const below = engagementId ? await resolveSpec(null, path) : null;
  const baseline = below?.content ?? readFrameworkDefault(path) ?? "";

  const { error } = await sb.from("spec_file").upsert({
    org_id: scope === "org" ? DEFAULT_ORG : null,
    engagement_id: engagementId,
    path, content,
    base_hash: baseline ? hashContent(baseline) : null,
    // The baseline TEXT, not just its fingerprint — without it we could say a default had changed
    // but never show what changed in it, which is the only question worth asking.
    base_content: baseline || null,
    updated_at: new Date().toISOString(),
    updated_by: actor.userId ?? body.role ?? null,
  }, { onConflict: "org_id,engagement_id,path" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  if (dangerous.length) {
    // The audit half of the confirmation. A step someone chose to remove should be answerable
    // later without reading a diff.
    await audit(sb, scope, engagementId, actor.userId ?? body.role,
                `Structural change to ${path}: ${summarizeChanges(changes)}`);
  }

  return NextResponse.json({ ok: true, saved: true, changes, validation });
}
