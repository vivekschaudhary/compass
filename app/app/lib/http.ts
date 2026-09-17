// The route side of `./envelope`: three helpers, so a v2 route cannot invent a sixth shape.
//
// The status code carries the same answer as the body. A refusal that returned 200 was
// indistinguishable, to anything reading the status, from the engagement it declined to create.

import { NextResponse } from "next/server";
import { isRefused, type Envelope, type Refusal } from "./envelope";

export type { Refusal } from "./envelope";

/** It worked. The payload is spread beside `ok`, so existing readers of its keys keep working. */
export function ok<T extends object>(payload: T, status = 200) {
  return NextResponse.json({ ok: true as const, ...payload }, { status });
}

/**
 * Understood and declined. 4xx: 400 for a request missing what it needs, 422 for one that is
 * well-formed and still cannot be done.
 */
export function refuse(refusals: Refusal | string | (Refusal | string)[], status = 422) {
  const list = (Array.isArray(refusals) ? refusals : [refusals]).map((r) =>
    typeof r === "string" ? { message: r } : r,
  );
  // An empty list would render as nothing, which is the silent failure all over again.
  if (!list.length) return fail("Refused without a reason.");
  if (status < 400 || status > 499) throw new Error(`refuse() takes a 4xx status, got ${status}`);
  return NextResponse.json({ ok: false as const, refusals: list }, { status });
}

/** Send a result that is already an envelope, with the status its answer calls for. */
export function respond<T extends object>(result: Envelope<T>) {
  // `ok` re-adds `ok: true`, so passing the success through whole changes nothing.
  if (result.ok) return ok(result);
  return isRefused(result) ? refuse(result.refusals) : fail(result.error);
}

/** Something broke. 5xx. */
export function fail(error: string, status = 500) {
  if (status < 500 || status > 599) throw new Error(`fail() takes a 5xx status, got ${status}`);
  return NextResponse.json({ ok: false as const, error: error || "Failed without a message." }, { status });
}
