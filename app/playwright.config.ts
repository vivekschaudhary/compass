import { defineConfig, devices } from "@playwright/test";

// Browser smoke tests, kept deliberately separate from `npm test`.
//
// Why they exist: every defect in the spec editor so far was invisible to the unit suite and found
// by hand — a Save button that moved out from under the pointer, a role dropped by a redirect, a
// null field that 500'd a page. All click-and-navigate behaviour, none of it reachable from vitest
// in node.
//
// They need a REAL database (the editor reads and writes spec_file), so they are not part of the
// default test run and are not in CI. `npm run test:e2e` locally, deliberately.

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,        // they share one database; parallel writes to the same rows collide
  workers: 1,
  timeout: 60_000,             // saves shell out to python to parse a workflow
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reuse a dev server if one is already up, otherwise start one. `stdout: "pipe"` so a startup
  // failure is visible rather than a bare timeout.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/api/spec",
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "pipe",
  },
});
