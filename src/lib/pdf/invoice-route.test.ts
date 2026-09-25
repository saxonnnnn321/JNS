import { describe, expect, it, vi } from 'vitest';

// Only the database read is faked. toDocument and the renderer are the real
// ones, because they are what we are actually trying to exercise.
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/invoicing/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/invoicing/queries')>();
  return {
    ...actual,
    loadInvoice: vi.fn(async () => ({
      id: 'inv1',
      reference: 'INV-0001',
      customerId: 'c1',
      customerName: 'Dave Thompson',
      status: 'draft' as const,
      issuedDate: '2026-09-25',
      dueDate: '2026-10-02',
      subtotalCents: 30800,
      gstCents: 0,
      totalCents: 30800,
      overdue: false,
      lines: [
        {
          description: '5 Hope Street — mow',
          quantity: 1,
          unit: 'visit',
          amountCents: 30800,
        },
      ],
    })),
  };
});

describe('GET /api/invoice/[id]/pdf', () => {
  it('returns a real PDF', async () => {
    const { GET } = await import('@/app/api/invoice/[id]/pdf/route');
    const response = await GET(new Request('http://x/api/invoice/inv1/pdf'), {
      params: Promise.resolve({ id: 'inv1' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-');
  });
});
