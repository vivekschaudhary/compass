// The one shape every HTTP route answers in.
//
// There were five. `onboard` refused with HTTP 200 and a `problems: string[]`, `import` refused with
// 422 and a `problems: Problem[]` — same key, incompatible types — and the rest used a bare `error`,
// `ok: false`, or a domain `kind`. The new-engagement form checked for `error`, got `problems`, took
// the success branch, found no engagement id and drew the blank form again: a refused request looked
// exactly like nothing happening.
//
// So the split is not error-vs-problems but REFUSAL vs FAILURE:
//
//   { ok: true,  ...payload }            200   it worked
//   { ok: false, refusals: Refusal[] }   4xx   understood and declined — the person can fix it
//   { ok: false, error: string }         5xx   something broke — they cannot
//
// Refusals stay plural and structured because this repo treats them as the useful output: each one
// names what was wrong and, where it can, the next move.
//
// Types and the client-side reader only. No `next/server` import, so a client component can use it;
// the route helpers are in `./http`.
//
// HTTP routes only. Server actions are typed end to end and keep their own `{ ok, error }`.

export type Refusal = {
  message: string;
  /** The one next move, when there is one. */
  fix?: string;
  /** For refusals about uploaded rows: which file, which row. */
  file?: string;
  row?: number | null;
};

export type Refused = { ok: false; refusals: Refusal[] };
export type Failed = { ok: false; error: string };
export type Envelope<T extends object = object> = ({ ok: true } & T) | Refused | Failed;

export const isRefused = (e: { ok: boolean }): e is Refused =>
  !e.ok && Array.isArray((e as Refused).refusals);

/**
 * Read a route's answer as an envelope, whatever came back.
 *
 * A body that is not an envelope becomes a failure rather than a guess. That covers a platform error
 * page (a `maxDuration` timeout is HTML, not JSON) and a route that has not adopted the contract —
 * reading either as success is the defect this file exists to end.
 */
export async function readEnvelope<T extends object>(res: Response): Promise<Envelope<T>> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: `The server answered ${res.status} with no readable body.` };
  }
  if (!body || typeof body !== "object" || typeof (body as { ok?: unknown }).ok !== "boolean") {
    return { ok: false, error: `The server answered ${res.status} in an unrecognised shape.` };
  }
  const e = body as Envelope<T>;
  if (e.ok) return e;
  if (isRefused(e) && e.refusals.length) return e;
  if (typeof (e as Failed).error === "string" && (e as Failed).error) return e;
  // `ok: false` with nothing saying why is still a failure — never an empty refusal list, which a
  // caller would render as nothing.
  return { ok: false, error: `The server answered ${res.status} and did not say why.` };
}

/** One line for a surface with room for one: the first refusal (with its fix), or the error. */
export function describeFailure(e: Refused | Failed): string {
  if (isRefused(e)) {
    const [first, ...rest] = e.refusals;
    const line = first.fix ? `${first.message} ${first.fix}` : first.message;
    return rest.length ? `${line} (+${rest.length} more)` : line;
  }
  return e.error;
}
