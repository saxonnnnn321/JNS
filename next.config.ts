import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @react-pdf/renderer is a Node-side library; keep it out of the client
  // bundle and leave it to be required from node_modules at runtime.
  serverExternalPackages: ['@react-pdf/renderer', 'pdfkit'],

  /**
   * pdfkit loads its built-in fonts lazily, through subpath imports that look
   * like `require('#standard-fonts/Helvetica')`. Those are resolved at
   * runtime, so Next's file tracer cannot see them and never uploads the
   * files. Locally nobody notices, because node_modules is sitting right
   * there. On Vercel the function gets only what was traced, and the first
   * PDF dies with:
   *
   *   Cannot find module '/var/task/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs'
   *
   * So the fonts are named explicitly here. They are about 300 KB in total.
   */
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/pdfkit/js/standard-fonts/**'],
  },
};

export default nextConfig;
