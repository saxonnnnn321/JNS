import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  btnGo,
  btnDanger,
  btnSecondary,
  btnSmall,
  card,
  legend,
  FrequencyTag,
  PageHeader,
  StatusTag,
  Tag,
} from '@/components/ui';
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
      <Link href="/customers" className="text-sm text-muted hover:text-bark">
        ← Customers
      </Link>

      <div className="mt-2">
        <PageHeader
          title={customer.name}
          sub={
            <>
              {/* Tappable on a phone: you are usually looking at this to ring
                  them from the driveway. */}
              {customer.phone ? (
                <a href={`tel:${customer.phone}`} className="font-medium text-leaf hover:underline">
                  {customer.phone}
                </a>
              ) : null}
              {customer.phone && customer.email ? ' · ' : null}
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className="hover:underline">
                  {customer.email}
                </a>
              ) : null}
              {!customer.phone && !customer.email ? 'No contact details' : null}
              {' · since '}
              {formatBusinessDate(customer.since)}
            </>
          }
          aside={
            <div className="flex gap-3 text-right">
              {weeklyRecurringCents(plans) > 0 && (
                <div>
                  <p className={legend}>On the round</p>
                  <p className="tnum font-display text-2xl font-extrabold text-leaf">
                    {formatMoney(weeklyRecurringCents(plans))}
                    <span className="text-sm font-bold text-faint">/wk</span>
                  </p>
                </div>
              )}
              {jobsPipeline > 0 && (
                <div>
                  <p className={legend}>In jobs</p>
                  <p className="tnum font-display text-2xl font-extrabold text-clay">
                    {formatMoney(jobsPipeline)}
                  </p>
                </div>
              )}
            </div>
          }
        />
      </div>

      {/* Two kinds of quote, and they are genuinely different tools, so both
          doors are here and both say which is which. Their details and
          addresses come across either way rather than being retyped. */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/quotes/new?customer=${customer.id}`}
          className="flex-1 rounded-xl border border-leaf-line bg-leaf-soft/60 px-4 py-3 text-sm font-bold text-leaf transition hover:border-leaf hover:bg-leaf-soft sm:flex-none"
        >
          🌱 Quote a mow
          <span className="mt-0.5 block text-xs font-medium text-muted">
            Measures the block, prices the round
          </span>
        </Link>
        <a
          href="#jobs"
          className="flex-1 rounded-xl border border-clay-line bg-clay-soft/60 px-4 py-3 text-sm font-bold text-clay transition hover:border-clay hover:bg-clay-soft sm:flex-none"
        >
          🧱 Quote a job
          <span className="mt-0.5 block text-xs font-medium text-muted">
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
      <section
        className={`${card} mt-5 ${
          unbilledCount > 0 ? 'border-hivis/70 bg-hivis-soft/50' : ''
        }`}
      >
        <p className={legend}>Invoicing</p>
        {unbilledCount === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nothing waiting to be billed.
          </p>
        ) : (
          <>
            <p className="tnum mt-1 font-display text-3xl font-extrabold text-ink">
              {formatMoney(unbilledCents)}
            </p>
            <p className="mt-1 text-sm text-muted">
              ready to invoice —{' '}
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
              <button type="submit" className={btnGo}>
                Invoice for work done
              </button>
            </form>
            <p className="mt-2 text-xs text-muted">
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
          <p className={`${card} mt-2 text-sm text-muted`}>
            No address on file. Add one below — plans and jobs hang off it.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {properties.map((property) => (
              <li key={property.id} className={`${card} text-sm`}>
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-medium">{property.addressLine}</span>
                    <span className="text-muted">, {property.suburb}</span>
                    {property.lawnAreaM2 ? (
                      <span className="ml-2 text-xs text-faint">
                        lawn {property.lawnAreaM2} m²
                      </span>
                    ) : null}
                    {property.accessNotes && (
                      <span className="mt-1 block text-xs text-amber-800">
                        ⚠ {property.accessNotes}
                      </span>
                    )}
                  </summary>
                  <div className="mt-3 border-t border-line pt-3">
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
                        className="text-xs text-faint hover:text-red-600"
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
          <p className={`${card} mt-2 text-sm text-muted`}>
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
                        <span className="text-muted">
                          {formatMoney(plan.priceCents)} ·{' '}
                          {formatMinutes(plan.estimatedMinutes)}
                        </span>
                        {!plan.active && (
                          <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[11px] text-muted">
                            stopped
                          </span>
                        )}
                        {plan.pausedUntil && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
                            paused to {formatBusinessDate(plan.pausedUntil)}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-faint">
                        {next ? `Next due ${formatBusinessDate(next)}` : 'Nothing due'}
                      </span>
                    </summary>
                    <div className="mt-3 border-t border-line pt-3">
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
                          className="text-xs text-faint hover:text-red-600"
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
        <p className="mt-1 text-xs text-faint">
          Construction, cleanups, anything that happens once — at a price you
          quoted or at cost plus. Add one, and the quote to send them is on it.
          Mark it finished and it becomes invoiceable.
        </p>
        {jobs.length === 0 ? (
          <p className={`${card} mt-2 text-sm text-muted`}>No jobs yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {jobs.map((job) => {
              return (
                <li key={job.id} className={`${card} text-sm`}>
                  <details>
                    <summary className="cursor-pointer">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <StatusTag status={job.status} of="job" />
                        <span className="font-medium">{job.title}</span>
                        <span className="text-muted">
                          {formatMoney(valueOf(job, actuals).totalCents)}
                        </span>
                        {job.pricing === 'costPlus' && (
                          <Tag tone="clay">cost plus</Tag>
                        )}
                        {job.invoiceId && (
                          <span className="text-[11px] text-faint">invoiced</span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-faint">
                        {labelFor(job.propertyId) ?? 'No address'}
                        {job.scheduledFor &&
                          ` · booked ${formatBusinessDate(job.scheduledFor)}`}
                        {job.completedOn &&
                          ` · finished ${formatBusinessDate(job.completedOn)}`}
                      </span>
                    </summary>
                    <div className="mt-3 border-t border-line pt-3">
                      {job.invoiceId ? (
                        <p className="text-xs text-muted">
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
                              className="text-xs text-faint hover:text-red-600"
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
                <span className="w-28 shrink-0 text-muted">
                  {formatBusinessDate(extra.incurredOn)}
                </span>
                <span className="min-w-0 flex-1">{extra.description}</span>
                <span
                  className={`font-semibold ${extra.amountCents < 0 ? 'text-amber-800' : 'text-leaf'}`}
                >
                  {formatMoney(extra.amountCents)}
                </span>
                {extra.invoiceId ? (
                  <span className="text-[11px] text-faint">invoiced</span>
                ) : (
                  <form action={removeExtra}>
                    <input type="hidden" name="id" value={extra.id} />
                    <input type="hidden" name="customerId" value={customer.id} />
                    <button
                      type="submit"
                      aria-label="Remove"
                      className="px-1 text-faint hover:text-red-600"
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
          <p className="mt-1 text-xs text-faint">
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
                      className="h-32 w-28 rounded-lg border border-line object-cover hover:border-leaf"
                    />
                  </a>
                )}
                <p className="mt-1 text-xs font-medium">
                  {formatMoney(receipt.amountCents)}
                </p>
                <p className="truncate text-[11px] text-muted">
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
          <p className="mt-1 text-xs text-muted">
            {accuracy.visits} timed visits, running{' '}
            {accuracy.ratio >= 1
              ? `${Math.round((accuracy.ratio - 1) * 100)}% over`
              : `${Math.round((1 - accuracy.ratio) * 100)}% under`}{' '}
            estimate.
          </p>
        )}
        {history.length === 0 ? (
          <p className={`${card} mt-2 text-sm text-muted`}>
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
                    <tr key={visit.id} className="border-t border-line">
                      <td className="py-1.5">{formatBusinessDate(visit.date)}</td>
                      <td className="py-1.5 text-muted">
                        {property?.addressLine ?? '—'}
                      </td>
                      <td className="py-1.5 text-right text-muted">
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
                      <td className="py-1.5 text-right text-muted">
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
        <summary className="cursor-pointer text-sm text-faint hover:text-bark">
          Remove this customer
        </summary>
        <div className={`${card} mt-2 border-red-200`}>
          <p className="text-sm text-ink">
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
        <p className="mt-2 text-xs text-ink">
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
        <span className={ledger.remainingCents === 0 ? 'text-faint' : 'text-leaf'}>
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
              <span className="w-24 shrink-0 text-muted">
                {formatBusinessDate(claim.claimedOn)}
              </span>
              <span className="min-w-0 flex-1">{claim.description}</span>
              <span className="font-medium">{formatMoney(claim.amountCents)}</span>
              {claim.invoiceId ? (
                <span className="text-faint">invoiced</span>
              ) : (
                <>
                  <span className="text-leaf">on next invoice</span>
                  <form action={removeClaim}>
                    <input type="hidden" name="id" value={claim.id} />
                    <input type="hidden" name="customerId" value={customerId} />
                    <button
                      type="submit"
                      aria-label="Remove claim"
                      className="px-1 text-faint hover:text-red-600"
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
        <p className="mt-2 text-xs text-faint">
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
        <div className="mt-3 border-t border-line pt-3">
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
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
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
