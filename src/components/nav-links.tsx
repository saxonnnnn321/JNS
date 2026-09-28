'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The links that need to know where you are.
 *
 * Split into a client component so the nav itself can stay on the server and
 * keep reading the signed-in staff row. Only the highlight needs the pathname.
 */

/** `/customers` is active on `/customers/<id>`, but `/` only on exactly `/`. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ href, label }: { href: string; label: string }) {
  const active = isActive(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`rounded-lg px-2.5 py-1.5 font-medium transition ${
        active
          ? 'bg-leaf-soft text-leaf'
          : 'text-muted hover:bg-ink/4 hover:text-ink'
      }`}
    >
      {label}
    </Link>
  );
}

export function TabLink({
  href,
  label,
  d,
}: {
  href: string;
  label: string;
  /** The icon path. */
  d: string;
}) {
  const active = isActive(usePathname(), href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${
        active ? 'text-leaf' : 'text-faint'
      }`}
    >
      <span className="relative">
        {/* The active tab gets a hi-vis halo rather than only a colour change,
            which is much easier to pick out at a glance in bright light. */}
        {active && (
          <span className="absolute -inset-2 rounded-xl bg-hivis-soft" />
        )}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={active ? 2.4 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="relative h-5 w-5"
          aria-hidden="true"
        >
          <path d={d} />
        </svg>
      </span>
      {label}
    </Link>
  );
}
