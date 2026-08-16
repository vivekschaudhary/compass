"use client";

// The three destinations, with the current one marked.
//
// A client component only because a layout has no access to the pathname — Organic already styles
// `[aria-current]`, so the whole job here is knowing which link is live. Marking it is not
// decoration: without it the top bar gives no answer to "where am I", which is the one question a
// nav exists to answer.

import Link from "next/link";
import { usePathname } from "next/navigation";

const DESTINATIONS = [
  { slug: "jobs", label: "Jobs to do" },
  { slug: "plan", label: "Plan & sprint" },
  { slug: "content", label: "Shared content" },
] as const;

export function TopNav({ engagement }: { engagement: string }) {
  const pathname = usePathname();

  return (
    <nav className="topnav">
      {DESTINATIONS.map((d) => {
        const href = `/v2/e/${engagement}/${d.slug}`;
        // startsWith, not equality: a job's own page lives under /jobs/<id> and is still Jobs.
        const current = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={d.slug} href={href} aria-current={current ? "page" : undefined}>
            {d.label}
          </Link>
        );
      })}
    </nav>
  );
}
