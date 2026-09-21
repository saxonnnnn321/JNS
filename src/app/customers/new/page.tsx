'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { addCustomer, type FormResult } from '../actions';
import { businessDate } from '@/lib/dates';
import { MicButton } from '@/components/mic-button';
import { useDictation } from '@/lib/voice/use-dictation';
import { tidyAddress } from '@/lib/voice/speech';
import type { PropertyLookupResult } from '@/lib/property/lookup';

const card = 'rounded-xl border border-black/10 bg-white p-4 sm:p-5';
const legend = 'text-xs font-semibold uppercase tracking-wider text-bark/50';
const input =
  'mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20';
const primary =
  'rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90 disabled:cursor-not-allowed disabled:bg-bark/20';

export default function NewCustomerPage() {
  const [result, submit, pending] = useActionState<FormResult, FormData>(
    addCustomer,
    null,
  );

  const [addressLine, setAddressLine] = useState('');
  const [suburb, setSuburb] = useState('');
  const [postcode, setPostcode] = useState('');
  const [lawnAreaM2, setLawnAreaM2] = useState('');
  const [frequency, setFrequency] = useState('none');

  const [looking, setLooking] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  const addressVoice = useDictation({
    onTranscript: (text) => setAddressLine(tidyAddress(text)),
  });

  /**
   * The same cadastre lookup the quote page uses. Filling the lawn size in
   * here means a standing plan can be priced off a measurement rather than a
   * memory.
   */
  async function measure(override?: string) {
    const query = (
      override ?? [addressLine, suburb, postcode].filter(Boolean).join(' ')
    ).trim();
    if (!query) return;
    setLooking(true);
    setLookupNote(null);
    try {
      const response = await fetch(
        `/api/property/lookup?address=${encodeURIComponent(query)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Could not find that');
      const found = data as PropertyLookupResult;
      setAddressLine(found.address.addressLine || addressLine);
      if (found.address.suburb) setSuburb(found.address.suburb);
      if (found.address.postcode) setPostcode(found.address.postcode);
      setLawnAreaM2(String(found.measurements.lawnAreaM2));
      setLookupNote(
        `Lot ${found.parcel.lotId ?? '—'} · block ${found.parcel.areaM2} m² · lawn about ${found.measurements.lawnAreaM2} m²`,
      );
    } catch (cause) {
      setLookupNote(
        cause instanceof Error ? cause.message : 'Could not find that address',
      );
    } finally {
      setLooking(false);
    }
  }

  /**
   * "Add a new customer at 40 Gipps Street" arrives here as a query string
   * from the app-wide microphone. Measuring it straight away splits the one
   * spoken line into street, suburb and postcode properly, which is a job the
   * cadastre does far better than a regex.
   */
  const consumedParams = useRef(false);
  useEffect(() => {
    if (consumedParams.current) return;
    consumedParams.current = true;

    const spoken = new URLSearchParams(window.location.search).get('address');
    if (!spoken) return;
    setAddressLine(spoken);
    window.history.replaceState(null, '', window.location.pathname);
    void measure(spoken);
    // measure() reads its address from the argument, so it needs no deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/customers" className="text-sm text-bark/50 hover:text-bark">
        ← Customers
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Add a customer</h1>
      <p className="mt-1 text-sm text-bark/60">
        Name and address are all that is needed. Add a standing plan if they
        are going on the round.
      </p>

      <form action={submit} className="mt-6 space-y-5">
        <section className={card}>
          <p className={legend}>Who</p>
          <label className="mt-2 block text-sm">
            Name
            <input name="name" className={input} required autoFocus />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Phone
              <input name="phone" className={input} inputMode="tel" placeholder="0412 345 678" />
            </label>
            <label className="block text-sm">
              Email
              <input name="email" className={input} inputMode="email" />
            </label>
          </div>
        </section>

        <section className={card}>
          <p className={legend}>Where</p>

          <label className="mt-2 block text-sm">
            Street address
            <div className="flex gap-2">
              <input
                name="addressLine"
                className={input}
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="12 Short Street"
                required
              />
              {addressVoice.supported && (
                <div className="mt-1">
                  <MicButton
                    listening={addressVoice.listening}
                    onClick={() => addressVoice.toggle(addressLine)}
                    title="Say the address"
                  />
                </div>
              )}
            </div>
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Suburb
              <input
                name="suburb"
                className={input}
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              Postcode
              <input
                name="postcode"
                className={input}
                inputMode="numeric"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void measure()}
              disabled={looking || !addressLine.trim()}
              className="rounded-lg border border-leaf px-4 py-2 text-sm font-medium text-leaf hover:bg-leaf-soft disabled:cursor-not-allowed disabled:border-bark/20 disabled:text-bark/30"
            >
              {looking ? 'Measuring…' : 'Measure the block'}
            </button>
            <label className="text-sm">
              <span className="sr-only">Lawn area in square metres</span>
              <input
                name="lawnAreaM2"
                className={`${input} mt-0 w-32`}
                inputMode="numeric"
                placeholder="Lawn m²"
                value={lawnAreaM2}
                onChange={(e) => setLawnAreaM2(e.target.value)}
              />
            </label>
          </div>
          {lookupNote && (
            <p className="mt-2 text-xs text-bark/60">{lookupNote}</p>
          )}

          <label className="mt-3 block text-sm">
            Access notes
            <textarea
              name="accessNotes"
              className={input}
              rows={2}
              placeholder="Side gate, code 1234. Dog in the yard."
            />
          </label>
        </section>

        <section className={card}>
          <p className={legend}>On the round?</p>
          <label className="mt-2 block text-sm">
            How often
            <select
              name="frequency"
              className={input}
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              <option value="none">Not on the round — one-off work</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Every 4 weeks</option>
              <option value="onceOff">Booked once</option>
            </select>
          </label>

          {frequency !== 'none' && (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  Price a visit
                  <input
                    name="price"
                    className={input}
                    inputMode="decimal"
                    placeholder="$308"
                    required
                  />
                </label>
                <label className="block text-sm">
                  Minutes a visit
                  <input
                    name="estimatedMinutes"
                    className={input}
                    inputMode="numeric"
                    placeholder="112"
                    required
                  />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  First visit
                  <input
                    type="date"
                    name="anchorDate"
                    className={input}
                    defaultValue={businessDate()}
                  />
                  <span className="mt-1 block text-xs text-bark/45">
                    Sets the weekday every later visit lands on.
                  </span>
                </label>
                <label className="block text-sm">
                  Package
                  <select name="packageKey" className={input}>
                    <option value="standard">Mow, edge and blow</option>
                    <option value="fullTidy">Full tidy</option>
                  </select>
                </label>
              </div>
            </>
          )}
        </section>

        {result?.error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {result.error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className={primary} disabled={pending}>
            {pending ? 'Saving…' : 'Add customer'}
          </button>
          <Link href="/customers" className="text-sm text-bark/50 hover:text-bark">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
