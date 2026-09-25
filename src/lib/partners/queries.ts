import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import {
  DEFAULT_RETENTION_BASIS_POINTS,
  splitPeriod,
  type PartnerInput,
  type SplitResult,
} from './split';

/**
 * Everything the split needs for one period, read from the database.
 *
 * Income is two things added together: the round (visits marked done, priced
 * from their standing plan) and anything typed in by hand — cash jobs, one
 * offs, work that never made it onto a plan. Without that second part a busy
 * week of off-the-books work would look like a loss.
 *
 * Server-side only.
 */

export type TimesheetEntry = {
  id: string;
  staffId: string;
  staffName: string;
  workDate: string;
  minutes: number;
  description?: string;
  customerId?: string;
  jobId?: string;
};

export type MoneyEntry = {
  id: string;
  date: string;
  amountCents: number;
  note?: string;
  staffId?: string;
  staffName?: string;
};

export type RunningTimer = {
  staffId: string;
  staffName: string;
  startedAt: string;
  description?: string;
  customerId?: string;
};

export type PeriodBooks = {
  from: string;
  to: string;
  split: SplitResult;
  entries: TimesheetEntry[];
  drawings: MoneyEntry[];
  income: MoneyEntry[];
  roundIncomeCents: number;
  manualIncomeCents: number;
  retentionBasisPoints: number;
  /** Clocks running right now, whoever started them. */
  runningTimers: RunningTimer[];
  /** For the "which job?" picker. Name only. */
  customers: { id: string; name: string }[];
  /** No partner rows yet — the migration has not been run. */
  notConfigured: boolean;
  /** running_timers is missing, so migration 0005 has not been run. */
  timerUnavailable: boolean;
};

function emptyBooks(from: string, to: string): PeriodBooks {
  return {
    from,
    to,
    split: splitPeriod({
      incomeCents: 0,
      retentionBasisPoints: DEFAULT_RETENTION_BASIS_POINTS,
      partners: [],
    }),
    entries: [],
    drawings: [],
    income: [],
    roundIncomeCents: 0,
    manualIncomeCents: 0,
    retentionBasisPoints: DEFAULT_RETENTION_BASIS_POINTS,
    runningTimers: [],
    customers: [],
    notConfigured: true,
    timerUnavailable: true,
  };
}

