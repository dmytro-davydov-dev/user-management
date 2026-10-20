import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Node by default; component tests opt into jsdom with `// @vitest-environment jsdom`.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // `server-only` throws outside React Server Components; tests import server modules directly.
      'server-only': resolve(__dirname, 'src/test/empty-module.ts'),
    },
  },
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
