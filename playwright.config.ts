import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Treatment Companion's end-to-end smoke.
 *
 * Two modes:
 *  - Local (default): boots the app with `npm run dev` on localhost:3000.
 *    Requires a working .env.local (Supabase URL + anon key) so the app runs.
 *  - Remote: set E2E_BASE_URL=https://<your-preview>.vercel.app to test a
 *    deployed build instead; no local server is started.
 *
 * Test data / credentials come from env (see e2e/README.md):
 *    E2E_PATIENT_EMAIL, E2E_PATIENT_PASSWORD
 * The authenticated tests skip themselves when those are not set.
 *
 * All artifacts (HTML report, traces, screenshots, videos) are written under
 * e2e/.artifacts/ so they can be gitignored without touching the repo root.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const usingRemote = !!process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts/test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    process.env.CI ? ['github'] : ['list'],
    ['html', { outputFolder: './e2e/.artifacts/playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    // Add more browsers once the smoke is stable on Chromium:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',  use: { ...devices['Desktop Safari'] } },
  ],
  // Only start a local server when we're NOT pointing at a deployed URL.
  ...(usingRemote
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        }
      })
});
