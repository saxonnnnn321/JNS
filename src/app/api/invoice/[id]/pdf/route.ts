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

  let pdf: Buffer;
  try {
    pdf = await renderInvoicePdf(toDocument(invoice));
  } catch (cause) {
    // A blank page is the worst possible way to report this. Say it in words.
    console.error('could not render the invoice PDF', cause);
    return new Response(
      `Could not build the PDF for ${invoice.reference}: ${
        cause instanceof Error ? cause.message : 'unknown error'
      }`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  // `inline` so "View it" shows in the browser; the download button carries
  // its own `download` attribute, which overrides this and saves the file.
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.reference}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
