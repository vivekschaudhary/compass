// Load the framework's agent files and remaining templates into `spec_file`, at the org default.
//
//   node --experimental-strip-types --env-file=.env.local scripts/seed-specs.mts
//   node --experimental-strip-types --env-file=.env.local scripts/seed-specs.mts --apply
//
// Without `--apply` it reports and writes nothing, like `seed-templates.mts` and for the same reason.
//
// `agentMarkdown` reads the TABLE only, so until this has run every agent run reports "no agent
// file for role". After it, the table is the source: an edit there is what the next run reads, and
// re-running this would overwrite it. So a row whose `updated_by` is not 'seed' (someone edited it)
// is left alone unless `--force`. Engagement overrides are never touched.
//
// Loaded: `agents/*.md` (the prompt) and `templates/*.md` — doc-tree.md, which the importer reads, and
// the framework-authoring templates. A template whose name already has a `document_template` row is
// SKIPPED: those are deliverable shapes with their own table, and a second copy is a second source.
// Workflows stay on disk — the orchestrator's graph.py reads them from there.

import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { supabaseAdmin } from "../app/lib/supabase.ts";
import { createHash } from "crypto";

// Not imported from specs.ts: its extensionless imports do not resolve under bare node.
const DEFAULT_ORG = "default";                      // specs.ts DEFAULT_ORG
const hashContent = (c: string) => createHash("sha256").update(c).digest("hex").slice(0, 16);

const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");
const ROOT = resolve(process.cwd(), "..", "compass");

const sb = supabaseAdmin();
if (!sb) { console.error("Supabase is not configured. Check .env.local."); process.exit(1); }

const { data: shapes, error: shapesErr } = await sb.from("document_template").select("name");
if (shapesErr) { console.error(`✗ read document_template: ${shapesErr.message}`); process.exit(1); }
const owned = new Set((shapes ?? []).map((t: { name: string }) => t.name));

const files = ["agents", "templates"].flatMap((dir) =>
  readdirSync(resolve(ROOT, dir)).filter((f) => f.endsWith(".md"))
    .filter((f) => dir === "agents" || !owned.has(f.slice(0, -3)))
    .map((f) => `${dir}/${f}`)).sort();
if (!files.length) { console.error(`✗ No files found under ${ROOT}`); process.exit(1); }

let wrote = 0, same = 0, kept = 0;

for (const path of files) {
  const content = readFileSync(resolve(ROOT, path), "utf8");
  if (!content.trim()) { console.error(`✗ ${path} is empty — it would be a prompt of nothing`); process.exit(1); }

  const { data: held, error } = await sb.from("spec_file")
    .select("id, content, updated_by").eq("org_id", DEFAULT_ORG).eq("path", path).maybeSingle();
  if (error) { console.error(`✗ read ${path}: ${error.message}`); process.exit(1); }

  if (held && held.content === content) { console.log(`  =     ${path}`); same++; continue; }
  if (held && held.updated_by !== "seed" && !force) {
    console.log(`  KEEP  ${path}  edited by ${held.updated_by ?? "someone"} — pass --force to overwrite`);
    kept++; continue;
  }

  console.log(`  ${held ? "UPDATE" : "NEW   "} ${path}  ${content.length} chars`);
  if (!apply) continue;

  const row = { org_id: DEFAULT_ORG, engagement_id: null, path, content, base_hash: hashContent(content),
                updated_by: "seed", updated_at: new Date().toISOString() };
  const w = held
    ? await sb.from("spec_file").update(row).eq("id", held.id)
    : await sb.from("spec_file").insert(row);
  if (w.error) { console.error(`✗ write ${path}: ${w.error.message}`); process.exit(1); }
  const v = await sb.from("spec_file_version")
    .insert({ org_id: DEFAULT_ORG, engagement_id: null, path, content, saved_by: "seed" });
  if (v.error) { console.error(`✗ history ${path}: ${v.error.message}`); process.exit(1); }
  wrote++;
}

console.log(`\n${apply ? "wrote" : "would write"} ${apply ? wrote : files.length - same - kept}, unchanged ${same}, kept ${kept} of ${files.length}`);
if (!apply) console.log("dry run — pass --apply to write");
