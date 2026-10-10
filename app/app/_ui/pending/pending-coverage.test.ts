// A route with no `loading.tsx` shows the old screen until its server render finishes, which reads
// as a hung page. Fails when a page.tsx has no loading.tsx at or above it (inside the app/ tree,
// below the root), or when a client file moves with a bare router.push/replace instead of
// `useNavigate`.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === "node_modules" || n === "api") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);

describe("pending feedback coverage", () => {
  it("every page has a loading.tsx at or above it", () => {
    const missing = files
      .filter((f) => f.endsWith("/page.tsx"))
      .filter((f) => {
        let d = dirname(f);
        while (d.startsWith(ROOT) && d !== ROOT) {
          if (existsSync(join(d, "loading.tsx"))) return false;
          d = dirname(d);
        }
        return true;
      })
      // The root page only redirects; /design is a static showcase.
      .map((f) => relative(ROOT, f))
      .filter((f) => f !== "page.tsx" && f !== "design/page.tsx");
    expect(missing).toEqual([]);
  });

  it("client code navigates through useNavigate / useAction, not a bare router.push", () => {
    const offenders = files
      .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
      .filter((f) => !f.includes("/_ui/pending/") && !f.endsWith(".test.ts"))
      .filter((f) => /router\.(push|replace)\(/.test(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "")))
      .map((f) => relative(ROOT, f));
    // StartTaskButton already pushes inside its own useTransition, which keeps it pending.
    expect(offenders.filter((f) => !f.endsWith("jobs/StartTaskButton.tsx"))).toEqual([]);
  });
});
