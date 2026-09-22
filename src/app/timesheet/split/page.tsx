import Link from 'next/link';
import { card, legend } from '@/components/ui';
import { formatMinutes, formatMoney } from '@/lib/format';
import { addDays, formatBusinessDate } from '@/lib/dates';
import { today, weekStart } from '@/lib/crm/schedule';
import { loadPeriodBooks } from '@/lib/partners/queries';

export const dynamic = 'force-dynamic';

export default async function SplitPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const date = today();
  const from = params.from ?? weekStart(date);
  const to = params.to ?? addDays(from, 6);

  const books = await loadPeriodBooks(from, to);
  const { split } = books;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/timesheet?from=${from}&to=${to}`} className="text-sm text-bark/50 hover:text-bark">
        ← Timesheet
      </Link>
      <h1 className="mt-2 text-2xl font-bold">The split</h1>
      <p className="mt-1 text-sm text-bark/60">
        {formatBusinessDate(from)} – {formatBusinessDate(to)}
      </p>

      {books.notConfigured ? (
        <div className={`${card} mt-5`}>
          <p className="font-semibold">Nothing to split yet.</p>
          <p className="mt-1 text-sm text-bark/60">
            Run migration 0004 in Supabase, then log some hours.
          </p>
        </div>
      ) : (
        <>
          {split.warnings.map((warning) => (
            <p
              key={warning}
              className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
            >
              {warning}
            </p>
          ))}

          {/* ---------- where the money went ---------- */}
          <section className={`${card} mt-5`}>
            <p className={legend}>Where the money went</p>
            <dl className="mt-3 space-y-2 text-sm">
              <Line label="Income" value={formatMoney(split.incomeCents)} strong />
              <Line
                label={`Less the business cut (${(books.retentionBasisPoints / 100).toFixed(0)}%)`}
                value={`− ${formatMoney(split.retentionCents)}`}
                hint="Fuel, insurance, gear, repairs and the tax that is coming."
              />
              <Line label="Left to share" value={formatMoney(split.poolCents)} rule />
              <Line
                label="Less wages for hours worked"
                value={`− ${formatMoney(split.wagesCents)}`}
                hint="Each partner's own rate × their own hours. Unequal on purpose."
              />
              <Line
                label="Profit, split by ownership"
                value={formatMoney(split.profitCents)}
                strong
                rule
                negative={split.profitCents < 0}
              />
            </dl>
          </section>

          {/* ---------- each partner ---------- */}
          <section className="mt-6">
            <h2 className={legend}>Each of you</h2>
            <div className={`${card} mt-2 overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={legend}>
                    <th className="pb-2 text-left font-semibold">Partner</th>
                    <th className="pb-2 text-right font-semibold">Hours</th>
                    <th className="pb-2 text-right font-semibold">Wage</th>
                    <th className="pb-2 text-right font-semibold">Profit</th>
                    <th className="pb-2 text-right font-semibold">Earned</th>
                    <th className="pb-2 text-right font-semibold">Took</th>
                    <th className="pb-2 text-right font-semibold">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {split.partners.map((partner) => (
                    <tr key={partner.id} className="border-t border-black/5">
                      <td className="py-2 font-medium">{partner.name}</td>
                      <td className="py-2 text-right text-bark/60">
                        {formatMinutes(partner.minutesWorked)}
                      </td>
                      <td className="py-2 text-right">{formatMoney(partner.wageCents)}</td>
                      <td
                        className={`py-2 text-right ${partner.profitShareCents < 0 ? 'text-red-600' : ''}`}
                      >
                        {formatMoney(partner.profitShareCents)}
                      </td>
                      <td className="py-2 text-right font-semibold">
                        {formatMoney(partner.earnedCents)}
                      </td>
                      <td className="py-2 text-right text-bark/60">
                        {formatMoney(partner.drawnCents)}
                      </td>
                      <td
                        className={`py-2 text-right font-semibold ${
                          partner.balanceCents < 0 ? 'text-red-600' : 'text-leaf'
                        }`}
                      >
                        {partner.balanceCents > 0 ? '+' : ''}
                        {formatMoney(partner.balanceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-bark/50">
              A negative balance means that partner has taken more than they
              earned this period and owes it back. A positive one means the
              business still owes them.
            </p>
          </section>

          {/* ---------- the answer ---------- */}
          <section
            className={`${card} mt-6 ${split.settlement ? 'border-leaf bg-leaf-soft' : ''}`}
          >
            <p className={legend}>Squaring up</p>
            {split.settlement ? (
              <>
                <p className="mt-2 text-lg font-bold text-leaf">
                  {split.settlement.fromName} pays {split.settlement.toName}{' '}
                  {formatMoney(split.settlement.amountCents)}
                </p>
                <p className="mt-1 text-sm text-bark/70">
                  That is the one payment that leaves you both level for this
                  period. Anything still outstanding after it is between a
                  partner and the business, not between the two of you.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-bark/70">
                {split.partners.every((p) => p.balanceCents === 0)
                  ? 'Dead even. Nobody owes anybody.'
                  : 'No payment between you two is needed — any balance is with the business rather than with each other.'}
              </p>
            )}
          </section>

          {/* ---------- how it works ---------- */}
          <section className={`${card} mt-6 text-sm`}>
            <p className={legend}>Why it is worked out this way</p>
            <p className="mt-2 text-bark/70">
              You are paid for two different things, and keeping them apart is
              what makes an uneven week fair.
            </p>
            <p className="mt-2 text-bark/70">
              <b>A wage for the hours you did.</b> Unequal on purpose. Work ten
              hours more than the other bloke and you are paid for ten hours
              more — not a cent more than that.
            </p>
            <p className="mt-2 text-bark/70">
              <b>A share of the profit for owning the business.</b> Split by
              ownership, normally half each, and nothing to do with who swung
              the whipper snipper. You both own the mower whether you pushed it
              that week or not.
            </p>
            <p className="mt-2 text-xs text-bark/50">
              Income counts visits marked done, priced from their standing
              plan, plus anything logged by hand. A quiet week where wages
              outrun income shows a negative profit share, which you both wear
              equally — that is what being partners means.
            </p>
          </section>
        </>
      )}
    </main>
  );
}

function Line({
  label,
  value,
  hint,
  strong,
  rule,
  negative,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  rule?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={rule ? 'border-t border-black/10 pt-2' : ''}>
      <div className="flex items-baseline justify-between gap-4">
        <dt className={strong ? 'font-semibold' : 'text-bark/70'}>{label}</dt>
        <dd
          className={`shrink-0 tabular-nums ${strong ? 'font-bold' : ''} ${
            negative ? 'text-red-600' : strong ? 'text-leaf' : ''
          }`}
        >
          {value}
        </dd>
      </div>
      {hint && <p className="mt-0.5 text-xs text-bark/45">{hint}</p>}
    </div>
  );
}
