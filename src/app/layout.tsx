import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';

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
        {children}
      </body>
    </html>
  );
}
