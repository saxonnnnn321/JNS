import nodemailer from 'nodemailer';
import { BUSINESS } from '../business';
import { GMAIL_USER, emailConfigured, gmailAppPassword } from './env';

/**
 * Sending mail through Gmail.
 *
 * Gmail rather than a transactional service because it needs no domain and
 * costs nothing, which matters more right now than deliverability reporting.
 * The trade is real though: Google blocks sign-ins from IP addresses it does
 * not recognise, and a serverless function's IP is exactly that. When that
 * happens the failure is visible here rather than silent, which is the whole
 * reason `sendMail` errors are surfaced to the operator instead of swallowed.
 *
 * Server-only. Importing this into a client component would be a build error,
 * which is the point.
 */

export type Attachment = { filename: string; content: Buffer };

export class EmailError extends Error {}

function transport() {
  if (!emailConfigured) {
    throw new EmailError(
      'Email is not set up. Add GMAIL_USER and GMAIL_APP_PASSWORD, then redeploy.',
    );
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: gmailAppPassword },
  });
}

export async function sendEmail({
  to,
  subject,
  text,
  attachments = [],
}: {
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
}): Promise<void> {
  try {
    await transport().sendMail({
      from: `${BUSINESS.tradingName} <${GMAIL_USER}>`,
      // Replies go to the business address even if that differs from the
      // account actually doing the sending.
      replyTo: BUSINESS.email,
      to,
      subject,
      text,
      attachments,
    });
  } catch (cause) {
    if (cause instanceof EmailError) throw cause;
    const message = cause instanceof Error ? cause.message : 'Unknown error';

    // Translate the two that actually happen. Never log or echo the password.
    if (/invalid login|username and password not accepted|535/i.test(message)) {
      throw new EmailError(
        'Gmail rejected the login. Check the App Password is right and that 2-Step Verification is still on.',
      );
    }
    if (/timed out|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      throw new EmailError(
        'Could not reach Gmail. This is the usual symptom of Google blocking the server’s IP — see if it works from your own machine.',
      );
    }
    throw new EmailError(`Gmail would not send it: ${message}`);
  }
}
