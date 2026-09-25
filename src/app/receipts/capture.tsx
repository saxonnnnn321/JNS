'use client';

import { useActionState, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { saveReceipt, type ReceiptResult } from './actions';
import { rechargePlan } from '@/lib/receipts/recharge';

const input =
  'mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20';

/**
 * Photograph a receipt and file it against a customer.
 *
 * The photo goes from the phone straight to Supabase Storage, before the form
 * is submitted. Two reasons: a receipt must stay readable, so it is kept at a
 * higher quality than a job photo, and routing an image that size through a
 * server action would run into Vercel's 4.5 MB body limit.
 *
 * Resized to 1600px on the long edge, which keeps the small print legible
 * while getting a typical phone photo under a megabyte.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.8;

async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return file;
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  // If the browser refuses, the original is better than nothing.
  return blob ?? file;
}

export type Option = { id: string; label: string };
export type JobOption = Option & {
  customerId: string;
  pricing: 'fixed' | 'costPlus';
};

export function ReceiptCapture({
  customers,
  jobs,
  today,
}: {
  customers: Option[];
  jobs: JobOption[];
  today: string;
}) {
  const [result, submit, saving] = useActionState<ReceiptResult, FormData>(
    saveReceipt,
    null,
  );

  const [preview, setPreview] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rechargeable, setRechargeable] = useState(true);
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  // No photo, just the amount. Common enough to be a first-class option.
  const [noPhoto, setNoPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const jobsForCustomer = jobs.filter((job) => job.customerId === customerId);
  const chosenJob = jobsForCustomer.find((job) => job.id === jobId);

  // The one rule that stops a purchase being billed twice, asked here so the
  // form can explain itself before you press save rather than after.
  const plan = rechargePlan({
    hasCustomer: Boolean(customerId),
    rechargeable,
    jobPricing: chosenJob?.pricing,
  });
  const billedByJob = chosenJob?.pricing === 'costPlus';
  const ready = Boolean(storagePath) || noPhoto;

  async function take(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const blob = await compress(file);
      const path = `${crypto.randomUUID()}.jpg`;

      const supabase = createClient();
      const { error } = await supabase.storage
        .from('receipts')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });

      if (error) {
        setUploadError(
          /bucket not found/i.test(error.message)
            ? 'The receipts bucket does not exist yet — run migration 0007.'
            : `Could not upload it: ${error.message}`,
        );
        return;
      }

      setStoragePath(path);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setUploadError('Could not read that photo. Try taking it again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form action={submit}>
      <input type="hidden" name="storagePath" value={storagePath} />

      {noPhoto ? (
        <div className="rounded-xl border border-dashed border-black/15 p-4 text-center">
          <p className="text-sm font-medium">No photo — amount only</p>
          <button
            type="button"
            onClick={() => setNoPhoto(false)}
            className="mt-1 text-xs text-leaf hover:underline"
          >
            Actually, I have the receipt
          </button>
        </div>
      ) : !storagePath ? (
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-leaf/40 bg-leaf-soft/40 p-6 text-center hover:bg-leaf-soft">
          <span className="text-base font-semibold text-leaf">
            {uploading ? 'Uploading…' : 'Photograph the receipt'}
          </span>
          <span className="mt-1 text-xs text-bark/50">
            Opens the camera. Lay it flat and get the total in frame.
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              void take(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      ) : (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview ?? ''}
            alt="The receipt"
            className="h-32 w-24 rounded-lg border border-black/10 object-cover"
          />
          <button
            type="button"
            onClick={() => {
              setStoragePath('');
              setPreview(null);
            }}
            className="text-xs text-bark/45 hover:text-bark"
          >
            Take a different one
          </button>
        </div>
      )}

      {!storagePath && !noPhoto && (
        <button
          type="button"
          onClick={() => setNoPhoto(true)}
          className="mt-2 text-xs text-bark/50 hover:text-bark"
        >
          No receipt? Just put the amount in →
        </button>
      )}

      {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}

      {ready && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              Amount
              <input
                name="amount"
                className={input}
                inputMode="decimal"
                placeholder="$248.50"
                autoFocus
                required
              />
            </label>
            <label className="block text-sm">
              Where from
              <input name="supplier" className={input} placeholder="Bunnings" />
            </label>
            <label className="block text-sm">
              Date
              <input
                type="date"
                name="purchasedOn"
                className={input}
                defaultValue={today}
              />
            </label>
          </div>

          <label className="mt-3 block text-sm">
            Who is it for
            <select
              name="customerId"
              className={input}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">
                Nobody — a business cost (fuel, blades, insurance)
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.label}
                </option>
              ))}
            </select>
          </label>

          {customerId && jobsForCustomer.length > 0 && (
            <label className="mt-3 block text-sm">
              Against which job <span className="text-bark/40">(optional)</span>
              <select
                name="jobId"
                className={input}
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              >
                <option value="">Not a particular job</option>
                {jobsForCustomer.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.label}
                    {job.pricing === 'costPlus' ? ' — cost plus' : ''}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-bark/45">
                On a cost-plus job this adds to what the job is worth.
              </span>
            </label>
          )}

          {customerId && (
            <>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="rechargeable"
                  checked={rechargeable}
                  onChange={(e) => setRechargeable(e.target.checked)}
                  disabled={billedByJob}
                  className="mt-1"
                />
                <span className={billedByJob ? 'text-bark/40' : undefined}>
                  Charge it back to them
                  <span className="block text-xs text-bark/45">
                    Adds it to their next invoice automatically. Untick if you
                    are absorbing it.
                  </span>
                </span>
              </label>
              {/* Ticking this AND picking a cost-plus job used to bill the
                  same purchase twice. Now the job wins and says so. */}
              {billedByJob && (
                <p className="mt-2 rounded-lg bg-leaf-soft p-2 text-xs text-bark/70">
                  {plan.because} No separate charge line is added, or they
                  would pay for it twice.
                </p>
              )}
            </>
          )}

          <label className="mt-3 block text-sm">
            What it was for
            <input
              name="notes"
              className={input}
              placeholder="Besser block and reo for the back wall"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="mt-4 w-full rounded-lg bg-leaf px-5 py-3 text-sm font-semibold text-white hover:bg-leaf/90 disabled:bg-bark/20"
          >
            {saving ? 'Saving…' : 'Save receipt'}
          </button>
          {result?.error && (
            <p className="mt-2 text-sm text-red-600">{result.error}</p>
          )}
        </>
      )}
    </form>
  );
}
