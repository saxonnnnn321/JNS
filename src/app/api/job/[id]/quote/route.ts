import { loadJobQuote } from '@/lib/invoicing/job-quote';
import { renderJobQuotePdf } from '@/lib/pdf/render-job-quote';

// @react-pdf/renderer needs Node, not the edge runtime.
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Read as the signed-in user, so row level security decides what is
  // visible. A guessed id gets a 404, not somebody else's quote.
  const quote = await loadJobQuote(id);
  if (!quote) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const pdf = await renderJobQuotePdf(quote);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${quote.reference}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (cause) {
    console.error('could not render the job quote', cause);
    return new Response(
      `Could not build the quote for ${quote.reference}: ${
        cause instanceof Error ? cause.message : 'unknown error'
      }`,
      { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }
}
