import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Every Compass class used in v2 has a rule.
 *
 * This exists because a regex tidying compass.css swept out a block of rules while the components
 * kept using their class names. Nothing failed: no build error, no console warning, no type error —
 * the elements simply rendered unstyled, and it was caught by someone looking at a screenshot two
 * commits later.
 *
 * CSS has no compiler, so the class name on an element and the rule in the stylesheet are joined by
 * nothing but a string. This is that join, checked.
 */

const V2 = join(process.cwd(), "app", "v2");
const CSS = readFileSync(join(V2, "compass.css"), "utf-8");
const ORGANIC = readFileSync(join(V2, "organic.css"), "utf-8");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

/** Class names with a rule in either stylesheet. */
function defined(css: string): Set<string> {
  return new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
}

/**
 * Tailwind utilities and dynamic names are not ours to check. A Compass class is one that appears
 * in a stylesheet's vocabulary OR looks like our naming — lowercase, hyphenated, not a utility.
 */
const TAILWIND = /^(flex|grid|gap|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|min|max|text|bg|border|rounded|items|justify|self|space|col|row|order|absolute|relative|fixed|sticky|inline|block|hidden|overflow|z|opacity|font|leading|tracking|whitespace|truncate|cursor|select|list|underline|uppercase|lowercase|capitalize|shrink|grow|basis|aspect|object|top|left|right|bottom|inset)(-|$)|:/;

describe("compass.css", () => {
  const known = new Set([...defined(CSS), ...defined(ORGANIC)]);

  it("has a rule for every Compass class the components use", () => {
    const missing = new Map<string, string[]>();

    for (const file of tsxFiles(V2)) {
      const src = readFileSync(file, "utf-8");
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{cx\(([^)]*)\)\})/g)) {
        // Inside cx(...) only the QUOTED parts are class names — `cx("btn", icon && "btn-icon")`
        // also contains the variable `icon`, which is not a class and was reported as a missing
        // one on the first run. A guard that cries wolf gets switched off.
        const raw = m[3] !== undefined
          ? [...m[3].matchAll(/["'`]([^"'`]*)["'`]/g)].map((q) => q[1]).join(" ")
          : [m[1], m[2]].filter(Boolean).join(" ");
        for (const cls of raw.split(/[\s"',]+/)) {
          const c = cls.trim();
          // Skip empties, template holes, and Tailwind.
          if (!c || c.includes("$") || c.includes("{") || TAILWIND.test(c)) continue;
          if (!/^[a-z][a-z0-9-]*$/.test(c)) continue;
          if (known.has(c)) continue;
          missing.set(c, [...(missing.get(c) ?? []), file.replace(process.cwd() + "/", "")]);
        }
      }
    }

    expect(
      [...missing].map(([c, files]) => `.${c} — used in ${files[0]}`),
      "these class names appear on elements but match no rule",
    ).toEqual([]);
  });
});
