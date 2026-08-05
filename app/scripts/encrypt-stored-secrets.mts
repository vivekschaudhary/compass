// One-off migration: wrap any credential still stored in plaintext.
//
// Credentials written before app/lib/crypto.ts shipped sit in the clear on the `engagement` row.
// Reads already tolerate both (decryptSecret passes unprefixed values through), so this is not
// urgent — but leaving them is the exposure the encryption exists to close.
//
// Safe to re-run: already-encrypted values are skipped. Every value is round-tripped BEFORE the
// write, so a key that cannot decrypt what it just encrypted aborts instead of turning a working
// credential into an unreadable one.
//
//   npx tsx --env-file=.env.local scripts/encrypt-stored-secrets.mts          # report only
//   npx tsx --env-file=.env.local scripts/encrypt-stored-secrets.mts --apply  # write
import { supabaseAdmin } from "../app/lib/supabase";
import { encryptSecret, decryptSecret, isEncrypted, encryptionAvailable } from "../app/lib/crypto";
import { secretColumns } from "../app/lib/adapters";

const apply = process.argv.includes("--apply");

if (!encryptionAvailable()) {
  console.error("COMPASS_SECRET_KEY is not set — nothing to migrate to. Generate one with `openssl rand -base64 32`.");
  process.exit(1);
}
const sb = supabaseAdmin();
if (!sb) { console.error("Supabase not configured."); process.exit(1); }

const cols = secretColumns();
const { data: rows, error } = await sb.from("engagement").select(["id", ...cols].join(", "));
if (error) { console.error(error.message); process.exit(1); }

let plaintext = 0, encrypted = 0, empty = 0;
for (const row of (rows ?? []) as unknown as Record<string, string | null>[]) {
  const patch: Record<string, string> = {};
  for (const col of cols) {
    const v = row[col];
    if (!v) { empty++; continue; }
    if (isEncrypted(v)) { encrypted++; continue; }
    plaintext++;
    const wrapped = encryptSecret(v);
    if (decryptSecret(wrapped) !== v) {           // never write what we cannot read back
      console.error(`  ✗ ${row.id}.${col}: round-trip FAILED — aborting, nothing written`);
      process.exit(1);
    }
    patch[col] = wrapped;
    console.log(`  ${apply ? "encrypting" : "would encrypt"} ${row.id}.${col} (${v.length} chars)`);
  }
  if (apply && Object.keys(patch).length) {
    const { error: e } = await sb.from("engagement").update(patch).eq("id", row.id);
    if (e) { console.error(`  ✗ ${row.id}: ${e.message}`); process.exit(1); }
  }
}

console.log(`\nplaintext: ${plaintext}   already encrypted: ${encrypted}   empty: ${empty}`);
if (!apply && plaintext) console.log("Re-run with --apply to write.");
