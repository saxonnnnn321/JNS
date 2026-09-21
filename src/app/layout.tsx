import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
import { VoiceProvider } from '@/components/voice-provider';
import { loadDirectory } from '@/lib/crm/queries';

export const metadata: Metadata = {
  title: 'JNS Landscaping',
  description: 'Quoting, customers and the round for JNS Landscaping',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // What the app-wide microphone is allowed to recognise by name.
  const directory = await loadDirectory();

  return (
    <html lang="en-AU">
      <body className="min-h-screen text-bark antialiased">
        <Nav />
        <VoiceProvider directory={directory}>{children}</VoiceProvider>
      </body>
    </html>
  );
}
