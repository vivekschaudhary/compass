"use client";

// `next/link` that says so when clicked.
//
// `useLinkStatus` only works from a component rendered INSIDE the Link, hence the child. The link
// itself is dimmed from the stylesheet (`a:has(> .link-pending)`), because a child cannot set an
// attribute on its parent.

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

function Indicator() {
  const { pending } = useLinkStatus();
  return pending ? <span className="spinner link-pending" aria-hidden /> : null;
}

export function PendingLink({ children, ...rest }: ComponentProps<typeof Link>) {
  return (
    <Link {...rest}>
      {children}
      <Indicator />
    </Link>
  );
}
