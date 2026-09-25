import Link from 'next/link';
import { notFound } from 'next/navigation';
import { card, legend, FrequencyTag } from '@/components/ui';
import { formatMinutes, formatMoney } from '@/lib/format';
import { addDays, formatBusinessDate } from '@/lib/dates';
import {
  dueDates,
  estimateAccuracy,
  today,
  weeklyRecurringCents,
} from '@/lib/crm/schedule';
import { loadRound } from '@/lib/crm/queries';
import { deleteCustomer, removeRecord } from '../actions';
import { invoiceCustomer } from '@/app/invoices/actions';
import {
  finishJob,
  removeClaim,
  removeExtra,
  removeJob,
} from '@/app/jobs/actions';
import { invoiceableVisitsFor } from '@/lib/invoicing/collect';
import {
  asClaimLikes,
  billableClaims,
  billableExtras,
  billableJobs,
  claimsForCustomer,
  extrasForCustomer,
  jobActualsFor,
  jobsForCustomer,
  valueOf,
  type JobActualsMap,
  type OneOffJob,
} from '@/lib/invoicing/jobs';
import { jobLedger } from '@/lib/invoicing/claims';
import { loadReceipts } from '@/lib/receipts/queries';
import { emailConfigured } from '@/lib/email/env';
import { QuoteButtons } from './quote-buttons';
import {
  ClaimForm,
  EditCustomer,
  ExtraForm,
  JobForm,
  PlanForm,
  PropertyForm,
} from './forms';

export const dynamic = 'force-dynamic';

