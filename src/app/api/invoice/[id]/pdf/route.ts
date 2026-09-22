import { loadInvoice, toDocument } from '@/lib/invoicing/queries';
import { renderInvoicePdf } from '@/lib/pdf/render-invoice';
import { today } from '@/lib/crm/schedule';

// @react-pdf/renderer needs Node, not the edge runtime.
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Read as the signed-in user, so row level security decides what is
  // visible. A stranger with a guessed id gets a 404, not an invoice.
  const invoice = await loadInvoice(id, today());
  if (!invoice) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const pdf = await renderInvoicePdf(toDocument(invoice));

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.reference}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
