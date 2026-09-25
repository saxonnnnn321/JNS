'use client';

import { useActionState, useState } from 'react';
import {
  logDrawing,
  logHours,
  logIncome,
  updateEntry,
  type FormResult,
} from './actions';

const input =
  'mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20';
const primary =
  'rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90 disabled:cursor-not-allowed disabled:bg-bark/20';

export type Person = { id: string; name: string };
export type WorkOption = { id: string; label: string; kind: 'job' | 'customer' };

/**
 * What the hours were spent on.
 *
 * One dropdown rather than two, because picking a customer and then a job on
 * a phone in a ute is two taps too many. Jobs come first: hours on a
 * cost-plus job are what it gets billed for, so that is the choice that
 * actually changes money.
 */
export function WorkPicker({
  options,
  defaultJobId,
  defaultCustomerId,
}: {
  options: WorkOption[];
  defaultJobId?: string;
  defaultCustomerId?: string;
}) {
  const initial = defaultJobId
    ? `job:${defaultJobId}`
    : defaultCustomerId
      ? `customer:${defaultCustomerId}`
      : '';
  const [choice, setChoice] = useState(initial);

  const jobs = options.filter((option) => option.kind === 'job');
  const customers = options.filter((option) => option.kind === 'customer');
  const [kind, id] = choice.split(':');

  return (
    <label className="block text-sm">
      What it was on <span className="text-bark/40">(optional)</span>
      <select
        className={input}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">Nothing in particular</option>
        {jobs.length > 0 && (
          <optgroup label="Jobs">
            {jobs.map((option) => (
              <option key={option.id} value={`job:${option.id}`}>
                {option.label}
              </option>
            ))}
          </optgroup>
        )}
        {customers.length > 0 && (
          <optgroup label="Customers">
            {customers.map((option) => (
              <option key={option.id} value={`customer:${option.id}`}>
                {option.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <input type="hidden" name="jobId" value={kind === 'job' ? id : ''} />
      <input
        type="hidden"
        name="customerId"
        value={kind === 'customer' ? id : ''}
      />
    </label>
  );
}

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
  work,
}: {
  people: Person[];
  canChoose: boolean;
  self: string;
  today: string;
  /** Prefilled when the app-wide microphone heard "log three hours". */
  defaultHours?: string;
  defaultWhat?: string;
  work: WorkOption[];
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
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <WorkPicker options={work} />
        <WhoField people={people} canChoose={canChoose} self={self} name="staffId" />
      </div>
      <div className="mt-3">
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

/**
 * Fixing an entry in place. Tucked inside a disclosure on the row, so the
 * list stays a list until you need to change something.
 */
export function EditEntry({
  id,
  workDate,
  hours,
  description,
  customerId,
  jobId,
  work,
}: {
  id: string;
  workDate: string;
  hours: string;
  description: string;
  customerId?: string;
  jobId?: string;
  work: WorkOption[];
}) {
  const [result, submit, pending] = useActionState<FormResult, FormData>(
    updateEntry,
    null,
  );

  return (
    <form action={submit} className="mt-2 w-full border-t border-black/5 pt-2">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="block text-xs">
          Day
          <input type="date" name="workDate" className={input} defaultValue={workDate} />
        </label>
        <label className="block text-xs">
          Hours
          <input
            name="hours"
            className={input}
            inputMode="decimal"
            defaultValue={hours}
            required
          />
        </label>
        <label className="block text-xs sm:col-span-2">
          What you did
          <input name="description" className={input} defaultValue={description} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-48">
          <WorkPicker
            options={work}
            defaultJobId={jobId}
            defaultCustomerId={customerId}
          />
        </div>
        <button type="submit" className={primary} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <Message result={result} />
    </form>
  );
}
