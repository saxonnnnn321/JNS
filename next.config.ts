import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @react-pdf/renderer is a Node-side library; keep it out of the client bundle.
  serverExternalPackages: ['@react-pdf/renderer'],
};

export default nextConfig;
