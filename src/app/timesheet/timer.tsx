'use client';

import { useActionState, useEffect, useState } from 'react';
import { cancelTimer, startTimer, stopTimer, type FormResult } from './actions';
import { WorkPicker, type WorkOption } from './forms';

const input =
  'mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20';

/**
 * The clock.
 *
 * The elapsed figure is worked out from `startedAt` on every tick rather than
 * counted up, so it stays right through a locked screen, a backgrounded tab
 * or a browser the phone quietly killed — all of which stop timers that count
 * their own seconds. The truth is the start time in the database; this only
 * renders the difference.
 */
export function Timer({
  running,
  work,
}: {
  running: { startedAt: string; description?: string; customerId?: string } | null;
  work: WorkOption[];
}) {
  if (running) return <RunningClock running={running} />;
  return <IdleClock work={work} />;
}

function elapsedLabel(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function RunningClock({
  running,
}: {
  running: { startedAt: string; description?: string };
}) {
  const [now, setNow] = useState(() => Date.now());
  const [result, stop, stopping] = useActionState<FormResult, FormData>(
    stopTimer,
    null,
  );

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const longRun = now - new Date(running.startedAt).getTime() > 12 * 3600 * 1000;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <p className="font-mono text-4xl font-bold tabular-nums text-leaf">
          {elapsedLabel(running.startedAt, now)}
        </p>
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-600">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-600" />
          </span>
          Running
        </span>
      </div>

      {longRun && (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          This has been going over 12 hours. Left on overnight?
        </p>
      )}

      <form action={stop} className="mt-3">
        <label className="block text-sm">
          What you did
          <input
            name="description"
            className={input}
            defaultValue={running.description ?? ''}
            placeholder="Penrith run, three lawns"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={stopping}
            className="min-h-12 rounded-lg bg-red-600 px-6 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-bark/20"
          >
            {stopping ? 'Stopping…' : 'Stop and log it'}
          </button>
          <button
            type="submit"
            formAction={cancelTimer}
            className="text-sm text-bark/45 hover:text-bark"
          >
            Throw it away
          </button>
        </div>
      </form>
      {result && 'error' in result && (
        <p className="mt-2 text-xs text-amber-800">{result.error}</p>
      )}
    </div>
  );
}

function IdleClock({ work }: { work: WorkOption[] }) {
  const [result, start, starting] = useActionState<FormResult, FormData>(
    startTimer,
    null,
  );

  return (
    <form action={start}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          What you are doing
          <input
            name="description"
            className={input}
            placeholder="Penrith run, three lawns"
          />
        </label>
        <WorkPicker options={work} />
      </div>
      <button
        type="submit"
        disabled={starting}
        className="mt-3 min-h-12 rounded-lg bg-leaf px-8 text-base font-semibold text-white hover:bg-leaf/90 disabled:bg-bark/20"
      >
        {starting ? 'Starting…' : 'Start the clock'}
      </button>
      {result && 'error' in result && (
        <p className="mt-2 text-xs text-red-600">{result.error}</p>
      )}
    </form>
  );
}
