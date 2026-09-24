"use client";

// The ONE client-side Supabase client — anon key, safe to ship to the browser. Nothing before this
// used it: every read in this app goes through a Server Component or Server Action on the service
// role key. Realtime is the first thing that genuinely has to run in the browser, because a push has
// to reach an open tab directly rather than through a request that tab initiated.
//
// This inherits the app's existing no-RLS posture (`app/lib/data/tasks.ts`: "There is no RLS yet, so
// this is the whole guarantee") rather than introducing a new one — every table here is already
// readable via plain PostgREST with the anon key, RLS or not; Realtime adds a push channel on top of
// access that already exists. Authorization is explicitly out of scope for the MVP (single operator,
// `mvp-brd.md` §8) and this does not change that scope.

import { createClient } from "@supabase/supabase-js";

let client: ReturnType<typeof createClient> | null = null;

export function supabaseBrowser() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}
