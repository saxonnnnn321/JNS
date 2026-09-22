'use client';

import { useActionState, useState } from 'react';
import { saveQuote, type SaveQuoteResult } from '../actions';
import { formatMoney } from '@/lib/format';
import type { QuoteOption } from '@/lib/types';

const input =
  'mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20';

/**
 * Save the quote against a customer, so it stops being a PDF and starts
 * being work the business can track.
 *
 * Two shapes, because a quote is one of two things: a one-off job that sits
 * on the board until they say yes, or a standing arrangement that joins the
 * round. Everything else is already known from the lookup, so this is mostly
 * one press.
 */
export function SaveQuote({
  customer,
  address,
  lawnAreaM2,
  options,
}: {
  customer: { name: string; phone: string; email: string };
  address: { addressLine: string; suburb: string; postcode: string };
  lawnAreaM2: number;
  options: QuoteOption[];
}) {
  const [result, submit, pending] = useActionState<SaveQuoteResult, FormData>(
    saveQuote,
    null,
  );
  const [chosen, setChosen] = useState(options[0]?.key ?? 'standard');
  const [as, setAs] = useState<'job' | 'plan'>('job');

  const option = options.find((o) => o.key === chosen) ?? options[0];
  if (!option) return null;

  return (
    <form action={submit} className="mt-3">
      <input type="hidden" name="name" value={customer.name} />
      <input type="hidden" name="phone" value={customer.phone} />
      <input type="hidden" name="email" value={customer.email} />
      <input type="hidden" name="addressLine" value={address.addressLine} />
      <input type="hidden" name="suburb" value={address.suburb} />
      <input type="hidden" name="postcode" value={address.postcode} />
      <input type="hidden" name="lawnAreaM2" value={lawnAreaM2} />
      <input type="hidden" name="packageKey" value={option.key} />
      <input type="hidden" name="price" value={(option.totalCents / 100).toFixed(2)} />
      <input
        type="hidden"
        name="estimatedMinutes"
        value={Math.round(option.totalMinutes)}
      />
      <input type="hidden" name="summary" value={option.blurb} />
      <input type="hidden" name="as" value={as} />

      {options.length > 1 && (
        <label className="block text-sm">
          Which option
          <select
            className={input}
            value={chosen}
            onChange={(e) => setChosen(e.target.value as typeof chosen)}
          >
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name} — {formatMoney(o.totalCents)}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mt-3 block text-sm">
        Save it as
        <select
          className={input}
          value={as}
          onChange={(e) => setAs(e.target.value as 'job' | 'plan')}
        >
          <option value="job">A one-off job, waiting on a yes</option>
          <option value="plan">A regular customer on the round</option>
        </select>
      </label>

      {as === 'plan' && (
        <label className="mt-3 block text-sm">
          How often
          <select name="frequency" className={input} defaultValue="fortnightly">
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Every 4 weeks</option>
            <option value="onceOff">Booked once</option>
          </select>
        </label>
      )}
      {as === 'job' && <input type="hidden" name="frequency" value="onceOff" />}

      <button
        type="submit"
        disabled={pending || !customer.name.trim()}
        className="mt-3 w-full rounded-lg border border-leaf px-5 py-3 text-sm font-medium text-leaf hover:bg-leaf-soft disabled:cursor-not-allowed disabled:border-bark/20 disabled:text-bark/30"
      >
        {pending
          ? 'Saving…'
          : as === 'plan'
            ? `Add to the round at ${formatMoney(option.totalCents)}`
            : `Save as a job at ${formatMoney(option.totalCents)}`}
      </button>
      {!customer.name.trim() && (
        <p className="mt-2 text-xs text-bark/45">Needs a customer name.</p>
      )}
      {result?.error && (
        <p className="mt-2 text-xs text-red-600">{result.error}</p>
      )}
    </form>
  );
}
