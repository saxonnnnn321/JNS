/**
 * Email credentials.
 *
 * Gmail, via an App Password rather than the account password. Both of these
 * are server-only — NEITHER may ever gain a NEXT_PUBLIC_ prefix, because that
 * would compile the password into the JavaScript the browser downloads and
 * hand anyone who viewed source the ability to send mail as JNS.
 */

export const GMAIL_USER = process.env.GMAIL_USER ?? '';
export const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD ?? '';

/**
 * A Google App Password is 16 characters, usually shown in four groups of
 * four. Spaces are cosmetic and Google accepts it either way, so strip them
 * rather than making the pasted value's formatting matter.
 */
export const gmailAppPassword = GMAIL_APP_PASSWORD.replace(/\s+/g, '');

export const emailConfigured =
  GMAIL_USER.includes('@') && gmailAppPassword.length >= 16;
