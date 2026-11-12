import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: a real API (built), a real PostgreSQL/Redis/S3, and the
 * built passenger website, driven in Chromium. global-setup starts and seeds everything.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3202',
    trace: 'off',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1360, height: 900 },
    // The browser is at Kurmi Market, Kano, for "Use my location".
    permissions: ['geolocation'],
    geolocation: { latitude: 11.9906, longitude: 8.5141 },
  },
});
