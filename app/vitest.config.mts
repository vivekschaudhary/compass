import { defineConfig } from "vitest/config";

// The app's test runner. Server-side lib code is the target, so the default environment is `node`
// — no jsdom cost on a suite that is almost entirely pure functions and API-route logic.
//
// `.mts` because this file is ESM and the nearest package.json has no `"type": "module"`.
// `resolve.tsconfigPaths` reads the `@/*` alias out of tsconfig.json rather than restating it here,
// so the alias cannot drift between what the app resolves and what the tests resolve.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "app/**/*.test.tsx"],
    // Tests must not reach the real Supabase / Atlassian / Anthropic accounts. Anything needing a
    // credential is either mocked or is a live check run by hand — never part of `npm test`.
    env: { COMPASS_SECRET_KEY: "test-key-not-a-real-secret" },
    restoreMocks: true,
  },
});
