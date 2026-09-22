import type { ReactElement } from 'react';
import { type DocumentProps, renderToBuffer } from '@react-pdf/renderer';
import { InvoiceDocument, type InvoiceDocumentData } from './invoice-document';

/** Render an invoice to PDF bytes. See render-quote.tsx for why the cast. */
export function renderInvoicePdf(invoice: InvoiceDocumentData): Promise<Buffer> {
  const document = (
    <InvoiceDocument invoice={invoice} />
  ) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(document);
}
