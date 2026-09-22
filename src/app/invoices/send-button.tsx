'use client';

import { useActionState } from 'react';
import { emailInvoice, type SendResult } from './actions';

/**
 * Sending is one press, and it reports what happened. A silent send is worse
 * than no send — you would never know a customer had not been billed.
 */
export function SendButton({
  invoiceId,
  to,
  configured,
}: {
  invoiceId: string;
  to?: string;
  configured: boolean;
}) {
  const [result, send, sending] = useActionState<SendResult, FormData>(
    emailInvoice,
    null,
  );

  if (!configured) {
    return (
      <p className="mt-2 text-xs text-bark/45">
        Email is not connected yet. Add GMAIL_USER and GMAIL_APP_PASSWORD, then
        redeploy, and a send button appears here.
      </p>
    );
  }

  return (
    <div>
      <form action={send} className="inline">
        <input type="hidden" name="id" value={invoiceId} />
        <button
          type="submit"
          disabled={sending || !to}
          className="rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90 disabled:cursor-not-allowed disabled:bg-bark/20"
          title={to ? `Send to ${to}` : 'No email address on file'}
        >
          {sending ? 'Sending…' : to ? `Email to ${to}` : 'No email on file'}
        </button>
      </form>
      {result && 'error' in result && (
        <p className="mt-2 text-sm text-red-600">{result.error}</p>
      )}
      {result && 'ok' in result && (
        <p className="mt-2 text-sm font-medium text-leaf">✓ {result.ok}</p>
      )}
    </div>
  );
}
