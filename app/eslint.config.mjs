import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ── the data layer is the only door ────────────────────────────────────────────────────────
  //
  // Every v2 read applies two filters that are not optional: the engagement (tenant isolation,
  // and there is no RLS yet so it is the whole guarantee) and the role's scope. Both come from an
  // Actor, so a caller cannot forget one.
  //
  // "All queries go through lib/data" is exactly the kind of convention that lasts until someone
  // adds a route at 6pm. v1 already has the bug this prevents: an unfiltered `story` fetch put
  // another engagement's slipping story into a brand-new engagement's board, and it was caught by
  // eye. Mechanical, or it will not hold.
  //
  // Scoped to v2 deliberately. v1 has ~190 direct calls and they are all legitimate under its own
  // design; flagging them would make the rule noise that everyone learns to ignore.
  {
    files: ["app/v2/**/*.{ts,tsx}", "app/api/v2/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@/app/lib/supabase",
          importNames: ["supabaseAdmin"],
          message:
            "Query through app/lib/data instead — it applies the engagement filter and the role's " +
            "scope from the Actor. If you genuinely need a raw client, it belongs behind a new " +
            "function in lib/data, not at the call site.",
        }],
        patterns: [{
          group: ["**/lib/supabase", "../**/lib/supabase"],
          importNames: ["supabaseAdmin"],
          message:
            "Query through app/lib/data instead — it applies the engagement filter and the role's " +
            "scope from the Actor.",
        }],
      }],
    },
  },
]);

export default eslintConfig;
