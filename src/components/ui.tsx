export const card = 'rounded-xl border border-black/10 bg-white p-4 sm:p-5';
export const legend =
  'text-xs font-semibold uppercase tracking-wider text-bark/50';

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className={card}>
      <p className={legend}>{label}</p>
      <p className="mt-1 text-2xl font-bold text-leaf">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-bark/50">{hint}</p>}
    </div>
  );
}

const FREQUENCY_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Every 4 weeks',
  onceOff: 'One off',
};

export function FrequencyTag({ frequency }: { frequency: string }) {
  return (
    <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-[11px] font-medium text-leaf">
      {FREQUENCY_LABEL[frequency] ?? frequency}
    </span>
  );
}
