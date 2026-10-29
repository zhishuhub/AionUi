import { defineConfig } from '@playwright/test';

// Store screenshots only: one long run against the real app, see storeShots.e2e.ts.
export default defineConfig({
  testDir: '.',
  testMatch: '*.e2e.ts',
  timeout: 900_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: 'out/results',
});
