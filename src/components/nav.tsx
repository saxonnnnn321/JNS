import Link from 'next/link';
import { BUSINESS } from '@/lib/business';
import { currentStaff } from '@/lib/supabase/server';

const LINKS = [
  { href: '/', label: 'Today' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/customers', label: 'Customers' },
  { href: '/timesheet', label: 'Timesheet' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/quotes/new', label: 'New quote' },
];

export async function Nav() {
  const staff = await currentStaff();
  // Nothing to navigate to when signed out; the login page stands alone.
  if (!staff) return null;

  return (
    <header className="border-b border-black/10 bg-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link href="/" className="font-bold text-leaf">
          {BUSINESS.tradingName}
        </Link>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-bark/60 hover:text-leaf"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3 text-xs text-bark/45">
          <span className="hidden sm:inline">
            {staff.full_name || staff.email}
            {staff.role === 'owner' && ' · owner'}
          </span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="hover:text-bark">
              Sign out
            </button>
          </form>
        </div>
      </nav>
    </header>
  );
}
