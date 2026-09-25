import type { ReactElement } from 'react';
import { type DocumentProps, renderToBuffer } from '@react-pdf/renderer';
import { JobQuoteDocument, type JobQuoteData } from './job-quote-document';

/** Render a job quote to PDF bytes. See render-quote.tsx for why the cast. */
export function renderJobQuotePdf(quote: JobQuoteData): Promise<Buffer> {
  const document = (
    <JobQuoteDocument quote={quote} />
  ) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(document);
}
