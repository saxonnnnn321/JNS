import Link from 'next/link';
import { BUSINESS } from '@/lib/business';
import { currentStaff } from '@/lib/supabase/server';
import { NavLink, TabLink } from './nav-links';

/**
 * Getting around.
 *
 * Two shapes, because the two ways this app gets used are nothing alike.
 *
 * On a laptop at the kitchen table you want everything at once, so the top bar
 * lists all eight destinations.
 *
 * On a phone in the ute you want your thumb to reach the five things you
 * actually touch during a work day, so those five become a bottom tab bar and
 * the rest move into the top bar. Eight links wrapping across three lines at
 * the top of a phone screen was the old behaviour, and picking one out of that
 * pile while parked was genuinely annoying.
 */

/** Everything, for the top bar on a wide screen. */
const ALL = [
  { href: '/', label: 'Today' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/customers', label: 'Customers' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/receipts', label: 'Receipts' },
  { href: '/timesheet', label: 'Timesheet' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/quotes/new', label: 'New quote' },
];

/**
 * The five for the thumb. Icons are inline paths rather than a library —
 * eight glyphs is not worth a dependency, and these ship in the HTML.
 */
const TABS = [
  {
    href: '/',
    label: 'Today',
    // A tick: what you do all day is tick jobs off.
    d: 'M20 6 9 17l-5-5',
  },
  {
    href: '/customers',
    label: 'People',
    d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm13 14v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  },
  {
    href: '/jobs',
    label: 'Jobs',
    // A trowel-ish rectangle stack: the construction side.
    d: 'M3 7h18M3 12h18M3 17h10',
  },
  {
    href: '/receipts',
    label: 'Receipts',
    d: 'M5 3v18l3-2 2 2 2-2 2 2 3-2V3H5Zm3 5h8M8 12h8',
  },
  {
    href: '/invoices',
    label: 'Money',
    d: 'M12 2v20M17 6.5C17 4.6 14.8 4 12 4S7 4.8 7 7s2.2 2.8 5 3.5 5 1.4 5 3.5-2.2 3-5 3-5-.8-5-2.5',
  },
];

export async function Nav() {
  const staff = await currentStaff();
  // Nothing to navigate to when signed out; the login page stands alone.
  if (!staff) return null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-lg">
        <nav className="mx-auto flex max-w-6xl items-center gap-x-5 px-4 py-3">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 font-display text-base font-extrabold tracking-tight text-leaf"
          >
            {/* The mark: a leaf on a hi-vis chip. Mowing and building, which
                is what the business is now. */}
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-hivis text-ink">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M12 21C7 17 5 13 5 9a7 7 0 0 1 14 0c0 4-2 8-7 12Z"
                  fill="currentColor"
                  opacity="0.25"
                />
                <path
                  d="M12 21V8M12 12 8.5 8.5M12 15l3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </span>
            <span className="hidden sm:inline">{BUSINESS.tradingName}</span>
          </Link>

          {/* Everything, once there is room for it. */}
          <div className="hidden flex-wrap gap-x-1 text-sm lg:flex">
            {ALL.map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} />
            ))}
          </div>

          {/* On a phone the tab bar has the five daily ones, so only the rest
              need to be up here. */}
          <div className="flex flex-wrap gap-x-1 text-sm lg:hidden">
            {ALL.filter(
              (link) => !TABS.some((tab) => tab.href === link.href),
            ).map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} />
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-faint">
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-leaf-soft text-[10px] font-bold text-leaf">
                {(staff.full_name || staff.email || '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden md:inline">
                {staff.full_name || staff.email}
                {staff.role === 'owner' && ' · owner'}
              </span>
            </span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </nav>
      </header>

      {/* The thumb bar. Sits above the home bar on an iPhone via the safe-area
          inset, and the mic button is lifted clear of it in voice-provider. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
        aria-label="Main"
      >
        <ul className="mx-auto flex max-w-lg">
          {TABS.map((tab) => (
            <li key={tab.href} className="flex-1">
              <TabLink href={tab.href} label={tab.label} d={tab.d} />
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
