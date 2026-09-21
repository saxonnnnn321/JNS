'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { businessDate } from '@/lib/dates';

/**
 * Adding and removing real customers.
 *
 * Everything runs as the signed-in user, so the row level security policies in
 * supabase/migrations/0002 decide what is allowed. Staff can add; only the
 * owner can delete. That is enforced in the database, not here — this code
 * only turns the resulting error into a sentence.
 */

export type FormResult = { error: string } | null;

const dollars = z
  .string()
  .trim()
  .transform((value) => value.replace(/[$,\s]/g, ''))
  .pipe(z.coerce.number().min(0).max(100_000));

const schema = z.object({
  name: z.string().trim().min(1, 'A name is needed'),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.string().trim().email('That email does not look right'), z.literal('')]),

  addressLine: z.string().trim().min(1, 'A street address is needed'),
  suburb: z.string().trim().min(1, 'A suburb is needed'),
  postcode: z.string().trim().max(10).optional(),
  accessNotes: z.string().trim().max(500).optional(),
  lawnAreaM2: z.union([z.coerce.number().min(0).max(100_000), z.literal('')]).optional(),

  // The standing plan is optional: plenty of customers are one-off jobs.
  frequency: z.enum(['none', 'weekly', 'fortnightly', 'monthly', 'onceOff']),
  anchorDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  packageKey: z.enum(['standard', 'fullTidy']),
  price: dollars.optional(),
  estimatedMinutes: z.coerce.number().int().min(0).max(1440).optional(),
});

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

export async function addCustomer(
  _previous: FormResult,
  data: FormData,
): Promise<FormResult> {
  if (!supabaseConfigured) {
    return { error: 'Not connected to a database yet.' };
  }

  const parsed = schema.safeParse({
    name: field(data, 'name'),
    phone: field(data, 'phone'),
    email: field(data, 'email'),
    addressLine: field(data, 'addressLine'),
    suburb: field(data, 'suburb'),
    postcode: field(data, 'postcode'),
    accessNotes: field(data, 'accessNotes'),
    lawnAreaM2: field(data, 'lawnAreaM2') || '',
    frequency: field(data, 'frequency') || 'none',
    anchorDate: field(data, 'anchorDate') || businessDate(),
    packageKey: field(data, 'packageKey') || 'standard',
    price: field(data, 'price') || '0',
    estimatedMinutes: field(data, 'estimatedMinutes') || '0',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form' };
  }
  const input = parsed.data;

  const supabase = await createClient();

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .insert({
      name: input.name,
      phone: input.phone || null,
      email: input.email || null,
    })
    .select('id')
    .single();

  if (customerError || !customer) {
    return { error: describe(customerError?.message, 'Could not save the customer') };
  }

  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .insert({
      customer_id: customer.id,
      address_line: input.addressLine,
      suburb: input.suburb,
      state: 'NSW',
      postcode: input.postcode || null,
      access_notes: input.accessNotes || null,
      lawn_area_m2:
        typeof input.lawnAreaM2 === 'number' ? input.lawnAreaM2 : null,
    })
    .select('id')
    .single();

  if (propertyError || !property) {
    // Supabase has no transaction across calls, so undo the half-made
    // customer rather than leaving a nameless orphan in the list.
    await supabase.from('customers').delete().eq('id', customer.id);
    return { error: describe(propertyError?.message, 'Could not save the address') };
  }

  if (input.frequency !== 'none') {
    const { error: planError } = await supabase.from('service_plans').insert({
      customer_id: customer.id,
      property_id: property.id,
      frequency: input.frequency,
      anchor_date: input.anchorDate || businessDate(),
      package_key: input.packageKey,
      price_cents: Math.round((input.price ?? 0) * 100),
      estimated_minutes: input.estimatedMinutes ?? 0,
      active: true,
    });
    if (planError) {
      // The customer and address are fine and worth keeping; only the
      // recurring plan failed, and that can be added again.
      return {
        error: describe(
          planError.message,
          'Customer saved, but the recurring plan did not',
        ),
      };
    }
  }

  revalidatePath('/customers');
  revalidatePath('/schedule');
  revalidatePath('/');
  redirect(`/customers/${customer.id}`);
}

export async function deleteCustomer(data: FormData): Promise<void> {
  const id = field(data, 'id');
  if (!id) return;

  const supabase = await createClient();
  // Properties, plans and visits go with it — the foreign keys cascade.
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) {
    console.error('could not delete customer', error);
    redirect(`/customers/${id}?error=delete`);
  }

  revalidatePath('/customers');
  revalidatePath('/schedule');
  revalidatePath('/');
  redirect('/customers');
}

/**
 * Database errors are not written for people standing in a driveway. Translate
 * the two that actually happen and pass anything else through.
 */
function describe(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  if (/row-level security|permission denied/i.test(message)) {
    return 'Your account is not allowed to do that.';
  }
  if (/duplicate key/i.test(message)) return 'That one is already on the books.';
  return `${fallback}: ${message}`;
}
