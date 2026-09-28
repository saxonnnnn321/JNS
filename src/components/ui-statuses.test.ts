import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INVOICE_STATUS, JOB_STATUS } from './ui';

/**
 * The status maps in the kit are now the only place a status gets a label and
 * a colour, and three pages read them. That makes an unlabelled status a
 * visible bug — the raw database word, in grey, on the board.
 *
 * So these tests read the check constraints straight out of the migrations and
 * insist the kit covers every value the column actually permits. Adding a
 * status in SQL without labelling it fails here rather than on screen.
 */

const DIR = join(process.cwd(), 'supabase', 'migrations');

function allMigrations(): string {
  return readdirSync(DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(DIR, name), 'utf8'))
    .join('\n');
}

/** The allowed values from `check (status in ('a', 'b'))` for one table. */
function allowedStatuses(table: string): string[] {
  const sql = allMigrations();
  const create = new RegExp(
    `create table (?:if not exists )?${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
    'i',
  );
  const body = sql.match(create)?.[1];
  if (!body) throw new Error(`no create table for ${table}`);

  // The constraint wraps across lines in these files, so match loosely.
  const check = body.match(/status[\s\S]*?check \(status in \(([\s\S]*?)\)\)/i)?.[1];
  if (!check) throw new Error(`no status check constraint on ${table}`);

  return [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('the status maps cover what the database allows', () => {
  it('found the constraints at all, so a silent pass is not possible', () => {
    expect(allowedStatuses('one_off_jobs').length).toBeGreaterThan(3);
    expect(allowedStatuses('invoices').length).toBeGreaterThan(3);
  });

  it('labels every job status', () => {
    const missing = allowedStatuses('one_off_jobs').filter(
      (status) => !JOB_STATUS[status],
    );
    expect(missing, `JOB_STATUS is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('labels every invoice status', () => {
    const missing = allowedStatuses('invoices').filter(
      (status) => !INVOICE_STATUS[status],
    );
    expect(missing, `INVOICE_STATUS is missing: ${missing.join(', ')}`).toEqual([]);
  });

  it('gives every status a human label, not the raw database word', () => {
    for (const [status, entry] of Object.entries(JOB_STATUS)) {
      // in_progress must not reach a customer's eyes as "in_progress".
      expect(entry.label).not.toContain('_');
      expect(entry.label[0]).toBe(entry.label[0].toUpperCase());
      expect(entry.label.toLowerCase()).not.toBe(status.toLowerCase() + '_');
    }
  });
});
