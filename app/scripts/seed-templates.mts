// Load the framework's document templates into `document_template`, at the default scope.
//
//   node --experimental-strip-types --env-file=.env.local scripts/seed-templates.mts
//   node --experimental-strip-types --env-file=.env.local scripts/seed-templates.mts --apply
//
// Without `--apply` it reports and writes nothing, like `reset-engagement.mts` and for the same
// reason: the useful output of a tool that overwrites things is the list of what it would overwrite.
//
// RUN ONCE, at cutover. After this the TABLE is the source — a client's SOW shape is edited in the
// app, not in the repo, and re-running this would overwrite that edit at the default scope only.
// Engagement and org rows are never touched. The files under compass/templates/ can be deleted as
// a separate step once nothing reads them.
//
// Only DELIVERABLE shapes are seeded. compass/templates/ also holds templates for authoring the
// framework itself — a workflow's dispatch table, an agent task, the dashboard's HTML — and those
// are not documents any row produces. Seeding them would offer `workflow` as a shape a SOW could be
// drafted into, which is a menu of nonsense rather than a harmless extra row.

import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { supabaseAdmin } from "../app/lib/supabase.ts";
import { parseTemplate } from "../app/lib/render/template.ts";

const apply = process.argv.includes("--apply");

const DIR = resolve(process.cwd(), "..", "compass", "templates");

/** Framework-authoring templates, not deliverable shapes. */
const NOT_A_DELIVERABLE = new Set([
  "workflow", "workflow-template", "agent-task", "doc-tree", "copy-doc",
]);
const isExample = (stem: string) => stem.includes(".example-");

const sb = supabaseAdmin();
if (!sb) { console.error("Supabase is not configured. Check .env.local."); process.exit(1); }

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".md"))
  .map((f) => ({ file: f, name: f.replace(/\.md$/, "") }))
  .filter(({ name }) => !NOT_A_DELIVERABLE.has(name) && !isExample(name))
  .sort((a, b) => a.name.localeCompare(b.name));

if (!files.length) { console.error(`✗ No templates found in ${DIR}`); process.exit(1); }

let wrote = 0, skipped = 0;

for (const { file, name } of files) {
  const body = readFileSync(resolve(DIR, file), "utf8");
  const parsed = parseTemplate(body);

  // A template with no level-2 headings has an EMPTY FLOOR: every draft satisfies it, including one
  // that produced nothing of the sort. That is the aggregate-over-zero-rows failure, and it would
  // be invisible — the row would look templated and gate on nothing. Refused here rather than
  // seeded and discovered later.
  if (!parsed.sections.length) {
    console.log(`  SKIP  ${name.padEnd(28)} no '##' sections — it would gate on nothing`);
    skipped++;
    continue;
  }

  console.log(`  ${String(parsed.sections.length).padStart(3)}  ${name.padEnd(28)} ${parsed.title ?? "(no title)"}`);

  if (apply) {
    // Read then write, rather than `upsert({ onConflict: "name" })`.
    //
    // The default scope's uniqueness is a PARTIAL index — `unique (name) where org_id is null and
    // engagement_id is null` — because Postgres treats NULLs as distinct, so a plain unique over
    // the three columns would not stop two default rows with the same name. ON CONFLICT cannot
    // address a partial index by column name, and the upsert fails with "no unique or exclusion
    // constraint matching". The index is right; the upsert was the wrong tool.
    const row = { org_id: null, engagement_id: null, name, title: parsed.title ?? name, body, updated_by: "seed" };
    const { data: held, error: readErr } = await sb
      .from("document_template").select("id")
      .eq("name", name).is("org_id", null).is("engagement_id", null).maybeSingle();
    if (readErr) { console.error(`✗ read ${name}: ${readErr.message}`); process.exit(1); }

    const { error } = held
      ? await sb.from("document_template")
          .update({ ...row, updated_at: new Date().toISOString() }).eq("id", held.id)
      : await sb.from("document_template").insert(row);
    if (error) { console.error(`✗ write ${name}: ${error.message}`); process.exit(1); }
    wrote++;
  }
}

console.log(
  `\n${files.length} template(s): ${files.length - skipped} with sections, ${skipped} skipped.` +
  (apply ? `  ✓ ${wrote} written at the default scope.` : "\nReport only. Re-run with --apply to write."),
);
