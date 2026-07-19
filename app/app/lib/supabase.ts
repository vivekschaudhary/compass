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
