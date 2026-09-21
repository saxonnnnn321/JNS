import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * Server-side Supabase, acting as the SIGNED-IN USER.
 *
 * This is the important bit: queries run with the user's own permissions, so
 * the row level security policies are doing real work. If this used the
 * service role key instead, RLS would be decoration and the audit stamps would
 * all come back empty.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which cannot set cookies. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/** The signed-in staff member, or null. */
export async function currentStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('staff')
    .select('id, email, full_name, role, active')
    .eq('id', user.id)
    .maybeSingle();

  return data?.active ? data : null;
}
