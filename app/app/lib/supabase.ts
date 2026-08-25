import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client (service role) — used only in API routes / server code.
// Never import this into a client component.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // not configured yet → callers fall back to the seed fixture
  return createClient(url, key, { auth: { persistSession: false } });
}

export const supabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * A read whose failure must not be mistaken for an absence.
 *
 * PostgREST returns `{ data: null, error }` for a dropped connection, a timeout, a column that
 * does not exist — and `{ data: null, error: null }` for a row that genuinely is not there. A
 * caller destructuring only `data` cannot tell those apart, so it reports the second when it means
 * the first. That is how a live task rendered "This page could not be found": `buildContext` read
 * `work_task`, the read failed, null read as "no such task", and the page called `notFound()`.
 *
 * Use this wherever null FEEDS A DECISION — a 404, a gate verdict, a dependency being met. A read
 * whose emptiness is a legitimate answer (no prior draft, no member assigned) does not need it.
 *
 * The name of the read is required because the throw is what someone will see in a log, and
 * "PGRST116" without it says nothing about which read gave up.
 */
export function must<T>(what: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}
