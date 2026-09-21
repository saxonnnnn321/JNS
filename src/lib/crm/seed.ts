/**
 * MOCK DATA for the CRM mockup.
 *
 * None of this is real and nothing here is persisted — it exists so the screens
 * have something to show before a database is wired up. The schema these rows
 * follow is the one in supabase/migrations/, so swapping this module for real
 * queries later is the whole migration.
 *
 * Anchor dates are deliberately in the past: the recurrence rules generate
 * forward from them, so the round always has work in it whenever you open it.
 */

import type { Customer, Property, ServicePlan, Visit } from './types';

export const customers: Customer[] = [
  { id: 'c1', name: 'Dave Thompson', phone: '0412 345 678', email: 'dave@example.com', since: '2024-03-11' },
  { id: 'c2', name: 'Marg Whitton', phone: '0413 221 900', since: '2023-08-02', notes: 'Prefers a text the night before.' },
  { id: 'c3', name: 'Penrith Dental', phone: '02 4721 0000', email: 'admin@example.com', since: '2025-01-20', notes: 'Commercial. Invoice monthly, 14 day terms.' },
  { id: 'c4', name: 'Hien Nguyen', phone: '0455 010 221', since: '2025-06-14' },
  { id: 'c5', name: 'Bob & Sue Farrell', phone: '0400 771 233', since: '2022-11-05', notes: 'Pensioners, same price since 2024.' },
  { id: 'c6', name: 'Jess Calloway', phone: '0466 918 004', email: 'jess@example.com', since: '2026-02-18' },
  { id: 'c7', name: 'Emu Plains Childcare', phone: '02 4735 1122', since: '2025-09-01', notes: 'Must be done before 7am or after 6pm.' },
  { id: 'c8', name: 'Ray Mitchell', phone: '0421 556 700', since: '2026-07-30' },
];

export const properties: Property[] = [
  { id: 'p1', customerId: 'c1', addressLine: '5 Hope Street', suburb: 'Penrith', state: 'NSW', postcode: '2750', lotId: '19//DP31239', parcelAreaM2: 621, lawnAreaM2: 365, accessNotes: 'Side gate, code 1234. Dog in the yard.' },
  { id: 'p2', customerId: 'c2', addressLine: '12 Short Street', suburb: 'Emu Plains', state: 'NSW', postcode: '2750', lotId: '211//DP243386', parcelAreaM2: 650, lawnAreaM2: 309 },
  { id: 'p3', customerId: 'c3', addressLine: '48 Henry Street', suburb: 'Penrith', state: 'NSW', postcode: '2750', parcelAreaM2: 1180, lawnAreaM2: 240, accessNotes: 'Car park out the back. Bins Tuesday.' },
  { id: 'p4', customerId: 'c4', addressLine: '7 Bunyarra Drive', suburb: 'Emu Plains', state: 'NSW', postcode: '2750', lotId: '30//DP258972', parcelAreaM2: 790, lawnAreaM2: 376 },
  { id: 'p5', customerId: 'c5', addressLine: '22 Lawson Street', suburb: 'Kingswood', state: 'NSW', postcode: '2747', parcelAreaM2: 580, lawnAreaM2: 280, accessNotes: 'Back gate sticks. Lift it.' },
  { id: 'p6', customerId: 'c6', addressLine: '104 Jamison Road', suburb: 'Kingswood', state: 'NSW', postcode: '2747', parcelAreaM2: 700, lawnAreaM2: 340 },
  { id: 'p7', customerId: 'c7', addressLine: '3 Great Western Highway', suburb: 'Emu Plains', state: 'NSW', postcode: '2750', parcelAreaM2: 1650, lawnAreaM2: 620, accessNotes: 'Locked gate, office has the key.' },
  { id: 'p8', customerId: 'c8', addressLine: '9 Banks Drive', suburb: 'St Clair', state: 'NSW', postcode: '2759', parcelAreaM2: 540, lawnAreaM2: 250 },
  { id: 'p9', customerId: 'c1', addressLine: '2/18 Derby Street', suburb: 'Penrith', state: 'NSW', postcode: '2750', parcelAreaM2: 310, lawnAreaM2: 90, accessNotes: 'Investment property. Tenant on site.' },
];

