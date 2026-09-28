/**
 * The shared kit.
 *
 * Everything that appears on more than one screen lives here, for one reason:
 * before this, a job's status was coloured in three different places with
 * three different maps, and an invoice's in a fourth. They had drifted — the
 * same word was a different colour depending on which page you were on. One
 * definition each now, so adding a status is a one-line change and cannot
 * disagree with itself.
 */

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export const card =
  'rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(22,32,27,0.04)] sm:p-5';

/** A card you can press. Lifts slightly, so it reads as a target. */
export const cardLink =
  `${card} block transition hover:-translate-y-0.5 hover:border-leaf-line hover:shadow-[0_6px_16px_rgba(22,32,27,0.08)]`;

export const legend =
  'text-[11px] font-semibold uppercase tracking-[0.12em] text-muted';

// ---------------------------------------------------------------------------
// Buttons
//
// Minimum height 44px throughout: that is Apple's tap target, and this gets
// used one-handed with work gloves on.
// ---------------------------------------------------------------------------

const btnBase =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40';

/** The one thing this screen is for. */
export const btnPrimary =
  `${btnBase} bg-leaf text-white shadow-sm hover:bg-leaf-deep`;

/**
 * The press that earns money — invoicing, sending, taking a payment.
 * Hi-vis under dark ink, the way it works on a vest.
 */
export const btnGo =
  `${btnBase} bg-hivis text-ink shadow-sm hover:bg-hivis-bright`;

export const btnSecondary =
  `${btnBase} border border-leaf bg-transparent text-leaf hover:bg-leaf-soft`;

export const btnQuiet =
  `${btnBase} border border-line bg-surface text-muted hover:border-faint hover:text-ink`;

/** Small, for the third or fourth action inside a card. */
export const btnSmall =
  'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-leaf px-3.5 text-xs font-semibold text-leaf transition hover:bg-leaf-soft active:scale-[0.98]';

/** Deleting something. Stays quiet until you hover it. */
export const btnDanger =
  'text-xs font-medium text-faint transition hover:text-red-600';

export const input =
  'mt-1 w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition placeholder:text-faint focus:border-leaf focus:ring-4 focus:ring-leaf/10';

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export type Tone =
  | 'leaf'
  | 'hivis'
  | 'clay'
  | 'sky'
  | 'warn'
  | 'bad'
  | 'neutral'
  | 'done';

const TONE: Record<Tone, string> = {
  leaf: 'bg-leaf-soft text-leaf',
  hivis: 'bg-hivis-soft text-hivis-ink',
  clay: 'bg-clay-soft text-clay',
  sky: 'bg-sky-soft text-sky',
  warn: 'bg-amber-100 text-amber-900',
  bad: 'bg-red-50 text-red-700',
  neutral: 'bg-ink/6 text-muted',
  done: 'bg-leaf text-white',
};

export function Tag({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Statuses — the single source of truth
// ---------------------------------------------------------------------------

/** Where a one-off job is up to. The wording customers would recognise. */
export const JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  quoted: { label: 'Quoted', tone: 'hivis' },
  scheduled: { label: 'Booked in', tone: 'sky' },
  in_progress: { label: 'On the tools', tone: 'clay' },
  done: { label: 'Finished', tone: 'done' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/**
 * Every value the `invoices.status` check constraint allows, including
 * `overdue` — which the app normally works out from the due date rather than
 * storing, but the column permits it and an unlabelled status would show the
 * raw word. ui-statuses.test.ts checks this against the migrations.
 */
export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'sky' },
  paid: { label: 'Paid', tone: 'done' },
  overdue: { label: 'Overdue', tone: 'warn' },
  void: { label: 'Void', tone: 'neutral' },
};

export function StatusTag({
  status,
  of,
}: {
  status: string;
  of: 'job' | 'invoice';
}) {
  const map = of === 'job' ? JOB_STATUS : INVOICE_STATUS;
  const found = map[status] ?? { label: status, tone: 'neutral' as Tone };
  return <Tag tone={found.tone}>{found.label}</Tag>;
}

const FREQUENCY: Record<string, { label: string; tone: Tone }> = {
  weekly: { label: 'Weekly', tone: 'leaf' },
  fortnightly: { label: 'Fortnightly', tone: 'leaf' },
  monthly: { label: 'Every 4 weeks', tone: 'sky' },
  onceOff: { label: 'One off', tone: 'neutral' },
};

export function FrequencyTag({ frequency }: { frequency: string }) {
  const found = FREQUENCY[frequency] ?? { label: frequency, tone: 'neutral' as Tone };
  return <Tag tone={found.tone}>{found.label}</Tag>;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export function Stat({
  label,
  value,
  hint,
  tone = 'leaf',
}: {
  label: string;
  value: string;
  hint?: string;
  /** `hivis` for the figure you are meant to act on. */
  tone?: 'leaf' | 'hivis' | 'ink';
}) {
  const accent =
    tone === 'hivis'
      ? 'text-hivis-ink'
      : tone === 'ink'
        ? 'text-ink'
        : 'text-leaf';

  return (
    <div
      className={`${card} relative overflow-hidden ${
        tone === 'hivis' ? 'border-hivis/60 bg-hivis-soft/40' : ''
      }`}
    >
      <p className={legend}>{label}</p>
      <p className={`tnum mt-1 font-display text-3xl font-extrabold ${accent}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  sub,
  aside,
  children,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  /** The figure or count that belongs beside the title. */
  aside?: React.ReactNode;
  /** Buttons. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {aside}
        {children}
      </div>
    </div>
  );
}

export function SectionHeading({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className={legend}>{children}</h2>
      {aside && <span className="text-xs text-faint">{aside}</span>}
    </div>
  );
}

/**
 * The screen you see before you have any data.
 *
 * Always says what to press next, because an empty screen that only says
 * "nothing here" is a dead end.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${card} mt-5 border-dashed`}>
      <p className="font-display text-base font-bold">{title}</p>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
