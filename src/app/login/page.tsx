'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { supabaseConfigured } from '@/lib/supabase/env';
import { BUSINESS } from '@/lib/business';

const input =
  'mt-1 w-full rounded-lg border border-black/15 px-3 py-2.5 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setError(signInError?.message ?? 'Could not sign in');
      setBusy(false);
      return;
    }

    // Having an account is not the same as being allowed in. The staff table
    // is the allow-list, and row level security means a non-staff account
    // would see a working app with nothing in it — confusing. Say so instead.
    const { data: staff } = await supabase
      .from('staff')
      .select('id, active')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!staff?.active) {
      await supabase.auth.signOut();
      setError('That account is not set up for this business. Ask Saxon to add you.');
      setBusy(false);
      return;
    }

    router.push(params.get('next') || '/');
    router.refresh();
  }

  if (!supabaseConfigured) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-50 p-4 text-sm">
        <p className="font-semibold text-amber-900">Not connected to a database</p>
        <p className="mt-1 text-amber-900/80">
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>{' '}
          (or to the environment variables in Vercel) and restart.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={signIn} className="rounded-xl border border-black/10 bg-white p-5">
      <label className="block text-sm">
        Email
        <input
          className={input}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </label>
      <label className="mt-3 block text-sm">
        Password
        <input
          className={input}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 w-full rounded-lg bg-leaf px-4 py-3 font-medium text-white hover:bg-leaf/90 disabled:bg-bark/20"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-bold text-leaf">{BUSINESS.tradingName}</h1>
      <p className="mt-1 mb-6 text-sm text-bark/50">Sign in to the office</p>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <p className="mt-4 text-xs text-bark/45">
        Accounts are created by the owner in Supabase. There is no public sign-up —
        this is a business tool, not a website.
      </p>
    </main>
  );
}
