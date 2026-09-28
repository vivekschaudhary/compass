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
  // Every read applies two filters that are not optional: the engagement (tenant isolation,
  // and there is no RLS yet so it is the whole guarantee) and the role's scope. Both come from an
  // Actor, so a caller cannot forget one.
  //
  // "All queries go through lib/data" is exactly the kind of convention that lasts until someone
  // adds a route at 6pm. v1 had the bug this prevents: an unfiltered `story` fetch put another
  // engagement's slipping story into a brand-new engagement's board, and it was caught by eye.
  // Mechanical, or it will not hold.
  //
  // Everything in app/ EXCEPT lib/, which is where a raw client is allowed. It used to be scoped to
  // two globs covering just the pages and routes, because v1's ~190 direct calls sat outside them
  // and were legitimate under v1's design. v1 is gone, so the rule
  // is written the other way round: a new page or route is covered the moment it exists, rather than
  // when someone remembers to add it to a list.
  {
    files: ["app/**/*.{ts,tsx}"],
    ignores: ["app/lib/**"],
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
  // ── the data layer does not import the agent ───────────────────────────────────────────────
  //
  // `agent/*` builds on `data/*` — run.ts calls the gates, the phases, the documents. When `data`
  // imports `agent` back, the two become one module with a directory boundary drawn through it, and
  // no split of either can be done in isolation. `subjectOfRun` was the case that made `gates`
  // and `materialise` reach into `agent/context` for a single query.
  //
  // The files below still do, and are listed rather than exempted by glob: each is a known
  // violation, not a permitted pattern, and this list should only ever get shorter. Nothing new
  // may join it. What they take from the agent is mostly `agent/context`'s loaders, which is
  // Phase 3's split of that file (they belong in data, or in a shared module both layers import).
  {
    files: ["app/lib/data/**/*.ts"],
    ignores: [
      "**/*.test.ts",
      "app/lib/data/ticket-body.ts", // agentMarkdown, doneCriteriaFor, loadDocumentText, selectHost
      "app/lib/data/tasks.ts", // pinInputs
      "app/lib/data/job.ts", // HEARTBEAT_STALE_MINUTES
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["**/agent", "**/agent/*", "@/app/lib/agent", "@/app/lib/agent/*"],
          message:
            "lib/data must not import lib/agent — agent builds on data, not the reverse. Move what " +
            "you need into lib/data (as `run-subject.ts` did), or into a module both layers import.",
        }],
      }],
    },
  },
]);

export default eslintConfig;
