import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
import { VoiceProvider } from '@/components/voice-provider';
import { customers, properties } from '@/lib/crm/seed';
import type { Directory } from '@/lib/voice/commands';

/**
 * What the voice router is allowed to recognise by name. Deliberately only
 * the fields it needs — phone numbers, emails and customer notes have no
 * business being shipped to the browser just so a microphone can match "Dave".
 */
const directory: Directory = {
  customers: customers.map(({ id, name }) => ({ id, name })),
  properties: properties.map(({ customerId, addressLine, suburb }) => ({
    customerId,
    addressLine,
    suburb,
  })),
};

export const metadata: Metadata = {
  title: 'JNS Landscaping',
  description: 'Quoting, customers and the round for JNS Landscaping',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen text-bark antialiased">
        <Nav />
        <VoiceProvider directory={directory}>{children}</VoiceProvider>
      </body>
    </html>
  );
}
