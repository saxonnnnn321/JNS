'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { businessDate } from '@/lib/dates';

/**
 * Turning a quote into something the business can act on.
 *
 * Until now the quote page was an island: it priced a job beautifully and
 * then forgot it the moment you closed the tab. This is the bridge — the
 * quote becomes a customer, an address, and either a job waiting on a yes or
 * a standing plan on the round.
 *
 * It is deliberately one press with everything already filled in, because the
 * moment you are most likely to save a quote is standing in the driveway.
 */

export type SaveQuoteResult = { error: string } | null;

const dollars = z
  .string()
  .trim()
  .transform((value) => value.replace(/[$,\s]/g, ''))
  .pipe(z.coerce.number().min(0).max(1_000_000));

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

const schema = z.object({
  /** Known when the quote was started from an existing customer's page. */
  customerId: z.string().uuid().optional().or(z.literal('')),
  name: z.string().trim().min(1, 'Who is it for?'),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.string().trim().email('That email looks wrong'), z.literal('')]),

  addressLine: z.string().trim().min(1, 'Look up an address first'),
  suburb: z.string().trim().min(1, 'Look up an address first'),
  postcode: z.string().trim().max(10).optional(),
  lawnAreaM2: z.union([z.coerce.number().min(0).max(100_000), z.literal('')]).optional(),

  price: dollars,
  estimatedMinutes: z.coerce.number().int().min(0).max(100_000),
  packageKey: z.enum(['standard', 'fullTidy']),
  summary: z.string().trim().max(2000).optional(),

  /** A one-off job, or a standing plan on the round. */
  as: z.enum(['job', 'plan']),
  frequency: z.enum(['weekly', 'fortnightly', 'monthly', 'onceOff']),
});

export async function saveQuote(
  _previous: SaveQuoteResult,
  data: FormData,
): Promise<SaveQuoteResult> {
  const parsed = schema.safeParse({
    customerId: field(data, 'customerId'),
    name: field(data, 'name'),
    phone: field(data, 'phone'),
    email: field(data, 'email'),
    addressLine: field(data, 'addressLine'),
    suburb: field(data, 'suburb'),
    postcode: field(data, 'postcode'),
    lawnAreaM2: field(data, 'lawnAreaM2') || '',
    price: field(data, 'price'),
    estimatedMinutes: field(data, 'estimatedMinutes') || '0',
    packageKey: field(data, 'packageKey') || 'standard',
    summary: field(data, 'summary'),
    as: field(data, 'as') || 'job',
    frequency: field(data, 'frequency') || 'fortnightly',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details' };
  }
  const input = parsed.data;
  const supabase = await createClient();

  // Started from their page, so we already know exactly who. Matching by
  // name is only a fallback, and a poor one when two customers share a name.
  let customerId = input.customerId || undefined;

  if (!customerId) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .ilike('name', input.name)
      .limit(1)
      .maybeSingle();
    customerId = existing?.id as string | undefined;
  }

  if (!customerId) {
    const { data: created, error } = await supabase
      .from('customers')
      .insert({
        name: input.name,
        phone: input.phone || null,
        email: input.email || null,
      })
      .select('id')
      .single();
    if (error || !created) {
      return { error: `Could not save the customer: ${error?.message ?? ''}` };
    }
    customerId = created.id;
  }

  // Same for the address — quoting the same place twice should not double it.
  const { data: existingProperty } = await supabase
    .from('properties')
    .select('id')
    .eq('customer_id', customerId)
    .ilike('address_line', input.addressLine)
    .limit(1)
    .maybeSingle();

  let propertyId = existingProperty?.id as string | undefined;

  if (!propertyId) {
    const { data: created, error } = await supabase
      .from('properties')
      .insert({
        customer_id: customerId,
        address_line: input.addressLine,
        suburb: input.suburb,
        state: 'NSW',
        postcode: input.postcode || null,
        lawn_area_m2:
          typeof input.lawnAreaM2 === 'number' ? input.lawnAreaM2 : null,
      })
      .select('id')
      .single();
    if (error || !created) {
      return { error: `Could not save the address: ${error?.message ?? ''}` };
    }
    propertyId = created.id;
  }

  const priceCents = Math.round(input.price * 100);

  if (input.as === 'plan') {
    const { error } = await supabase.from('service_plans').insert({
      customer_id: customerId,
      property_id: propertyId,
      frequency: input.frequency,
      anchor_date: businessDate(),
      package_key: input.packageKey,
      price_cents: priceCents,
      estimated_minutes: input.estimatedMinutes,
      active: true,
    });
    if (error) return { error: `Could not add them to the round: ${error.message}` };
  } else {
    // Quoted, not agreed. It sits on the jobs board until they say yes.
    const { error } = await supabase.from('one_off_jobs').insert({
      customer_id: customerId,
      property_id: propertyId,
      title: `${input.addressLine} — quoted work`,
      description: input.summary || null,
      kind: 'landscaping',
      price_cents: priceCents,
      materials_cents: 0,
      estimated_minutes: input.estimatedMinutes,
      status: 'quoted',
    });
    if (error) return { error: `Could not save the job: ${error.message}` };
  }

  revalidatePath('/customers');
  revalidatePath('/jobs');
  revalidatePath('/');
  redirect(`/customers/${customerId}`);
}
