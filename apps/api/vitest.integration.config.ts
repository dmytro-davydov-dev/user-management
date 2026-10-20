import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Runs against a real PostgreSQL (DATABASE_URL); tests share one DB, so no parallel files.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