const JOB_STATUS: Record<string, { label: string; style: string }> = {
  quoted: { label: 'Quoted', style: 'bg-bark/10 text-bark/60' },
  scheduled: { label: 'Booked in', style: 'bg-leaf-soft text-leaf' },
  in_progress: { label: 'Started', style: 'bg-amber-100 text-amber-900' },
  done: { label: 'Finished', style: 'bg-leaf text-white' },
  cancelled: { label: 'Cancelled', style: 'bg-bark/10 text-bark/40' },
};

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invoice?: string; why?: string }>;
}) {
  const { id } = await params;
  const { invoice: invoiceFlag, why: invoiceWhy } = await searchParams;

  const [round, jobs, extras, claims, receiptList, actuals] = await Promise.all([
    loadRound(),
    jobsForCustomer(id),
    extrasForCustomer(id),
    claimsForCustomer(id),
    loadReceipts(id),
    jobActualsFor(id),
  ]);
  const claimLikes = asClaimLikes(claims);
  const receipts = receiptList.receipts;

  const customer = round.customerById(id);
  if (!customer) notFound();

  const date = today();
  const plans = round.plansFor(id);
  const properties = round.propertiesFor(id);
  const history = round.visitsFor(id);
  const accuracy = estimateAccuracy(history, (planId) =>
    round.planById(planId)?.estimatedMinutes,
  );

  const propertyOptions = properties.map((property) => ({
    id: property.id,
    label: `${property.addressLine}, ${property.suburb}`,
  }));
  const labelFor = (propertyId?: string) =>
    propertyOptions.find((option) => option.id === propertyId)?.label;

  // Everything that would go on an invoice if you pressed the button now.
  const unbilledVisits = invoiceableVisitsFor(round, id);
  const unbilledJobs = billableJobs(jobs, labelFor, claimLikes, actuals);
  const unbilledClaims = billableClaims(claims, jobs, labelFor);
  const unbilledExtras = billableExtras(extras);
  const unbilledCents =
    unbilledVisits.reduce((t, v) => t + v.priceCents, 0) +
    unbilledJobs.reduce((t, j) => t + j.priceCents + j.materialsCents, 0) +
    unbilledClaims.reduce((t, c) => t + c.amountCents, 0) +
    unbilledExtras.reduce((t, e) => t + e.amountCents, 0);
  const unbilledCount =
    unbilledVisits.length +
    unbilledJobs.length +
    unbilledClaims.length +
    unbilledExtras.length;

  const openJobs = jobs.filter(
    (job) => job.status !== 'cancelled' && job.status !== 'done',
  );
  const jobsPipeline = openJobs.reduce(
    (t, job) => t + valueOf(job, actuals).totalCents,
    0,
  );

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/customers" className="text-sm text-bark/50 hover:text-bark">
        ← Customers
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">{customer.name}</h1>
        <div className="text-right text-sm">
          <span className="font-semibold text-leaf">
            {formatMoney(weeklyRecurringCents(plans))}/wk
          </span>
          {jobsPipeline > 0 && (
            <span className="text-bark/50">
              {' '}
              · {formatMoney(jobsPipeline)} in jobs
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-bark/60">
        {[customer.phone, customer.email].filter(Boolean).join(' · ') ||
          'No contact details'}{' '}
        · since {formatBusinessDate(customer.since)}
      </p>

      {/* Two kinds of quote, and they are genuinely different tools, so both
          doors are here and both say which is which. Their details and
          addresses come across either way rather than being retyped. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/quotes/new?customer=${customer.id}`}
          className="rounded-lg border border-leaf px-4 py-2 text-sm font-medium text-leaf hover:bg-leaf-soft"
        >
          Quote a mow
          <span className="block text-xs font-normal text-bark/50">
            Measures the block, prices the round
          </span>
        </Link>
        <a
          href="#jobs"
          className="rounded-lg border border-leaf px-4 py-2 text-sm font-medium text-leaf hover:bg-leaf-soft"
        >
          Quote a job
          <span className="block text-xs font-normal text-bark/50">
            Construction, cleanups, cost plus
          </span>
        </a>
      </div>

      {invoiceFlag === 'nothing' && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Nothing to invoice yet. Tick a visit off the run sheet, mark a job
          finished, or add an extra line below.
        </p>
      )}
      {invoiceFlag === 'failed' && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">Could not create the invoice.</p>
          {invoiceWhy && (
            <p className="mt-1 font-mono text-xs break-words">{invoiceWhy}</p>
          )}
          <p className="mt-1 text-xs">
            If that mentions a column, the database is missing a migration.
            Send me the message and I will tell you which one.
          </p>
        </div>
      )}

      {/* ---------- invoicing ---------- */}
      <section className={`${card} mt-5`}>
        <p className={legend}>Invoicing</p>
        {unbilledCount === 0 ? (
          <p className="mt-2 text-sm text-bark/60">
            Nothing waiting to be billed.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm">
              <b>{formatMoney(unbilledCents)}</b> ready to invoice —{' '}
              {[
                unbilledVisits.length && `${unbilledVisits.length} visit${unbilledVisits.length === 1 ? '' : 's'}`,
                unbilledJobs.length && `${unbilledJobs.length} job${unbilledJobs.length === 1 ? '' : 's'}`,
                unbilledClaims.length && `${unbilledClaims.length} progress claim${unbilledClaims.length === 1 ? '' : 's'}`,
                unbilledExtras.length && `${unbilledExtras.length} extra line${unbilledExtras.length === 1 ? '' : 's'}`,
              ]
                .filter(Boolean)
                .join(', ')}
              .
            </p>
            <form action={invoiceCustomer} className="mt-3">
              <input type="hidden" name="customerId" value={customer.id} />
              <button
                type="submit"
                className="rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90"
              >
                Invoice for work done
              </button>
            </form>
            <p className="mt-2 text-xs text-bark/45">
              Makes a draft you read before anything is sent.
            </p>
          </>
        )}
      </section>

      {/* ---------- details ---------- */}
      <Panel title="Contact details" summary="Change the name, phone or email">
        <EditCustomer
          id={customer.id}
          name={customer.name}
          phone={customer.phone}
          email={customer.email}
        />
      </Panel>

      {/* ---------- addresses ---------- */}
      <section className="mt-6">
        <h2 className={legend}>Addresses</h2>
        {properties.length === 0 ? (
          <p className={`${card} mt-2 text-sm text-bark/50`}>
            No address on file. Add one below — plans and jobs hang off it.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {properties.map((property) => (
              <li key={property.id} className={`${card} text-sm`}>
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-medium">{property.addressLine}</span>
                    <span className="text-bark/60">, {property.suburb}</span>
                    {property.lawnAreaM2 ? (
                      <span className="ml-2 text-xs text-bark/45">
                        lawn {property.lawnAreaM2} m²
                      </span>
                    ) : null}
                    {property.accessNotes && (
                      <span className="mt-1 block text-xs text-amber-800">
                        ⚠ {property.accessNotes}
                      </span>
                    )}
                  </summary>
                  <div className="mt-3 border-t border-black/5 pt-3">
                    <PropertyForm
                      customerId={customer.id}
                      property={{
                        id: property.id,
                        addressLine: property.addressLine,
                        suburb: property.suburb,
                        postcode: property.postcode,
                        accessNotes: property.accessNotes,
                        lawnAreaM2: property.lawnAreaM2,
                      }}
                    />
                    <form action={removeRecord} className="mt-3">
                      <input type="hidden" name="table" value="properties" />
                      <input type="hidden" name="id" value={property.id} />
                      <input type="hidden" name="customerId" value={customer.id} />
                      <button
                        type="submit"
                        className="text-xs text-bark/40 hover:text-red-600"
                      >
                        Remove this address
                      </button>
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <Panel title="Add an address" summary="Add an address">
          <PropertyForm customerId={customer.id} />
        </Panel>
      </section>

      {/* ---------- the round ---------- */}
      <section className="mt-6">
        <h2 className={legend}>On the round</h2>
        {plans.length === 0 ? (
          <p className={`${card} mt-2 text-sm text-bark/50`}>
            Not on the round. That is fine for one-off and construction work —
            add a plan below if they want regular visits.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {plans.map((plan) => {
              const property = round.propertyById(plan.propertyId);
              const next = dueDates(plan, date, addDays(date, 90))[0];
              return (
                <li key={plan.id} className={`${card} text-sm`}>
                  <details>
                    <summary className="cursor-pointer">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <FrequencyTag frequency={plan.frequency} />
                        <span className="font-medium">
                          {property?.addressLine ?? 'Unknown address'}
                        </span>
                        <span className="text-bark/60">
                          {formatMoney(plan.priceCents)} ·{' '}
                          {formatMinutes(plan.estimatedMinutes)}
                        </span>
                        {!plan.active && (
                          <span className="rounded-full bg-bark/10 px-2 py-0.5 text-[11px] text-bark/50">
                            stopped
                          </span>
                        )}
                        {plan.pausedUntil && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
                            paused to {formatBusinessDate(plan.pausedUntil)}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-bark/45">
                        {next ? `Next due ${formatBusinessDate(next)}` : 'Nothing due'}
                      </span>
                    </summary>
                    <div className="mt-3 border-t border-black/5 pt-3">
                      <PlanForm
                        customerId={customer.id}
                        properties={propertyOptions}
                        today={date}
                        plan={{
                          id: plan.id,
                          propertyId: plan.propertyId,
                          frequency: plan.frequency,
                          anchorDate: plan.anchorDate,
                          packageKey: plan.packageKey,
                          priceCents: plan.priceCents,
                          estimatedMinutes: plan.estimatedMinutes,
                          active: plan.active,
                          pausedUntil: plan.pausedUntil,
                        }}
                      />
                      <form action={removeRecord} className="mt-3">
                        <input type="hidden" name="table" value="service_plans" />
                        <input type="hidden" name="id" value={plan.id} />
                        <input type="hidden" name="customerId" value={customer.id} />
                        <button
                          type="submit"
                          className="text-xs text-bark/40 hover:text-red-600"
                        >
                          Remove this plan
                        </button>
                      </form>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <Panel title="Add a plan" summary="Put them on the round">
          <PlanForm
            customerId={customer.id}
            properties={propertyOptions}
            today={date}
          />
        </Panel>
      </section>

      {/* ---------- one-off jobs ---------- */}
      <section id="jobs" className="mt-6 scroll-mt-4">
        <h2 className={legend}>Jobs</h2>
        <p className="mt-1 text-xs text-bark/45">
          Construction, cleanups, anything that happens once — at a price you
          quoted or at cost plus. Add one, and the quote to send them is on it.
          Mark it finished and it becomes invoiceable.
        </p>
        {jobs.length === 0 ? (
          <p className={`${card} mt-2 text-sm text-bark/50`}>No jobs yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {jobs.map((job) => {
              const status = JOB_STATUS[job.status] ?? {
                label: job.status,
                style: 'bg-bark/10',
              };
              return (
                <li key={job.id} className={`${card} text-sm`}>
                  <details>
                    <summary className="cursor-pointer">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.style}`}
                        >
                          {status.label}
                        </span>
                        <span className="font-medium">{job.title}</span>
                        <span className="text-bark/60">
                          {formatMoney(valueOf(job, actuals).totalCents)}
                        </span>
                        {job.pricing === 'costPlus' && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
                            cost plus
                          </span>
                        )}
                        {job.invoiceId && (
                          <span className="text-[11px] text-bark/40">invoiced</span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-bark/45">
                        {labelFor(job.propertyId) ?? 'No address'}
                        {job.scheduledFor &&
                          ` · booked ${formatBusinessDate(job.scheduledFor)}`}
                        {job.completedOn &&
                          ` · finished ${formatBusinessDate(job.completedOn)}`}
                      </span>
                    </summary>
                    <div className="mt-3 border-t border-black/5 pt-3">
                      {job.invoiceId ? (
                        <p className="text-xs text-bark/50">
                          This job has been invoiced, so it is locked. Cancel
                          the invoice to change it.
                        </p>
                      ) : (
                        <>
                          <QuoteButtons
                            jobId={job.id}
                            customerEmail={customer.email}
                            sentAt={job.quoteSentAt}
                            emailReady={emailConfigured}
                          />

                          {job.status !== 'done' && (
                            <form action={finishJob} className="mb-3">
                              <input type="hidden" name="id" value={job.id} />
                              <input
                                type="hidden"
                                name="customerId"
                                value={customer.id}
                              />
                              <button
                                type="submit"
                                className="rounded-lg border border-leaf px-4 py-2 text-xs font-medium text-leaf hover:bg-leaf-soft"
                              >
                                Mark finished today
                              </button>
                            </form>
                          )}
                          <JobClaims
                            job={job}
                            actuals={actuals}
                            claims={claims.filter((c) => c.jobId === job.id)}
                            customerId={customer.id}
                            today={date}
                          />

                          <JobForm
                            customerId={customer.id}
                            properties={propertyOptions}
                            job={job}
                          />
                          <form action={removeJob} className="mt-3">
                            <input type="hidden" name="id" value={job.id} />
                            <input type="hidden" name="customerId" value={customer.id} />
                            <button
                              type="submit"
                              className="text-xs text-bark/40 hover:text-red-600"
                            >
                              Delete this job
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <Panel title="Add a job" summary="Add a job">
          <JobForm customerId={customer.id} properties={propertyOptions} />
        </Panel>
      </section>

      {/* ---------- extra lines ---------- */}
      <section className="mt-6">
        <h2 className={legend}>Extra charges</h2>
        {extras.length > 0 && (
          <ul className="mt-2 space-y-1">
            {extras.map((extra) => (
              <li
                key={extra.id}
                className={`${card} flex flex-wrap items-baseline gap-x-3 py-2 text-sm`}
              >
                <span className="w-28 shrink-0 text-bark/50">
                  {formatBusinessDate(extra.incurredOn)}
                </span>
                <span className="min-w-0 flex-1">{extra.description}</span>
                <span
                  className={`font-semibold ${extra.amountCents < 0 ? 'text-amber-800' : 'text-leaf'}`}
                >
                  {formatMoney(extra.amountCents)}
                </span>
                {extra.invoiceId ? (
                  <span className="text-[11px] text-bark/40">invoiced</span>
                ) : (
                  <form action={removeExtra}>
                    <input type="hidden" name="id" value={extra.id} />
                    <input type="hidden" name="customerId" value={customer.id} />
                    <button
                      type="submit"
                      aria-label="Remove"
                      className="px-1 text-bark/30 hover:text-red-600"
                    >
                      ×
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <Panel title="Add a charge" summary="Add materials, a callout or a discount">
          <ExtraForm customerId={customer.id} today={date} />
        </Panel>
      </section>

      {/* ---------- receipts ---------- */}
      {receipts.length > 0 && (
        <section className="mt-6">
          <h2 className={legend}>Receipts</h2>
          <p className="mt-1 text-xs text-bark/45">
            What was bought for this customer. The charged-back ones already
            appear above as extra charges.
          </p>
          <ul className="mt-2 flex flex-wrap gap-3">
            {receipts.map((receipt) => (
              <li key={receipt.id} className="w-28">
                {receipt.photoUrl && (
                  <a href={receipt.photoUrl} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={receipt.photoUrl}
                      alt={`Receipt from ${receipt.supplier ?? 'a supplier'}`}
                      className="h-32 w-28 rounded-lg border border-black/10 object-cover hover:border-leaf"
                    />
                  </a>
                )}
                <p className="mt-1 text-xs font-medium">
                  {formatMoney(receipt.amountCents)}
                </p>
                <p className="truncate text-[11px] text-bark/50">
                  {receipt.supplier ?? 'Receipt'}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- history ---------- */}
      <section className="mt-6">
        <h2 className={legend}>Visit history</h2>
        {accuracy && (
          <p className="mt-1 text-xs text-bark/50">
            {accuracy.visits} timed visits, running{' '}
            {accuracy.ratio >= 1
              ? `${Math.round((accuracy.ratio - 1) * 100)}% over`
              : `${Math.round((1 - accuracy.ratio) * 100)}% under`}{' '}
            estimate.
          </p>
        )}
        {history.length === 0 ? (
          <p className={`${card} mt-2 text-sm text-bark/50`}>
            No visits recorded yet. Tick jobs off the run sheet as you do them.
          </p>
        ) : (
          <div className={`${card} mt-2 overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead>
                <tr className={legend}>
                  <th className="pb-2 text-left font-semibold">Date</th>
                  <th className="pb-2 text-left font-semibold">Property</th>
                  <th className="pb-2 text-right font-semibold">Est.</th>
                  <th className="pb-2 text-right font-semibold">Actual</th>
                  <th className="pb-2 text-right font-semibold">Invoiced</th>
                </tr>
              </thead>
              <tbody>
                {history.map((visit) => {
                  const plan = round.planById(visit.planId);
                  const property = plan
                    ? round.propertyById(plan.propertyId)
                    : undefined;
                  const over =
                    visit.actualMinutes && plan
                      ? visit.actualMinutes - plan.estimatedMinutes
                      : null;
                  return (
                    <tr key={visit.id} className="border-t border-black/5">
                      <td className="py-1.5">{formatBusinessDate(visit.date)}</td>
                      <td className="py-1.5 text-bark/60">
                        {property?.addressLine ?? '—'}
                      </td>
                      <td className="py-1.5 text-right text-bark/50">
                        {plan ? formatMinutes(plan.estimatedMinutes) : '—'}
                      </td>
                      <td className="py-1.5 text-right">
                        {visit.status === 'skipped' ? (
                          <span className="text-amber-800">Skipped</span>
                        ) : visit.actualMinutes ? (
                          <>
                            {formatMinutes(visit.actualMinutes)}
                            {over !== null && over !== 0 && (
                              <span className={over > 0 ? 'text-amber-700' : 'text-leaf'}>
                                {' '}({over > 0 ? '+' : ''}{over})
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-1.5 text-right text-bark/50">
                        {visit.invoiceId ? '✓' : visit.status === 'done' ? 'Not yet' : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-bark/45 hover:text-bark">
          Remove this customer
        </summary>
        <div className={`${card} mt-2 border-red-200`}>
          <p className="text-sm text-bark/70">
            Deletes {customer.name}, their {properties.length} address
            {properties.length === 1 ? '' : 'es'}, {plans.length} plan
            {plans.length === 1 ? '' : 's'}, {jobs.length} job
            {jobs.length === 1 ? '' : 's'} and {history.length} visit
            {history.length === 1 ? '' : 's'}. This cannot be undone.
          </p>
          <form action={deleteCustomer} className="mt-3">
            <input type="hidden" name="id" value={customer.id} />
            <button
              type="submit"
              className="rounded-lg border border-red-600 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Delete {customer.name}
            </button>
          </form>
        </div>
      </details>
    </main>
  );
}

/**
 * Billing a big job in stages.
 *
 * Shows the whole picture at once — what it is worth, what has been claimed,
 * what is left — because the question you actually have standing on site is
 * "how much of this have I already billed her for?"
 */
function JobClaims({
  job,
  actuals,
  claims,
  customerId,
  today,
}: {
  job: OneOffJob;
  actuals: JobActualsMap;
  claims: {
    id: string;
    description: string;
    amountCents: number;
    claimedOn: string;
    invoiceId?: string;
  }[];
  customerId: string;
  today: string;
}) {
  const value = valueOf(job, actuals);
  const ledger = jobLedger(
    { id: job.id, totalCents: value.totalCents },
    claims.map((claim) => ({
      claimId: claim.id,
      jobId: job.id,
      amountCents: claim.amountCents,
      invoiceId: claim.invoiceId,
    })),
  );

  return (
    <div className="mb-4 rounded-lg bg-leaf-soft/50 p-3">
      <p className={legend}>
        {value.isCostPlus ? 'Cost plus — what it has come to' : 'Billing in stages'}
      </p>

      {value.isCostPlus && (
        <p className="mt-2 text-xs text-bark/70">
          {(actuals.get(job.id)?.minutesWorked ?? 0) / 60 > 0
            ? `${((actuals.get(job.id)?.minutesWorked ?? 0) / 60).toFixed(1)} hours`
            : 'No hours yet'}{' '}
          at {formatMoney(job.labourRateCents)}/hr ={' '}
          <b>{formatMoney(value.labourCents)}</b>
          {value.materialsCents > 0 && (
            <>
              {' '}· materials <b>{formatMoney(value.materialsCents)}</b>
              {value.markupCents > 0 && (
                <>
                  {' '}+ {job.markupBasisPoints / 100}% ={' '}
                  <b>{formatMoney(value.markupCents)}</b>
                </>
              )}
            </>
          )}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span>
          Job worth <b>{formatMoney(ledger.totalCents)}</b>
        </span>
        <span>
          Claimed <b>{formatMoney(ledger.claimedCents)}</b>
        </span>
        <span className={ledger.remainingCents === 0 ? 'text-bark/45' : 'text-leaf'}>
          Still to bill <b>{formatMoney(ledger.remainingCents)}</b>
        </span>
      </div>

      {ledger.overClaimed && (
        <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
          The stages add up to more than the job is worth. Check them before
          you invoice.
        </p>
      )}

      {claims.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {claims.map((claim) => (
            <li key={claim.id} className="flex items-baseline gap-2">
              <span className="w-24 shrink-0 text-bark/50">
                {formatBusinessDate(claim.claimedOn)}
              </span>
              <span className="min-w-0 flex-1">{claim.description}</span>
              <span className="font-medium">{formatMoney(claim.amountCents)}</span>
              {claim.invoiceId ? (
                <span className="text-bark/40">invoiced</span>
              ) : (
                <>
                  <span className="text-leaf">on next invoice</span>
                  <form action={removeClaim}>
                    <input type="hidden" name="id" value={claim.id} />
                    <input type="hidden" name="customerId" value={customerId} />
                    <button
                      type="submit"
                      aria-label="Remove claim"
                      className="px-1 text-bark/30 hover:text-red-600"
                    >
                      ×
                    </button>
                  </form>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {value.isCostPlus && (
        <p className="mt-2 text-xs text-bark/45">
          This figure moves as hours are logged and receipts filed against the
          job. Log hours to it on the{' '}
          <Link href="/timesheet" className="text-leaf hover:underline">
            timesheet
          </Link>
          , and pick it when you{' '}
          <Link href="/receipts" className="text-leaf hover:underline">
            photograph a receipt
          </Link>
          . A receipt against a cost-plus job is billed by the job, so do not
          also charge it back as an extra.
        </p>
      )}

      {ledger.remainingCents > 0 ? (
        <div className="mt-3 border-t border-black/5 pt-3">
          <ClaimForm
            jobId={job.id}
            customerId={customerId}
            today={today}
            remainingLabel={formatMoney(ledger.remainingCents)}
          />
        </div>
      ) : (
        /* Saying why the form is not here. A cost-plus job with nothing
           logged has nothing to bill yet, which is not the same as being
           fully claimed. */
        <p className="mt-3 border-t border-black/5 pt-3 text-xs text-bark/50">
          {value.isCostPlus && value.totalCents === 0
            ? 'Nothing to bill in stages yet — log the hours or file the receipts against this job first.'
            : 'Every dollar of this job has been claimed already.'}
        </p>
      )}
    </div>
  );
}

/** A disclosure that keeps a form out of the way until it is wanted. */
function Panel({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-medium text-leaf hover:underline">
        + {summary}
      </summary>
      <div className={`${card} mt-2`}>
        <p className={legend}>{title}</p>
        <div className="mt-3">{children}</div>
      </div>
    </details>
  );
}
