import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Every column this app writes to must actually exist.
 *
 * This test exists because it did not, and an invoice insert carried a
 * `property_id` that `invoices` has never had — copied from `quotes`, which
 * does. Postgres rejected the whole insert and the app said "check the logs"
 * to someone standing in a driveway holding a phone.
 *
 * Nothing here talks to a database. It reads supabase/migrations, works out
 * what columns each table ends up with, and checks the lists below against
 * that. When you add a column to an insert, add it here too — the point is
 * that the two have to be kept in step deliberately.
 */

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');

/** Words that begin a table constraint rather than a column. */
const NOT_A_COLUMN = new Set([
  'primary', 'foreign', 'unique', 'check', 'constraint', 'exclude', 'like',
]);

function parseSchema(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const columnsOf = (table: string) => {
    const existing = tables.get(table);
    if (existing) return existing;
    const created = new Set<string>();
    tables.set(table, created);
    return created;
  };

  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8');

    // create table [if not exists] name ( ... );
    const creates = sql.matchAll(
      /create table (?:if not exists )?(\w+)\s*\(([\s\S]*?)\n\);/gi,
    );
    for (const [, table, body] of creates) {
      const columns = columnsOf(table);
      for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (line === '' || line.startsWith('--')) continue;
        const first = line.split(/[\s(]/)[0].toLowerCase();
        if (NOT_A_COLUMN.has(first)) continue;
        if (/^\w+$/.test(first)) columns.add(first);
      }
    }

    // alter table name add column [if not exists] col ...
    const alters = sql.matchAll(/alter table (\w+)([\s\S]*?);/gi);
    for (const [, table, body] of alters) {
      const columns = columnsOf(table);
      for (const [, column] of body.matchAll(
        /add column (?:if not exists )?(\w+)/gi,
      )) {
        columns.add(column.toLowerCase());
      }
    }
  }

  return tables;
}

/** Columns the application actually writes, per table. */
const WRITES: Record<string, string[]> = {
  customers: ['name', 'phone', 'email'],
  properties: [
    'customer_id', 'address_line', 'suburb', 'state', 'postcode',
    'access_notes', 'lawn_area_m2',
  ],
  service_plans: [
    'customer_id', 'property_id', 'frequency', 'anchor_date', 'package_key',
    'price_cents', 'estimated_minutes', 'active', 'paused_until',
  ],
  visits: [
    'plan_id', 'visit_date', 'status', 'actual_minutes', 'notes', 'invoice_id',
  ],
  invoices: [
    'reference', 'customer_id', 'status', 'issued_date', 'due_date',
    'subtotal_cents', 'gst_cents', 'total_cents', 'paid_at',
  ],
  invoice_items: [
    'invoice_id', 'sort', 'description', 'quantity', 'unit', 'amount_cents',
  ],
  one_off_jobs: [
    'customer_id', 'property_id', 'title', 'description', 'kind',
    'price_cents', 'materials_cents', 'estimated_minutes', 'status',
    'scheduled_for', 'completed_on', 'notes', 'invoice_id',
    'pricing', 'labour_rate_cents', 'markup_basis_points',
    // Written when a quote is produced and when it is emailed (0010).
    'quote_reference', 'quote_sent_at',
  ],
  invoice_extras: [
    'customer_id', 'description', 'amount_cents', 'incurred_on', 'invoice_id',
  ],
  job_claims: [
    'job_id', 'description', 'amount_cents', 'claimed_on', 'invoice_id',
  ],
  receipts: [
    'storage_path', 'supplier', 'amount_cents', 'purchased_on', 'notes',
    'customer_id', 'job_id', 'rechargeable', 'extra_id',
  ],
  timesheet_entries: [
    'staff_id', 'work_date', 'minutes', 'description', 'customer_id', 'job_id',
  ],
  partner_drawings: ['staff_id', 'paid_on', 'amount_cents', 'note'],
  income_entries: ['received_on', 'amount_cents', 'description'],
  running_timers: [
    'staff_id', 'started_at', 'description', 'customer_id', 'job_id',
  ],
  partners: ['staff_id', 'share_basis_points', 'wage_cents_per_hour', 'active'],
  business_settings: ['id', 'retention_basis_points'],
  staff: ['id', 'email', 'full_name', 'role', 'active'],
};

describe('the migrations define every column the app writes', () => {
  const schema = parseSchema();

  it('parsed something that looks like a schema', () => {
    expect(schema.size).toBeGreaterThan(10);
    expect(schema.get('invoices')?.has('reference')).toBe(true);
  });

  it('knows invoices has no property_id, which is the bug that started this', () => {
    expect(schema.get('invoices')?.has('property_id')).toBe(false);
    // ...whereas quotes genuinely does, which is where it was copied from.
    expect(schema.get('quotes')?.has('property_id')).toBe(true);
  });

  for (const [table, columns] of Object.entries(WRITES)) {
    it(`${table} has every column written to it`, () => {
      const actual = schema.get(table);
      expect(actual, `no table named ${table} in any migration`).toBeDefined();
      const missing = columns.filter((column) => !actual?.has(column));
      expect(missing, `${table} is missing: ${missing.join(', ')}`).toEqual([]);
    });
  }
});
