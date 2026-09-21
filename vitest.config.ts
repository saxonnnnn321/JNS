import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // Match the automatic JSX runtime Next.js uses, so the PDF components compile
  // the same way under test as they do in the app.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