export async function loadPeriodBooks(
  from: string,
  to: string,
): Promise<PeriodBooks> {
  if (!supabaseConfigured) return emptyBooks(from, to);

  const supabase = await createClient();

  const [
    staffResult,
    partnerResult,
    settingsResult,
    timesheetResult,
    drawingResult,
    incomeResult,
    visitResult,
    timerResult,
    customerResult,
  ] = await Promise.all([
    supabase.from('staff').select('id, full_name, email'),
    supabase
      .from('partners')
      .select('staff_id, share_basis_points, wage_cents_per_hour, active'),
    supabase
      .from('business_settings')
      .select('retention_basis_points')
      .eq('id', 1)
      .maybeSingle(),
    supabase
      .from('timesheet_entries')
      .select('id, staff_id, work_date, minutes, description, customer_id, job_id')
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date', { ascending: false }),
    supabase
      .from('partner_drawings')
      .select('id, staff_id, paid_on, amount_cents, note')
      .gte('paid_on', from)
      .lte('paid_on', to)
      .order('paid_on', { ascending: false }),
    supabase
      .from('income_entries')
      .select('id, received_on, amount_cents, description')
      .gte('received_on', from)
      .lte('received_on', to)
      .order('received_on', { ascending: false }),
    supabase
      .from('visits')
      .select('id, plan_id, visit_date, status, service_plans (price_cents)')
      .eq('status', 'done')
      .gte('visit_date', from)
      .lte('visit_date', to),
    supabase
      .from('running_timers')
      .select('staff_id, started_at, description, customer_id'),
    supabase.from('customers').select('id, name').order('name').limit(500),
  ]);

  // The partners table only exists once migration 0004 has been run. Say so
  // rather than showing a confident set of zeroes.
  if (partnerResult.error || !partnerResult.data) {
    return emptyBooks(from, to);
  }

  const staffNames = new Map<string, string>();
  for (const row of (staffResult.data ?? []) as {
    id: string;
    full_name: string | null;
    email: string | null;
  }[]) {
    staffNames.set(row.id, row.full_name || row.email || 'Unnamed');
  }

  const entries: TimesheetEntry[] = (
    (timesheetResult.data ?? []) as {
      id: string;
      staff_id: string;
      work_date: string;
      minutes: number;
      description: string | null;
      customer_id: string | null;
      job_id: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    staffId: row.staff_id,
    staffName: staffNames.get(row.staff_id) ?? 'Unknown',
    workDate: row.work_date,
    minutes: row.minutes,
    description: row.description ?? undefined,
    customerId: row.customer_id ?? undefined,
    jobId: row.job_id ?? undefined,
  }));

  const drawings: MoneyEntry[] = (
    (drawingResult.data ?? []) as {
      id: string;
      staff_id: string;
      paid_on: string;
      amount_cents: number;
      note: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    date: row.paid_on,
    amountCents: row.amount_cents,
    note: row.note ?? undefined,
    staffId: row.staff_id,
    staffName: staffNames.get(row.staff_id) ?? 'Unknown',
  }));

  const income: MoneyEntry[] = (
    (incomeResult.data ?? []) as {
      id: string;
      received_on: string;
      amount_cents: number;
      description: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    date: row.received_on,
    amountCents: row.amount_cents,
    note: row.description ?? undefined,
  }));

  // Supabase returns an embedded row as an object or an array depending on
  // how it infers the relationship, so handle both rather than trusting one.
  const roundIncomeCents = (
    (visitResult.data ?? []) as {
      service_plans: { price_cents: number } | { price_cents: number }[] | null;
    }[]
  ).reduce((total, row) => {
    const plan = Array.isArray(row.service_plans)
      ? row.service_plans[0]
      : row.service_plans;
    return total + (plan?.price_cents ?? 0);
  }, 0);

  const manualIncomeCents = income.reduce((t, row) => t + row.amountCents, 0);

  const minutesBy = new Map<string, number>();
  for (const entry of entries) {
    minutesBy.set(entry.staffId, (minutesBy.get(entry.staffId) ?? 0) + entry.minutes);
  }
  const drawnBy = new Map<string, number>();
  for (const drawing of drawings) {
    if (!drawing.staffId) continue;
    drawnBy.set(
      drawing.staffId,
      (drawnBy.get(drawing.staffId) ?? 0) + drawing.amountCents,
    );
  }

  const partnerInputs: PartnerInput[] = (
    partnerResult.data as {
      staff_id: string;
      share_basis_points: number;
      wage_cents_per_hour: number;
      active: boolean;
    }[]
  )
    .filter((row) => row.active)
    .map((row) => ({
      id: row.staff_id,
      name: staffNames.get(row.staff_id) ?? 'Unnamed',
      shareBasisPoints: row.share_basis_points,
      wageCentsPerHour: row.wage_cents_per_hour,
      minutesWorked: minutesBy.get(row.staff_id) ?? 0,
      drawnCents: drawnBy.get(row.staff_id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const retentionBasisPoints =
    settingsResult.data?.retention_basis_points ?? DEFAULT_RETENTION_BASIS_POINTS;

  // running_timers arrives in a later migration than the rest, so a missing
  // table means "not run yet", not "broken".
  const timerUnavailable = Boolean(timerResult.error);
  const runningTimers: RunningTimer[] = timerUnavailable
    ? []
    : (
        (timerResult.data ?? []) as {
          staff_id: string;
          started_at: string;
          description: string | null;
          customer_id: string | null;
        }[]
      ).map((row) => ({
        staffId: row.staff_id,
        staffName: staffNames.get(row.staff_id) ?? 'Unknown',
        startedAt: row.started_at,
        description: row.description ?? undefined,
        customerId: row.customer_id ?? undefined,
      }));

  return {
    from,
    to,
    split: splitPeriod({
      incomeCents: roundIncomeCents + manualIncomeCents,
      retentionBasisPoints,
      partners: partnerInputs,
    }),
    entries,
    drawings,
    income,
    roundIncomeCents,
    manualIncomeCents,
    retentionBasisPoints,
    runningTimers,
    customers: (customerResult.data ?? []) as { id: string; name: string }[],
    notConfigured: partnerInputs.length === 0,
    timerUnavailable,
  };
}
