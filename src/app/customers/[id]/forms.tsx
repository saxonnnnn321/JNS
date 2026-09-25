'use client';

import { useActionState } from 'react';
import {
  addPlan,
  addProperty,
  updateCustomer,
  updatePlan,
  updateProperty,
  type FormResult,
} from '../actions';
import {
  addClaim,
  addExtra,
  addJob,
  updateJob,
  type JobResult,
} from '@/app/jobs/actions';

const input =
  'mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20';
const primary =
  'rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90 disabled:cursor-not-allowed disabled:bg-bark/20';

type Result = FormResult | JobResult;

function Message({ result }: { result: Result }) {
  if (!result) return null;
  return <p className="mt-2 text-xs text-red-600">{result.error}</p>;
}

export type PropertyOption = { id: string; label: string };

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export function EditCustomer({
  id,
  name,
  phone,
  email,
}: {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}) {
  const [result, submit, pending] = useActionState<FormResult, FormData>(
    updateCustomer,
    null,
  );

  return (
    <form action={submit}>
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          Name
          <input name="name" className={input} defaultValue={name} required />
        </label>
        <label className="block text-sm">
          Phone
          <input name="phone" className={input} defaultValue={phone ?? ''} inputMode="tel" />
        </label>
        <label className="block text-sm">
          Email
          <input name="email" className={input} defaultValue={email ?? ''} inputMode="email" />
        </label>
      </div>
      <button type="submit" className={`${primary} mt-3`} disabled={pending}>
        {pending ? 'Saving…' : 'Save details'}
      </button>
      <Message result={result} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

export function PropertyForm({
  customerId,
  property,
}: {
  customerId: string;
  property?: {
    id: string;
    addressLine: string;
    suburb: string;
    postcode?: string;
    accessNotes?: string;
    lawnAreaM2?: number;
  };
}) {
  const [result, submit, pending] = useActionState<FormResult, FormData>(
    property ? updateProperty : addProperty,
    null,
  );

  return (
    <form action={submit}>
      <input type="hidden" name="customerId" value={customerId} />
      {property && <input type="hidden" name="id" value={property.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Street address
          <input
            name="addressLine"
            className={input}
            defaultValue={property?.addressLine ?? ''}
            placeholder="12 Short Street"
            required
          />
        </label>
        <label className="block text-sm">
          Suburb
          <input
            name="suburb"
            className={input}
            defaultValue={property?.suburb ?? ''}
            required
          />
        </label>
        <label className="block text-sm">
          Postcode
          <input
            name="postcode"
            className={input}
            inputMode="numeric"
            defaultValue={property?.postcode ?? ''}
          />
        </label>
        <label className="block text-sm">
          Lawn m²
          <input
            name="lawnAreaM2"
            className={input}
            inputMode="numeric"
            defaultValue={property?.lawnAreaM2 ?? ''}
          />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        Access notes
        <textarea
          name="accessNotes"
          className={input}
          rows={2}
          defaultValue={property?.accessNotes ?? ''}
          placeholder="Side gate, code 1234. Dog in the yard."
        />
      </label>
      <button type="submit" className={`${primary} mt-3`} disabled={pending}>
        {pending ? 'Saving…' : property ? 'Save address' : 'Add address'}
      </button>
      <Message result={result} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Service plan — the recurring round
// ---------------------------------------------------------------------------

export function PlanForm({
  customerId,
  properties,
  today,
  plan,
}: {
  customerId: string;
  properties: PropertyOption[];
  today: string;
  plan?: {
    id: string;
    propertyId: string;
    frequency: string;
    anchorDate: string;
    packageKey: string;
    priceCents: number;
    estimatedMinutes: number;
    active: boolean;
    pausedUntil?: string;
  };
}) {
  const [result, submit, pending] = useActionState<FormResult, FormData>(
    plan ? updatePlan : addPlan,
    null,
  );

  if (properties.length === 0) {
    return (
      <p className="text-sm text-bark/60">
        Add an address first — a plan has to be for somewhere.
      </p>
    );
  }

  return (
    <form action={submit}>
      <input type="hidden" name="customerId" value={customerId} />
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Which address
          <select
            name="propertyId"
            className={input}
            defaultValue={plan?.propertyId ?? properties[0].id}
          >
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          How often
          <select
            name="frequency"
            className={input}
            defaultValue={plan?.frequency ?? 'fortnightly'}
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Every 4 weeks</option>
            <option value="onceOff">Booked once</option>
          </select>
        </label>
        <label className="block text-sm">
          Price a visit
          <input
            name="price"
            className={input}
            inputMode="decimal"
            defaultValue={plan ? (plan.priceCents / 100).toFixed(2) : ''}
            placeholder="$308"
            required
          />
        </label>
        <label className="block text-sm">
          Minutes a visit
          <input
            name="estimatedMinutes"
            className={input}
            inputMode="numeric"
            defaultValue={plan?.estimatedMinutes ?? ''}
            placeholder="112"
            required
          />
        </label>
        <label className="block text-sm">
          First visit
          <input
            type="date"
            name="anchorDate"
            className={input}
            defaultValue={plan?.anchorDate ?? today}
          />
          <span className="mt-1 block text-xs text-bark/45">
            Fixes the weekday every later visit lands on.
          </span>
        </label>
        <label className="block text-sm">
          Package
          <select
            name="packageKey"
            className={input}
            defaultValue={plan?.packageKey ?? 'standard'}
          >
            <option value="standard">Mow, edge and blow</option>
            <option value="fullTidy">Full tidy</option>
          </select>
        </label>
        {plan && (
          <>
            <label className="block text-sm">
              On the round?
              <select
                name="active"
                className={input}
                defaultValue={plan.active ? 'true' : 'false'}
              >
                <option value="true">Active</option>
                <option value="false">Stopped</option>
              </select>
            </label>
            <label className="block text-sm">
              Paused until
              <input
                type="date"
                name="pausedUntil"
                className={input}
                defaultValue={plan.pausedUntil ?? ''}
              />
              <span className="mt-1 block text-xs text-bark/45">
                For winter, or a holiday. Leave empty for none.
              </span>
            </label>
          </>
        )}
      </div>
      <button type="submit" className={`${primary} mt-3`} disabled={pending}>
        {pending ? 'Saving…' : plan ? 'Save plan' : 'Add to the round'}
      </button>
      <Message result={result} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// One-off job — construction and everything that is not the round
// ---------------------------------------------------------------------------

export function JobForm({
  customerId,
  properties,
  job,
}: {
  customerId: string;
  properties: PropertyOption[];
  job?: {
    id: string;
    propertyId?: string;
    title: string;
    description?: string;
    kind: string;
    priceCents: number;
    materialsCents: number;
    estimatedMinutes?: number;
    status: string;
    scheduledFor?: string;
    completedOn?: string;
    notes?: string;
  };
}) {
  const [result, submit, pending] = useActionState<JobResult, FormData>(
    job ? updateJob : addJob,
    null,
  );

  return (
    <form action={submit}>
      <input type="hidden" name="customerId" value={customerId} />
      {job && <input type="hidden" name="id" value={job.id} />}
      <label className="block text-sm">
        What the job is
        <input
          name="title"
          className={input}
          defaultValue={job?.title ?? ''}
          placeholder="Retaining wall, back yard"
          required
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Type
          <select name="kind" className={input} defaultValue={job?.kind ?? 'construction'}>
            <option value="construction">Construction</option>
            <option value="landscaping">Landscaping</option>
            <option value="cleanup">Cleanup</option>
            <option value="maintenance">Maintenance</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block text-sm">
          Where
          <select name="propertyId" className={input} defaultValue={job?.propertyId ?? ''}>
            <option value="">Not tied to an address</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Price agreed
          <input
            name="price"
            className={input}
            inputMode="decimal"
            defaultValue={job ? (job.priceCents / 100).toFixed(2) : ''}
            placeholder="$4,200"
            required
          />
        </label>
        <label className="block text-sm">
          Materials
          <input
            name="materials"
            className={input}
            inputMode="decimal"
            defaultValue={job ? (job.materialsCents / 100).toFixed(2) : ''}
            placeholder="$0"
          />
          <span className="mt-1 block text-xs text-bark/45">
            Billed as its own line, so they can see the split.
          </span>
        </label>
        <label className="block text-sm">
          Where it is up to
          <select name="status" className={input} defaultValue={job?.status ?? 'quoted'}>
            <option value="quoted">Quoted</option>
            <option value="scheduled">Booked in</option>
            <option value="in_progress">Started</option>
            <option value="done">Finished</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <span className="mt-1 block text-xs text-bark/45">
            Only a finished job can be invoiced.
          </span>
        </label>
        <label className="block text-sm">
          Booked for
          <input
            type="date"
            name="scheduledFor"
            className={input}
            defaultValue={job?.scheduledFor ?? ''}
          />
        </label>
        <label className="block text-sm">
          Finished on
          <input
            type="date"
            name="completedOn"
            className={input}
            defaultValue={job?.completedOn ?? ''}
          />
          <span className="mt-1 block text-xs text-bark/45">
            Left empty on a finished job, today is used.
          </span>
        </label>
        <label className="block text-sm">
          Hours expected
          <input
            name="estimatedMinutes"
            className={input}
            inputMode="numeric"
            defaultValue={job?.estimatedMinutes ?? ''}
            placeholder="Minutes"
          />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        Detail
        <textarea
          name="description"
          className={input}
          rows={3}
          defaultValue={job?.description ?? ''}
          placeholder="18m of besser block, 900 high. Excavation, drainage, backfill."
        />
      </label>
      <button type="submit" className={`${primary} mt-3`} disabled={pending}>
        {pending ? 'Saving…' : job ? 'Save job' : 'Add job'}
      </button>
      <Message result={result} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Extra invoice line
// ---------------------------------------------------------------------------

export function ExtraForm({
  customerId,
  today,
}: {
  customerId: string;
  today: string;
}) {
  const [result, submit, pending] = useActionState<JobResult, FormData>(
    addExtra,
    null,
  );

  return (
    <form action={submit}>
      <input type="hidden" name="customerId" value={customerId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm sm:col-span-2">
          What for
          <input
            name="description"
            className={input}
            placeholder="Turf, 40 rolls"
            required
          />
        </label>
        <label className="block text-sm">
          Amount
          <input
            name="amount"
            className={input}
            inputMode="decimal"
            placeholder="$520"
            required
          />
        </label>
      </div>
      <label className="mt-3 block text-sm sm:w-48">
        Date
        <input type="date" name="incurredOn" className={input} defaultValue={today} />
      </label>
      <button type="submit" className={`${primary} mt-3`} disabled={pending}>
        {pending ? 'Saving…' : 'Add line'}
      </button>
      <p className="mt-2 text-xs text-bark/45">
        Goes on their next invoice. A minus sign makes it a discount.
      </p>
      <Message result={result} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Progress claim — billing a stage of a big job
// ---------------------------------------------------------------------------

export function ClaimForm({
  jobId,
  customerId,
  today,
  remainingLabel,
}: {
  jobId: string;
  customerId: string;
  today: string;
  remainingLabel: string;
}) {
  const [result, submit, pending] = useActionState<JobResult, FormData>(
    addClaim,
    null,
  );

  return (
    <form action={submit}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="customerId" value={customerId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm sm:col-span-2">
          What stage
          <input
            name="description"
            className={input}
            placeholder="Slab down and drainage in"
            required
          />
        </label>
        <label className="block text-sm">
          Claim now
          <input
            name="amount"
            className={input}
            inputMode="decimal"
            placeholder="$5,000"
            required
          />
        </label>
      </div>
      <label className="mt-3 block text-sm sm:w-48">
        Date
        <input type="date" name="claimedOn" className={input} defaultValue={today} />
      </label>
      <button type="submit" className={`${primary} mt-3`} disabled={pending}>
        {pending ? 'Saving…' : 'Add progress claim'}
      </button>
      <p className="mt-2 text-xs text-bark/45">
        {remainingLabel} left unclaimed. It goes on their next invoice, and the
        final bill is whatever is still owing.
      </p>
      <Message result={result} />
    </form>
  );
}
