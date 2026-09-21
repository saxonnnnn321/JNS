'use client';

/**
 * The microphone button. Sized for a thumb in a work glove — nothing here is
 * smaller than 44px — and it disappears entirely on a browser that cannot
 * listen, rather than sitting there doing nothing when tapped.
 */
export function MicButton({
  listening,
  onClick,
  label,
  title,
}: {
  listening: boolean;
  onClick: () => void;
  /** Omit for an icon-only button, e.g. beside a single-line input. */
  label?: string;
  title?: string;
}) {
  const base =
    'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors';
  const look = listening
    ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
    : 'border-leaf/40 text-leaf hover:bg-leaf-soft';

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? (listening ? 'Stop listening' : 'Dictate')}
      aria-label={title ?? (listening ? 'Stop listening' : 'Dictate')}
      aria-pressed={listening}
      className={`${base} ${look} ${label ? '' : 'min-w-11 px-0'}`}
    >
      {listening ? <StopIcon /> : <MicIcon />}
      {label && <span>{listening ? 'Stop' : label}</span>}
    </button>
  );
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function StopIcon() {
  return (
    <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
      {/* The ring keeps pulsing while the microphone is live, so a button left
          on in a pocket is obvious at a glance. */}
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/60" />
      <svg viewBox="0 0 24 24" fill="currentColor" className="relative h-3 w-3" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="2" />
      </svg>
    </span>
  );
}
