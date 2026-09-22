'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Ticking a job off the run sheet.
 *
 * Visits are not stored in advance — the round is worked out from each
 * customer's standing plan, so a future visit is a calculation, not a row.
 * A visit only becomes a row the moment it actually happens, which is what
 * this does. That row is what turns the job into income on the split, and
 * what feeds the "is the rate card right?" figure.
 */

const schema = z.object({
  planId: z.string().uuid(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actualMinutes: z
    .union([z.coerce.number().int().min(1).max(1440), z.literal('')])
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

export async function markVisitDone(data: FormData): Promise<void> {
  const parsed = schema.safeParse({
    planId: field(data, 'planId'),
    visitDate: field(data, 'visitDate'),
    actualMinutes: field(data, 'actualMinutes') || '',
    notes: field(data, 'notes'),
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  // A plan cannot be visited twice on the same day, so re-ticking updates
  // rather than failing on the unique constraint.
  const { error } = await supabase.from('visits').upsert(
    {
      plan_id: parsed.data.planId,
      visit_date: parsed.data.visitDate,
      status: 'done',
      actual_minutes:
        typeof parsed.data.actualMinutes === 'number'
          ? parsed.data.actualMinutes
          : null,
      notes: parsed.data.notes || null,
    },
    { onConflict: 'plan_id,visit_date' },
  );
  if (error) console.error('could not mark the visit done', error);

  revalidatePath('/');
  revalidatePath('/schedule');
  revalidatePath('/timesheet/split');
}

/** Ticked the wrong one. Puts it back to unvisited. */
export async function undoVisit(data: FormData): Promise<void> {
  const planId = field(data, 'planId');
  const visitDate = field(data, 'visitDate');
  if (!planId || !visitDate) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from('visits')
    .delete()
    .eq('plan_id', planId)
    .eq('visit_date', visitDate);
  if (error) console.error('could not undo the visit', error);

  revalidatePath('/');
  revalidatePath('/schedule');
  revalidatePath('/timesheet/split');
}
