import { estimateQuote } from '@/lib/pricing';
import { quoteRequestSchema } from '@/lib/schema';
import { renderQuotePdf } from '@/lib/pdf/render-quote';

// @react-pdf/renderer needs Node, not the edge runtime.
export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }

  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid quote', issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const quote = estimateQuote(parsed.data);
  const pdf = await renderQuotePdf(quote);

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${quote.reference}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
