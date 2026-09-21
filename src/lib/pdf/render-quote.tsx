import type { ReactElement } from 'react';
import { type DocumentProps, renderToBuffer } from '@react-pdf/renderer';
import { QuoteDocument } from './quote-document';
import type { QuoteEstimate } from '../types';

/**
 * Render a quote to PDF bytes.
 *
 * The cast is unavoidable: @react-pdf types `renderToBuffer` as taking a literal
 * `<Document>` element, so any wrapper component fails the check even though it
 * renders exactly that. Keeping the cast in this one function means nothing else
 * in the codebase has to know about it.
 */
export function renderQuotePdf(quote: QuoteEstimate): Promise<Buffer> {
  const document = (<QuoteDocument quote={quote} />) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(document);
}
