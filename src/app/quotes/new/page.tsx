import { loadRound } from '@/lib/crm/queries';
import { QuoteForm, type QuoteFor } from './quote-form';

export const dynamic = 'force-dynamic';

/**
 * The quoting page.
 *
 * Usually a blank slate: type an address, get a price. But it can also be
 * opened from a customer's page with `?customer=<id>`, in which case their
 * details are already filled in and their addresses are one tap away — the
 * common case being an existing customer asking for a second job.
 */
export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer: customerId } = await searchParams;
  if (!customerId) return <QuoteForm />;

  const round = await loadRound();
  const customer = round.customerById(customerId);
  // An unknown id is not worth an error page — a blank quote is still useful.
  if (!customer) return <QuoteForm />;

  const quoteFor: QuoteFor = {
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    properties: round.propertiesFor(customer.id).map((property) => ({
      id: property.id,
      label: `${property.addressLine}, ${property.suburb}`,
      // What the cadastre lookup wants: the whole thing as one line.
      lookup: [property.addressLine, property.suburb, property.postcode]
        .filter(Boolean)
        .join(' '),
    })),
  };

  return <QuoteForm quoteFor={quoteFor} />;
}
