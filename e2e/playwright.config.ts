import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

/**
 * E2E suite (T9.1). Runs against an already running stack: the Compose `e2e` profile
 * in CI, or any local stack via `E2E_BASE_URL` (default http://localhost:3000).
 */
export default defineConfig({
  testDir: './tests',
  // Pagination tests depend on the global user count, so specs must not interleave.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      grep: /@mobile/,
    },
  ],
});
