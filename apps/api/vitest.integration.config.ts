import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Runs against a real PostgreSQL: a separate `<db>_test` database (see test/integration/test-database.ts),
// created and migrated by the global setup. Tests share one DB, so no parallel files.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/integration/setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
