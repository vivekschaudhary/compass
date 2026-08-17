// One-time: tell Supabase that the migrations already applied by hand are applied.
//
// Eleven v2 migrations (plus v1's) went in by pasting SQL into the dashboard, before this project
// used the CLI's migration system. `supabase db push` would now try to run all of them again.
// Most are written idempotently and would survive it; 030_drop_unused would not — it queries a
// table it has already dropped — and a migration runner that "usually works" is not one.
//
// So each existing file is marked applied WITHOUT running it. After this, `db push` only applies
// what is genuinely new, and nothing is ever pasted again.

import { readdirSync } from "fs";
import { execFileSync } from "child_process";

const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
const versions = files.map((f) => f.split("_")[0]);

if (!versions.length) {
  console.error("No migrations found in supabase/migrations/.");
  process.exit(1);
}

console.log(`Marking ${versions.length} migrations as already applied:\n`);
for (const f of files) console.log(`   ${f}`);
console.log("\nThis runs no SQL. It records that these were applied by hand.\n");

try {
  execFileSync("supabase", ["migration", "repair", "--status", "applied", ...versions, "--linked"],
    { stdio: "inherit" });
  console.log("\nDone. `npm run db:push` will now apply only new migrations.");
} catch {
  console.error(
    "\nCould not reach the project. This needs a one-time link first:\n" +
    "   supabase login\n" +
    "   supabase link --project-ref <ref>\n" +
    "then re-run `npm run db:adopt`.",
  );
  process.exit(1);
}
