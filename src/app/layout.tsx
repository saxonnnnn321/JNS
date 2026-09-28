import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/nav';
import { VoiceProvider } from '@/components/voice-provider';
import { loadDirectory } from '@/lib/crm/queries';

/**
 * Two faces, both self-hosted by next/font so there is no request to Google at
 * runtime and no flash of the wrong font on a slow connection in the ute.
 *
 * Outfit for headings — geometric and a bit bold, which suits a trade name.
 * Inter for everything else, chosen mostly for its digits: it has proper
 * tabular figures, and this app is mostly columns of money.
 */
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  weight: ['600', '700', '800'],
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'JNS Landscaping',
  description: 'Quoting, customers and the round for JNS Landscaping',
};

export const viewport = {
  themeColor: '#2b5636',
  // The nav is thumb-reachable at the bottom on a phone, so the page must be
  // allowed to sit under the home bar rather than above it.
  viewportFit: 'cover' as const,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // What the app-wide microphone is allowed to recognise by name.
  const directory = await loadDirectory();

  return (
    <html lang="en-AU" className={`${inter.variable} ${outfit.variable}`}>
      <body className="min-h-screen font-sans text-ink antialiased">
        <Nav />
        {/* Room at the bottom for the phone tab bar, which floats over the
            page rather than pushing it. */}
        <div className="pb-24 lg:pb-0">
          <VoiceProvider directory={directory}>{children}</VoiceProvider>
        </div>
      </body>
    </html>
  );
}
