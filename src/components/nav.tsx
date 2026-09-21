import Link from 'next/link';
import { BUSINESS } from '@/lib/business';

const LINKS = [
  { href: '/', label: 'Today' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/customers', label: 'Customers' },
  { href: '/quotes/new', label: 'New quote' },
];

export function Nav() {
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
        <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
          Mock data
        </span>
      </nav>
    </header>
  );
}
