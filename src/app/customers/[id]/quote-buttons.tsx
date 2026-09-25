'use client';

import { useActionState } from 'react';
import { emailJobQuote, type SendQuoteResult } from '@/app/jobs/actions';

/**
 * Getting a construction quote in front of the customer.
 *
 * Download for printing or sending yourself; email to do it from here. The
 * emailed one records when it went, because "did I actually send that?" is
 * the question you will have in a fortnight.
 */
export function QuoteButtons({
  jobId,
  customerEmail,
  sentAt,
  emailReady,
}: {
  jobId: string;
  customerEmail?: string;
  sentAt?: string;
  emailReady: boolean;
}) {
  const [result, send, sending] = useActionState<SendQuoteResult, FormData>(
    emailJobQuote,
    null,
  );

  return (
    <div className="mb-4 rounded-lg border border-black/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-bark/50">
        The quote
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a
          href={`/api/job/${jobId}/quote`}
          download
          className="rounded-lg bg-leaf px-4 py-2 text-xs font-medium text-white hover:bg-leaf/90"
        >
          Download
        </a>
        <a
          href={`/api/job/${jobId}/quote`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-black/15 px-4 py-2 text-xs hover:border-leaf"
        >
          View it
        </a>

        {emailReady && customerEmail && (
          <form action={send}>
            <input type="hidden" name="id" value={jobId} />
            <button
              type="submit"
              disabled={sending}
              className="rounded-lg border border-leaf px-4 py-2 text-xs font-medium text-leaf hover:bg-leaf-soft disabled:border-bark/20 disabled:text-bark/30"
            >
              {sending ? 'Sending…' : `Email to ${customerEmail}`}
            </button>
          </form>
        )}
      </div>

      {!customerEmail && (
        <p className="mt-2 text-xs text-bark/45">
          No email on file for them, so it cannot be sent from here. Download
          it and send it however you like.
        </p>
      )}
      {customerEmail && !emailReady && (
        <p className="mt-2 text-xs text-bark/45">
          Email is not connected yet — download it and send it yourself.
        </p>
      )}
      {sentAt && (
        <p className="mt-2 text-xs text-leaf">
          Sent {new Date(sentAt).toLocaleString('en-AU', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Australia/Sydney',
          })}
        </p>
      )}
      {result && 'error' in result && (
        <p className="mt-2 text-xs text-red-600">{result.error}</p>
      )}
      {result && 'ok' in result && (
        <p className="mt-2 text-xs font-medium text-leaf">✓ {result.ok}</p>
      )}
    </div>
  );
}