/** Monday = the Penrith run, Tuesday = Emu Plains, Wednesday = the west. */
export const plans: ServicePlan[] = [
  { id: 's1', customerId: 'c1', propertyId: 'p1', frequency: 'fortnightly', anchorDate: '2026-09-07', packageKey: 'standard', priceCents: 30800, estimatedMinutes: 112, active: true },
  { id: 's2', customerId: 'c2', propertyId: 'p2', frequency: 'fortnightly', anchorDate: '2026-09-01', packageKey: 'standard', priceCents: 27500, estimatedMinutes: 100, active: true },
  { id: 's3', customerId: 'c3', propertyId: 'p3', frequency: 'weekly', anchorDate: '2026-09-02', packageKey: 'fullTidy', priceCents: 46200, estimatedMinutes: 165, active: true },
  { id: 's4', customerId: 'c4', propertyId: 'p4', frequency: 'fortnightly', anchorDate: '2026-09-08', packageKey: 'standard', priceCents: 31900, estimatedMinutes: 118, active: true },
  { id: 's5', customerId: 'c5', propertyId: 'p5', frequency: 'monthly', anchorDate: '2026-09-02', packageKey: 'standard', priceCents: 24200, estimatedMinutes: 88, active: true },
  { id: 's6', customerId: 'c6', propertyId: 'p6', frequency: 'weekly', anchorDate: '2026-09-09', packageKey: 'standard', priceCents: 29700, estimatedMinutes: 108, active: true },
  { id: 's7', customerId: 'c7', propertyId: 'p7', frequency: 'weekly', anchorDate: '2026-09-01', packageKey: 'fullTidy', priceCents: 69300, estimatedMinutes: 250, active: true },
  { id: 's8', customerId: 'c8', propertyId: 'p8', frequency: 'fortnightly', anchorDate: '2026-09-09', packageKey: 'standard', priceCents: 26400, estimatedMinutes: 96, active: true, pausedUntil: '2026-10-12' },
  { id: 's9', customerId: 'c1', propertyId: 'p9', frequency: 'monthly', anchorDate: '2026-09-07', packageKey: 'standard', priceCents: 16500, estimatedMinutes: 55, active: true },
];

/**
 * Completed visits. `actualMinutes` next to the plan's estimate is the feedback
 * loop — after enough of these you stop guessing at the rate card.
 */
export const visits: Visit[] = [
  { id: 'v1', planId: 's1', date: '2026-09-07', status: 'done', actualMinutes: 125, invoiceId: 'i1' },
  { id: 'v2', planId: 's2', date: '2026-09-01', status: 'done', actualMinutes: 95, invoiceId: 'i2' },
  { id: 'v3', planId: 's3', date: '2026-09-02', status: 'done', actualMinutes: 180, invoiceId: 'i3' },
  { id: 'v4', planId: 's3', date: '2026-09-09', status: 'done', actualMinutes: 172, invoiceId: 'i4' },
  { id: 'v5', planId: 's3', date: '2026-09-16', status: 'done', actualMinutes: 168 },
  { id: 'v6', planId: 's7', date: '2026-09-08', status: 'done', actualMinutes: 265, invoiceId: 'i5' },
  { id: 'v7', planId: 's7', date: '2026-09-15', status: 'done', actualMinutes: 240 },
  { id: 'v8', planId: 's4', date: '2026-09-08', status: 'done', actualMinutes: 130, notes: 'Grass was well away, took longer.' },
  { id: 'v9', planId: 's6', date: '2026-09-09', status: 'done', actualMinutes: 102, invoiceId: 'i6' },
  { id: 'v10', planId: 's6', date: '2026-09-16', status: 'done', actualMinutes: 99 },
  { id: 'v11', planId: 's5', date: '2026-09-02', status: 'skipped', notes: 'Rained out, rebooked.' },
  { id: 'v12', planId: 's2', date: '2026-09-15', status: 'done', actualMinutes: 88 },
];

export const customerById = (id: string) => customers.find((c) => c.id === id);
export const propertyById = (id: string) => properties.find((p) => p.id === id);
export const planById = (id: string) => plans.find((p) => p.id === id);
export const lookup = { plans, customerById, propertyById };

export const propertiesFor = (customerId: string) =>
  properties.filter((p) => p.customerId === customerId);
export const plansFor = (customerId: string) =>
  plans.filter((p) => p.customerId === customerId);
export const visitsForPlan = (planId: string) =>
  visits.filter((v) => v.planId === planId).sort((a, b) => b.date.localeCompare(a.date));
export const visitsFor = (customerId: string) =>
  visits
    .filter((v) => plansFor(customerId).some((p) => p.id === v.planId))
    .sort((a, b) => b.date.localeCompare(a.date));
