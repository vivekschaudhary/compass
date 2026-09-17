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
  // adds a route at 6pm. v1 had the bug this prevents: an unfiltered `story` fetch put another
  // engagement's slipping story into a brand-new engagement's board, and it was caught by eye.
  // Mechanical, or it will not hold.
  //
  // Scoped to the pages and routes. When this was written v1's ~190 direct calls sat outside it;
  // v1 is deleted, and every page and route that reads data now lives under these two globs. The
  // only others are the root layout and the `/` redirect, which touch none; the rest is lib/, which
  // is where a raw client is allowed. A new route or page outside them is a new
  // surface, and belongs in this list.
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
