'use client';

import { useActionState } from 'react';
import { logDrawing, logHours, logIncome, type FormResult } from './actions';

const input =
  'mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20';
const primary =
  'rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90 disabled:cursor-not-allowed disabled:bg-bark/20';

export type Person = { id: string; name: string };

function Message({ result }: { result: FormResult }) {
  if (!result) return null;
  if ('ok' in result) {
    return <p className="mt-2 text-xs text-leaf">Saved.</p>;
  }
  return <p className="mt-2 text-xs text-red-600">{result.error}</p>;
}

/**
 * Who the entry is for. Only the owner gets a choice — everyone else can log
 * against themselves and nobody else, which is what the database enforces
 * anyway. Showing a picker that the database would reject is just a trap.
 */
function WhoField({
  people,
  canChoose,
  self,
  name,
}: {
  people: Person[];
  canChoose: boolean;
  self: string;
  name: string;
}) {
  if (!canChoose || people.length < 2) {
    return <input type="hidden" name={name} value={self} />;
  }
  return (
    <label className="block text-sm">
      Who
      <select name={name} className={input} defaultValue={self}>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HoursForm({
  people,
  canChoose,
  self,
  today,
  defaultHours,
  defaultWhat,
}: {
  people: Person[];
  canChoose: boolean;
  self: string;
  today: string;
  /** Prefilled when the app-wide microphone heard "log three hours". */
  defaultHours?: string;
  defaultWhat?: string;
}) {
  const [result, submit, pending] = useActionState<FormResult, FormData>(
    logHours,
    null,
  );

  return (
    <form action={submit}>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          Day
          <input type="date" name="workDate" className={input} defaultValue={today} />
        </label>
        <label className="block text-sm">
          Hours
          <input
            name="hours"
            className={input}
            inputMode="decimal"
            placeholder="6.5"
            defaultValue={defaultHours}
            autoFocus={Boolean(defaultHours)}
            required
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          What you did
          <input
            name="description"
            className={input}
            placeholder="Penrith run, three lawns"
            defaultValue={defaultWhat}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <WhoField people={people} canChoose={canChoose} self={self} name="staffId" />
        <button type="submit" className={primary} disabled={pending}>
          {pending ? 'Saving…' : 'Log hours'}
        </button>
      </div>
      <Message result={result} />
    </form>
  );
}

export function DrawingForm({
  people,
  canChoose,
  self,
  today,
}: {
  people: Person[];
  canChoose: boolean;
  self: string;
  today: string;
}) {
  const [result, submit, pending] = useActionState<FormResult, FormData>(
    logDrawing,
    null,
  );

  return (
    <form action={submit}>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          Day
          <input type="date" name="paidOn" className={input} defaultValue={today} />
        </label>
        <label className="block text-sm">
          Amount
          <input name="amount" className={input} inputMode="decimal" placeholder="$500" required />
        </label>
        <label className="block text-sm sm:col-span-2">
          What for
          <input name="note" className={input} placeholder="Wage, cash out of the till" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <WhoField people={people} canChoose={canChoose} self={self} name="staffId" />
        <button type="submit" className={primary} disabled={pending}>
          {pending ? 'Saving…' : 'Log a drawing'}
        </button>
      </div>
      <Message result={result} />
    </form>
  );
}

export function IncomeForm({ today }: { today: string }) {
  const [result, submit, pending] = useActionState<FormResult, FormData>(
    logIncome,
    null,
  );

  return (
    <form action={submit}>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          Day
          <input type="date" name="receivedOn" className={input} defaultValue={today} />
        </label>
        <label className="block text-sm">
          Amount
          <input name="amount" className={input} inputMode="decimal" placeholder="$450" required />
        </label>
        <label className="block text-sm sm:col-span-2">
          Where from
          <input
            name="description"
            className={input}
            placeholder="Cash job, Jamison Road cleanup"
          />
        </label>
      </div>
      <div className="mt-3">
        <button type="submit" className={primary} disabled={pending}>
          {pending ? 'Saving…' : 'Log income'}
        </button>
      </div>
      <Message result={result} />
    </form>
  );
}
