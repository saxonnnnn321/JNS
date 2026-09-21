/**
 * Supabase configuration, read once and checked.
 *
 * The anon key is public by design — it is compiled into the browser bundle.
 * It is safe there ONLY because row level security stands behind it (see
 * supabase/migrations/0002). The service role key is a different animal and
 * must never appear in this file or anything it imports.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False on a fresh clone with no .env.local. The app says so rather than crashing. */
export const supabaseConfigured =
  SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;
